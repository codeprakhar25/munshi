import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScanSourceButton } from '@/components/scan/scan-source-button';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Pressable, Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';
import { type ScanEntry, useScanStore } from '@/store/scan-store';

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
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
          <Text className="text-xl text-ink">←</Text>
        </Pressable>
        <Text className="text-base font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
          {t.scanTitle}
        </Text>
        <View className="w-10" />
      </View>

      <View
        className="mx-5 mt-4 mb-2 items-center justify-center rounded-3xl"
        style={{ height: 220, backgroundColor: '#1c1917' }}>
        <Text className="text-sm text-white/70" style={{ fontFamily: AppFonts.body }}>
          {t.scanFrame}
        </Text>
      </View>

      <View className="gap-2.5 px-5 py-4">
        <ScanSourceButton icon="📷" label={t.scanCamera} onPress={pickCamera} />
        <ScanSourceButton icon="🖼️" label={t.scanGallery} onPress={pickGallery} />
        <ScanSourceButton icon="📄" label={t.scanPdf} onPress={pickPdf} />
      </View>
    </SafeAreaView>
  );
}
