import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Shelf } from '@/types';
import { useStore } from '@/store/useStore';
import { onColor, radius, SHELF_COLORS, spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Dialog } from '@/components/Dialog';
import { Button, Pill } from '@/components/ui';

/** Curated Ionicons glyphs offered as shelf markers. */
export const SHELF_ICONS: string[] = [
  'bookmark', 'book', 'library', 'heart', 'star', 'flame',
  'school', 'briefcase', 'planet', 'rocket', 'leaf', 'cafe',
  'moon', 'sunny', 'musical-notes', 'game-controller', 'code-slash', 'color-palette',
  'trophy', 'gift', 'airplane', 'paw', 'bulb', 'globe',
];

/** Curated emoji offered as shelf markers. */
export const SHELF_EMOJIS: string[] = [
  '📚', '📖', '❤️', '⭐', '🔥', '🌙', '☀️', '🎯',
  '✨', '🚀', '🎵', '🎮', '💡', '🌿', '☕', '🏆',
  '🎁', '✈️', '🐾', '💪', '🧠', '🌈', '🍿', '👑',
];

type MarkerKind = 'icon' | 'emoji';

interface Props {
  visible: boolean;
  /** undefined/null → create mode; a shelf → edit mode. */
  shelf?: Shelf | null;
  onClose: () => void;
}

export function ShelfEditor({ visible, shelf, onClose }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const addShelf = useStore((s) => s.addShelf);
  const updateShelf = useStore((s) => s.updateShelf);
  const c = t.colors;

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(SHELF_COLORS[0]);
  const [marker, setMarker] = useState<MarkerKind>('icon');
  const [icon, setIcon] = useState<string>('bookmark');
  const [emoji, setEmoji] = useState<string>('📚');

  useEffect(() => {
    if (!visible) return;
    if (shelf) {
      setName(shelf.name);
      setColor(shelf.color ?? SHELF_COLORS[0]);
      if (shelf.emoji) {
        setMarker('emoji');
        setEmoji(shelf.emoji);
        setIcon('bookmark');
      } else {
        setMarker('icon');
        setIcon(shelf.icon ?? 'bookmark');
        setEmoji('📚');
      }
    } else {
      setName('');
      setColor(SHELF_COLORS[0]);
      setMarker('icon');
      setIcon('bookmark');
      setEmoji('📚');
    }
  }, [visible, shelf]);

  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    void Haptics.selectionAsync();
    const markerFields =
      marker === 'emoji' ? { emoji, icon: undefined } : { icon, emoji: undefined };
    if (shelf) updateShelf(shelf.id, { name, color, ...markerFields });
    else addShelf({ name, color, ...markerFields });
    onClose();
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={shelf ? tr('settings.editShelf') : tr('settings.newShelf')}
    >
      <View style={{ gap: spacing.md }}>
          {/* Live preview */}
          <View style={styles.preview}>
            <Pill
              label={name.trim() || tr('settings.shelfNamePlaceholder')}
              color={color}
              active
              icon={marker === 'icon' ? icon : undefined}
              emoji={marker === 'emoji' ? emoji : undefined}
            />
          </View>

          <ScrollView
            style={{ maxHeight: 340 }}
            contentContainerStyle={{ gap: spacing.lg }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={tr('settings.shelfNamePlaceholder')}
              placeholderTextColor={c.textFaint}
              style={[styles.input, { backgroundColor: c.cardAlt, color: c.text }]}
            />

            <View style={{ gap: spacing.sm }}>
              <Text style={[styles.label, { color: c.textMuted }]}>{tr('settings.shelfColor')}</Text>
              <View style={styles.grid}>
                {SHELF_COLORS.map((sw) => {
                  const sel = sw === color;
                  return (
                    <Pressable
                      key={sw}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setColor(sw);
                      }}
                      style={[
                        styles.swatch,
                        { backgroundColor: sw, borderColor: sel ? c.text : 'transparent' },
                      ]}
                    >
                      {sel ? <Ionicons name="checkmark" size={16} color={onColor(sw)} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={[styles.label, { color: c.textMuted }]}>{tr('settings.shelfSymbol')}</Text>
              <View style={[styles.segment, { backgroundColor: c.cardAlt }]}>
                {(['icon', 'emoji'] as MarkerKind[]).map((m) => {
                  const sel = marker === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setMarker(m);
                      }}
                      style={[styles.segmentBtn, sel && { backgroundColor: c.card }]}
                    >
                      <Text
                        style={{
                          color: sel ? c.text : c.textMuted,
                          fontWeight: '700',
                          fontSize: 14,
                        }}
                      >
                        {m === 'icon' ? tr('settings.markerIcon') : tr('settings.markerEmoji')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.grid}>
                {marker === 'icon'
                  ? SHELF_ICONS.map((g) => {
                      const sel = g === icon;
                      return (
                        <Pressable
                          key={g}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setIcon(g);
                          }}
                          style={[
                            styles.cell,
                            {
                              backgroundColor: sel ? color : c.cardAlt,
                              borderColor: sel ? color : c.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={g as keyof typeof Ionicons.glyphMap}
                            size={20}
                            color={sel ? onColor(color) : c.textMuted}
                          />
                        </Pressable>
                      );
                    })
                  : SHELF_EMOJIS.map((g) => {
                      const sel = g === emoji;
                      return (
                        <Pressable
                          key={g}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setEmoji(g);
                          }}
                          style={[
                            styles.cell,
                            {
                              backgroundColor: sel ? color : c.cardAlt,
                              borderColor: sel ? color : c.border,
                            },
                          ]}
                        >
                          <Text style={{ fontSize: 20 }}>{g}</Text>
                        </Pressable>
                      );
                    })}
              </View>
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button label={tr('common.cancel')} variant="ghost" full onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={shelf ? tr('common.save') : tr('settings.createShelf')}
                full
                disabled={!canSave}
                onPress={save}
              />
            </View>
          </View>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modal: { width: '100%', borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 18, fontWeight: '800' },
  preview: { alignItems: 'flex-start' },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 50,
    fontSize: 16,
  },
  label: { fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  cell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
