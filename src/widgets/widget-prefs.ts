import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-widget-instance preferences for the home-screen widgets.
 *
 * Android home-screen widgets can be placed multiple times, each with its own
 * `widgetId`. The "Currently reading" widget lets the user pick *which* of the
 * books they're reading it shows; that choice is stored here, keyed by widgetId.
 */
const READING_SEL_KEY = 'tomo:widget:reading-selection:v1';

type SelectionMap = Record<string, string>;

// Widget events run as independent WorkManager jobs whose JS handlers
// interleave at every await; two concurrent read-modify-writes of the map
// would clobber each other (a deleted entry resurrected, a double cycle-tap
// advancing by one). Serialise every mutation through a promise chain.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op, op);
  queue = next.catch(() => {});
  return next;
}

async function readMap(): Promise<SelectionMap> {
  try {
    const raw = await AsyncStorage.getItem(READING_SEL_KEY);
    return raw ? (JSON.parse(raw) as SelectionMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(map: SelectionMap): Promise<void> {
  try {
    await AsyncStorage.setItem(READING_SEL_KEY, JSON.stringify(map));
  } catch {
    // best-effort: a failed write just means the widget falls back to default
  }
}

/** The bookId pinned to a given "Currently reading" widget instance, if any. */
export async function getReadingSelection(widgetId: number): Promise<string | undefined> {
  const map = await readMap();
  return map[String(widgetId)];
}

/** Pin a book to a given "Currently reading" widget instance. */
export async function setReadingSelection(widgetId: number, bookId: string): Promise<void> {
  await enqueue(async () => {
    const map = await readMap();
    map[String(widgetId)] = bookId;
    await writeMap(map);
  });
}

/** Drop the selection of a removed widget instance so the map doesn't grow forever. */
export async function removeReadingSelection(widgetId: number): Promise<void> {
  await enqueue(async () => {
    const map = await readMap();
    if (!(String(widgetId) in map)) return;
    delete map[String(widgetId)];
    await writeMap(map);
  });
}

/** Wipe every widget selection - used by "clear all data" so the map doesn't
 *  keep book ids from a wiped library. */
export async function clearReadingSelections(): Promise<void> {
  await enqueue(async () => {
    try {
      await AsyncStorage.removeItem(READING_SEL_KEY);
    } catch {
      // best-effort
    }
  });
}
