import { Share } from 'react-native';

/** Share plain text via the system share sheet (WhatsApp, Telegram, SMS, …). */
export async function shareText(message: string): Promise<void> {
  try {
    await Share.share({ message });
  } catch {
    // user dismissed or sharing unavailable - ignore
  }
}
