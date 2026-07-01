import type { RefObject } from 'react';
import type { View } from 'react-native';
import { Image } from 'expo-image';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export type ShareImageResult = 'shared' | 'unavailable' | 'failed';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capture a view as a PNG and open the share sheet. Returns a result code so
 * the caller can show an error instead of failing silently.
 */
export async function shareViewAsImage(
  ref: RefObject<View | null>,
  opts: { dialogTitle?: string; preloadUrls?: (string | undefined)[] } = {}
): Promise<ShareImageResult> {
  let uri: string | undefined;
  try {
    if (!ref.current) return 'failed';

    // Warm the image cache for any remote covers so they're painted in time.
    const remote = (opts.preloadUrls ?? []).filter(
      (u): u is string => !!u && (u.startsWith('http://') || u.startsWith('https://'))
    );
    if (remote.length) {
      await Promise.race([Image.prefetch(remote), delay(4000)]); // cap the wait
    }
    // Let the layout and images settle before snapshotting.
    await delay(remote.length ? 350 : 120);

    if (!(await Sharing.isAvailableAsync())) return 'unavailable';

    uri = await captureRef(ref, { format: 'png', quality: 1 });
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: opts.dialogTitle ?? 'Tomo',
      UTI: 'public.png',
    });
    return 'shared';
  } catch {
    return 'failed';
  } finally {
    // captureRef writes a temp PNG to the cache; remove it so shares don't
    // accumulate files over time.
    if (uri) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
