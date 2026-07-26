import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, StyleSheet, View as RNView } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuietButton, SaffronButton } from '@/components/ui/buttons';
import { AmbientBackdrop, Gradient, PressScale, Rise, useBreath } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';
import { type ScanEntry, useScanStore } from '@/store/scan-store';

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <RNView
      style={[
        styles.corner,
        pos.includes('t') ? { top: 14 } : { bottom: 14 },
        pos.includes('l') ? { left: 14 } : { right: 14 },
        {
          borderTopWidth: pos.includes('t') ? 2.5 : 0,
          borderBottomWidth: pos.includes('b') ? 2.5 : 0,
          borderLeftWidth: pos.includes('l') ? 2.5 : 0,
          borderRightWidth: pos.includes('r') ? 2.5 : 0,
        },
      ]}
    />
  );
}

export default function ScanSourceScreen() {
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  const entry: ScanEntry = entryParam === 'onboarding' ? 'onboarding' : 'general';
  const language = useOnboardingStore((s) => s.language);
  const t = useStrings(language);
  const setSource = useScanStore((s) => s.setSource);
  const shutterHalo = useBreath({ peak: 1.06, lo: 0.35, hi: 0.85, ms: 2200 });

  function goToProcessing() {
    router.push(`/scan/processing?entry=${entry}`);
  }

  async function pickCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    setSource(result.assets[0].uri, 'image', entry);
    goToProcessing();
  }

  async function pickGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85,
      mediaTypes: ['images'],
    });
    if (result.canceled || !result.assets[0]) return;
    setSource(result.assets[0].uri, 'image', entry);
    goToProcessing();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }} edges={['top', 'bottom']}>
      <AmbientBackdrop image="radial-gradient(circle at 90% -10%, #ffedd5 0%, rgba(255,237,213,0) 52%)" />
      <AmbientBackdrop image="radial-gradient(circle at 8% 110%, #e0e7ff 0%, rgba(224,231,255,0) 48%)" />

      <View className="flex-row items-center justify-between px-4 pt-1">
        <PressScale
          onPress={() => router.back()}
          style={styles.backBtn}>
          <Text style={{ fontFamily: AppFonts.displayBold, fontSize: 18, color: Porcelain.ink }}>←</Text>
        </PressScale>
        <Text style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 22, color: Porcelain.ink, letterSpacing: -0.4 }}>
          {t.scanTitle}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View className="flex-1 px-5 pb-4 pt-3">
        <Rise index={0}>
          <Text
            style={{
              fontFamily: AppFonts.body,
              fontSize: 15,
              color: Porcelain.muted,
              lineHeight: 22,
              marginBottom: 14,
            }}>
            {t.scanSubtitle}
          </Text>
        </Rise>

        {/* Hero viewfinder — brand-first composition */}
        <Rise index={1} style={{ flex: 1, minHeight: 280 }}>
          <View style={styles.heroShell}>
            <Image
              source={require('../../../assets/images/bahi-hero.png')}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
            <Gradient
              image="linear-gradient(180deg, rgba(28,25,23,0.15) 0%, rgba(28,25,23,0.55) 55%, rgba(28,25,23,0.82) 100%)"
              style={StyleSheet.absoluteFill}
            />
            <RNView style={styles.frame}>
              <Corner pos="tl" />
              <Corner pos="tr" />
              <Corner pos="bl" />
              <Corner pos="br" />
              <Text
                style={{
                  fontFamily: AppFonts.displaySemiBold,
                  fontSize: 11,
                  letterSpacing: 2.2,
                  color: 'rgba(255,255,255,0.92)',
                  textTransform: 'uppercase',
                }}>
                {t.scanFrame}
              </Text>
            </RNView>
            <View style={styles.scriptChip}>
              <Text
                style={{
                  fontFamily: AppFonts.displaySemiBold,
                  fontSize: 11,
                  color: Porcelain.saffronMist,
                }}>
                {t.scanAnyScript}
              </Text>
            </View>
          </View>
        </Rise>

        <Rise index={2}>
          <View className="mt-5 gap-3">
            <View style={{ alignItems: 'center' }}>
              <Animated.View pointerEvents="none" style={[styles.shutterHalo, shutterHalo]}>
                <Gradient
                  image="radial-gradient(circle, rgba(245,158,11,0.45) 0%, rgba(245,158,11,0) 70%)"
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              <SaffronButton label={t.scanShutter} onPress={pickCamera} style={{ width: '100%' }} />
            </View>
            <QuietButton label={t.scanGallery} onPress={pickGallery} />
          </View>
        </Rise>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Porcelain.white,
    borderWidth: 1,
    borderColor: Porcelain.line,
  },
  heroShell: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#1c1917',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1c1917',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  frame: {
    width: '72%',
    height: '78%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 22,
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#fbbf24',
  },
  scriptChip: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(28,25,23,0.55)',
  },
  shutterHalo: {
    position: 'absolute',
    width: 220,
    height: 72,
    top: -8,
  },
});
