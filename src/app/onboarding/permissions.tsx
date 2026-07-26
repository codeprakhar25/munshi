import * as Contacts from 'expo-contacts/legacy';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Pressable, Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';

export default function ContactsPermissionScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const setPermission = useOnboardingStore((s) => s.setPermission);
  const t = useStrings(language);

  async function allow() {
    const { status } = await Contacts.requestPermissionsAsync();
    setPermission('contacts', status === 'granted' ? 'granted' : 'denied');
    router.push('/onboarding/contacts-import');
  }

  function skip() {
    setPermission('contacts', 'denied');
    router.push('/onboarding/contacts-import');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <View className="flex-1 justify-between px-6 pb-6 pt-10">
        <View className="gap-3">
          <Text className="text-3xl font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
            {t.contactsTitle}
          </Text>
          <Text className="text-base leading-6 text-muted" style={{ fontFamily: AppFonts.body }}>
            {t.contactsBody}
          </Text>
        </View>

        <View className="gap-2.5">
          <Pressable
            onPress={allow}
            className="rounded-2xl py-4"
            style={{ backgroundColor: Porcelain.saffronDeep }}>
            <Text className="text-center text-base font-bold text-white" style={{ fontFamily: AppFonts.displayBold }}>
              {t.chooseContacts}
            </Text>
          </Pressable>
          <Pressable onPress={skip} className="rounded-2xl border border-line bg-surface py-4">
            <Text className="text-center text-base font-bold text-ink" style={{ fontFamily: AppFonts.displaySemiBold }}>
              {t.useDemo}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
