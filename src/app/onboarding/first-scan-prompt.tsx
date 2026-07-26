import { useRouter } from 'expo-router';
import { Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LineButton, SaffronButton } from '@/components/ui/buttons';
import { AmbientBackdrop, Rise } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';

export default function FirstScanPromptScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const t = useStrings(language);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <AmbientBackdrop image="linear-gradient(180deg, rgba(254,243,199,0.8) 0%, rgba(254,243,199,0) 45%)" />
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Rise index={0}>
          <Image
            source={require('../../../assets/images/bahi-hero.png')}
            style={{ width: 220, height: 140, borderRadius: 20 }}
            resizeMode="cover"
          />
        </Rise>
        <Rise index={1}>
          <Text className="text-center text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 28, letterSpacing: -0.6 }}>
            {t.firstScanTitle}
          </Text>
        </Rise>
        <Rise index={2}>
          <Text className="max-w-[30ch] text-center text-base text-muted" style={{ fontFamily: AppFonts.body }}>
            {t.firstScanBody}
          </Text>
        </Rise>
      </View>

      <View className="gap-2.5 px-6 pb-6">
        <SaffronButton label={t.scanNow} onPress={() => router.push('/scan?entry=onboarding')} />
        <LineButton
          label={t.skip}
          onPress={() => {
            completeOnboarding();
            router.replace('/home');
          }}
        />
      </View>
    </SafeAreaView>
  );
}
