import { useRouter } from 'expo-router';
import { Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageGrid } from '@/components/onboarding/language-grid';
import { SaffronButton } from '@/components/ui/buttons';
import { AmbientBackdrop, Rise } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';

export default function OnboardingSplash() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const setLanguage = useOnboardingStore((s) => s.setLanguage);
  const t = useStrings(language);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <AmbientBackdrop image="radial-gradient(circle at 50% -10%, #ffffff 0%, rgba(255,255,255,0) 55%)" />
      <View className="flex-1 justify-between px-6 pb-6 pt-8">
        <View className="flex-1 items-center justify-center gap-2.5">
          <Rise index={0}>
            <View style={styles.art}>
              <Image
                source={require('../../../assets/images/bahi-hero.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
          </Rise>
          <Rise index={1}>
            <Text
              className="text-center text-xs font-bold uppercase tracking-widest"
              style={{ fontFamily: AppFonts.displayBold, color: Porcelain.saffronDeep }}>
              {t.splashEyebrow}
            </Text>
          </Rise>
          <Rise index={2}>
            <Text
              className="text-center text-ink"
              style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 52, letterSpacing: -2, lineHeight: 54 }}>
              Munshi
            </Text>
          </Rise>
          <Rise index={3}>
            <Text className="max-w-[24ch] text-center text-base leading-6 text-muted" style={{ fontFamily: AppFonts.body }}>
              {t.splashSub}
            </Text>
          </Rise>
          <Rise index={4} style={{ alignSelf: 'stretch' }}>
            <LanguageGrid value={language} onChange={setLanguage} />
          </Rise>
        </View>

        <Rise index={5}>
          <SaffronButton label={t.start} onPress={() => router.push('/onboarding/notifications')} />
        </Rise>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  art: {
    width: 240,
    height: 240,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: Porcelain.paper2,
    marginBottom: 8,
    shadowColor: '#1c1917',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
});
