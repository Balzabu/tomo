// Bookmory exports: "Database(db)" (a zip holding a sembast SQLite database,
// the format Bookmory itself recommends for moving data) and "Excel(xlsx)".
// Formats checked against real exports of Bookmory 1.4.23. Pure - see
// importBundle.ts; the SQLite reading happens in the app layer, which hands
// the `entry` rows over.
import type { ReadingStatus } from '@/types';
import { normalizeIsbn } from './isbn.ts';
import type { BundleBook, BundleSession, ImportBundle, ShelfLabels } from './importBundle.ts';
import { splitReads, utf8Decode } from './importBundle.ts';

// --- Database ----------------------------------------------------------------

export interface EntryRow {
  store: string;
  key: string;
  value: string;
}

interface BmRead {
  nth?: number;
  start?: number;
  end?: number;
  star?: number;
  comment?: string;
  status?: string;
  page?: number;
  page_type?: string;
  page_log_list?: { page?: number; page_type?: string; created_at?: number }[];
  read_timer_list?: { read_started_at?: number; elapsed_sec?: number }[];
}

interface BmBook {
  title?: string;
  authors?: string[];
  author?: string;
  image?: string;
  isbn?: string;
  publisher?: string;
  publication_date?: string;
  language?: string;
  description?: string;
  tags?: string;
  page_type?: string;
  real_total_page?: number;
  total_page?: number;
  cur_page?: number;
  wishlist?: boolean;
  collection_keys?: string[];
  reads?: BmRead[];
  series_number?: number;
  created_at?: number;
}

const STATUS: Record<string, ReadingStatus> = {
  DONE: 'finished',
  READING: 'reading',
  PAUSE: 'paused',
  GIVE_UP: 'dnf',
  NOT_STARTED: 'want_to_read',
};

const ms = (v: unknown) => (typeof v === 'number' && v > 0 ? v : undefined);
/** A trimmed string field of an untrusted record ('' for anything else). */
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Quill delta (Bookmory's rich-text notes) to plain text. */
export function quillToText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  try {
    const ops = JSON.parse(raw) as unknown;
    if (!Array.isArray(ops)) return raw.trim();
    return (ops as { insert?: unknown }[])
      .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
      .join('')
      .trim();
  } catch {
    return raw.trim();
  }
}

