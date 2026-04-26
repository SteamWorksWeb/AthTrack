import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import Paywall from '../../components/Paywall';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Athlete {
  id: string;
  name: string;
  sport: string;
  [key: string]: unknown; // allow extra columns from select('*')
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Athlete[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Paywall modal state
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

  // Debounce ref — cancels the previous search if the user keeps typing
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Search function ─────────────────────────────────────────────────────

  const searchAthletes = useCallback(async (q: string) => {
    const trimmed = q.trim();

    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .ilike('name', `%${trimmed}%`)
        .limit(20);

      if (error) throw error;

      setResults((data as Athlete[]) ?? []);
    } catch (error: any) {
      Alert.alert('Search Error', error?.message ?? 'An unexpected error occurred.');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // ─── Debounced input handler ──────────────────────────────────────────────

  function handleQueryChange(text: string) {
    setQuery(text);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => searchAthletes(text), 350);
  }

  // ─── Paywall handlers ─────────────────────────────────────────────────────

  function handleAthletePress(athleteId: string) {
    setSelectedAthleteId(athleteId);
  }

  function handlePaywallDismiss() {
    setSelectedAthleteId(null);
  }

  function handlePaywallSuccess() {
    setSelectedAthleteId(null);
    // Optionally refresh results or navigate to athlete profile
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderAthlete({ item }: { item: Athlete }) {
    return (
      <TouchableOpacity
        onPress={() => handleAthletePress(item.id)}
        className="flex-row items-center bg-slate-900 rounded-2xl px-4 py-3.5 mb-3 border border-slate-800 active:border-brand-500/50 active:bg-slate-800"
        activeOpacity={0.75}
      >
        {/* Avatar placeholder */}
        <View className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/40 items-center justify-center mr-3">
          <Text className="text-brand-400 text-base font-bold">
            {item.name?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>

        {/* Info */}
        <View className="flex-1">
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-slate-400 text-sm mt-0.5" numberOfLines={1}>
            {item.sport ?? 'Sport unknown'}
          </Text>
        </View>

        {/* Chevron */}
        <Text className="text-slate-600 text-lg ml-2">›</Text>
      </TouchableOpacity>
    );
  }

  function renderEmptyState() {
    if (isSearching) return null;
    if (!hasSearched) {
      return (
        <View className="items-center mt-20 px-8">
          <Text className="text-4xl mb-4">🏅</Text>
          <Text className="text-slate-400 text-center text-sm leading-relaxed">
            Search for athletes by name to get started.
          </Text>
        </View>
      );
    }
    return (
      <View className="items-center mt-20 px-8">
        <Text className="text-4xl mb-4">🔍</Text>
        <Text className="text-white font-semibold text-base mb-1">No athletes found</Text>
        <Text className="text-slate-400 text-center text-sm">
          Try a different name or check your spelling.
        </Text>
      </View>
    );
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Search bar */}
      <View className="px-4 pt-4 pb-3">
        <View className="flex-row items-center bg-slate-800 rounded-2xl px-4 border border-slate-700 focus-within:border-brand-500">
          <Text className="text-slate-400 text-base mr-2">🔍</Text>
          <TextInput
            className="flex-1 text-white text-base py-3.5"
            placeholder="Search athletes by name…"
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={handleQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => searchAthletes(query)}
            clearButtonMode="while-editing"
          />
          {isSearching ? (
            <ActivityIndicator size="small" color="#0ea5e9" className="ml-2" />
          ) : null}
        </View>
      </View>

      {/* Result count */}
      {hasSearched && !isSearching && results.length > 0 ? (
        <Text className="text-slate-500 text-xs px-5 pb-2">
          {results.length} result{results.length !== 1 ? 's' : ''} for "{query.trim()}"
        </Text>
      ) : null}

      {/* Results list */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderAthlete}
        ListEmptyComponent={renderEmptyState}
        contentContainerClassName="px-4 pt-1 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />

      {/* Paywall modal */}
      <Modal
        visible={selectedAthleteId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handlePaywallDismiss}
      >
        {selectedAthleteId ? (
          <Paywall
            athleteId={selectedAthleteId}
            onSuccess={handlePaywallSuccess}
            onDismiss={handlePaywallDismiss}
          />
        ) : null}
      </Modal>
    </KeyboardAvoidingView>
  );
}
