import { deferLink } from '@/lib/deferredLink';

// Every incoming link passes here first - see src/lib/deferredLink.ts.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    return deferLink(path, initial);
  } catch {
    // Can't tell whether the app is locked: open nothing new.
    return initial ? '/' : '';
  }
}
