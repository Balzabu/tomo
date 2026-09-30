// "Quote of the day" rotation. Pure (type-only app imports) so the check
// scripts run it under plain Node.
import type { BookNote } from '@/types';
import { dateKeyToDate, toDateKey } from './utils.ts';

/**
 * Today's quote: quotes in the order they were saved, one per day, cycling.
 * Walking the list day by day shows every quote once before any repeats (the
 * "least recently shown" order, without having to remember what was shown).
 * `offset` is the per-widget "next quote" taps.
 */
export function quoteOfDay(notes: BookNote[], today: string = toDateKey(), offset = 0): BookNote | undefined {
  const quotes = notes
    .filter((n) => n.type === 'quote' && n.text.trim())
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (quotes.length === 0) return undefined;
  const day = Math.round(dateKeyToDate(today).getTime() / 86_400_000);
  const i = (((day + offset) % quotes.length) + quotes.length) % quotes.length;
  return quotes[i];
}
