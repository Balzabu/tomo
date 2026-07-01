import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { lookupByIsbn } from '@/services/bookApi';
import { useStore } from '@/store/useStore';
import { spacing, useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui';

type Phase = 'scanning' | 'searching' | 'notfound';

export default function ScanScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const addBook = useStore((s) => s.addBook);
  const [phase, setPhase] = useState<Phase>('scanning');
  const [lastIsbn, setLastIsbn] = useState<string | null>(null);
  // ref lock: state updates are async, this blocks a second barcode firing
  // in the same frame before `phase` has re-rendered the camera off.
  const lockRef = useRef(false);
  // The ISBN lookup can take seconds; if the user dismisses the modal while it
  // runs, don't add a book they abandoned / call router.back() / setState.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const cameraActive = phase === 'scanning';

  const onScanned = async ({ data }: { data: string }) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setPhase('searching'); // disables the camera while we look up
    setLastIsbn(data);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const result = await lookupByIsbn(data);
    if (!mountedRef.current) return; // screen was dismissed mid-lookup
    if (result) {
      addBook(result, 'want_to_read');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      // Keep the camera off so we don't instantly re-scan the same code in a
      // loop; let the user decide to retry or add the book manually.
      setPhase('notfound');
    }
  };

  const resumeScanning = () => {
    lockRef.current = false;
    setLastIsbn(null);
    setPhase('scanning');
  };

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: t.colors.bg, padding: spacing.xl, gap: spacing.lg }]}>
        <Ionicons name="camera-outline" size={56} color={t.colors.textFaint} />
        <Text style={[styles.permTitle, { color: t.colors.text }]}>
          {tr('scan.permTitle')}
        </Text>
        <Text style={[styles.permSub, { color: t.colors.textMuted }]}>
          {tr('scan.permSub')}
        </Text>
        <Button label={tr('scan.allow')} icon="camera" onPress={requestPermission} />
        <Button label={tr('scan.manual')} variant="ghost" onPress={() => router.replace('/add-manual')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        active={cameraActive}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={cameraActive ? onScanned : undefined}
      />

      {/* Scanning: aiming frame */}
      {phase === 'scanning' ? (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>{tr('scan.aim')}</Text>
        </View>
      ) : null}

      {/* Searching: camera paused */}
      {phase === 'searching' ? (
        <View style={[styles.scrim, { backgroundColor: t.colors.overlay }]}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.scrimTitle}>{tr('scan.searching')}</Text>
          {lastIsbn ? <Text style={styles.scrimSub}>ISBN {lastIsbn}</Text> : null}
          <Text style={styles.scrimHint}>{tr('scan.paused')}</Text>
        </View>
      ) : null}

      {/* Not found: camera stays off */}
      {phase === 'notfound' ? (
        <View style={[styles.scrim, { backgroundColor: t.colors.overlay }]}>
          <Ionicons name="alert-circle" size={48} color={t.colors.accent} />
          <Text style={styles.scrimTitle}>{tr('scan.notFound')}</Text>
          {lastIsbn ? <Text style={styles.scrimSub}>ISBN {lastIsbn}</Text> : null}
          <Text style={styles.scrimHint}>{tr('scan.notFoundSub')}</Text>
          <View style={styles.scrimBtns}>
            <Button label={tr('scan.again')} icon="scan" full onPress={resumeScanning} />
            <Button
              label={tr('scan.manual')}
              variant="secondary"
              icon="create"
              full
              onPress={() => router.replace('/add-manual')}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permSub: { fontSize: 14, textAlign: 'center' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  frame: {
    width: 260,
    height: 150,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
  },
  hint: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  scrimTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  scrimSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  scrimHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.md,
  },
  scrimBtns: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.md },
});
