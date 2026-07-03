import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { uid } from '@/lib/utils';

// Locally-stored custom covers live here so they survive app restarts.
const COVERS_DIR = `${FileSystem.documentDirectory}covers/`;

export type PickResult =
  | { status: 'ok'; uri: string }
  | { status: 'canceled' };

export function isLocalCover(uri?: string): boolean {
  return !!uri && uri.startsWith(COVERS_DIR);
}

/** Read a local cover file as base64 (for embedding in a backup). */
export async function coverToBase64(uri: string): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }
}

/** Write base64 image data to a new local cover file (when restoring a backup). */
export async function base64ToCover(base64: string): Promise<string> {
  await ensureDir();
  const dest = `${COVERS_DIR}${uid('cov_')}.jpg`;
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(COVERS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(COVERS_DIR, { intermediates: true });
  }
}

/** Let the user pick an image and copy it into persistent storage. */
export async function pickCover(): Promise<PickResult> {
  // No permission gate: launchImageLibraryAsync uses the system picker, which
  // needs no media permission. Requesting one here actually *broke* the picker
  // on Android < 13, where the request includes WRITE_EXTERNAL_STORAGE - a
  // permission this app strips from its manifest, so it was always denied.
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [2, 3],
    quality: 0.85,
  });
  if (res.canceled || !res.assets?.[0]) return { status: 'canceled' };

  await ensureDir();
  const asset = res.assets[0];
  const dest = `${COVERS_DIR}${uid('cov_')}.jpg`;
  // Cap the stored size: a camera-roll crop is easily 12MP+, which bloats
  // base64-embedded backups and makes the widget renderer decode a ~45MB
  // bitmap just to scale it down to a 64dp thumbnail. ~600px wide is more
  // than any in-app rendering uses.
  const MAX_WIDTH = 600;
  if (asset.width && asset.width > MAX_WIDTH) {
    try {
      const resized = await manipulateAsync(asset.uri, [{ resize: { width: MAX_WIDTH } }], {
        compress: 0.85,
        format: SaveFormat.JPEG,
      });
      await FileSystem.moveAsync({ from: resized.uri, to: dest });
      return { status: 'ok', uri: dest };
    } catch {
      // resize is an optimisation - fall back to storing the original
    }
  }
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  return { status: 'ok', uri: dest };
}

/** Delete a locally-stored cover file (no-op for remote/online covers). */
export async function deleteCoverFile(uri?: string): Promise<void> {
  if (!isLocalCover(uri)) return;
  try {
    await FileSystem.deleteAsync(uri as string, { idempotent: true });
  } catch {
    // ignore - orphaned file is harmless
  }
}

/**
 * Delete cover files no longer referenced by any book. This reclaims orphans
 * left behind when the app is force-quit during the delete-undo window (the
 * book record is already gone but its cover cleanup never ran). Best-effort.
 */
export async function reconcileCovers(referencedUrls: (string | undefined)[]): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(COVERS_DIR);
    if (!info.exists) return;
    const referenced = new Set(referencedUrls.filter(isLocalCover) as string[]);
    const names = await FileSystem.readDirectoryAsync(COVERS_DIR);
    await Promise.all(
      names.map((name) => {
        const uri = `${COVERS_DIR}${name}`;
        if (referenced.has(uri)) return Promise.resolve();
        return FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      })
    );
  } catch {
    // best-effort cleanup
  }
}

/** Remove every locally-stored cover file (used when wiping all data). */
export async function clearCovers(): Promise<void> {
  try {
    await FileSystem.deleteAsync(COVERS_DIR, { idempotent: true });
  } catch {
    // ignore - best-effort cleanup
  }
}
