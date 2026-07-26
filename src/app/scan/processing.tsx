import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Image, StyleSheet, View as RNView } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InkButton } from '@/components/ui/buttons';
import { AmbientBackdrop, Gradient, Rise, useBreath } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { loadKhata } from '@/db/khata';
import { useStrings } from '@/lib/i18n';
import {
  fingerprintsFromKhata,
  markAlreadyImported,
} from '@/lib/sarvam/scan-parsing';
import { runScan, type ScanPhase } from '@/ocr';
import type { DocLanguage } from '@/ocr/client';
import { Text, View } from '@/tw';
import { useDeviceContactsStore } from '@/store/device-contacts-store';
import { type AppLanguage, useOnboardingStore } from '@/store/onboarding-store';
import { type ScanEntry, type ScanJobPhase, useScanStore } from '@/store/scan-store';

const PHASES: ScanJobPhase[] = [
  'uploading',
  'processing',
  'downloading',
  'reading',
  'structuring',
  'matching',
];

function ProgressSweep() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
  }, [p]);
  const style = useAnimatedStyle(() => ({
    left: `${-40 + 140 * p.value}%`,
  }));
  return (
    <RNView style={styles.track}>
      <Animated.View style={[styles.fill, style]}>
        <Gradient
          image="linear-gradient(90deg, rgba(245,158,11,0) 0%, #f59e0b 30%, #b45309 70%, rgba(180,83,9,0) 100%)"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </RNView>
  );
}

function PhaseDots({ active }: { active: ScanJobPhase }) {
  const idx = Math.max(0, PHASES.indexOf(active));
  return (
    <View className="flex-row items-center gap-1.5">
      {PHASES.map((phase, i) => {
        const on = i <= idx;
        return (
          <RNView
            key={phase}
            style={{
              height: 5,
              width: on && i === idx ? 22 : 5,
              borderRadius: 99,
              backgroundColor: on ? Porcelain.saffronDeep : Porcelain.line,
            }}
          />
        );
      })}
    </View>
  );
}

const LANGUAGE_TO_DOC: Record<AppLanguage, DocLanguage> = {
  hi: 'hi-IN',
  en: 'en-IN',
  mr: 'mr-IN',
  ta: 'ta-IN',
};

function asJobPhase(phase: ScanPhase): ScanJobPhase {
  switch (phase) {
    case 'uploading':
    case 'processing':
    case 'downloading':
    case 'reading':
    case 'structuring':
    case 'matching':
      return phase;
    default:
      return 'processing';
  }
}

export default function ScanProcessingScreen() {
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  const entry: ScanEntry = entryParam === 'onboarding' ? 'onboarding' : 'general';
  const language = useOnboardingStore((s) => s.language);
  const t = useStrings(language);

  const sourceUri = useScanStore((s) => s.sourceUri);
  const sourceType = useScanStore((s) => s.sourceType);
  const appendNext = useScanStore((s) => s.appendNext);
  const jobPhase = useScanStore((s) => s.jobPhase);
  const errorMessage = useScanStore((s) => s.errorMessage);
  const setJobPhase = useScanStore((s) => s.setJobPhase);
  const setJobId = useScanStore((s) => s.setJobId);
  const setDrafts = useScanStore((s) => s.setDrafts);
  const appendDrafts = useScanStore((s) => s.appendDrafts);

  useEffect(() => {
    if (!sourceUri || !sourceType) return;
    let cancelled = false;

    async function run() {
      try {
        setJobPhase('uploading');
        const res = await fetch(sourceUri!);
        if (!res.ok) throw new Error(`could not read source (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;

        const khata = await loadKhata();
        // Names only, lazy — never blocks onboarding with a full-book dump.
        await useDeviceContactsStore.getState().ensureLoaded();
        if (cancelled) return;
        const contacts = useDeviceContactsStore.getState().contacts.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
        }));
        if (cancelled) return;

        const report = await runScan(bytes, sourceType!, LANGUAGE_TO_DOC[language], {
          khata,
          contacts,
          scriptLanguage: 'auto',
          onPhase: (phase) => {
            if (!cancelled) setJobPhase(asJobPhase(phase));
          },
        });
        if (cancelled) return;

        setJobId(report.jobId);
        const drafts = markAlreadyImported(
          report.drafts,
          fingerprintsFromKhata(khata),
        );
        if (appendNext) appendDrafts(drafts);
        else setDrafts(drafts);
        setJobPhase('done');
        router.replace(`/scan/review?entry=${entry}`);
      } catch (err) {
        if (!cancelled) {
          setJobPhase('error', err instanceof Error ? err.message : 'Something went wrong');
        }
      }
    }
    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUri, sourceType]);

  const caption = useMemo(() => captionFor(jobPhase, t), [jobPhase, t]);
  const breath = useBreath({ peak: 1.03, lo: 0.85, hi: 1, ms: 2600 });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <AmbientBackdrop image="radial-gradient(circle at 80% 0%, #ffedd5 0%, rgba(255,237,213,0) 55%)" />
      <AmbientBackdrop image="radial-gradient(circle at 10% 100%, #e0e7ff 0%, rgba(224,231,255,0) 45%)" />

      {jobPhase === 'error' ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text
            style={{
              fontFamily: AppFonts.body,
              fontSize: 16,
              color: Porcelain.ink,
              textAlign: 'center',
              lineHeight: 24,
            }}>
            {errorMessage}
          </Text>
          <InkButton label="Back" onPress={() => router.back()} style={{ minWidth: 140, marginTop: 8 }} />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center gap-6 px-8">
          <Rise index={0}>
            <Animated.View style={[styles.art, breath]}>
              <Image
                source={require('../../../assets/images/bahi-hero.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
              <Gradient
                image="linear-gradient(180deg, rgba(28,25,23,0) 40%, rgba(28,25,23,0.35) 100%)"
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Rise>
          <Rise index={1}>
            <Text
              style={{
                fontFamily: AppFonts.serifSemiBold,
                fontSize: 22,
                color: Porcelain.ink,
                textAlign: 'center',
                letterSpacing: -0.3,
              }}>
              {caption}
            </Text>
          </Rise>
          <Rise index={2}>
            <PhaseDots active={jobPhase} />
          </Rise>
          <Rise index={3}>
            <ProgressSweep />
          </Rise>
        </View>
      )}
    </SafeAreaView>
  );
}

function captionFor(phase: ScanJobPhase, t: ReturnType<typeof useStrings>): string {
  switch (phase) {
    case 'uploading':
      return t.processingUploading;
    case 'processing':
      return t.processingProcessing;
    case 'downloading':
      return t.processingDownloading;
    case 'reading':
      return t.processingReading;
    case 'structuring':
      return t.processingStructuring;
    case 'matching':
      return t.processingMatching;
    default:
      return t.processingMatching;
  }
}

const styles = StyleSheet.create({
  art: {
    width: 196,
    height: 196,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: Porcelain.paper2,
    shadowColor: '#1c1917',
    shadowOpacity: 0.12,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
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
