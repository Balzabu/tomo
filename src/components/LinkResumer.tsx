import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useLock } from '@/store/useLock';
import { hasPendingLink, takePendingLink } from '@/lib/deferredLink';

/** Opens a link held back by deferLink once the app is in front and unlocked. */
export function LinkResumer() {
  const locked = useLock((s) => s.locked);
  useEffect(() => {
    const resume = () => {
      if (useLock.getState().locked || AppState.currentState !== 'active' || !hasPendingLink()) return;
      // Let the resume/unlock settle so the lock decision for it is made - and
      // only take the link then: locking again meanwhile keeps it pending.
      setTimeout(() => {
        if (useLock.getState().locked) return;
        const route = takePendingLink();
        if (route) router.push(route as never);
      }, 50);
    };
    const t = setTimeout(resume, 300);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && setTimeout(resume, 300));
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [locked]);
  return null;
}
