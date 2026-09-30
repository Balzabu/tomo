// Core data model for Tomo

export type ReadingStatus =
  | 'want_to_read'
  | 'reading'
  | 'finished'
  | 'paused'
  | 'dnf'; // did not finish

export const STATUS_ORDER: ReadingStatus[] = [
  'reading',
  'want_to_read',
  'paused',
  'finished',
  'dnf',
];

export type BookSource = 'google' | 'openlibrary' | 'manual' | 'import';

export type ReadingPace = 'slow' | 'medium' | 'fast';

export const MOOD_OPTIONS = [
  'adventurous',
  'challenging',
  'dark',
  'emotional',
  'funny',
  'hopeful',
  'informative',
  'inspiring',
  'mysterious',
  'reflective',
  'relaxing',
  'romantic',
  'sad',
  'tense',
] as const;

/** One completed read cycle. The *current* cycle lives in Book.startedAt /
 *  Book.finishedAt; only earlier, completed cycles are recorded here (see
 *  src/lib/reads.ts), so old data needs no migration and nothing is counted
 *  twice. */
export interface ReadRecord {
  startedAt?: number;
  finishedAt: number;
}

export interface Book {
  id: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  isbn?: string;
  pageCount?: number;
  description?: string;
  publisher?: string;
  publishedDate?: string;
  categories?: string[];
  language?: string;

  status: ReadingStatus;
  currentPage: number;
  rating?: number; // 0..5 (half stars allowed)
  review?: string;

  series?: string;
  seriesNumber?: number;
  moods?: string[]; // personal mood tags (e.g. cosy, dark, funny)
  pace?: ReadingPace;

  addedAt: number;
  startedAt?: number;
  finishedAt?: number;
  readCount?: number; // times finished (rereads); a floor - see readCountOf()
  reads?: ReadRecord[]; // earlier completed cycles, oldest first
  /** set by startReread, cleared when that cycle finishes: its finish is a
   *  new read even when readCount already exceeds the dated history */
  rereading?: boolean;

  shelfIds: string[];
  source: BookSource;
  /** The ISBN the catalogues were last asked about without having anything
   *  more to fill in - stops the "details missing" prompt from nagging about
   *  a book they don't know. A different ISBN makes the book eligible again. */
  catalogCheckedIsbn?: string;
  /** Reading plan: finish by `target` (local YYYY-MM-DD). `start`/`startPage`
   *  record where the plan began, for the ahead/behind schedule. */
  plan?: ReadingPlanSpec;
  /** Last local change (ms). Lets a backup merge keep the newer copy. */
  updatedAt?: number;
}

export interface ReadingPlanSpec {
  target: string;
  start: string;
  startPage: number;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  startPage?: number;
  endPage?: number;
  pagesRead: number;
  note?: string;
  date: string; // YYYY-MM-DD (local)
  updatedAt?: number;
}

export type NoteType = 'note' | 'quote';

export interface BookNote {
  id: string;
  bookId: string;
  type: NoteType;
  text: string;
  page?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface Shelf {
  id: string;
  name: string;
  color: string;
  icon?: string; // Ionicons glyph name (mutually exclusive with emoji)
  emoji?: string; // emoji marker; takes precedence over icon
  createdAt: number;
  updatedAt?: number;
}

/** Pre-1.4 goal kinds - still written alongside metric/period so a backup
 *  stays readable by older versions of the app. */
export type GoalType = 'books_per_year' | 'pages_per_day' | 'minutes_per_day';

export type GoalMetric = 'books' | 'pages' | 'minutes';
/** day/month/year recur (the current one is tracked); custom is a one-off
 *  challenge between `start` and `end`. */
export type GoalPeriod = 'day' | 'month' | 'year' | 'custom';

export interface Goal {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
  /** period 'year': the calendar year it counts. */
  year?: number;
  /** period 'custom': inclusive local days (YYYY-MM-DD) and a display name. */
  start?: string;
  end?: string;
  name?: string;
  createdAt: number;
  updatedAt?: number;
  type?: GoalType;
}

/** Record of a deletion, so merging an older backup can't resurrect it. */
export interface Tombstone {
  id: string;
  deletedAt: number;
  /** books: ISBN/title keys, so the deletion also reaches the same book
   *  under another id on another device */
  keys?: string[];
}

export interface AppData {
  books: Book[];
  sessions: ReadingSession[];
  notes: BookNote[];
  shelves: Shelf[];
  goals: Goal[];
  deleted: Tombstone[];
  version: number;
}

// Library screen view preferences (persisted in settings).
export type LibrarySort = 'recent' | 'title' | 'author' | 'rating' | 'progress' | 'finished' | 'started';
export const LIBRARY_SORTS: LibrarySort[] = ['recent', 'title', 'author', 'rating', 'progress', 'finished', 'started'];
export type LibraryFilter =
  | { kind: 'all' }
  | { kind: 'status'; status: ReadingStatus }
  | { kind: 'shelf'; id: string };

// A book parsed from a Goodreads/StoryGraph CSV, before it gets an id/shelves.
export interface ImportedBook {
  title: string;
  authors: string[];
  isbn?: string;
  pageCount?: number;
  status: ReadingStatus;
  currentPage?: number;
  rating?: number;
  review?: string;
  series?: string;
  seriesNumber?: number;
  moods?: string[];
  pace?: ReadingPace;
  publishedDate?: string;
  addedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  readCount?: number;
  reads?: ReadRecord[];
  shelfNames?: string[];
}

// Shape returned by the book search service before being saved
export interface BookSearchResult {
  title: string;
  authors: string[];
  coverUrl?: string;
  isbn?: string;
  pageCount?: number;
  description?: string;
  publisher?: string;
  publishedDate?: string;
  categories?: string[];
  language?: string;
  source: BookSource;
}
