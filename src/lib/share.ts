import { Share } from 'react-native';
import { withLockGrace } from '@/store/useLock';

/** Share plain text via the system share sheet (WhatsApp, Telegram, SMS, …). */
export async function shareText(message: string): Promise<void> {
  try {
    // Korean UI strings carry invisible word joiners (see keepKoreanWords):
    // not wanted in text that leaves the app.
    await withLockGrace(() => Share.share({ message: message.replace(/\u2060/g, '') }));
  } catch {
    // user dismissed or sharing unavailable - ignore
  }
}
