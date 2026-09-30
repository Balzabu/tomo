import { Share } from 'react-native';
import { withLockGrace } from '@/store/useLock';

/** Share plain text via the system share sheet (WhatsApp, Telegram, SMS, …). */
export async function shareText(message: string): Promise<void> {
  try {
    await withLockGrace(() => Share.share({ message }));
  } catch {
    // user dismissed or sharing unavailable - ignore
  }
}
