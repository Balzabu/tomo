import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Language, LANGUAGES, useSettings } from '@/store/useSettings';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Flag } from '@/components/Flag';

export default function LanguageSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);
  const c = t.colors;

  const pick = (l: Language) => {
    void Haptics.selectionAsync();
    setLanguage(l);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {LANGUAGES.map((l, i) => {
          const active = language === l;
          return (
            <Pressable
              key={l}
              onPress={() => pick(l)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                pressed && { backgroundColor: c.cardAlt },
              ]}
            >
              <Flag code={l} width={26} />
              <Text style={[styles.name, { color: c.text }]}>{tr(`lang.${l}`)}</Text>
              {active ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: 54,
  },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
});
