import { useEffect, useState } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { useTranslation } from '@/i18n';

// Catalogues normally answer in a second or two; past this, say so, so a
// slow network doesn't look like a frozen app.
const SLOW_AFTER_MS = 5000;

/** "Taking longer than usual…", shown once `active` has lasted a while. */
export function SlowHint({ active, style }: { active: boolean; style?: StyleProp<TextStyle> }) {
  const { t: tr } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active]);
  return slow ? <Text style={style}>{tr('search.slow')}</Text> : null;
}
