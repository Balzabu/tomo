import AsyncStorage from '@react-native-async-storage/async-storage';

// The app was formerly codenamed "bootrack"; its AsyncStorage keys still carried
// that prefix. We rename them to "tomo:" without losing existing users' data by
// copying each old key to its new name on first launch after the update.
//
// Idempotent and safe to run from both the app and the headless widget context:
// each key is copied only when the new key is absent and the old one exists,
// then the old key is removed. Concurrent runs converge (same value copied).
const RENAMES: readonly (readonly [oldKey: string, newKey: string])[] = [
  ['bootrack:data:v1', 'tomo:data:v1'],
  ['bootrack:settings:v2', 'tomo:settings:v2'],
  ['bootrack:activeSession:v1', 'tomo:activeSession:v1'],
  ['bootrack:googleApiKey', 'tomo:googleApiKey'],
  ['bootrack:widget:reading-selection:v1', 'tomo:widget:reading-selection:v1'],
];

let done = false;

/**
 * One-time rename of the legacy "bootrack:" storage keys to "tomo:".
 * Best-effort: a failure leaves the data under the old keys to be retried on the
 * next launch, so nothing is lost.
 */
export async function migrateLegacyKeys(): Promise<void> {
  if (done) return;
  try {
    // One cheap listing instead of a getItem per key: reading a value only to
    // test its presence could throw on an oversized legacy blob.
    const keys = new Set(await AsyncStorage.getAllKeys());
    for (const [oldKey, newKey] of RENAMES) {
      if (!keys.has(oldKey)) continue; // nothing under the old key
      if (keys.has(newKey)) {
        // Already migrated but the old copy was never removed (a crash between
        // the two writes): drop it so it stops eating the storage budget.
        await AsyncStorage.removeItem(oldKey);
        continue;
      }
      const oldVal = await AsyncStorage.getItem(oldKey);
      if (oldVal == null) continue;
      await AsyncStorage.setItem(newKey, oldVal);
      await AsyncStorage.removeItem(oldKey);
    }
    done = true;
  } catch {
    // leave the old keys in place; the next launch retries the migration
  }
}
