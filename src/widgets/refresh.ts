import { Platform } from 'react-native';
import { AppData } from '@/types';
import { loadWidgetContext } from './widget-shared';

const NAMES = ['CurrentlyReading', 'QuickStart', 'StreakGoal', 'Heatmap'] as const;

/**
 * Re-render all placed widgets with fresh data. Android-only and best-effort:
 * if the widget package or a widget isn't available it silently no-ops.
 *
 * Pass the in-memory `data` snapshot (from the store) so we don't re-read the
 * whole database from disk on every mutation. When no widgets are placed the
 * per-instance render callback never fires, so this stays cheap.
 */
export async function refreshWidgets(data?: AppData): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // Lazy require so iOS never loads the Android-only native module.
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const { renderWidgetFor } = require('./widget-task-handler');
    const ctx = await loadWidgetContext(data);
    await Promise.all(
      NAMES.map((name) =>
        requestWidgetUpdate({
          widgetName: name,
          // `info.widgetId` lets each placed instance keep its own book
          // selection; its size lets each one lay out for its own footprint.
          renderWidget: (info: { widgetId: number; width: number; height: number }) =>
            renderWidgetFor(name, ctx, info.widgetId, { width: info.width, height: info.height }),
        }).catch(() => {})
      )
    );
  } catch {
    // ignore - widgets are a best-effort enhancement
  }
}
