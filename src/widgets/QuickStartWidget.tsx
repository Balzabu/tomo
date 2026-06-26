import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import type { ImageWidgetSource } from 'react-native-android-widget';
import { Theme } from '@/theme/theme';
import { hx, link, WidgetT } from './widget-shared';

export interface QuickStartItem {
  id: string;
  title: string;
  coverImage?: ImageWidgetSource;
}

interface Props {
  theme: Theme;
  t: WidgetT;
  books: QuickStartItem[];
}

export function QuickStartWidget({ theme, t, books }: Props) {
  const c = theme.colors;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hx(c.card),
        borderRadius: 16,
        padding: 12,
        flexDirection: 'column',
      }}
    >
      <TextWidget
        text={`▶  ${t('book.startReading')}`}
        style={{ color: hx(c.text), fontSize: 14, fontWeight: '700', marginBottom: 6 }}
      />

      {books.length === 0 ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: link('search') }}
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget
            text={`＋ ${t('add.title')}`}
            style={{ color: hx(c.primary), fontSize: 14, fontWeight: '700' }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'column' }}>
          {books.map((b) => (
            <FlexWidget
              key={b.id}
              clickAction="OPEN_URI"
              clickActionData={{ uri: link(`timer/${b.id}`) }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: 'match_parent',
                backgroundColor: hx(c.cardAlt),
                borderRadius: 10,
                padding: 6,
                marginBottom: 6,
              }}
            >
              {b.coverImage ? (
                <ImageWidget image={b.coverImage} imageWidth={26} imageHeight={38} radius={4} />
              ) : (
                <FlexWidget
                  style={{
                    width: 26,
                    height: 38,
                    backgroundColor: hx(c.border),
                    borderRadius: 4,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <TextWidget text="📖" style={{ fontSize: 14 }} />
                </FlexWidget>
              )}
              <FlexWidget style={{ flex: 1, marginLeft: 8, marginRight: 6 }}>
                <TextWidget
                  text={b.title}
                  maxLines={1}
                  truncate="END"
                  style={{ color: hx(c.text), fontSize: 13, fontWeight: '600' }}
                />
              </FlexWidget>
              <TextWidget text="▶" style={{ color: hx(c.primary), fontSize: 15, marginRight: 4 }} />
            </FlexWidget>
          ))}

          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: link('') }}
            style={{ width: 'match_parent', alignItems: 'center', paddingTop: 2 }}
          >
            <TextWidget
              text={`${t('tab.library')}  →`}
              style={{ color: hx(c.textFaint), fontSize: 11, fontWeight: '600' }}
            />
          </FlexWidget>
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
