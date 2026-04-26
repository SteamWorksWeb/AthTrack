import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

/**
 * LargeSecureStore
 *
 * expo-secure-store has a 2048-byte value limit per key. Supabase session tokens
 * (JWTs + refresh tokens) routinely exceed this limit. This adapter chunks large
 * values into 2000-byte pieces and stores each chunk under a separate key, then
 * reassembles them on read.
 */
class LargeSecureStore {
  private async _encrypt(key: string, value: string): Promise<void> {
    const chunkSize = 2000;
    const chunks = Math.ceil(value.length / chunkSize);

    // Store the total number of chunks so we know how many to read back
    await SecureStore.setItemAsync(`${key}_count`, String(chunks));

    for (let i = 0; i < chunks; i++) {
      const chunk = value.slice(i * chunkSize, (i + 1) * chunkSize);
      await SecureStore.setItemAsync(`${key}_${i}`, chunk);
    }
  }

  private async _decrypt(key: string): Promise<string | null> {
    const countStr = await SecureStore.getItemAsync(`${key}_count`);
    if (!countStr) return null;

    const count = parseInt(countStr, 10);
    const chunks: string[] = [];

    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
      if (chunk === null) return null;
      chunks.push(chunk);
    }

    return chunks.join('');
  }

  async getItem(key: string): Promise<string | null> {
    return this._decrypt(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await this._encrypt(key, value);
  }

  async removeItem(key: string): Promise<void> {
    const countStr = await SecureStore.getItemAsync(`${key}_count`);
    if (!countStr) return;

    const count = parseInt(countStr, 10);
    await SecureStore.deleteItemAsync(`${key}_count`);

    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${key}_${i}`);
    }
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
