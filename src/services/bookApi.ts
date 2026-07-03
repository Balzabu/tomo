import { BookSearchResult } from '@/types';

// Tomo uses only free, key-less public APIs:
//  - Google Books  (rich metadata, but a tight key-less quota → HTTP 429)
//  - Open Library  (very generous, no key) - used as fallback for search
//                   and for ISBN lookups / covers.
//
// Strategy: try Google first (best data); on rate-limit/failure fall back to
// Open Library so search keeps working even when Google says 429.

const GOOGLE = 'https://www.googleapis.com/books/v1/volumes';
// Legacy Google Book Search "GData" feed: keyless, NOT subject to the v1 API's
// aggressive 429 throttling, and covers Italian/European editions the modern
// key-less endpoint won't return. Same catalog as v1, returned as JSON.
const GDATA = 'https://books.google.com/books/feeds/volumes';
const OPENLIB = 'https://openlibrary.org';
const OPENLIB_COVERS = 'https://covers.openlibrary.org';

const HEADERS = {
  Accept: 'application/json',
  // Open Library asks for a descriptive UA; harmless for Google.
  'User-Agent': 'Tomo/1.0 (reading tracker app)',
};

// Google's key-less endpoint has a tiny shared quota and often returns 429.
// Once we see a 429 we stop calling Google for a while and go straight to
// Open Library, so searches stay instant instead of waiting on a dead request.
const GOOGLE_COOLDOWN_MS = 10 * 60 * 1000;
let googleBlockedUntil = 0;

// Optional user-supplied Google Books API key. With a key the quota is ~1000
// req/day (no more 429) and Italian/European editions become findable.
let googleApiKey = '';

export function setGoogleApiKey(key: string): void {
  googleApiKey = (key ?? '').trim();
  // A fresh key deserves a fresh chance even if we were on cooldown.
  if (googleApiKey) googleBlockedUntil = 0;
}

function keyParam(): string {
  return googleApiKey ? `&key=${encodeURIComponent(googleApiKey)}` : '';
}

// Google API keys: "AIza" + 35 url-safe base64 chars (39 total).
export const GOOGLE_API_KEY_REGEX = /^AIza[0-9A-Za-z_-]{35}$/;

/** Quick offline format check - does this look like a Google API key at all? */
export function isLikelyGoogleApiKey(key: string): boolean {
  return GOOGLE_API_KEY_REGEX.test(key.trim());
}

export type KeyValidation = 'valid' | 'invalid' | 'network';

/**
 * Verify a Google Books API key by making one tiny request and reading the
 * HTTP status: 200 → valid, 400/403 → invalid (bad key or Books API not
 * enabled), anything else / no network → 'network' (couldn't verify).
 */