function tagsOf(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  return v
    .split(/#/)
    .map((t) => t.trim().replace(/,$/, ''))
    .filter(Boolean);
}

/**
 * Sessions of one read: every timer entry becomes a timed session; the page
 * log recorded when it was saved (Bookmory stores both at the end of a
 * session) gives its pages. Page updates without a timer become untimed
 * sessions, like Tomo's own "update progress".
 */
function sessionsOf(key: string, read: BmRead): BundleSession[] {
  const out: BundleSession[] = [];
  const paged = (read.page_type ?? 'PAGE') === 'PAGE';
  const logs = list<NonNullable<BmRead['page_log_list']>[number]>(read.page_log_list)
    .filter((l) => !!l && typeof l.page === 'number' && ms(l.created_at) && (l.page_type ?? 'PAGE') === 'PAGE')
    .sort((a, b) => (a.created_at as number) - (b.created_at as number));
  const used = new Set<number>();
  let prevPage = 0;
  const pageBefore = (t: number) => {
    let p = 0;
    for (const l of logs) if ((l.created_at as number) < t) p = Math.max(p, l.page as number);
    return p;
  };
  const timers = list<NonNullable<BmRead['read_timer_list']>[number]>(read.read_timer_list)
    // A timer left running for days isn't a reading session.
    .filter((x) => !!x && ms(x.read_started_at) && typeof x.elapsed_sec === 'number' && x.elapsed_sec > 0 && x.elapsed_sec <= 86_400)
    .sort((a, b) => (a.read_started_at as number) - (b.read_started_at as number));
  for (const x of timers) {
    const start = x.read_started_at as number;
    const end = start + (x.elapsed_sec as number) * 1000;
    // The progress saved with this session: the first log from its end on
    // (within a day), not already claimed by an earlier session.
    const idx = paged
      ? logs.findIndex((l, i) => !used.has(i) && (l.created_at as number) >= end - 60_000 && (l.created_at as number) <= end + 86_400_000)
      : -1;
    const from = pageBefore(start);
    let endPage: number | undefined;
    if (idx >= 0) {
      used.add(idx);
      endPage = logs[idx].page as number;
    }
    out.push({
      bookKey: key,
      startTime: start,
      endTime: end,
      durationSeconds: x.elapsed_sec as number,
      pagesRead: endPage != null ? Math.max(0, endPage - from) : 0,
      startPage: endPage != null ? from : undefined,
      endPage,
    });
  }
  logs.forEach((l, i) => {
    const page = l.page as number;
    if (!used.has(i) && page > prevPage) {
      const t = l.created_at as number;
      out.push({ bookKey: key, startTime: t, endTime: t, durationSeconds: 0, pagesRead: page - prevPage, startPage: prevPage, endPage: page });
    }
    prevPage = Math.max(prevPage, page);
  });
  return out;
}

export function parseBookmoryEntries(rows: EntryRow[], labels: ShelfLabels): ImportBundle {
  const bundle: ImportBundle = { source: 'bookmory', books: [], notes: [], sessions: [] };
  const collections = new Map<string, string>();
  for (const r of rows) {
    if (r.store !== 'collections') continue;
    try {
      const c = JSON.parse(r.value) as { name?: string };
      if (c.name) collections.set(String(r.key), c.name);
    } catch {
      // skip
    }
  }
  for (const r of rows) {
    if (r.store !== 'books') continue;
    let b: BmBook;
    try {
      b = JSON.parse(r.value) as BmBook;
    } catch {
      continue;
    }
    if (!b || typeof b !== 'object') continue;
    const title = txt(b.title);
    if (!title) continue;
    const key = `bm:${r.key}`;
    const reads = list<NonNullable<BmBook['reads']>[number]>(b.reads).filter((x) => x && typeof x === 'object').sort((a, c) => (a.nth ?? 0) - (c.nth ?? 0));
    const last = reads[reads.length - 1];
    const status: ReadingStatus = last ? STATUS[last.status ?? ''] ?? 'want_to_read' : 'want_to_read';
    const paged = (b.page_type ?? 'PAGE') === 'PAGE';
    const total = Number(b.real_total_page ?? b.total_page);
    const pageCount = paged && Number.isFinite(total) && total > 0 ? Math.round(total) : undefined;
    const cur = Number(b.cur_page);
    const currentPage =
      status === 'finished' && pageCount ? pageCount : paged && Number.isFinite(cur) && cur > 0 ? Math.round(cur) : 0;
    const dated = reads
      .filter((x) => ms(x.start) || (x.status === 'DONE' && ms(x.end)))
      .map((x) => ({ start: ms(x.start), end: x.status === 'DONE' ? ms(x.end) ?? ms(x.start) : undefined }));
    const doneReads = reads.filter((x) => x.status === 'DONE');
    const rated = [...doneReads].reverse().find((x) => (x.star ?? 0) > 0) ?? [...reads].reverse().find((x) => (x.star ?? 0) > 0);
    const comment = txt([...reads].reverse().find((x) => txt(x.comment))?.comment);
    const shelves = [
      ...list<unknown>(b.collection_keys).map((k) => collections.get(String(k))).filter((n): n is string => !!n),
      ...tagsOf(b.tags),
      ...(b.wishlist ? [labels.wishlist] : []),
    ];
    const book: BundleBook = {
      key,
      title,
      authors: (list<unknown>(b.authors).length ? list<unknown>(b.authors) : txt(b.author).split(',')).map(txt).filter(Boolean),
      isbn: txt(b.isbn) ? normalizeIsbn(txt(b.isbn)) ?? txt(b.isbn) : undefined,
      pageCount,
      status,
      currentPage,
      rating: typeof rated?.star === 'number' && rated.star > 0 ? Math.min(5, rated.star) : undefined,
      review: comment || undefined,
      publisher: txt(b.publisher) || undefined,
      publishedDate: txt(b.publication_date) || undefined,
      language: txt(b.language) || undefined,
      description: txt(b.description) || undefined,
      // https only (release builds block cleartext): upgrade http.
      coverUrl: typeof b.image === 'string' && /^https?:\/\//i.test(b.image) ? b.image.replace(/^http:\/\//i, 'https://') : undefined,
      addedAt: ms(b.created_at),
      ...splitReads(dated, status === 'finished'),
      shelfNames: shelves.length ? [...new Set(shelves)] : undefined,
    };
    bundle.books.push(book);
    for (const read of reads) bundle.sessions.push(...sessionsOf(key, read));
  }
  const bookKeys = new Set(bundle.books.map((b) => b.key));
  for (const r of rows) {
    if (r.store !== 'notes') continue;
    let n: { bid?: string | number; content_quill?: string; content?: string; type?: string; page?: number; page_type?: string; created_at?: number };
    try {
      n = JSON.parse(r.value);
    } catch {
      continue;
    }
    if (!n || typeof n !== 'object') continue;
    const bookKey = `bm:${n.bid}`;
    if (!bookKeys.has(bookKey)) continue;
    const text = quillToText(n.content_quill) || txt(n.content);
    if (!text) continue;
    bundle.notes.push({
      bookKey,
      type: n.type === 'BOOK_CONTENT' ? 'quote' : 'note',
      text,
      page: (n.page_type ?? 'PAGE') === 'PAGE' && typeof n.page === 'number' && n.page > 0 ? Math.round(n.page) : undefined,
      createdAt: ms(n.created_at) ?? Date.now(),
    });
  }
  return bundle;
}

// --- Excel -------------------------------------------------------------------

// Bookmory writes the status and note-type labels in the app's language.
// Generated from its 17 translation files.
const DONE = ['Eu li tudo!', 'Ho letto tutto!', "I've read it all!", 'Ich habe alles gelesen!', "J'ai tout lu !", 'Mám dočteno!', 'Okudum', 'Przeczytane!', 'Saya sudah membaca semuanya!', '¡Lo terminé de leer!', 'Дочитано!', 'Прочитано!', 'قرأته بالكامل!', '已讀完', '已读', '読み終わった！', '다 읽었어요!'];
const ING = ['Czytam', 'En cours de lecture', 'In lettura', 'Lendo', 'Lese ich gerade', 'Leyendo ahora', 'Okuyorum', 'Reading', 'Rozečteno', 'Sedang dibaca', 'Читаю', 'Чтение', 'قيد القراءة', 'いま読んでいる', '在读', '閱讀中', '읽고있는 중'];
const GIVEUP = ['Abandonné', 'Abbandonato', 'Aufgegeben', 'Berhenti dibaca', 'Dejé de leer', 'Desisti', 'Gave up', 'Odloženo', 'Porzucone', 'Vazgeçtim', 'Брошено', 'Закинуто', 'تخليت عنه', 'やめた', '已棄讀', '放弃', '그만 읽었어요'];
const PAUSED = ['Dijeda', 'Duraklatıldı', 'In pausa', 'Mis en pause', 'On hold', 'Pausado', 'Pausiert', 'Pozastaveno', 'Wstrzymano', 'На паузе', 'Призупинено', 'متوقف مؤقتًا', '一時停止中', '已暂停', '已暫停', '잠시 중단함'];
const BOOK_CONTENT = ['Book Content', 'Brano del libro', 'Buchinhalt', 'Cita del libro', 'Citát z knihy', 'Cytat z książki', 'Extrait du livre', 'Kitaptan alıntı', 'Kutipan buku', 'Trecho do livro', 'Содержание книги', 'Цитата з книги', 'محتوى الكتاب', '书中原文', '書中原文', '本の内容', '책 속 문장'];
const YES = ['Ano', 'Evet', 'Ja', 'Oui', 'Sim', 'Sì', 'Sí', 'Tak', 'Ya', 'Yes', 'Да', 'Так', 'نعم', 'はい', '是', '是的', '네', '예'];
const norm = (s: string) => s.trim().toLowerCase();
const inList = (list: string[], v: string) => list.some((x) => norm(x) === norm(v));

function xlsxStatus(v: string): ReadingStatus | undefined {
  if (!v.trim()) return undefined;
  if (inList(DONE, v)) return 'finished';
  if (inList(ING, v)) return 'reading';
  if (inList(GIVEUP, v)) return 'dnf';
  if (inList(PAUSED, v)) return 'paused';
  return 'want_to_read';
}

function decodeXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => codePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** An out-of-range character reference becomes U+FFFD instead of throwing. */
function codePoint(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd';
}

/** Column index of a cell ref ("C7" -> 2); -1 past any sane sheet width, so a
 *  crafted "XFD1" can't make us allocate a huge sparse row. */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1 < 1000 ? n - 1 : -1;
}

