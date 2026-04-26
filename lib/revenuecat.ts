import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

const IOS_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '';

/**
 * Module-level mock flag.
 *
 * Set to `true` when RevenueCat cannot be initialized — e.g. running on iOS
 * without a valid App Store Connect / Apple Developer account key. Consumers
 * read this via `isRcMockMode()` to skip real SDK calls and substitute local
 * mock behavior so the app remains fully testable on iOS simulators.
 */
let _isMockMode = false;

/** Returns true when RevenueCat is running in mock (bypass) mode. */
export function isRcMockMode(): boolean {
  return _isMockMode;
}

/**
 * initRevenueCat
 *
 * Call once at app startup, before any `Purchases.*` calls.
 *
 * Behavior:
 *  - Android: always initializes the live SDK with the Android key.
 *  - iOS + valid key: initializes the live SDK with the iOS key.
 *  - iOS + missing/empty key: sets `isMockMode = true`, logs a warning,
 *    and skips SDK initialization entirely — preventing simulator crashes
 *    caused by an unconfigured Apple entitlement.
 */
export function initRevenueCat(): void {
  if (Platform.OS === 'ios') {
    if (!IOS_KEY) {
      _isMockMode = true;
      console.warn(
        '[RevenueCat] iOS key is missing — running in MOCK MODE. ' +
          'Purchases will be simulated. Set EXPO_PUBLIC_RC_IOS_KEY when ' +
          'an Apple Developer account is available.',
      );
      return; // ← Do NOT call Purchases.configure; no key = crash on iOS
    }
  }

  // Android, or iOS with a valid key — initialize the live SDK
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  Purchases.configure({ apiKey });

  _isMockMode = false;
}
