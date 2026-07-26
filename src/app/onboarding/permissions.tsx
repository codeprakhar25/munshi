import * as Contacts from 'expo-contacts/legacy';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InkButton, LineButton } from '@/components/ui/buttons';
import { AmbientBackdrop, Rise } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Text, View } from '@/tw';
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
      <AmbientBackdrop image="radial-gradient(circle at 50% 0%, #FEF3C7 0%, rgba(254,243,199,0) 60%)" />
      <View className="flex-1 justify-end px-6 pb-7">
        <Rise index={0}>
          <View style={styles.icon}>
            <Text style={{ fontSize: 24 }}>◎</Text>
          </View>
        </Rise>
        <Rise index={1}>
          <Text className="mb-2.5 text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 32, letterSpacing: -0.8, lineHeight: 36 }}>
            {t.contactsTitle}
          </Text>
        </Rise>
        <Rise index={2}>
          <Text className="mb-7 max-w-[28ch] text-base leading-6 text-muted" style={{ fontFamily: AppFonts.body }}>
            {t.contactsBody}
          </Text>
        </Rise>
        <Rise index={3} style={{ gap: 8 }}>
          <InkButton label={t.chooseContacts} onPress={allow} />
          <LineButton label={t.useDemo} onPress={skip} />
        </Rise>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Porcelain.white,
    borderWidth: 1,
    borderColor: Porcelain.line,
    marginBottom: 22,
    shadowColor: '#1c1917',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
});
