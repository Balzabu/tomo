import { StyleSheet, Text, View } from 'react-native';
import { TextInput } from '@/components/ThemedTextInput';
import { radius, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { isValidIsbn } from '@/lib/isbn';

/** Optional ISBN input. An invalid checksum only warns: some old books carry
 *  odd codes, and the user may know better than the checksum. */
export function IsbnField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const invalid = value.trim() !== '' && !isValidIsbn(value);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: t.colors.textMuted }]}>{tr('manual.isbn')}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={tr('manual.isbnPlaceholder')}
        placeholderTextColor={t.colors.textFaint}
        // ISBN-10 can end in X, so not a numeric keyboard.
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={24}
        style={[
          styles.input,
          {
            backgroundColor: t.colors.card,
            borderColor: invalid ? t.colors.danger : t.colors.border,
            borderWidth: invalid ? 1 : StyleSheet.hairlineWidth,
            color: t.colors.text,
          },
        ]}
      />
      {invalid ? <Text style={[styles.hint, { color: t.colors.danger }]}>{tr('manual.isbnInvalid')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
  input: {
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
});
