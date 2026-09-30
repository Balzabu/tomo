import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { toDateKey } from '@/lib/utils';

/**
 * Today's local day key, kept current: re-read on screen focus, when the
 * app comes back to the front, and at midnight while it stays open - so
 * daily goals, streaks and plan quotas never show yesterday.
 */
export function useTodayKey(): string {
  const [today, setToday] = useState(() => toDateKey());
  const refresh = useCallback(() => setToday(toDateKey()), []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refresh());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [today, refresh]);
  return today;
}
