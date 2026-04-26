import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { supabase } from '../lib/supabase';
import { isRcMockMode } from '../lib/revenuecat';
import { Session } from '@supabase/supabase-js';

// ─── Mock data ───────────────────────────────────────────────────────────────
/**
 * Mirrors the shape Paywall.tsx reads from a real PurchasesPackage so the UI
 * renders identically in mock mode without any special-casing in the JSX.
 */
interface MockPackage {
  identifier: string;
  product: { priceString: string; title: string };
  packageType: string;
}

const MOCK_PACKAGES: MockPackage[] = [
  {
    identifier: 'per_player',
    product: { priceString: '$2.99', title: 'Per Player' },
    packageType: 'MONTHLY',
  },
  {
    identifier: 'bundle',
    product: { priceString: '$20.00', title: 'Bundle (10 Athletes)' },
    packageType: 'MONTHLY',
  },
];

// ─── Display metadata ─────────────────────────────────────────────────────────
const PACKAGE_META: Record<
  string,
  { label: string; description: string; cta: string; badge?: string }
> = {
  per_player: {
    label: 'Per Player',
    description: 'Track one athlete — stats, workouts, and progress all in one place.',
    cta: 'Track for $2.99/mo',
  },
  bundle: {
    label: '10 Athletes Bundle',
    description: 'Track up to 10 athletes at a flat rate. Ideal for coaches and parents.',
    cta: '10 for $20/mo',
    badge: 'Best Value',
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface PaywallProps {
  /** Supabase athlete row ID to link to the purchase */
  athleteId: string;
  /** Called after a successful purchase + DB insert */
  onSuccess?: () => void;
  /** Called when user dismisses the paywall without purchasing */
  onDismiss?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Paywall({ athleteId, onSuccess, onDismiss }: PaywallProps) {
  const mockMode = isRcMockMode();

  // Use a union type: real packages in production, mock packages on iOS dev
  const [packages, setPackages] = useState<(PurchasesPackage | MockPackage)[]>([]);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // ─── Session ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  // ─── Fetch offerings ───────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        if (mockMode) {
          // iOS dev with no Apple key — use hardcoded dummy packages
          console.log('[Paywall] Mock mode: using dummy offerings.');
          setPackages(MOCK_PACKAGES);
        } else {
          // Production / Android — fetch real RevenueCat offerings
          const offerings = await Purchases.getOfferings();
          const available = (offerings.current?.availablePackages ?? []).filter(
            (pkg) => pkg.identifier === 'per_player' || pkg.identifier === 'bundle',
          );
          setPackages(available);
        }
      } catch (error: any) {
        Alert.alert('Error', error?.message ?? 'Failed to load subscription options.');
      } finally {
        setIsLoadingOfferings(false);
      }
    }

    load();
  }, [mockMode]);

  // ─── Purchase handler ──────────────────────────────────────────────────────
  async function handlePurchase(pkg: PurchasesPackage | MockPackage) {
    if (!session?.user?.id) {
      Alert.alert('Error', 'You must be signed in to make a purchase.');
      return;
    }

    setPurchasingId(pkg.identifier);

    try {
      if (mockMode) {
        // ── iOS Mock Mode ───────────────────────────────────────────────────
        // Simulate network latency so the UX mirrors a real purchase flow
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));

        const { error: dbError } = await supabase
          .from('user_athletes')
          .insert({ athlete_id: athleteId, user_id: session.user.id });

        if (dbError) throw new Error(dbError.message);

        if (__DEV__) {
          console.log('[Paywall] Mock purchase success — athlete linked:', athleteId);
        }
      } else {
        // ── Production Mode (Android / iOS with live key) ───────────────────
        const { customerInfo } = await Purchases.purchasePackage(
          pkg as PurchasesPackage,
        );

        // Verify the entitlement was granted before writing to the DB
        const isActive = Object.keys(customerInfo.entitlements.active).length > 0;
        if (!isActive) {
          throw new Error('Purchase completed but no active entitlement was returned.');
        }

        const { error: dbError } = await supabase
          .from('user_athletes')
          .insert({ athlete_id: athleteId, user_id: session.user.id });

        if (dbError) {
          throw new Error(`Purchase succeeded but failed to save: ${dbError.message}`);
        }
      }

      onSuccess?.();
    } catch (error: any) {
      // RevenueCat sets userCancelled = true when the user backs out of the
      // native payment sheet — don't show an error alert in that case
      if (!error?.userCancelled) {
        Alert.alert('Error', error?.message ?? 'An unexpected error occurred.');
      }
    } finally {
      setPurchasingId(null);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-slate-950">
      {/* Header */}
      <View className="px-6 pt-12 pb-6">
        <View className="flex-row items-center gap-2 mb-3">
          <Text className="text-white text-2xl font-bold tracking-tight">
            Unlock AthTrack
          </Text>
          {mockMode ? (
            <View className="bg-amber-500/20 border border-amber-500/40 rounded-full px-2 py-0.5">
              <Text className="text-amber-400 text-xs font-semibold">DEV MOCK</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-slate-400 text-sm leading-relaxed">
          Choose a plan to start tracking athlete performance.
          {mockMode ? ' (Purchases are simulated — no charge will occur.)' : ''}
        </Text>
      </View>

      {isLoadingOfferings ? (
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
            const meta = PACKAGE_META[pkg.identifier] ?? {
              label: pkg.identifier,
              description: '',
              cta: 'Subscribe',
            };
            const isBundle = pkg.identifier === 'bundle';
            const isPurchasing = purchasingId === pkg.identifier;
            const anyPurchasing = purchasingId !== null;

            return (
              <View
                key={pkg.identifier}
                className={`rounded-3xl p-5 border ${
                  isBundle
                    ? 'bg-brand-500/10 border-brand-500/50'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {/* Badge */}
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
                    <Text className="text-slate-400 text-xs">/&nbsp;month</Text>
                  </View>
                </View>

                {/* Description */}
                <Text className="text-slate-400 text-sm mb-5 leading-relaxed">
                  {meta.description}
                </Text>

                {/* CTA */}
                <TouchableOpacity
                  onPress={() => handlePurchase(pkg)}
                  disabled={anyPurchasing}
                  className={`rounded-xl py-3.5 items-center ${
                    isBundle
                      ? 'bg-brand-500 active:bg-brand-600'
                      : 'bg-slate-700 active:bg-slate-600'
                  } ${anyPurchasing ? 'opacity-50' : ''}`}
                >
                  {isPurchasing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-semibold text-base">{meta.cta}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Restore purchases (only shown in live mode — meaningless in mock) */}
          {!mockMode ? (
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
          ) : null}

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
