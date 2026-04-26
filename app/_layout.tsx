import '../global.css';

import { useEffect } from 'react';
import { useRouter, useSegments, Slot } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';

/**
 * AuthProvider
 *
 * Listens to Supabase auth state changes and redirects:
 *  - Unauthenticated users  → /(auth)/login
 *  - Authenticated users    → /(app)
 *
 * Rendered at the root so all route groups are children.
 */
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Hydrate session on mount (handles app restart with persisted session)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Subscribe to ongoing auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Not signed in — push to login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Signed in but still on auth screens — push to app
      router.replace('/(app)');
    }
  }, [session, segments, isLoading]);

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
