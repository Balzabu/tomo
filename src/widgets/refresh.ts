import { Platform } from 'react-native';
import { loadWidgetContext } from './widget-shared';

const NAMES = ['CurrentlyReading', 'QuickStart', 'StreakGoal', 'Heatmap'] as const;

/**
 * Re-render all placed widgets with fresh data. Android-only and best-effort:
 * if the widget package or a widget isn't available it silently no-ops.
 */
export async function refreshWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // Lazy require so iOS never loads the Android-only native module.
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const { renderForName } = require('./widget-task-handler');
    const ctx = await loadWidgetContext();
    await Promise.all(
      NAMES.map((name) =>
        requestWidgetUpdate({
          widgetName: name,
          // `info.widgetId` lets each placed instance keep its own book selection.
          renderWidget: (info: { widgetId: number }) => renderForName(name, ctx, info.widgetId),
        }).catch(() => {})
      )
    );
  } catch {
    // ignore - widgets are a best-effort enhancement
  }
}
