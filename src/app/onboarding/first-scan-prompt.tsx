import { useRouter } from 'expo-router';
import { Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Pressable, Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';

export default function FirstScanPromptScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const t = useStrings(language);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Image
          source={require('../../../assets/images/bahi-hero.png')}
          style={{ width: 220, height: 140, borderRadius: 20 }}
          resizeMode="cover"
        />
        <Text className="text-center text-2xl font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
          {t.firstScanTitle}
        </Text>
        <Text className="max-w-[30ch] text-center text-base text-muted" style={{ fontFamily: AppFonts.body }}>
          {t.firstScanBody}
        </Text>
      </View>

      <View className="gap-2.5 px-6 pb-6">
        <Pressable
          onPress={() => router.push('/scan?entry=onboarding')}
          className="rounded-2xl py-4"
          style={{ backgroundColor: Porcelain.saffronDeep }}>
          <Text className="text-center text-base font-bold text-white" style={{ fontFamily: AppFonts.displayBold }}>
            {t.scanNow}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            completeOnboarding();
            router.replace('/home');
          }}
          className="rounded-2xl border border-line bg-surface py-4">
          <Text className="text-center text-base font-bold text-ink" style={{ fontFamily: AppFonts.displaySemiBold }}>
            {t.skip}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
