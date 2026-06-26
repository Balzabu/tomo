import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
  PanGestureHandlerStateChangeEvent,
  State,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, useTheme } from '@/theme/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** optional element on the right of the title (e.g. a "Clear" action) */
  right?: React.ReactNode;
  /** called when the sheet becomes visible (e.g. to seed form fields) */
  onShow?: () => void;
  children: React.ReactNode;
}

/**
 * A bottom sheet that animates up on open and is dismissible by swiping down on
 * the grab handle / header (or tapping the backdrop).
 *
 * Uses react-native-gesture-handler (a plain PanGestureHandler with JS
 * callbacks - no reanimated needed). Crucially, a Modal renders in its own
 * native window OUTSIDE the app's root GestureHandlerRootView, so we wrap the
 * Modal content in its own GestureHandlerRootView or gestures won't fire.
 * The pan lives on the header only, so the body can still scroll.
 */
export function BottomSheet({ visible, onClose, title, right, onShow, children }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const heightRef = useRef(600);

  useEffect(() => {
    if (visible) {
      onShow?.();
      translateY.setValue(heightRef.current);
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }
    // onShow intentionally omitted from deps - fire once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, translateY]);

  const animateClose = () => {
    Animated.timing(translateY, {
      toValue: heightRef.current,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const onGestureEvent = (e: PanGestureHandlerGestureEvent) => {
    const ty = e.nativeEvent.translationY;
    if (ty > 0) translateY.setValue(ty);
  };

  const onStateChange = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
      const { translationY: ty, velocityY: vy } = e.nativeEvent;
      if (ty > 110 || vy > 800) animateClose();
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={animateClose}>
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={animateClose} />

        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: t.colors.card, paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
          ]}
          onLayout={(e) => {
            if (e.nativeEvent.layout.height > 0) heightRef.current = e.nativeEvent.layout.height;
          }}
        >
          <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onStateChange}
            activeOffsetY={[-12, 8]}
          >
            <View style={styles.dragZone}>
              <View style={[styles.grabber, { backgroundColor: t.colors.border }]} />
              {title ? (
                <View style={styles.headRow}>
                  <Text style={[styles.title, { color: t.colors.text }]}>{title}</Text>
                  {right}
                </View>
              ) : null}
            </View>
          </PanGestureHandler>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  dragZone: { paddingTop: spacing.md, paddingBottom: spacing.xs },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '800' },
});
