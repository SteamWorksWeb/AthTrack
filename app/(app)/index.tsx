import { View, Text, TouchableOpacity } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';

export default function DashboardScreen() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    // AuthProvider in root _layout.tsx handles redirect to login
  }

  return (
    <View className="flex-1 bg-slate-950 px-6 pt-10">
      {/* Header greeting */}
      <View className="mb-8">
        <Text className="text-slate-400 text-sm">Welcome back</Text>
        <Text className="text-white text-2xl font-bold mt-1" numberOfLines={1}>
          {session?.user?.email ?? '—'}
        </Text>
      </View>

      {/* Placeholder stats grid */}
      <View className="flex-row gap-4 mb-6">
        <View className="flex-1 bg-slate-900 rounded-2xl p-4">
          <Text className="text-slate-400 text-xs uppercase tracking-widest">Workouts</Text>
          <Text className="text-white text-3xl font-bold mt-1">—</Text>
        </View>
        <View className="flex-1 bg-slate-900 rounded-2xl p-4">
          <Text className="text-slate-400 text-xs uppercase tracking-widest">Streak</Text>
          <Text className="text-white text-3xl font-bold mt-1">—</Text>
        </View>
      </View>

      <View className="bg-slate-900 rounded-2xl p-4 mb-6">
        <Text className="text-slate-400 text-xs uppercase tracking-widest mb-2">
          Recent Activity
        </Text>
        <Text className="text-slate-600 text-sm text-center py-8">
          No workouts logged yet. Get moving!
        </Text>
      </View>

      {/* Sign out */}
      <TouchableOpacity
        onPress={handleSignOut}
        className="mt-auto mb-8 border border-slate-700 rounded-xl py-3.5 items-center"
      >
        <Text className="text-slate-400 font-semibold">Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}
