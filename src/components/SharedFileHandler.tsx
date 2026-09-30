import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { consumeSharedFile, onSharedFile, SharedFile } from '../../modules/tomo-system';
import { useLock } from '@/store/useLock';
import { useTranslation } from '@/i18n';
import { importFromUri } from '@/lib/importFlow';

/**
 * Files shared to Tomo from other apps (Bookmory, Openreads, a file manager,
 * Drive…) go straight into the import flow - after the lock screen, if any.
 */
export function SharedFileHandler() {
  const { t: tr } = useTranslation();
  const locked = useLock((s) => s.locked);
  const [pending, setPending] = useState<SharedFile | null>(null);
  const busy = useRef(false);
  // Re-check a pending file whenever the app comes to the front.
  const [front, setFront] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && setFront((n) => n + 1));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void consumeSharedFile().then((first) => first && setPending(first));
    return onSharedFile(setPending);
  }, []);

  useEffect(() => {
    if (!pending || locked || busy.current) return;
    // A share into the running app reaches us before the resume that may
    // lock it: wait until the app is in front and the lock has decided.
    const id = setTimeout(() => {
      if (AppState.currentState !== 'active' || useLock.getState().locked || busy.current) return;
      busy.current = true;
      const file = pending;
      setPending(null);
      void importFromUri(file.uri, tr).finally(() => {
        busy.current = false;
      });
    }, 600);
    return () => clearTimeout(id);
  }, [pending, locked, front, tr]);

  return null;
}
