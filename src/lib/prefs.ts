import AsyncStorage from '@react-native-async-storage/async-storage';

// Lightweight key/value prefs kept separate from the main app data blob.
const GOOGLE_KEY = 'bootrack:googleApiKey';

export async function loadGoogleApiKey(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(GOOGLE_KEY)) ?? '';
  } catch {
    return '';
  }
}

export async function saveGoogleApiKey(key: string): Promise<void> {
  const k = key.trim();
  if (k) await AsyncStorage.setItem(GOOGLE_KEY, k);
  else await AsyncStorage.removeItem(GOOGLE_KEY);
}
