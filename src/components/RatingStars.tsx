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
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {stars.map((i) => {
        const name =
          value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline';
        const star = (
          <Ionicons name={name} size={size} color={t.colors.star} />
        );
        if (!onChange)
          return (
            <View key={i} accessibilityLabel={tr('rating.stars', { n: value })}>
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
              void Haptics.selectionAsync();
              // Tapping a star cycles full → half → cleared, so a rating can
              // be removed again (there is no other way to reach 0).
              const next = value === i ? i - 0.5 : value === i - 0.5 ? 0 : i;
              onChange(next);
            }}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}
