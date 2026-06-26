import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { Book } from '@/types';
import {
  loadWidgetContext,
  progressPct,
  readingBooks,
  WidgetContext,
} from './widget-shared';
import { setReadingSelection } from './widget-prefs';
import { renderForName } from './widget-task-handler';

/**
 * Configuration screen for the "Currently reading" widget. Launched by Android
 * when the widget is added (and via long-press → Configure). Runs in its own
 * React root *outside* expo-router / the app store, so it loads theme + data
 * directly and renders plain react-native UI.
 */
export function WidgetConfigScreen({
  widgetInfo,
  renderWidget,
  setResult,
}: WidgetConfigurationScreenProps) {
  const [ctx, setCtx] = useState<WidgetContext | null>(null);
  const [list, setList] = useState<Book[]>([]);
  const committing = useRef(false);

  useEffect(() => {
    let alive = true;
    loadWidgetContext().then((c) => {
      if (!alive) return;
      setCtx(c);
      setList(readingBooks(c.data));
    });
    return () => {
      alive = false;
    };
  }, []);

  const commit = async (bookId?: string) => {
    if (committing.current || !ctx) return;
    committing.current = true;
    try {
      if (bookId) await setReadingSelection(widgetInfo.widgetId, bookId);
      renderWidget(await renderForName('CurrentlyReading', ctx, widgetInfo.widgetId));
      setResult('ok');
    } catch {
      setResult('ok'); // never trap the user in the config screen
    }
  };

  if (!ctx) {
    return (
      <View style={[styles.center, { backgroundColor: '#1a1b26' }]}>
        <ActivityIndicator color="#7aa2f7" size="large" />
      </View>
    );
  }

  const c = ctx.theme.colors;
  const t = ctx.t;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        paddingTop: (StatusBar.currentHeight ?? 0) + 16,
      }}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>{t('widget.pickTitle')}</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>{t('widget.pickSubtitle')}</Text>
        </View>
        <Pressable
          onPress={() => setResult('cancel')}
          style={[styles.closeBtn, { backgroundColor: c.cardAlt }]}
          hitSlop={10}
        >
          <Text style={{ color: c.textMuted, fontSize: 18, fontWeight: '700' }}>✕</Text>
        </Pressable>
      </View>

      {list.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 40 }}>📖</Text>
          <Text style={[styles.emptyText, { color: c.textMuted }]}>{t('widget.pickEmpty')}</Text>
          <Pressable
            onPress={() => commit()}
            style={[styles.okBtn, { backgroundColor: c.primary }]}
          >
            <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>OK</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}>
          {list.map((b) => {
            const pct = progressPct(b);
            const author = b.authors.join(', ') || t('common.unknownAuthor');
            return (
              <Pressable
                key={b.id}
                onPress={() => commit(b.id)}
                style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
              >
                {b.coverUrl ? (
                  <Image
                    source={{ uri: b.coverUrl }}
                    style={[styles.cover, { backgroundColor: c.cardAlt }]}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.cover, styles.coverFallback, { backgroundColor: c.cardAlt }]}>
                    <Text style={{ fontSize: 20 }}>📖</Text>
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text numberOfLines={2} style={[styles.bookTitle, { color: c.text }]}>
                    {b.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.bookAuthor, { color: c.textMuted }]}>
                    {author}
                  </Text>
                  <View style={[styles.track, { backgroundColor: c.cardAlt }]}>
                    <View
                      style={{
                        width: `${pct}%`,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: c.primary,
                      }}
                    />
                  </View>
                  <Text style={[styles.pct, { color: c.textFaint }]}>
                    {b.pageCount ? `${b.currentPage}/${b.pageCount} · ${pct}%` : `${pct}%`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  okBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  cover: { width: 48, height: 72, borderRadius: 6 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontSize: 15, fontWeight: '700' },
  bookAuthor: { fontSize: 12, marginTop: 2 },
  track: { height: 6, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  pct: { fontSize: 11, marginTop: 4 },
});
