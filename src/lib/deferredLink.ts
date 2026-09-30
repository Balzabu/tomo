import { isLockedOrDue } from '@/store/useLock';

// Links into the app (widgets, notifications' deep links, web pages, other
// apps) are held back while the app is locked - or is about to lock on this
// resume - and opened only after the PIN. Screens mounted by a link would
// otherwise run under the lock screen: start a reading session, open the
// camera, show a share sheet…

let pending: string | null = null;

const isHome = (p: string) => /^(tomo:\/\/\/?)?\/?$/.test(p);

/** expo-router's redirectSystemPath: returns the path to open now ('' opens
 *  nothing). */
export function deferLink(path: string, initial: boolean): string {
  // A cold start can't know yet whether the lock is on: the library opens
  // first and the link is replayed once the lock state is known.
  if (initial || isLockedOrDue()) {
    if (path && !isHome(path)) pending = path;
    // Warm: stay where we are. Navigating home would pop the screen under the
    // lock (a running timer's "cancel reading?" guard, unsaved forms).
    return initial ? '/' : '';
  }
  return path;
}

/** The held-back link as a router path (once). */
export function takePendingLink(): string | null {
  const p = pending;
  pending = null;
  if (!p) return null;
  const route = p.replace(/^tomo:\/\/\/?/, '/').replace(/^\/+/, '/');
  // Only in-app routes ("tomo:foo" and the like are dropped).
  return route === '/' || !route.startsWith('/') ? null : route;
}

export function hasPendingLink(): boolean {
  return pending != null;
}
