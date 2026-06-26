import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useStore } from '@/store/useStore';
import { useSettings } from '@/store/useSettings';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { APP_NAME } from '@/lib/constants';
import { SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { Flag } from '@/components/Flag';
import { clearData } from '@/lib/storage';
import { clearCovers } from '@/lib/covers';

export default function SettingsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const shelfCount = useStore((s) => s.shelves.length);
  const replaceAll = useStore((s) => s.replaceAll);
  const scheme = useSettings((s) => s.scheme);
  const language = useSettings((s) => s.language);
  const reminderEnabled = useSettings((s) => s.reminderEnabled);
  const reminderHour = useSettings((s) => s.reminderHour);
  const reminderMinute = useSettings((s) => s.reminderMinute);
  const c = t.colors;

  const go = (path: string) => router.push(path as Href);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const onClear = () => {
    Alert.alert(tr('settings.clearTitle'), tr('settings.clearMsg'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('settings.clearConfirm'),
        style: 'destructive',
        onPress: async () => {
          await clearData();
          await clearCovers();
          await replaceAll({ books: [], sessions: [], notes: [], shelves: [], goals: [], version: 1 });
        },
      },
    ]);
  };

  const themeValue = scheme === 'system' ? tr('theme.auto') : tr(`theme.${scheme}`);
  const reminderValue = reminderEnabled
    ? `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`
    : undefined;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 32 }}>
      <SettingsGroup title={tr('settings.groupAppearance')}>
        <SettingsRow first icon="color-palette" label={tr('settings.theme')} value={themeValue} onPress={() => go('/settings/appearance')} />
        <SettingsRow
          icon="language"
          label={tr('settings.language')}
          valueNode={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Flag code={language} width={18} />
              <Text style={{ color: c.textMuted, fontSize: 14 }}>{tr(`lang.${language}`)}</Text>
            </View>
          }
          onPress={() => go('/settings/language')}
        />
      </SettingsGroup>

      <SettingsGroup title={tr('settings.groupReading')}>
        <SettingsRow first icon="notifications" label={tr('settings.reminders')} value={reminderValue} onPress={() => go('/settings/reminders')} />
        <SettingsRow icon="bookmarks" label={tr('settings.shelves')} value={String(shelfCount)} onPress={() => go('/settings/shelves')} />
        <SettingsRow icon="search" label={tr('settings.bookSearch')} onPress={() => go('/settings/book-search')} />
      </SettingsGroup>

      <SettingsGroup title={tr('settings.groupData')}>
        <SettingsRow first icon="cloud-upload" label={tr('settings.backupImport')} onPress={() => go('/settings/data')} />
        <SettingsRow icon="trash" label={tr('settings.clearData')} danger onPress={onClear} />
      </SettingsGroup>

      <View style={styles.footer}>
        <Text style={[styles.appName, { color: c.text }]}>{APP_NAME}</Text>
        <Text style={[styles.version, { color: c.textFaint }]}>v{version}</Text>
        <View style={styles.links}>
          <Pressable style={styles.link} onPress={() => Linking.openURL('https://github.com/Balzabu')}>
            <Ionicons name="logo-github" size={16} color={c.textMuted} />
            <Text style={[styles.linkTxt, { color: c.textMuted }]}>GitHub</Text>
          </Pressable>
          <Pressable style={styles.link} onPress={() => Linking.openURL('https://balzabu.io')}>
            <Ionicons name="globe-outline" size={16} color={c.textMuted} />
            <Text style={[styles.linkTxt, { color: c.textMuted }]}>balzabu.io</Text>
          </Pressable>
        </View>
        <Text style={[styles.madeBy, { color: c.textFaint }]}>{tr('settings.madeBy')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'center', gap: 6, paddingTop: spacing.lg },
  appName: { fontSize: 16, fontWeight: '800' },
  version: { fontSize: 12, fontWeight: '600' },
  links: { flexDirection: 'row', gap: spacing.xl, marginTop: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkTxt: { fontSize: 13, fontWeight: '600' },
  madeBy: { fontSize: 12, marginTop: 6, textAlign: 'center' },
});
