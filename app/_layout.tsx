import '../global.css';

import { useEffect, useState } from 'react';
import { useRouter, useSegments, Slot } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Session } from '@supabase/supabase-js';
import Purchases from 'react-native-purchases';

import { supabase } from '../lib/supabase';
import { initRevenueCat, isRcMockMode } from '../lib/revenuecat';

/**
 * AuthProvider
 *
 * Responsibilities:
 *  1. Initializes the RevenueCat SDK once on mount (or enters mock mode on iOS
 *     when no Apple Developer key is present — prevents simulator crashes).
 *  2. Hydrates the Supabase session on cold start.
 *  3. Subscribes to ongoing auth state changes.
 *  4. When NOT in mock mode: calls Purchases.logIn(userId) on sign-in and
 *     Purchases.logOut() on sign-out to keep RC customer identity in sync
 *     with the Supabase UUID.
 *  5. Redirects unauthenticated users → /(auth)/login
 *     and authenticated users away from auth screens → /(app).
 */
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  // ─── SDK init + session hydration ────────────────────────────────────────────
  useEffect(() => {
    // Must run before any Purchases.* call
    initRevenueCat();

    // Hydrate persisted session from SecureStore on cold start
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Subscribe to ongoing auth state changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);

      // Only call real RC SDK methods when not in iOS mock mode
      if (!isRcMockMode()) {
        if (session?.user?.id) {
          // Signed in — link RevenueCat customer to the Supabase UUID
          try {
            await Purchases.logIn(session.user.id);
          } catch (error) {
            if (__DEV__) {
              console.warn('[RevenueCat] logIn failed:', error);
            }
          }
        } else {
          // Signed out — reset RC to an anonymous customer
          try {
            await Purchases.logOut();
          } catch (error) {
            if (__DEV__) {
              console.warn('[RevenueCat] logOut failed:', error);
            }
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Route guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [session, segments, isLoading]);

  // ─── Splash / loading state ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}
