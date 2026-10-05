import { useEffect } from 'react';
import { Appearance, View, ActivityIndicator } from 'react-native';
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
import { useActiveSession } from '@/store/useActiveSession';
import { useSettings } from '@/store/useSettings';
import { followsSystem, useDynamicPalettes, useTheme } from '@/theme/theme';
import { useLock } from '@/store/useLock';
import { AppLockGate } from '@/components/AppLockGate';
import { SharedFileHandler } from '@/components/SharedFileHandler';
import { LinkResumer } from '@/components/LinkResumer';
import { useBackup, watchAutoBackup } from '@/lib/autoBackup';
import { useTranslation } from '@/i18n';
import { loadGoogleApiKey } from '@/lib/prefs';
import { didReadFail } from '@/lib/storage';
import { migrateLegacyKeys } from '@/lib/migrate';
import { setGoogleApiKey } from '@/services/bookApi';
import { hasNotificationPermission } from '@/lib/notifications';
import { syncReminders, watchReminders } from '@/lib/reminders';
import { reconcileCovers } from '@/lib/covers';
import { refreshWidgets } from '@/widgets/refresh';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Snackbar } from '@/components/Snackbar';
import { AlertHost } from '@/components/AppAlert';
import { ActiveSessionWatcher } from '@/components/ActiveSessionWatcher';

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
  const hydrateActiveSession = useActiveSession((s) => s.hydrate);
  const sessionHydrated = useActiveSession((s) => s.hydrated);
  const hydrateSettings = useSettings((s) => s.hydrate);
  const settingsHydrated = useSettings((s) => s.hydrated);
  const hydrateLock = useLock((s) => s.hydrate);
  const lockHydrated = useLock((s) => s.hydrated);
  const reminderEnabled = useSettings((s) => s.reminderEnabled);
  const reminderHour = useSettings((s) => s.reminderHour);
  const reminderMinute = useSettings((s) => s.reminderMinute);

  useEffect(() => {
    void (async () => {
      // Rename legacy "bootrack:" storage keys to "tomo:" before anything reads them.
      await migrateLegacyKeys();
      void hydrate();
      void hydrateSettings();
      void hydrateActiveSession();
      void hydrateLock();
      void useBackup.getState().hydrate();
      void loadGoogleApiKey().then(setGoogleApiKey);
    })();
  }, [hydrate, hydrateSettings, hydrateActiveSession, hydrateLock]);

  // Re-plan the reading reminders on launch (survives reboots / locale
  // change, and drops today's if you've already read). If notification
  // permission was revoked in the meantime, reflect that in the setting
  // instead of "scheduling" a reminder that can never fire.
  const reminderSmart = useSettings((s) => s.reminderSmart);
  // "Already read today" depends on when the reading day starts.
  const dayStartHour = useSettings((s) => s.dayStartHour);
  useEffect(() => {
    if (!settingsHydrated || !hydrated || !reminderEnabled) return;
    void (async () => {
      if (!(await hasNotificationPermission())) {
        useSettings.getState().setReminder(false, reminderHour, reminderMinute);
        return;
      }
      await syncReminders();
      watchReminders();
    })();
  }, [settingsHydrated, hydrated, reminderEnabled, reminderHour, reminderMinute, reminderSmart, dayStartHour, tr]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(t.colors.bg);
  }, [t.colors.bg]);

  // Widgets resolve the 'system' theme at render time, so an OS dark-mode flip
  // (e.g. scheduled dark theme at sunset) must re-render them - otherwise they
  // keep the wrong palette until the next data mutation or 30-minute update.
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      if (followsSystem(useSettings.getState().scheme)) void refreshWidgets();
    });
    // A new wallpaper changes the Material You palette the widgets use too.
    const unsub = useDynamicPalettes.subscribe(() => {
      if (useSettings.getState().scheme === 'dynamic') void refreshWidgets();
    });
    return () => {
      sub.remove();
      unsub();
    };
  }, []);

  // Automatic backups start once the library is loaded.
  useEffect(() => {
    if (hydrated) watchAutoBackup();
  }, [hydrated]);

  // Once data is loaded, reclaim cover files orphaned by a force-quit during a
  // delete-undo window. Runs once per launch, best-effort.
  useEffect(() => {
    if (!hydrated) return;
    // If the library couldn't be read, the in-memory state is empty while the
    // real data (and its cover references) may still be intact on disk -
    // reconciling against it would delete every custom cover.
    if (didReadFail()) return;
    const books = useStore.getState().books;
    if (books.length === 0) return;
    void reconcileCovers(books.map((b) => b.coverUrl));
  }, [hydrated]);

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
          {!hydrated || !settingsHydrated || !sessionHydrated || !lockHydrated ? (
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
              <Stack.Screen name="notes" options={{ title: tr('notes.title') }} />
              <Stack.Screen name="settings/appearance" options={{ title: tr('settings.theme') }} />
              <Stack.Screen name="settings/language" options={{ title: tr('settings.language') }} />
              <Stack.Screen name="settings/reminders" options={{ title: tr('settings.reminders') }} />
              <Stack.Screen name="settings/day-start" options={{ title: tr('settings.dayStart') }} />
              <Stack.Screen name="settings/shelves" options={{ title: tr('settings.shelves') }} />
              <Stack.Screen name="settings/book-search" options={{ title: tr('settings.bookSearch') }} />
              <Stack.Screen name="settings/data" options={{ title: tr('settings.backupImport') }} />
              <Stack.Screen name="settings/security" options={{ title: tr('lock.settingsTitle') }} />
            </Stack>
          )}
          <Snackbar />
          <AlertHost />
          {hydrated && settingsHydrated && sessionHydrated && lockHydrated ? <ActiveSessionWatcher /> : null}
          {hydrated && settingsHydrated && lockHydrated ? <SharedFileHandler /> : null}
          {hydrated && settingsHydrated && sessionHydrated && lockHydrated ? <LinkResumer /> : null}
          </ErrorBoundary>
          {/* Outside the error boundary: a crash elsewhere must not take the
              lock screen down with it (or show data in the error page). */}
          {lockHydrated ? <AppLockGate /> : null}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
