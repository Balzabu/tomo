// What an import from another app produces: books plus the notes and reading
// sessions that belong to them. Pure (type-only app imports) so the check
// scripts run the parsers under plain Node.
import type { ImportedBook, NoteType, ReadRecord } from '@/types';

export type BundleSource = 'openreads' | 'bookmory' | 'goodreads' | 'storygraph';

export interface BundleBook extends ImportedBook {
  /** links the book's notes and sessions within the bundle */
  key: string;
  coverUrl?: string;
  /** a cover shipped inside the export (Openreads backups) */
  coverBase64?: string;
  description?: string;
  publisher?: string;
  language?: string;
}

export interface BundleNote {
  bookKey: string;
  type: NoteType;
  text: string;
  page?: number;
  createdAt: number;
}

export interface BundleSession {
  bookKey: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  pagesRead: number;
  startPage?: number;
  endPage?: number;
}

export interface ImportBundle {
  source: BundleSource;
  books: BundleBook[];
  notes: BundleNote[];
  sessions: BundleSession[];
}

/** Names the parsers use for app-level shelves (passed in translated). */
export interface ShelfLabels {
  favourites: string;
  wishlist: string;
}

/**
 * Split dated reads into Tomo's model: the current cycle (startedAt /
 * finishedAt) and earlier completed ones (`reads`). `reads` input is oldest
 * first; a finished book's last finished read is its current cycle.
 */
export function splitReads(
  reads: { start?: number; end?: number }[],
  finished: boolean
): { startedAt?: number; finishedAt?: number; reads?: ReadRecord[]; readCount?: number } {
  const done = reads.filter((r) => r.end != null) as { start?: number; end: number }[];
  const open = reads.filter((r) => r.end == null);
  const out: { startedAt?: number; finishedAt?: number; reads?: ReadRecord[]; readCount?: number } = {};
  let past = done;
  if (finished && done.length) {
    const cur = done[done.length - 1];
    out.startedAt = cur.start;
    out.finishedAt = cur.end;
    past = done.slice(0, -1);
  } else if (open.length) {
    out.startedAt = open[open.length - 1].start;
  }
  if (past.length) out.reads = past.map((r) => ({ startedAt: r.start, finishedAt: r.end }));
  if (done.length) out.readCount = done.length;
  return out;
}

/** Base64 of raw bytes (no Buffer/btoa dependency). */
export function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${chars[(n >> 18) & 63]}${chars[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${chars[(n >> 18) & 63]}${chars[(n >> 12) & 63]}${chars[(n >> 6) & 63]}=`;
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** UTF-8 bytes to string (TextDecoder isn't guaranteed on Hermes). */
export function utf8Decode(bytes: Uint8Array): string {
  // Invalid sequences (a CSV re-saved as Latin-1 by a spreadsheet) become
  // U+FFFD instead of throwing, like the platform decoder does.
  const cont = (i: number) => i < bytes.length && (bytes[i] & 0xc0) === 0x80;
  const parts: string[] = [];
  let chunk: number[] = [];
  for (let i = 0; i < bytes.length; ) {
    const c = bytes[i];
    let cp = 0xfffd;
    let len = 1;
    if (c < 0x80) cp = c;
    else if (c >= 0xc2 && c < 0xe0 && cont(i + 1)) {
      cp = ((c & 31) << 6) | (bytes[i + 1] & 63);
      len = 2;
    } else if (c >= 0xe0 && c < 0xf0 && cont(i + 1) && cont(i + 2)) {
      cp = ((c & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
      len = 3;
    } else if (c >= 0xf0 && c < 0xf5 && cont(i + 1) && cont(i + 2) && cont(i + 3)) {
      cp = ((c & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
      len = 4;
      if (cp > 0x10ffff) cp = 0xfffd;
    }
    i += len;
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else chunk.push(cp);
    if (chunk.length >= 8192) {
      parts.push(String.fromCharCode(...chunk));
      chunk = [];
    }
  }
  parts.push(String.fromCharCode(...chunk));
  const out = parts.join('');
  // A BOM would otherwise end up in the first field name.
  return out.charCodeAt(0) === 0xfeff ? out.slice(1) : out;
}

const MIN_TS = Date.UTC(1900, 0, 1);
const MAX_SESSION_SECONDS = 86_400;

/** A plausible timestamp (1900 .. tomorrow), else undefined. */
function okTime(v: number | undefined, now: number): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= MIN_TS && v <= now + 86_400_000 ? v : undefined;
}

/**
 * Bring a bundle's dates into range before it is applied: a file from another
 * app (or a crafted one) can carry any number, and a date far outside the
 * calendar breaks date keys ("NaN-NaN-NaN"), stats and goals. Sessions whose
 * times are unusable are dropped; durations are capped at a day.
 */
export function clampBundleTimes(bundle: ImportBundle, now: number = Date.now()): ImportBundle {
  for (const b of bundle.books) {
    b.addedAt = okTime(b.addedAt, now);
    b.startedAt = okTime(b.startedAt, now);
    b.finishedAt = okTime(b.finishedAt, now);
    if (b.reads) {
      b.reads = b.reads
        .map((r) => ({ ...r, startedAt: okTime(r.startedAt, now), finishedAt: okTime(r.finishedAt, now) }))
        .filter((r): r is typeof r & { finishedAt: number } => r.finishedAt != null)
        .map((r) => (r.startedAt == null ? { finishedAt: r.finishedAt } : { startedAt: r.startedAt, finishedAt: r.finishedAt }));
    }
  }
  bundle.sessions = bundle.sessions.filter((x) => {
    const start = okTime(x.startTime, now);
    const end = okTime(x.endTime, now);
    if (start == null || end == null || end < start) return false;
    x.durationSeconds = Math.max(0, Math.min(MAX_SESSION_SECONDS, Number.isFinite(x.durationSeconds) ? x.durationSeconds : 0));
    return true;
  });
  for (const n of bundle.notes) n.createdAt = okTime(n.createdAt, now) ?? now;
  return bundle;
}

/** Local timestamp from an ISO-like string without zone ("2026-09-02T00:00:00.000"). */
export function parseLocalIso(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return undefined;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s.trim())) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : undefined;
  }
  // Date-only or midnight: noon, so a DST shift can't move it to another day.
  const h = m[4] ? Number(m[4]) : 12;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h === 0 && !m[5] ? 12 : h, m[5] ? Number(m[5]) : 0, m[6] ? Number(m[6]) : 0);
  return Number.isFinite(d.getTime()) ? d.getTime() : undefined;
}
