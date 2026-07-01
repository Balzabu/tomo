import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
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
  const dest = `${COVERS_DIR}${uid('cov_')}.jpg`;
  await FileSystem.copyAsync({ from: res.assets[0].uri, to: dest });
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
