import { forwardRef } from 'react';
import { TextInput as RNTextInput, TextInputProps } from 'react-native';
import { useTheme } from '@/theme/theme';

/**
 * react-native's TextInput with the cursor, selection highlight and handles
 * in the theme's primary colour - left alone, Android paints them in the
 * system accent (teal, or the wallpaper colour with Material You).
 * Drop-in: same props and ref; explicit colour props still win.
 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  const t = useTheme();
  return (
    <RNTextInput
      ref={ref}
      cursorColor={t.colors.primary}
      selectionHandleColor={t.colors.primary}
      // translucent, so selected text stays readable under the highlight
      selectionColor={`${t.colors.primary}59`}
      {...props}
    />
  );
});
