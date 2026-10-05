import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { nextDayRollover, readingDayKey } from '@/lib/readingDay';
import { useSettings } from '@/store/useSettings';

/**
 * The hour reading days start at. Add it to the deps of anything memoized
 * from session days: changing it re-buckets every session without touching
 * the sessions themselves.
 */
export function useDayStartHour(): number {
  return useSettings((s) => s.dayStartHour);
}

/**
 * Today's reading day key, kept current: re-read on screen focus, when the
 * app comes back to the front, when the day start hour changes and at the
 * rollover while it stays open - so daily goals, streaks and plan quotas
 * never show yesterday.
 */
export function useTodayKey(): string {
  const dayStartHour = useDayStartHour();
  const [today, setToday] = useState(() => readingDayKey());
  const refresh = useCallback(() => setToday(readingDayKey()), []);
  useFocusEffect(refresh);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refresh());
    const now = Date.now();
    const timer = setTimeout(refresh, nextDayRollover(now) - now + 1000);
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [today, refresh, dayStartHour]);
  return today;
}
