import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  ThemeProvider,
  DefaultTheme,
  DarkTheme,
  type Theme as NavTheme,
} from '@react-navigation/native';
import * as SystemUI from 'expo-system-ui';
import { useStore } from '@/store/useStore';
import { useSettings } from '@/store/useSettings';
import { useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { loadGoogleApiKey } from '@/lib/prefs';
import { setGoogleApiKey } from '@/services/bookApi';
import { scheduleDailyReminder } from '@/lib/notifications';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Snackbar } from '@/components/Snackbar';

// Anchor deep links (e.g. the widgets' tomo:///timer/<id>) to the tab group so
// a cold start always has the app underneath - otherwise router.back() after
// saving a session would no-op and the screen would appear "stuck".
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const hydrateSettings = useSettings((s) => s.hydrate);
  const settingsHydrated = useSettings((s) => s.hydrated);
  const reminderEnabled = useSettings((s) => s.reminderEnabled);
  const reminderHour = useSettings((s) => s.reminderHour);
  const reminderMinute = useSettings((s) => s.reminderMinute);

  useEffect(() => {
    void hydrate();
    void hydrateSettings();
    void loadGoogleApiKey().then(setGoogleApiKey);
  }, [hydrate, hydrateSettings]);

  // Re-arm the daily reading reminder on launch (survives reboots / locale change).
  useEffect(() => {
    if (!settingsHydrated || !reminderEnabled) return;
    void scheduleDailyReminder(reminderHour, reminderMinute, tr('notif.title'), tr('notif.body'));
  }, [settingsHydrated, reminderEnabled, reminderHour, reminderMinute, tr]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(t.colors.bg);
  }, [t.colors.bg]);

  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    dark: t.dark,
    colors: {
      ...base.colors,
      primary: t.colors.primary,
      background: t.colors.bg,
      card: t.colors.bg,
      text: t.colors.text,
      border: t.colors.border,
      notification: t.colors.accent,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={t.dark ? 'light' : 'dark'} />
          <ErrorBoundary>
          {!hydrated || !settingsHydrated ? (
            <View
              style={{
                flex: 1,
                backgroundColor: t.colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator color={t.colors.primary} size="large" />
            </View>
          ) : (
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: t.colors.bg },
                headerTintColor: t.colors.text,
                headerTitleStyle: { fontWeight: '800' },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: t.colors.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="search" options={{ title: tr('search.title'), presentation: 'modal' }} />
              <Stack.Screen name="scan" options={{ title: tr('scan.title'), presentation: 'modal' }} />
              <Stack.Screen name="add-manual" options={{ title: tr('manual.title'), presentation: 'modal' }} />
              <Stack.Screen name="book/[id]" options={{ title: '' }} />
              <Stack.Screen name="book/edit/[id]" options={{ title: tr('editBook.title'), presentation: 'modal' }} />
              <Stack.Screen name="timer/[bookId]" options={{ title: tr('timer.title'), presentation: 'fullScreenModal' }} />
              <Stack.Screen name="wrapped" options={{ title: tr('stats.yearInReview') }} />
              <Stack.Screen name="settings/appearance" options={{ title: tr('settings.theme') }} />
              <Stack.Screen name="settings/language" options={{ title: tr('settings.language') }} />
              <Stack.Screen name="settings/reminders" options={{ title: tr('settings.reminders') }} />
              <Stack.Screen name="settings/shelves" options={{ title: tr('settings.shelves') }} />
              <Stack.Screen name="settings/book-search" options={{ title: tr('settings.bookSearch') }} />
              <Stack.Screen name="settings/data" options={{ title: tr('settings.backupImport') }} />
            </Stack>
          )}
          </ErrorBoundary>
          <Snackbar />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