export async function validateGoogleApiKey(keyRaw: string): Promise<KeyValidation> {
  const key = keyRaw.trim();
  if (!isLikelyGoogleApiKey(key)) return 'invalid';
  const url = `${GOOGLE}?q=harry+potter&maxResults=1&country=US&key=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (res.status === 200) return 'valid';
    if (res.status === 400 || res.status === 403) return 'invalid';
    return 'network';
  } catch {
    return 'network';
  } finally {
    clearTimeout(timer);
  }
}

function googleAvailable(): boolean {
  // With a key, always try Google (cooldown is only for the throttled keyless API).
  return googleApiKey ? true : Date.now() >= googleBlockedUntil;
}

// Only accept http(s) covers (upgraded to https); reject file:/data:/other
// schemes a spoofed API response might slip in before we hand it to the loader.
function httpsCover(url?: string): string | undefined {
  if (!url) return undefined;
  const upgraded = url.replace(/^http:\/\//i, 'https://');
  return /^https:\/\//i.test(upgraded) ? upgraded : undefined;
}

// Strip the user's API key before logging a URL (it lands in logcat otherwise).
function redactUrl(url: string): string {
  return url.replace(/([?&]key=)[^&]*/i, '$1REDACTED');
}

interface FetchResult<T> {
  status: number;
  data: T | null;
}

// Bumped whenever a fetch fails at the network layer (timeout, DNS, airplane
// mode). Callers compare against their start time to tell "the catalogs have
// no such book" apart from "the catalogs were unreachable" - showing a user
// with no connection a sad "no results" actively misleads them.
let lastNetworkFailureAt = 0;

/** fetch JSON with a timeout; never throws - returns status + parsed body. */
async function getJson<T>(url: string): Promise<FetchResult<T>> {
  const controller = new AbortController();
  // Declared outside try so the throw path can clear it too, and kept armed
  // through res.json() so a slow body read is bounded by the same timeout.
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) return { status: res.status, data: null };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return { status: res.status, data: null };
    return { status: res.status, data: (await res.json()) as T };
  } catch (e) {
    console.warn(`getJson failed for ${redactUrl(url)}:`, String(e));
    lastNetworkFailureAt = Date.now();
    return { status: 0, data: null };
  } finally {
    clearTimeout(timeout);
  }
}

interface GoogleVolume {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[];
  };
}

function mapGoogleVolume(v: GoogleVolume): BookSearchResult | null {
  const info = v.volumeInfo;
  if (!info || !info.title) return null;
  const isbn =
    info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ??
    info.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier;
  return {
    title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
    authors: info.authors ?? [],
    coverUrl: httpsCover(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
    isbn,
    pageCount: info.pageCount,
    description: info.description,
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    categories: info.categories,
    language: info.language,
    source: 'google',
  };
}

/** Returns null when Google is unavailable/rate-limited (caller should fall back). */
async function googleSearch(q: string): Promise<BookSearchResult[] | null> {
  if (!googleAvailable()) return null;
  const url = `${GOOGLE}?q=${encodeURIComponent(q)}&maxResults=24&printType=books&country=US${keyParam()}`;
  const { status, data } = await getJson<{ items?: GoogleVolume[] }>(url);
  if (status === 429) {
    googleBlockedUntil = Date.now() + GOOGLE_COOLDOWN_MS;
    return null;
  }
  if (!data) return null;
  return (data.items ?? [])
    .map(mapGoogleVolume)
    .filter((b): b is BookSearchResult => b !== null);
}

interface GText {
  $t?: string;
}
interface GLink {
  rel?: string;
  href?: string;
}
interface GEntry {
  title?: GText;
  link?: GLink[];
  dc$creator?: GText[];
  dc$date?: GText[];
  dc$format?: GText[];
  dc$identifier?: GText[];
  dc$description?: GText[];
  dc$publisher?: GText[];
  dc$language?: GText[];
}
interface GFeed {
  feed?: { entry?: GEntry[] };
}

function mapGEntry(e: GEntry): BookSearchResult | null {
  const title = e.title?.$t;
  if (!title) return null;

  const authors = (e.dc$creator ?? [])
    .map((c) => c.$t)
    .filter((x): x is string => !!x);

  const ids = (e.dc$identifier ?? []).map((i) => i.$t ?? '');
  const isbn =
    ids.find((s) => s.startsWith('ISBN:') && s.length === 18)?.slice(5) ??
    ids.find((s) => s.startsWith('ISBN:'))?.slice(5);

  const formats = (e.dc$format ?? []).map((f) => f.$t ?? '');
  const pageStr = formats.find((f) => /pages?/i.test(f));
  const pageCount = pageStr ? parseInt(pageStr, 10) || undefined : undefined;

  // Strip the page-curl overlay Google bakes into some feed thumbnails
  // (edge=curl) and normalise to the standard zoom=1 thumbnail.
  const thumb = e.link
    ?.find((l) => l.rel?.includes('thumbnail'))
    ?.href?.replace(/([?&])zoom=\d+/, '$1zoom=1')
    .replace(/&edge=curl/, '');

  return {
    title,
    authors,
    coverUrl: httpsCover(thumb) ?? olCoverFromIsbn(isbn),
    isbn,
    pageCount,
    description: e.dc$description?.[0]?.$t || undefined,
    publisher: e.dc$publisher?.[0]?.$t,
    publishedDate: e.dc$date?.[0]?.$t,
    language: e.dc$language?.[0]?.$t,
    source: 'google',
  };
}

async function gdataSearch(q: string): Promise<BookSearchResult[]> {
  const url = `${GDATA}?q=${encodeURIComponent(q)}&alt=json&max-results=24`;
  const { data } = await getJson<GFeed>(url);
  const entries = data?.feed?.entry ?? [];
  return entries
    .map(mapGEntry)
    .filter((b): b is BookSearchResult => b !== null);
}

async function gdataIsbn(isbn: string): Promise<BookSearchResult | null> {
  const url = `${GDATA}?q=isbn:${encodeURIComponent(isbn)}&alt=json`;
  const { data } = await getJson<GFeed>(url);
  const entry = data?.feed?.entry?.[0];
  const mapped = entry ? mapGEntry(entry) : null;
  if (mapped) {
    mapped.isbn = mapped.isbn ?? isbn;
    mapped.coverUrl = mapped.coverUrl ?? olCoverFromIsbn(isbn);
  }
  return mapped;
}

interface OLDoc {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  publisher?: string[];
  language?: string[];
}

function olCoverFromId(id?: number): string | undefined {
  return id ? `${OPENLIB_COVERS}/b/id/${id}-M.jpg` : undefined;
}

function olCoverFromIsbn(isbn?: string): string | undefined {
  // default=false: Open Library then 404s for a missing cover instead of
  // serving a blank 200 image - the image loader's error path can fall back
  // to the title placeholder rather than storing a permanently blank cover.
  return isbn ? `${OPENLIB_COVERS}/b/isbn/${isbn}-L.jpg?default=false` : undefined;
}

function mapOLDoc(d: OLDoc): BookSearchResult | null {
  if (!d.title) return null;
  const isbn = d.isbn?.find((x) => x.length === 13) ?? d.isbn?.[0];
  return {
    title: d.title,
    authors: d.author_name ?? [],
    coverUrl: olCoverFromId(d.cover_i) ?? olCoverFromIsbn(isbn),
    isbn,
    pageCount: d.number_of_pages_median,
    publishedDate: d.first_publish_year ? String(d.first_publish_year) : undefined,
    publisher: d.publisher?.[0],
    language: d.language?.[0],
    source: 'openlibrary',
  };
}

async function openLibrarySearch(q: string): Promise<BookSearchResult[]> {
  const fields =
    'title,author_name,cover_i,isbn,first_publish_year,number_of_pages_median,publisher,language';
  const url = `${OPENLIB}/search.json?q=${encodeURIComponent(q)}&limit=24&fields=${fields}`;
  const { data } = await getJson<{ docs?: OLDoc[] }>(url);
  if (!data?.docs) return [];
  return data.docs
    .map(mapOLDoc)
    .filter((b): b is BookSearchResult => b !== null);
}

function dedupe(list: BookSearchResult[]): BookSearchResult[] {
  const seen = new Set<string>();
  const out: BookSearchResult[] = [];
  for (const b of list) {
    const key = `${b.title}|${b.authors.join(',')}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

export interface SearchOutcome {
  results: BookSearchResult[];
  /** true when nothing was found AND at least one source failed at the network layer */
  offline: boolean;
}

export interface LookupOutcome {
  result: BookSearchResult | null;
  /** true when nothing was found AND at least one source failed at the network layer */
  offline: boolean;
}

/**
 * Free-text search (title, author, keyword). Source chain:
 *  1. Google Books v1 JSON - only with a user API key (key-less = 429)
 *  2. Google legacy GData feed - key-less, not throttled, great IT coverage
 *  3. Open Library - final safety net
 */
export async function searchBooks(query: string): Promise<SearchOutcome> {
  const q = query.trim();
  if (!q) return { results: [], offline: false };
  const startedAt = Date.now();
  const outcome = (results: BookSearchResult[]): SearchOutcome => ({
    results,
    offline: results.length === 0 && lastNetworkFailureAt >= startedAt,
  });

  if (googleApiKey) {
    const v1 = await googleSearch(q);
    if (v1 && v1.length > 0) return outcome(dedupe(v1));
  }

  const gdata = await gdataSearch(q);
  if (gdata.length > 0) return outcome(dedupe(gdata));

  const ol = await openLibrarySearch(q);
  return outcome(dedupe(ol));
}

/** Lookup a single book by ISBN (used by the barcode scanner). */
export async function lookupByIsbn(isbnRaw: string): Promise<LookupOutcome> {
  const startedAt = Date.now();
  const outcome = (result: BookSearchResult | null): LookupOutcome => ({
    result,
    offline: result == null && lastNetworkFailureAt >= startedAt,
  });
  const isbn = isbnRaw.replace(/[^0-9Xx]/g, '');
  if (!isbn) return outcome(null);

  // 1) Google Books v1 by ISBN - only worthwhile with a key (key-less = 429)
  if (googleApiKey && googleAvailable()) {
    const g = await getJson<{ items?: GoogleVolume[] }>(
      `${GOOGLE}?q=isbn:${encodeURIComponent(isbn)}&country=US${keyParam()}`
    );
    if (g.status === 429) googleBlockedUntil = Date.now() + GOOGLE_COOLDOWN_MS;
    const gFirst = g.data?.items?.[0] ? mapGoogleVolume(g.data.items[0]) : null;
    if (gFirst) {
      gFirst.isbn = gFirst.isbn ?? isbn;
      gFirst.coverUrl = gFirst.coverUrl ?? olCoverFromIsbn(isbn);
      return outcome(gFirst);
    }
  }

  // 2) Google legacy GData feed - key-less, finds Italian editions OL misses
  const gdata = await gdataIsbn(isbn);
  if (gdata) return outcome(gdata);

  // 3) Open Library search by ISBN (fast, gives covers + pages)
  const olSearch = await getJson<{ docs?: OLDoc[] }>(
    `${OPENLIB}/search.json?isbn=${encodeURIComponent(isbn)}&limit=1&fields=title,author_name,cover_i,isbn,first_publish_year,number_of_pages_median,publisher,language`
  );
  const olDoc = olSearch.data?.docs?.[0] ? mapOLDoc(olSearch.data.docs[0]) : null;
  if (olDoc) {
    olDoc.isbn = olDoc.isbn ?? isbn;
    olDoc.coverUrl = olDoc.coverUrl ?? olCoverFromIsbn(isbn);
    return outcome(olDoc);
  }

  // 4) Open Library /isbn/{isbn}.json edition endpoint (last resort)
  const edition = await getJson<{
    title?: string;
    number_of_pages?: number;
    publish_date?: string;
    publishers?: string[];
    authors?: { key: string }[];
  }>(`${OPENLIB}/isbn/${isbn}.json`);
  const ed = edition.data;
  if (ed?.title) {
    const authors = await resolveOpenLibraryAuthors(ed.authors);
    return outcome({
      title: ed.title,
      authors,
      coverUrl: olCoverFromIsbn(isbn),
      isbn,
      pageCount: ed.number_of_pages,
      publishedDate: ed.publish_date,
      publisher: ed.publishers?.[0],
      source: 'openlibrary',
    });
  }

  return outcome(null);
}

async function resolveOpenLibraryAuthors(
  authors?: { key: string }[]
): Promise<string[]> {
  if (!authors?.length) return [];
  const names = await Promise.all(
    authors.slice(0, 3).map(async (a) => {
      const { data } = await getJson<{ name?: string }>(`${OPENLIB}${a.key}.json`);
      return data?.name ?? null;
    })
  );
  return names.filter((n): n is string => !!n);
}
