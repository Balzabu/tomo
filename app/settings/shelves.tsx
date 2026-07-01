import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Shelf } from '@/types';
import { useStore } from '@/store/useStore';
import { onColor, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button, Card } from '@/components/ui';
import { ShelfEditor } from '@/components/ShelfEditor';

export default function ShelvesSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  // Actions are stable; subscribe only to the reactive shelves list.
  const store = useStore.getState();
  const shelves = useStore((s) => s.shelves);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingShelf, setEditingShelf] = useState<Shelf | null>(null);

  const openNew = () => {
    setEditingShelf(null);
    setEditorVisible(true);
  };
  const openEdit = (shelf: Shelf) => {
    setEditingShelf(shelf);
    setEditorVisible(true);
  };
  const confirmDelete = (sh: Shelf) =>
    Alert.alert(tr('settings.deleteShelfTitle'), tr('settings.deleteShelfMsg', { name: sh.name }), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('common.delete'), style: 'destructive', onPress: () => store.deleteShelf(sh.id) },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.lg }}>
      <Button label={tr('settings.newShelf')} icon="add" full onPress={openNew} />

      {shelves.length === 0 ? (
        <Text style={[styles.muted, { color: t.colors.textMuted }]}>{tr('settings.shelvesEmpty')}</Text>
      ) : (
        <Card style={{ gap: spacing.md }}>
          {shelves.map((sh) => (
            <Pressable key={sh.id} style={styles.shelfRow} onPress={() => openEdit(sh)}>
              <View style={[styles.marker, { backgroundColor: sh.color }]}>
                {sh.emoji ? (
                  <Text style={{ fontSize: 15 }}>{sh.emoji}</Text>
                ) : (
                  <Ionicons
                    name={(sh.icon ?? 'bookmark') as keyof typeof Ionicons.glyphMap}
                    size={15}
                    color={onColor(sh.color)}
                  />
                )}
              </View>
              <Text style={[styles.shelfName, { color: t.colors.text }]}>{sh.name}</Text>
              <Ionicons name="create-outline" size={18} color={t.colors.textFaint} />
              <Pressable onPress={() => confirmDelete(sh)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={t.colors.textFaint} />
              </Pressable>
            </Pressable>
          ))}
        </Card>
      )}

      <ShelfEditor
        visible={editorVisible}
        shelf={editingShelf}
        onClose={() => setEditorVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 14, lineHeight: 20 },
  shelfRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  marker: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  shelfName: { flex: 1, fontSize: 15, fontWeight: '600' },
});
