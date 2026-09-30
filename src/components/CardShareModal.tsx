import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Alert } from '@/components/AppAlert';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';
import { BottomSheet } from '@/components/BottomSheet';
import { ShareCard, ShareAspect, ShareContent, ShareStyle } from '@/components/ShareCard';
import { ShareStyleControls } from '@/components/ShareStyleControls';
import { shareViewAsImage } from '@/lib/shareImage';
import { shareText } from '@/lib/share';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  content: ShareContent;
  /** plain-text version for "share as text" */
  text: string;
  styles?: ShareStyle[];
  /** remote images the card shows (cover), fetched before capture */
  preloadUrls?: (string | undefined)[];
}

const CARD_W = 300;

/** Preview + share sheet for any ShareCard (stats cards, reading memories). */
export function CardShareModal({ visible, onClose, title, content, text, styles: allowed, preloadUrls }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const choices = allowed ?? ['minimal', 'gradient', 'paper'];
  const [style, setStyle] = useState<ShareStyle>(choices[0]);
  const [aspect, setAspect] = useState<ShareAspect>('square');

  const shareAsImage = async () => {
    if (busy) return;
    setBusy(true);
    const res = await shareViewAsImage(cardRef, { preloadUrls });
    setBusy(false);
    if (res === 'failed') Alert.alert(tr('share.failedTitle'), tr('share.failedMsg'));
    else if (res === 'unavailable') Alert.alert(tr('settings.shareUnavailableTitle'), tr('settings.shareUnavailableMsg'));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title ?? tr('wrapped.share')}>
      <ScrollView
        style={{ maxHeight: 480 }}
        contentContainerStyle={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}
        showsVerticalScrollIndicator={false}
      >
        <ShareStyleControls
          styles={choices}
          style={style}
          aspect={aspect}
          primary={t.colors.primary}
          accent={t.colors.accent}
          onStyle={setStyle}
          onAspect={setAspect}
        />
        <ShareCard ref={cardRef} theme={t} style={style} aspect={aspect} width={CARD_W} content={content} />
      </ScrollView>
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            label={tr('share.asText')}
            icon="chatbubble-ellipses-outline"
            variant="secondary"
            full
            disabled={busy}
            onPress={() => void shareText(`${text}\n\n${tr('share.fromTomo')}`)}
          />
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
