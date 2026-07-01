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
    for (const [oldKey, newKey] of RENAMES) {
      const existingNew = await AsyncStorage.getItem(newKey);
      if (existingNew != null) continue; // already migrated / fresh install
      const oldVal = await AsyncStorage.getItem(oldKey);
      if (oldVal == null) continue; // nothing under the old key
      await AsyncStorage.setItem(newKey, oldVal);
      await AsyncStorage.removeItem(oldKey);
    }
    done = true;
  } catch {
    // leave the old keys in place; the next launch retries the migration
  }
}
