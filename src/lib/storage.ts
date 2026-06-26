import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '@/types';

const STORAGE_KEY = 'bootrack:data:v1';

export const emptyData: AppData = {
  books: [],
  sessions: [],
  notes: [],
  shelves: [],
  goals: [],
  version: 1,
};

export async function loadData(): Promise<AppData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...emptyData };
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...emptyData,
      ...parsed,
      books: parsed.books ?? [],
      sessions: parsed.sessions ?? [],
      notes: parsed.notes ?? [],
      shelves: parsed.shelves ?? [],
      goals: parsed.goals ?? [],
    };
  } catch (e) {
    console.warn('Failed to load data, starting fresh', e);
    return { ...emptyData };
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to persist data', e);
  }
}

export async function clearData(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
