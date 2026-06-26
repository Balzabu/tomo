import { ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/store/useSettings';
import { SchemeChoice, spacing } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { ThemeGallery } from '@/components/ThemeGallery';

export default function AppearanceSettings() {
  const { t: tr } = useTranslation();
  const scheme = useSettings((s) => s.scheme);
  const setScheme = useSettings((s) => s.setScheme);

  const pick = (c: SchemeChoice) => {
    void Haptics.selectionAsync();
    setScheme(c);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      <ThemeGallery choice={scheme} autoLabel={tr('theme.auto')} onPick={pick} />
    </ScrollView>
  );
}
