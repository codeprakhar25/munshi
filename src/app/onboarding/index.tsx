import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageGrid } from '@/components/onboarding/language-grid';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Pressable, Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';

export default function OnboardingSplash() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const setLanguage = useOnboardingStore((s) => s.setLanguage);
  const t = useStrings(language);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <View className="flex-1 justify-between px-6 pb-6 pt-10">
        <View className="gap-3">
          <Text
            className="text-xs font-bold uppercase tracking-widest text-muted"
            style={{ fontFamily: AppFonts.displayBold, color: Porcelain.saffronDeep }}>
            {t.splashEyebrow}
          </Text>
          <Text
            className="text-5xl font-bold text-ink"
            style={{ fontFamily: AppFonts.displayExtraBold, letterSpacing: -1.5 }}>
            Munshi
          </Text>
          <Text className="max-w-[28ch] text-base leading-6 text-muted" style={{ fontFamily: AppFonts.body }}>
            {t.splashSub}
          </Text>
          <LanguageGrid value={language} onChange={setLanguage} />
        </View>

        <Pressable
          onPress={() => router.push('/onboarding/notifications')}
          className="rounded-2xl py-4"
          style={{ backgroundColor: Porcelain.ink }}>
          <Text
            className="text-center text-base font-bold text-white"
            style={{ fontFamily: AppFonts.displayBold }}>
            {t.start}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
