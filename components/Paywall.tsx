import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

interface PaywallProps {
  /** The Supabase athlete row ID to link to the purchase */
  athleteId: string;
  /** Called after a successful purchase + DB insert */
  onSuccess?: () => void;
  /** Called when the user dismisses/cancels the paywall */
  onDismiss?: () => void;
}

/**
 * Paywall
 *
 * Fetches the active RevenueCat offering on mount and renders the
 * "per_player" and "bundle" packages. On purchase success, inserts a
 * row into `user_athletes` to link the athlete to the authenticated user.
 */
export default function Paywall({ athleteId, onSuccess, onDismiss }: PaywallProps) {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [purchasingPkg, setPurchasingPkg] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // ─── Fetch current Supabase session ─────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  // ─── Fetch RevenueCat offerings ──────────────────────────────────────────────
  useEffect(() => {
    async function fetchOfferings() {
      try {
        const offerings = await Purchases.getOfferings();
        setOffering(offerings.current);
      } catch (error: any) {
        Alert.alert('Error', error?.message ?? 'Failed to load subscription options.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchOfferings();
  }, []);

  // ─── Purchase handler ────────────────────────────────────────────────────────
  async function handlePurchase(pkg: PurchasesPackage) {
    if (!session?.user?.id) {
      Alert.alert('Error', 'You must be signed in to make a purchase.');
      return;
    }

    setPurchasingPkg(pkg.identifier);

    try {
      // 1. Execute the RevenueCat purchase
      const { customerInfo } = await Purchases.purchasePackage(pkg);

      // Confirm the entitlement was granted (sanity check)
      const isActive =
        Object.keys(customerInfo.entitlements.active).length > 0;

      if (!isActive) {
        throw new Error('Purchase completed but no active entitlement was found.');
      }

      // 2. Link the athlete to the user in Supabase
      const { error: dbError } = await supabase
        .from('user_athletes')
        .insert({ athlete_id: athleteId, user_id: session.user.id });

      if (dbError) {
        throw new Error(`Purchase succeeded but failed to save: ${dbError.message}`);
      }

      onSuccess?.();
    } catch (error: any) {
      // RevenueCat throws a specific error code for user-cancelled purchases
      if (!error?.userCancelled) {
        Alert.alert('Error', error?.message ?? 'An unexpected error occurred.');
      }
    } finally {
      setPurchasingPkg(null);
    }
  }

  // ─── Filter to only our two named packages ───────────────────────────────────
  const packages = (offering?.availablePackages ?? []).filter((pkg) =>
    ['per_player', 'bundle'].includes(pkg.identifier),
  );

  // ─── Package metadata ────────────────────────────────────────────────────────
  const packageMeta: Record<string, { label: string; description: string; badge?: string }> = {
    per_player: {
      label: 'Per Player',
      description: 'Track one athlete — stats, workouts, and progress all in one place.',
    },
    bundle: {
      label: 'Bundle',
      description: 'Track unlimited athletes at a flat rate. Perfect for coaches and parents.',
      badge: 'Best Value',
    },
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-slate-950">
      {/* Header */}
      <View className="px-6 pt-12 pb-6">
        <Text className="text-white text-2xl font-bold tracking-tight">
          Unlock AthTrack
        </Text>
        <Text className="text-slate-400 text-sm mt-1">
          Choose a plan to start tracking athlete performance.
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text className="text-slate-500 text-sm mt-3">Loading plans…</Text>
        </View>
      ) : packages.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-slate-400 text-center">
            No subscription plans are available right now. Please try again later.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-6 pb-10 gap-4"
          showsVerticalScrollIndicator={false}
        >
          {packages.map((pkg) => {
            const meta = packageMeta[pkg.identifier] ?? {
              label: pkg.identifier,
              description: '',
            };
            const isPurchasing = purchasingPkg === pkg.identifier;
            const isBundle = pkg.identifier === 'bundle';

            return (
              <View
                key={pkg.identifier}
                className={`rounded-3xl p-5 border ${
                  isBundle
                    ? 'bg-brand-500/10 border-brand-500/50'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {/* Best Value badge */}
                {meta.badge ? (
                  <View className="self-start bg-brand-500 rounded-full px-3 py-0.5 mb-3">
                    <Text className="text-white text-xs font-bold">{meta.badge}</Text>
                  </View>
                ) : null}

                {/* Plan name + price */}
                <View className="flex-row items-start justify-between mb-2">
                  <Text className="text-white text-lg font-bold flex-1 mr-2">
                    {meta.label}
                  </Text>
                  <View className="items-end">
                    <Text className="text-white text-xl font-bold">
                      {pkg.product.priceString}
                    </Text>
                    <Text className="text-slate-400 text-xs">
                      / {pkg.packageType === 'ANNUAL' ? 'year' : 'month'}
                    </Text>
                  </View>
                </View>

                {/* Description */}
                <Text className="text-slate-400 text-sm mb-5 leading-relaxed">
                  {meta.description}
                </Text>

                {/* CTA Button */}
                <TouchableOpacity
                  onPress={() => handlePurchase(pkg)}
                  disabled={isPurchasing || purchasingPkg !== null}
                  className={`rounded-xl py-3.5 items-center ${
                    isBundle
                      ? 'bg-brand-500 active:bg-brand-600'
                      : 'bg-slate-700 active:bg-slate-600'
                  } ${purchasingPkg !== null ? 'opacity-60' : ''}`}
                >
                  {isPurchasing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-semibold text-base">
                      {isBundle ? 'Get Bundle' : 'Subscribe'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Legal restore + dismiss */}
          <TouchableOpacity
            className="items-center mt-2"
            onPress={async () => {
              try {
                await Purchases.restorePurchases();
              } catch (error: any) {
                Alert.alert('Error', error?.message ?? 'Could not restore purchases.');
              }
            }}
          >
            <Text className="text-slate-500 text-xs underline">Restore Purchases</Text>
          </TouchableOpacity>

          {onDismiss ? (
            <TouchableOpacity className="items-center mt-1" onPress={onDismiss}>
              <Text className="text-slate-600 text-xs">Not now</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
