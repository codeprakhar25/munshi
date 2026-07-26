import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStrings } from '@/lib/i18n';
import type { DocLanguage } from '@/lib/sarvam/document-intelligence';
import { runDocumentIntelligence } from '@/lib/sarvam/document-intelligence';
import { parseBlocksToDrafts } from '@/lib/sarvam/scan-parsing';
import { Pressable, Text, View } from '@/tw';
import { type AppLanguage, useOnboardingStore } from '@/store/onboarding-store';
import { type ScanEntry, useScanStore } from '@/store/scan-store';

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

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-app-bg px-6" style={{ backgroundColor: '#FBF9F6' }}>
      {jobPhase === 'error' ? (
        <View className="items-center gap-3">
          <Text className="text-4xl">⚠️</Text>
          <Text className="text-center text-base text-ink">{errorMessage}</Text>
          <Pressable onPress={() => router.back()} className="rounded-xl bg-accent px-5 py-3">
            <Text className="font-bold text-white">Back</Text>
          </Pressable>
        </View>
      ) : (
        <View className="items-center gap-4">
          <ActivityIndicator size="large" color="#B45309" />
          <Text className="text-center text-base text-muted">{caption}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
