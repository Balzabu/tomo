import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/theme';

interface Props {
  value: number; // 0..5
  size?: number;
  onChange?: (value: number) => void;
}

export function RatingStars({ value, size = 22, onChange }: Props) {
  const t = useTheme();
  const stars = [1, 2, 3, 4, 5];
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {stars.map((i) => {
        const name =
          value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline';
        const star = (
          <Ionicons name={name} size={size} color={t.colors.star} />
        );
        if (!onChange) return <View key={i}>{star}</View>;
        return (
          <Pressable
            key={i}
            hitSlop={4}
            onPress={() => {
              void Haptics.selectionAsync();
              // tap same star again to toggle the half value
              const next = value === i ? i - 0.5 : i;
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
