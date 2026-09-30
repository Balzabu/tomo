import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type Tone = '0' | '10' | '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '1000';
export type Palette = Record<Tone, string>;
export interface DynamicPalettes {
  accent1: Palette;
  accent2: Palette;
  accent3: Palette;
  neutral1: Palette;
  neutral2: Palette;
}

export interface SharedFile {
  /** file:// copy in the app cache */
  uri: string;
  name: string;
}

interface TomoSystemNative {
  getDynamicPalettes(): DynamicPalettes | null;
  setRecentsHidden(hidden: boolean): boolean;
  consumeSharedFile(): Promise<SharedFile | null>;
  clock(): { elapsed: number; boot: number };
  addListener(event: 'onSharedFile', cb: (f: SharedFile) => void): { remove(): void };
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<TomoSystemNative>('TomoSystem') : null;

/** Android 12+ wallpaper-based palettes, or null (older Android, iOS, web). */
export function getDynamicPalettes(): DynamicPalettes | null {
  try {
    return native?.getDynamicPalettes() ?? null;
  } catch {
    return null;
  }
}

/** Blank the app's snapshot in the recent-apps switcher (app lock). */
export function setRecentsHidden(hidden: boolean): void {
  try {
    native?.setRecentsHidden(hidden);
  } catch {
    // best-effort
  }
}

/** The file Tomo was launched with from another app's Share sheet (once). */
export async function consumeSharedFile(): Promise<SharedFile | null> {
  try {
    return (await native?.consumeSharedFile()) ?? null;
  } catch {
    return null;
  }
}

/** Files shared to Tomo while it is running. */
export function onSharedFile(cb: (f: SharedFile) => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener('onSharedFile', cb);
  return () => sub.remove();
}

/** Monotonic clock (ms since boot) and boot count - unaffected by changes to
 *  the device time. Falls back to the wall clock where unavailable. */
export function monotonicClock(): { elapsed: number; boot: number } {
  try {
    const c = native?.clock();
    if (c) return c;
  } catch {
    // fall through
  }
  return { elapsed: Date.now(), boot: -2 };
}