/** Rows of cell strings, by sheet name, from an xlsx's files. */
export function readXlsx(files: Record<string, Uint8Array>): { name: string; rows: string[][] }[] {
  const text = (p: string) => (files[p] ? utf8Decode(files[p]) : '');
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeXml(m[1]));
  const rels = new Map<string, string>();
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const sheets: { name: string; rows: string[][] }[] = [];
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(m[0].match(/name="([^"]*)"/)?.[1] ?? '');
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1] ?? '';
    const path = rels.get(rid);
    if (!path) continue;
    const rows: string[][] = [];
    for (const row of text(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
        const idx = ref ? colIndex(ref) : cells.length;
        if (idx < 0) continue;
        const body = c[2] ?? '';
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val = '';
        if (/t="s"/.test(attrs) && v != null) val = shared[Number(v)] ?? '';
        else if (/t="inlineStr"/.test(attrs)) val = decodeXml(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '');
        else if (v != null) val = decodeXml(v);
        cells[idx] = val;
      }
      rows.push(Array.from(cells, (x) => x ?? ''));
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

type DateOrder = 'dmy' | 'mdy' | 'ymd';
/** Guess the day/month order from every date in the file: a first number
 *  over 12 means D/M, a second one over 12 means M/D. */
function guessOrder(dates: string[], fallback: DateOrder): DateOrder {
  for (const d of dates) {
    const n = d.match(/\d+/g)?.map(Number) ?? [];
    if (n.length < 3) continue;
    if (n[0] > 31) return 'ymd';
    if (n[0] > 12) return 'dmy';
    if (n[1] > 12) return 'mdy';
  }
  return fallback;
}
function parseDate(s: string, order: DateOrder): number | undefined {
  const n = s.match(/\d+/g)?.map(Number) ?? [];
  if (n.length < 3) return undefined;
  const [y, m, d] = order === 'ymd' ? [n[0], n[1], n[2]] : order === 'dmy' ? [n[2], n[1], n[0]] : [n[2], n[0], n[1]];
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(year, m - 1, d, 12);
  return date.getMonth() === m - 1 && date.getDate() === d ? date.getTime() : undefined;
}

export function isBookmoryXlsx(files: Record<string, Uint8Array>): boolean {
  if (!files['xl/workbook.xml']) return false;
  const sheets = readXlsx(files);
  // Book list: a group-header row ("Book information" over column A, then
  // "Reading log n" every 4 columns from P), the real headers, the data.
  // Any other wide spreadsheet has a normal header row instead.
  const first = sheets[0]?.rows ?? [];
  const groups = first[0] ?? [];
  const groupOnly = groups.every((v, i) => !v || i === 0 || (i >= 15 && (i - 15) % 4 === 0));
  return first.length >= 2 && !!groups[0] && groupOnly && (first[1]?.length ?? 0) >= 15;
}

export function parseBookmoryXlsx(files: Record<string, Uint8Array>, labels: ShelfLabels): ImportBundle {
  const bundle: ImportBundle = { source: 'bookmory', books: [], notes: [], sessions: [] };
  const sheets = readXlsx(files);
  const list = sheets[0]?.rows.slice(2) ?? [];
  const allDates: string[] = [];
  for (const r of list) for (let c = 15; c < r.length; c += 4) if (r[c]) allDates.push(...r[c].split('~'));
  // English exports use M/D/Y; nearly every other locale D/M/Y.
  const header = sheets[0]?.rows[1]?.[0] ?? '';
  const order = guessOrder(allDates, header.trim() === 'Title' ? 'mdy' : 'dmy');
  const byTitle = new Map<string, string>();
  list.forEach((r, i) => {
    const title = (r[0] ?? '').trim();
    if (!title) return;
    const key = `bmx:${i}`;
    byTitle.set(norm(title), key);
    const pagesM = (r[10] ?? '').match(/^\D*?(\d+)\s*$/);
    const pageCount = pagesM && !(r[10] ?? '').includes('%') ? Number(pagesM[1]) : undefined;
    const status = xlsxStatus(r[14] ?? '') ?? 'want_to_read';
    const reads: { start?: number; end?: number; star?: number; comment?: string }[] = [];
    for (let c = 15; c < r.length; c += 4) {
      const [a, b] = (r[c] ?? '').split('~');
      const star = parseFloat(r[c + 1] ?? '');
      const start = a?.trim() ? parseDate(a, order) : undefined;
      const end = b?.trim() ? parseDate(b, order) : undefined;
      if (start == null && end == null && !(star > 0) && !(r[c + 2] ?? '').trim()) continue;
      reads.push({ start, end, star: star > 0 ? star : undefined, comment: (r[c + 2] ?? '').trim() || undefined });
    }
    const rated = [...reads].reverse().find((x) => x.star);
    const shelves = [
      ...(r[11] ?? '').split(/#/).map((t) => t.trim()).filter(Boolean),
      ...(r[12] ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      ...(inList(YES, r[13] ?? '') ? [labels.wishlist] : []),
    ];
    bundle.books.push({
      key,
      title,
      authors: (r[1] ?? '').split(',').map((a) => a.trim()).filter(Boolean),
      publisher: (r[5] ?? '').trim() || undefined,
      publishedDate: (r[6] ?? '').trim() || undefined,
      language: (r[7] ?? '').trim() || undefined,
      isbn: r[8] ? normalizeIsbn(r[8]) ?? r[8].trim() : undefined,
      pageCount,
      status,
      currentPage: status === 'finished' && pageCount ? pageCount : 0,
      rating: rated?.star ? Math.min(5, rated.star) : undefined,
      review: [...reads].reverse().find((x) => x.comment)?.comment,
      ...splitReads(
        reads.map((x) => ({ start: x.start, end: x.end })),
        status === 'finished'
      ),
      shelfNames: shelves.length ? [...new Set(shelves)] : undefined,
    });
  });
  // Notes sheets are named "Notes (<title>)" in the app's language; the
  // columns present depend on the export options, so they're recognised by
  // content: "p. 72" is the page, a known label the type, the text the last.
  for (const sheet of sheets.slice(1)) {
    const title = sheet.name.match(/\((.*)\)\s*$/)?.[1];
    const key = title ? byTitle.get(norm(title)) : undefined;
    if (!key) continue;
    for (const r of sheet.rows.slice(2)) {
      const cells = r.map((x) => (x ?? '').trim());
      const text = cells.filter(Boolean).pop();
      if (!text) continue;
      const pageCell = cells.find((x) => /^p\.\s*\d+/i.test(x));
      const typeCell = cells.find((x) => x !== text && !/^p\.\s*\d+/i.test(x) && !/\d{1,4}[./-]\d{1,2}/.test(x));
      const dateCell = cells.find((x) => /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(x));
      bundle.notes.push({
        bookKey: key,
        type: typeCell && inList(BOOK_CONTENT, typeCell) ? 'quote' : typeCell ? 'note' : 'quote',
        text,
        page: pageCell ? Number(pageCell.match(/\d+/)![0]) : undefined,
        createdAt: (dateCell && parseDate(dateCell, order)) || Date.now(),
      });
    }
  }
  return bundle;
}
