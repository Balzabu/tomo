import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';

interface Props {
  value: number; // 0..5
  size?: number;
  onChange?: (value: number) => void;
}

export function RatingStars({ value, size = 22, onChange }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const stars = [1, 2, 3, 4, 5];
  const stepTo = (next: number) => {
    void Haptics.selectionAsync();
    onChange?.(Math.min(5, Math.max(0, next)));
  };
  // One announcement for the whole row ("4 stars"), not five identical ones
  // per star. The interactive row is an adjustable control too, so a screen
  // reader can swipe up/down in half steps without hunting for the stars.
  const a11y = onChange
    ? {
        accessible: true,
        accessibilityRole: 'adjustable' as const,
        accessibilityLabel: tr('rating.label'),
        accessibilityValue: { text: tr('rating.stars', { n: value }) },
        accessibilityHint: tr('rating.hint'),
        accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
        onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
          if (e.nativeEvent.actionName === 'increment') stepTo(value + 0.5);
          else if (e.nativeEvent.actionName === 'decrement') stepTo(value - 0.5);
        },
      }
    : { accessible: true, accessibilityLabel: tr('rating.stars', { n: value }) };
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} {...a11y}>
      {stars.map((i) => {
        const name =
          value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline';
        const star = (
          <Ionicons name={name} size={size} color={t.colors.star} />
        );
        if (!onChange)
          return (
            <View key={i} importantForAccessibility="no-hide-descendants">
              {star}
            </View>
          );
        return (
          <Pressable
            key={i}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={tr('rating.stars', { n: i })}
            onPress={() => {
              // Tapping a star cycles full → half → cleared, so a rating can
              // be removed again (there is no other way to reach 0).
              stepTo(value === i ? i - 0.5 : value === i - 0.5 ? 0 : i);
            }}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}
