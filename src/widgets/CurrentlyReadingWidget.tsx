import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import type { ImageWidgetSource } from 'react-native-android-widget';
import { Theme } from '@/theme/theme';
import { formatDuration } from '@/lib/utils';
import { hx, link, WidgetT } from './widget-shared';

export interface CurrentlyReadingData {
  id: string;
  title: string;
  author: string;
  pct: number;
  currentPage: number;
  pageCount?: number;
  totalSeconds: number;
  streak: number;
  coverImage?: ImageWidgetSource;
}

interface Props {
  theme: Theme;
  t: WidgetT;
  book?: CurrentlyReadingData;
  /** 0-based position of `book` within the list of currently-reading books. */
  index?: number;
  /** Total number of currently-reading books. */
  total?: number;
}

export function CurrentlyReadingWidget({ theme, t, book, index = 0, total = 0 }: Props) {
  const c = theme.colors;
  const showSelector = total > 1;

  if (!book) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: link('search') }}
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: hx(c.card),
          borderRadius: 16,
          padding: 16,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <TextWidget text="📖" style={{ fontSize: 28 }} />
        <TextWidget
          text={t('book.startReading')}
          style={{ color: hx(c.primary), fontSize: 15, fontWeight: '700', marginTop: 6 }}
        />
      </FlexWidget>
    );
  }

  const pct = book.pct;
  const stats =
    `${book.pageCount ? `${t('common.pageAbbr')} ${book.currentPage}/${book.pageCount}` : `${t('common.pageAbbr')} ${book.currentPage}`}` +
    ` · ${formatDuration(book.totalSeconds)}` +
    (book.streak > 0 ? ` · 🔥${book.streak}` : '');

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: link(`book/${book.id}`) }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hx(c.card),
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {book.coverImage ? (
        <ImageWidget image={book.coverImage} imageWidth={64} imageHeight={96} radius={8} />
      ) : (
        <FlexWidget
          style={{
            width: 64,
            height: 96,
            backgroundColor: hx(c.cardAlt),
            borderRadius: 8,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget text="📖" style={{ fontSize: 24 }} />
        </FlexWidget>
      )}

      <FlexWidget
        style={{ flex: 1, height: 'match_parent', marginLeft: 12, justifyContent: 'center' }}
      >
        <FlexWidget
          style={{
            flexDirection: 'row',
            width: 'match_parent',
            alignItems: 'flex-start',
          }}
        >
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={book.title}
              maxLines={2}
              truncate="END"
              style={{ color: hx(c.text), fontSize: 15, fontWeight: '700' }}
            />
          </FlexWidget>

          {showSelector ? (
            <FlexWidget
              clickAction="CYCLE_READING"
              clickActionData={{}}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: hx(c.cardAlt),
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 4,
                marginLeft: 6,
              }}
            >
              <TextWidget
                text={`${index + 1}/${total}`}
                style={{ color: hx(c.textMuted), fontSize: 11, fontWeight: '700', marginRight: 4 }}
              />
              <TextWidget text="⇄" style={{ color: hx(c.primary), fontSize: 13, fontWeight: '700' }} />
            </FlexWidget>
          ) : null}
        </FlexWidget>

        <TextWidget
          text={book.author}
          maxLines={1}
          truncate="END"
          style={{ color: hx(c.textMuted), fontSize: 12, marginTop: 2 }}
        />

        <FlexWidget
          style={{
            flexDirection: 'row',
            height: 8,
            width: 'match_parent',
            backgroundColor: hx(c.cardAlt),
            borderRadius: 4,
            marginTop: 10,
          }}
        >
          {pct > 0 ? (
            <FlexWidget
              style={{ flex: pct, height: 8, backgroundColor: hx(c.primary), borderRadius: 4 }}
            />
          ) : null}
          {pct < 100 ? <FlexWidget style={{ flex: 100 - pct, height: 8 }} /> : null}
        </FlexWidget>

        <TextWidget
          text={`${stats} · ${pct}%`}
          maxLines={1}
          truncate="END"
          style={{ color: hx(c.textFaint), fontSize: 11, marginTop: 6 }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
