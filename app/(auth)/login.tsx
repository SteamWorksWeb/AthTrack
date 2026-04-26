import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type AuthMode = 'signin' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  function toggleMode() {
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
    setError(null);
  }

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        Alert.alert(
          'Check your email',
          'We sent a confirmation link. Verify your email then sign in.',
        );
        setMode('signin');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      }
      // On success, the AuthProvider in _layout.tsx handles the redirect automatically
    }

    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / Brand */}
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-2xl bg-brand-500 items-center justify-center mb-4">
            <Text className="text-white text-3xl font-bold">A</Text>
          </View>
          <Text className="text-white text-3xl font-bold tracking-tight">AthTrack</Text>
          <Text className="text-slate-400 text-sm mt-1">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </Text>
        </View>

        {/* Card */}
        <View className="bg-slate-900 rounded-3xl p-6 shadow-lg">

          {/* Error Banner */}
          {error ? (
            <View className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          ) : null}

          {/* Email Field */}
          <View className="mb-4">
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">
              Email
            </Text>
            <TextInput
              className="bg-slate-800 text-white rounded-xl px-4 py-3.5 text-base border border-slate-700 focus:border-brand-500"
              placeholder="you@example.com"
              placeholderTextColor="#64748b"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!loading}
            />
          </View>

          {/* Password Field */}
          <View className="mb-6">
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">
              Password
            </Text>
            <TextInput
              className="bg-slate-800 text-white rounded-xl px-4 py-3.5 text-base border border-slate-700 focus:border-brand-500"
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              editable={!loading}
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            className={`rounded-xl py-4 items-center ${
              loading ? 'bg-brand-700' : 'bg-brand-500 active:bg-brand-600'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-semibold text-base">
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Toggle Mode */}
        <View className="flex-row justify-center mt-6">
          <Text className="text-slate-400 text-sm">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          </Text>
          <TouchableOpacity onPress={toggleMode} disabled={loading}>
            <Text className="text-brand-400 text-sm font-semibold">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
