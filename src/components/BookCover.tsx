import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, useTheme } from '@/theme/theme';

interface Props {
  uri?: string;
  title?: string;
  width: number;
  height?: number;
}

export function BookCover({ uri, title, width, height }: Props) {
  const t = useTheme();
  const h = height ?? Math.round(width * 1.5);
  const fontSize = Math.max(10, Math.round(width / 7));

  // A cover URL that fails to load (404 from Open Library's default=false,
  // dangling local file, dead link) falls back to the title placeholder
  // instead of an empty rectangle. Reset when the row is recycled onto a
  // different uri.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        // recyclingKey avoids showing a previous row's cover while the new one
        // loads when FlatList recycles this view.
        recyclingKey={uri}
        style={{ width, height: h, borderRadius: radius.sm, backgroundColor: t.colors.cardAlt }}
        contentFit="cover"
        transition={200}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        {
          width,
          height: h,
          backgroundColor: t.colors.cardAlt,
          borderColor: t.colors.border,
        },
      ]}
    >
      <Ionicons name="book" size={width / 3} color={t.colors.textFaint} />
      {title ? (
        <Text
          numberOfLines={3}
          style={[styles.title, { color: t.colors.textMuted, fontSize }]}
        >
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  title: {
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
  },
});
