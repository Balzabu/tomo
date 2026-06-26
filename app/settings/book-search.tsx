import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button, Card } from '@/components/ui';
import { loadGoogleApiKey, saveGoogleApiKey } from '@/lib/prefs';
import { isLikelyGoogleApiKey, setGoogleApiKey, validateGoogleApiKey } from '@/services/bookApi';

export default function BookSearchSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [checking, setChecking] = useState(false);
  const c = t.colors;

  useEffect(() => {
    void loadGoogleApiKey().then((k) => {
      setApiKey(k);
      setSavedKey(k);
    });
  }, []);

  const persist = async (k: string) => {
    await saveGoogleApiKey(k);
    setGoogleApiKey(k);
    setSavedKey(k);
  };

  const onSave = async () => {
    const k = apiKey.trim();

    // Removing the key.
    if (!k) {
      await persist('');
      Alert.alert(tr('settings.keyRemovedTitle'), tr('settings.keyRemovedMsg'));
      return;
    }

    // Offline format check first - cheap, catches typos/paste errors.
    if (!isLikelyGoogleApiKey(k)) {
      Alert.alert(tr('settings.keyBadFormatTitle'), tr('settings.keyBadFormatMsg'));
      return;
    }

    setChecking(true);
    const result = await validateGoogleApiKey(k);
    setChecking(false);

    if (result === 'valid') {
      await persist(k);
      Alert.alert(tr('settings.keySavedTitle'), tr('settings.keyVerifiedMsg'));
    } else if (result === 'invalid') {
      Alert.alert(tr('settings.keyInvalidTitle'), tr('settings.keyInvalidMsg'));
    } else {
      // Couldn't reach Google - let the user save anyway (format is valid).
      Alert.alert(tr('settings.keyUnverifiedTitle'), tr('settings.keyUnverifiedMsg'), [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('settings.saveAnyway'),
          onPress: async () => {
            await persist(k);
          },
        },
      ]);
    }
  };

  const trimmed = apiKey.trim();
  const formatOk = trimmed === '' || isLikelyGoogleApiKey(trimmed);
  const saveLabel = checking
    ? tr('settings.keyChecking')
    : trimmed
    ? tr('settings.verifyAndSave')
    : savedKey
    ? tr('settings.removeKey')
    : tr('common.save');

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={[styles.status, { color: savedKey ? c.success : c.textFaint }]}>
          {savedKey ? tr('settings.keyActive') : tr('settings.keyInactive')}
        </Text>
        <Text style={[styles.muted, { color: c.textMuted }]}>{tr('settings.searchDesc')}</Text>

        <View style={[styles.inputWrap, { backgroundColor: c.cardAlt, borderColor: !formatOk ? c.danger : 'transparent' }]}>
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder={tr('settings.keyPlaceholder')}
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!checking}
            style={[styles.keyInput, { color: c.text }]}
          />
          {trimmed ? (
            <Ionicons
              name={formatOk ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={formatOk ? c.success : c.danger}
            />
          ) : null}
        </View>
        {!formatOk ? (
          <Text style={[styles.hint, { color: c.danger }]}>{tr('settings.keyBadFormatMsg')}</Text>
        ) : null}

        <Button
          label={saveLabel}
          icon="key"
          variant="secondary"
          full
          loading={checking}
          disabled={checking || trimmed === savedKey}
          onPress={onSave}
        />
        <Pressable
          onPress={() => Linking.openURL('https://console.cloud.google.com/apis/library/books.googleapis.com')}
        >
          <Text style={[styles.link, { color: c.primary }]}>{tr('settings.getKey')}</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 13, fontWeight: '700' },
  muted: { fontSize: 14, lineHeight: 20 },
  link: { fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 12, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
  },
  keyInput: { flex: 1, height: 48, fontSize: 14 },
});
