import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Image, StyleSheet, View as RNView } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InkButton } from '@/components/ui/buttons';
import { Gradient, Rise, useBreath } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import type { DocLanguage } from '@/lib/sarvam/document-intelligence';
import { runDocumentIntelligence } from '@/lib/sarvam/document-intelligence';
import { parseBlocksToDrafts } from '@/lib/sarvam/scan-parsing';
import { Text, View } from '@/tw';
import { type AppLanguage, useOnboardingStore } from '@/store/onboarding-store';
import { type ScanEntry, useScanStore } from '@/store/scan-store';

/**
 * Indeterminate progress in the mock's style: a saffron gradient segment
 * sweeping along the 3px track. Real OCR progress isn't knowable, so the sweep
 * is honest — motion without a fake percentage.
 */
function ProgressSweep() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }), -1, false);
  }, [p]);
  const style = useAnimatedStyle(() => ({
    left: `${-40 + 140 * p.value}%`,
  }));
  return (
    <RNView style={progressStyles.track}>
      <Animated.View style={[progressStyles.fill, style]}>
        <Gradient image="linear-gradient(90deg, rgba(245,158,11,0) 0%, #f59e0b 30%, #b45309 70%, rgba(180,83,9,0) 100%)" style={StyleSheet.absoluteFill} />
      </Animated.View>
    </RNView>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 3,
    width: 220,
    borderRadius: 99,
    backgroundColor: Porcelain.paper2,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    borderRadius: 99,
    overflow: 'hidden',
  },
});

const LANGUAGE_TO_DOC: Record<AppLanguage, DocLanguage> = {
  hi: 'hi-IN',
  en: 'en-IN',
  mr: 'mr-IN',
  ta: 'ta-IN',
};

export default function ScanProcessingScreen() {
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  const entry: ScanEntry = entryParam === 'onboarding' ? 'onboarding' : 'general';
  const language = useOnboardingStore((s) => s.language);
  const t = useStrings(language);

  const sourceUri = useScanStore((s) => s.sourceUri);
  const sourceType = useScanStore((s) => s.sourceType);
  const jobPhase = useScanStore((s) => s.jobPhase);
  const errorMessage = useScanStore((s) => s.errorMessage);
  const setJobPhase = useScanStore((s) => s.setJobPhase);
  const setDrafts = useScanStore((s) => s.setDrafts);

  useEffect(() => {
    if (!sourceUri || !sourceType) return;
    let cancelled = false;

    async function run() {
      try {
        setJobPhase('uploading');
        const blocks = await runDocumentIntelligence(
          { uri: sourceUri!, type: sourceType! },
          LANGUAGE_TO_DOC[language],
          (phase) => {
            if (!cancelled) setJobPhase(phase);
          }
        );
        if (cancelled) return;
        setJobPhase('parsing');
        const drafts = parseBlocksToDrafts(blocks);
        setDrafts(drafts);
        setJobPhase('done');
        router.replace(`/scan/review?entry=${entry}`);
      } catch (err) {
        if (!cancelled) {
          setJobPhase('error', err instanceof Error ? err.message : 'Something went wrong');
        }
      }
    }
    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUri, sourceType]);

  const caption =
    jobPhase === 'uploading'
      ? t.processingUploading
      : jobPhase === 'processing'
        ? t.processingProcessing
        : t.processingParsing;

  const breath = useBreath({ peak: 1.03, lo: 0.85, hi: 1, ms: 2600 });

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-app-bg px-6" style={{ backgroundColor: Porcelain.paper }}>
      {jobPhase === 'error' ? (
        <View className="items-center gap-3">
          <Text className="text-4xl">⚠️</Text>
          <Text className="text-center text-base text-ink">{errorMessage}</Text>
          <InkButton label="Back" onPress={() => router.back()} style={{ minWidth: 140, marginTop: 8 }} />
        </View>
      ) : (
        <View className="items-center gap-5">
          <Rise index={0}>
            <Animated.View style={[procStyles.art, breath]}>
              <Image
                source={require('../../../assets/images/bahi-hero.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </Animated.View>
          </Rise>
          <Rise index={1}>
            <Text className="text-center text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 20 }}>
              {caption}
            </Text>
          </Rise>
          <Rise index={2}>
            <ProgressSweep />
          </Rise>
        </View>
      )}
    </SafeAreaView>
  );
}

const procStyles = StyleSheet.create({
  art: {
    width: 180,
    height: 180,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Porcelain.paper2,
    shadowColor: '#1c1917',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
});
