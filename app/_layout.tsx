import '../global.css';

import { useEffect, useState } from 'react';
import { useRouter, useSegments, Slot } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Session } from '@supabase/supabase-js';
import Purchases from 'react-native-purchases';

import { supabase } from '../lib/supabase';
import { initRevenueCat } from '../lib/revenuecat';

/**
 * AuthProvider
 *
 * Responsibilities:
 *  1. Initializes the RevenueCat SDK once on mount.
 *  2. Hydrates the Supabase session on cold start (handles persisted sessions).
 *  3. Subscribes to ongoing auth state changes.
 *  4. Calls Purchases.logIn / Purchases.logOut to keep the RC customer
 *     identity in sync with the Supabase user UUID.
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
    // Initialize RevenueCat before any purchase calls
    initRevenueCat();

    // Hydrate session on mount (handles app restart with persisted session)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Subscribe to ongoing auth state changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);

      if (session?.user?.id) {
        // User signed in — link RevenueCat customer to the Supabase UUID
        try {
          await Purchases.logIn(session.user.id);
        } catch (error) {
          if (__DEV__) {
            console.warn('[RevenueCat] logIn failed:', error);
          }
        }
      } else {
        // User signed out — reset RevenueCat to an anonymous customer
        try {
          await Purchases.logOut();
        } catch (error) {
          if (__DEV__) {
            console.warn('[RevenueCat] logOut failed:', error);
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
      // Not signed in — redirect to login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Signed in but still on auth screens — redirect to app
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
