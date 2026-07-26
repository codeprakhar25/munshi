import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Pressable, Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';

export default function NotificationsScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const setPermission = useOnboardingStore((s) => s.setPermission);
  const t = useStrings(language);

  async function allow() {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermission('notifications', status === 'granted' ? 'granted' : 'denied');
    } catch {
      setPermission('notifications', 'denied');
    }
    router.push('/onboarding/permissions');
  }

  function skip() {
    setPermission('notifications', 'denied');
    router.push('/onboarding/permissions');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <View className="flex-1 justify-between px-6 pb-6 pt-10">
        <View className="gap-3">
          <Text
            className="text-3xl font-bold text-ink"
            style={{ fontFamily: AppFonts.displayBold }}>
            {t.notifTitle}
          </Text>
          <Text className="text-base leading-6 text-muted" style={{ fontFamily: AppFonts.body }}>
            {t.notifBody}
          </Text>
        </View>

        <View className="gap-2.5">
          <Pressable
            onPress={allow}
            className="rounded-2xl py-4"
            style={{ backgroundColor: Porcelain.saffronDeep }}>
            <Text className="text-center text-base font-bold text-white" style={{ fontFamily: AppFonts.displayBold }}>
              {t.allow}
            </Text>
          </Pressable>
          <Pressable onPress={skip} className="rounded-2xl border border-line bg-surface py-4">
            <Text className="text-center text-base font-bold text-ink" style={{ fontFamily: AppFonts.displaySemiBold }}>
              {t.notNow}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
