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
  readCount?: number; // times finished (rereads)

  shelfIds: string[];
  source: BookSource;
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
}

export type NoteType = 'note' | 'quote';

export interface BookNote {
  id: string;
  bookId: string;
  type: NoteType;
  text: string;
  page?: number;
  createdAt: number;
}

export interface Shelf {
  id: string;
  name: string;
  color: string;
  icon?: string; // Ionicons glyph name (mutually exclusive with emoji)
  emoji?: string; // emoji marker; takes precedence over icon
  createdAt: number;
}

export type GoalType = 'books_per_year' | 'pages_per_day' | 'minutes_per_day';

export interface Goal {
  id: string;
  type: GoalType;
  target: number;
  year: number;
  createdAt: number;
}

export interface AppData {
  books: Book[];
  sessions: ReadingSession[];
  notes: BookNote[];
  shelves: Shelf[];
  goals: Goal[];
  version: number;
}

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
