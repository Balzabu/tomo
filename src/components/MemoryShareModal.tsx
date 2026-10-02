import { useMemo } from 'react';
import { Book } from '@/types';
import { useStore } from '@/store/useStore';
import { durationUnits, formatDateKey, formatInt, numUnitSep, useTranslation, wordSep } from '@/i18n';
import { CardShareModal } from '@/components/CardShareModal';
import { readingCurve, readStats } from '@/lib/plan';
import { formatDuration } from '@/lib/utils';

/**
 * A "reading memory" for a finished book: dates, days, pages, time, rating,
 * the reading curve and a favourite quote, ready to share.
 */
export function MemoryShareModal({ visible, book, onClose }: { visible: boolean; book: Book; onClose: () => void }) {
  const { t: tr, lang } = useTranslation();
  const sessions = useStore((s) => s.sessions);
  const notes = useStore((s) => s.notes);

  const { content, text } = useMemo(() => {
    const st = readStats(book, sessions);
    const curve = readingCurve(book, sessions);
    // The shortest quote reads best on a card.
    const quote = notes
      .filter((n) => n.bookId === book.id && n.type === 'quote' && n.text.length <= 220)
      .sort((a, b) => a.text.length - b.text.length)[0]?.text;
    const range =
      st.start && st.end
        ? st.start === st.end
          ? formatDateKey(st.end, lang)
          : `${formatDateKey(st.start, lang, st.start.slice(0, 4) !== st.end.slice(0, 4))} – ${formatDateKey(st.end, lang)}`
        : st.end
        ? formatDateKey(st.end, lang)
        : '';
    const tiles = [
      ...(st.days ? [{ label: st.days === 1 ? tr('memory.day') : tr('memory.days'), value: formatInt(st.days, lang) }] : []),
      ...(st.pages ? [{ label: tr('unit.pages', { n: st.pages }), value: formatInt(st.pages, lang) }] : []),
      ...(st.seconds >= 60 ? [{ label: tr('memory.time'), value: formatDuration(st.seconds, durationUnits(lang)) }] : []),
      ...(st.sessions ? [{ label: tr('memory.sessions', { n: st.sessions }), value: formatInt(st.sessions, lang) }] : []),
    ];
    const author = book.authors.join(', ') || tr('common.unknownAuthor');
    return {
      content: {
        kind: 'memory' as const,
        kicker: tr('share.kicker.memory'),
        title: book.title,
        author,
        coverUrl: book.coverUrl,
        rating: book.rating,
        dates: range,
        tiles,
        quote,
        curve,
        pageCount: book.pageCount,
      },
      text: [
        `📖 ${book.title} — ${author}`,
        range ? `${tr('memory.readOn')}${/[:：]$/.test(tr('memory.readOn')) && wordSep(lang) === '' ? '' : ' '}${range}` : '',
        tiles.map((x) => `${x.value}${numUnitSep(lang)}${x.label}`).join(' · '),
        book.rating ? '★'.repeat(Math.round(book.rating)) : '',
        quote ? `“${quote}”` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }, [book, sessions, notes, lang, tr]);

  return (
    <CardShareModal
      visible={visible}
      onClose={onClose}
      title={tr('memory.title')}
      content={content}
      text={text}
      styles={['immersive', 'minimal', 'gradient', 'paper']}
      preloadUrls={[book.coverUrl]}
    />
  );
}
