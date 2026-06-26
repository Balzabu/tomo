// Custom entry point: boot Expo Router, then register the Android widget task
// handler. iOS never loads the Android-only widget module.
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    // The native widget module is absent in Expo Go - guard so the app still
    // runs there (widgets only appear in a dev/EAS build).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      registerWidgetTaskHandler,
      registerWidgetConfigurationScreen,
    } = require('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { widgetTaskHandler } = require('./src/widgets/widget-task-handler');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WidgetConfigScreen } = require('./src/widgets/WidgetConfigScreen');
    registerWidgetTaskHandler(widgetTaskHandler);
    registerWidgetConfigurationScreen(WidgetConfigScreen);
  } catch {
    // Widgets unavailable in this runtime (e.g. Expo Go) - ignore.
  }
}
