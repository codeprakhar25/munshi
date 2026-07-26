import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View as RNView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScanSourceButton } from '@/components/scan/scan-source-button';
import { PressScale, Rise } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';
import { type ScanEntry, useScanStore } from '@/store/scan-store';

/** The mock's amber viewfinder corners. */
function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <RNView
      style={[
        cornerStyles.base,
        pos.includes('t') ? { top: 10 } : { bottom: 10 },
        pos.includes('l') ? { left: 10 } : { right: 10 },
        {
          borderTopWidth: pos.includes('t') ? 2 : 0,
          borderBottomWidth: pos.includes('b') ? 2 : 0,
          borderLeftWidth: pos.includes('l') ? 2 : 0,
          borderRightWidth: pos.includes('r') ? 2 : 0,
        },
      ]}
    />
  );
}

const cornerStyles = StyleSheet.create({
  base: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: '#fbbf24',
  },
});

const frameStyles = StyleSheet.create({
  frame: {
    width: '62%',
    height: '82%',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
});

export default function ScanSourceScreen() {
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  const entry: ScanEntry = entryParam === 'onboarding' ? 'onboarding' : 'general';
  const language = useOnboardingStore((s) => s.language);
  const t = useStrings(language);
  const setSource = useScanStore((s) => s.setSource);

  function goToProcessing() {
    router.push(`/scan/processing?entry=${entry}`);
  }

  async function pickCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setSource(result.assets[0].uri, 'image', entry);
    goToProcessing();
  }

  async function pickGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
    if (result.canceled || !result.assets[0]) return;
    setSource(result.assets[0].uri, 'image', entry);
    goToProcessing();
  }

  async function pickPdf() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.[0]) return;
    setSource(result.assets[0].uri, 'pdf', entry);
    goToProcessing();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <View className="flex-row items-center justify-between px-4 pt-2">
        <PressScale onPress={() => router.back()} style={{ height: 40, width: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Text className="text-xl text-ink">←</Text>
        </PressScale>
        <Text className="text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 20 }}>
          {t.scanTitle}
        </Text>
        <View className="w-10" />
      </View>

      <Rise index={0}>
        <View
          className="mx-5 mt-4 mb-2 items-center justify-center overflow-hidden rounded-3xl"
          style={{ height: 260, backgroundColor: '#1c1917' }}>
          <RNView style={frameStyles.frame}>
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            <Text
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ fontFamily: AppFonts.displaySemiBold, color: 'rgba(255,255,255,0.9)' }}>
              {t.scanFrame}
            </Text>
          </RNView>
        </View>
      </Rise>

      <View className="gap-2.5 px-5 py-4">
        <Rise index={1}>
          <ScanSourceButton icon="📷" label={t.scanCamera} onPress={pickCamera} />
        </Rise>
        <Rise index={2}>
          <ScanSourceButton icon="🖼️" label={t.scanGallery} onPress={pickGallery} />
        </Rise>
        <Rise index={3}>
          <ScanSourceButton icon="📄" label={t.scanPdf} onPress={pickPdf} />
        </Rise>
      </View>
    </SafeAreaView>
  );
}
