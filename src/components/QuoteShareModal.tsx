import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';
import { BottomSheet } from '@/components/BottomSheet';
import { ShareCard, ShareAspect, ShareStyle } from '@/components/ShareCard';
import { ShareStyleControls } from '@/components/ShareStyleControls';
import { shareViewAsImage } from '@/lib/shareImage';
import { shareText } from '@/lib/share';

interface Props {
  visible: boolean;
  quote?: string;
  title?: string;
  author?: string;
  page?: number;
  onClose: () => void;
}

const QUOTE_STYLES: ShareStyle[] = ['minimal', 'gradient', 'paper'];
const CARD_W = 300;

export function QuoteShareModal({ visible, quote, title, author, page, onClose }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState<ShareStyle>('paper');
  const [aspect, setAspect] = useState<ShareAspect>('square');

  const shareAsImage = async () => {
    if (busy) return;
    setBusy(true);
    const res = await shareViewAsImage(cardRef);
    setBusy(false);
    if (res === 'failed') Alert.alert(tr('share.failedTitle'), tr('share.failedMsg'));
    else if (res === 'unavailable') Alert.alert(tr('settings.shareUnavailableTitle'), tr('settings.shareUnavailableMsg'));
  };

  const shareAsText = () => {
    const attribution = [title, author].filter(Boolean).join(' — ');
    const pageStr = page != null ? ` (${tr('common.pageAbbr')} ${page})` : '';
    void shareText(`“${quote ?? ''}”\n— ${attribution}${pageStr}\n\n${tr('share.fromTomo')}`);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('wrapped.share')}>
      <ScrollView
        style={{ maxHeight: 460 }}
        contentContainerStyle={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}
        showsVerticalScrollIndicator={false}
      >
        <ShareStyleControls
          styles={QUOTE_STYLES}
          style={style}
          aspect={aspect}
          primary={t.colors.primary}
          accent={t.colors.accent}
          onStyle={setStyle}
          onAspect={setAspect}
        />
        <ShareCard
          ref={cardRef}
          theme={t}
          style={style}
          aspect={aspect}
          width={CARD_W}
          content={{
            kind: 'quote',
            quote: quote ?? '',
            title,
            author,
            page,
            pageAbbr: tr('common.pageAbbr'),
          }}
        />
      </ScrollView>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button label={tr('share.asText')} icon="chatbubble-ellipses-outline" variant="secondary" full disabled={busy} onPress={shareAsText} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={busy ? tr('share.preparing') : tr('share.asImage')} icon="image" full loading={busy} onPress={shareAsImage} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
