import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { BookCover } from '@/components/BookCover';
import { pickCover } from '@/lib/covers';

interface Props {
  coverUrl?: string;
  title?: string;
  onChange: (uri: string | undefined) => void;
}

export function CoverPicker({ coverUrl, title, onChange }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await pickCover();
      if (res.status === 'ok') {
        void Haptics.selectionAsync();
        // Don't delete the previous file here - the user might still cancel the
        // form. The parent screen deletes the replaced cover only on save().
        onChange(res.uri);
      }
    } catch (e) {
      // e.g. copying the picked file failed (storage full) - tell the user
      // instead of leaving an unhandled rejection.
      Alert.alert(tr('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    onChange(undefined);
  };

  return (
    <View style={styles.row}>
      <BookCover uri={coverUrl} title={title} width={84} />
      <View style={styles.actions}>
        <Pressable
          onPress={choose}
          style={[styles.btn, { backgroundColor: t.colors.cardAlt, borderColor: t.colors.border }]}
        >
          <Ionicons name="image" size={18} color={t.colors.primary} />
          <Text style={[styles.btnTxt, { color: t.colors.text }]}>
            {coverUrl ? tr('cover.change') : tr('cover.choose')}
          </Text>
        </Pressable>
        {coverUrl ? (
          <Pressable onPress={remove} style={styles.removeBtn}>
            <Ionicons name="trash-outline" size={16} color={t.colors.danger} />
            <Text style={[styles.removeTxt, { color: t.colors.danger }]}>{tr('cover.remove')}</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.hint, { color: t.colors.textFaint }]}>{tr('cover.hint')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  actions: { flex: 1, gap: spacing.sm, justifyContent: 'center' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnTxt: { fontSize: 14, fontWeight: '700' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  removeTxt: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 11, textAlign: 'center' },
});
