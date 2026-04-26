import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

const IOS_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY!;
const ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY!;

/**
 * initRevenueCat
 *
 * Call once at app start (before any Purchases API calls), ideally in the
 * root layout. Selects the correct platform API key automatically.
 *
 * Debug logging is enabled in __DEV__ builds only; stripped in production.
 */
export function initRevenueCat(): void {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  Purchases.configure({ apiKey });
}
