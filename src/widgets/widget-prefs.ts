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
  const map = await readMap();
  map[String(widgetId)] = bookId;
  await writeMap(map);
}

/** Drop the selection of a removed widget instance so the map doesn't grow forever. */
export async function removeReadingSelection(widgetId: number): Promise<void> {
  const map = await readMap();
  if (!(String(widgetId) in map)) return;
  delete map[String(widgetId)];
  await writeMap(map);
}
