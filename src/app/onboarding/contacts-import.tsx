import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Pressable, Text, View } from '@/tw';
import { useDeviceContactsStore } from '@/store/device-contacts-store';
import { DEMO_PEOPLE, type Person, usePeopleStore } from '@/store/people-store';
import { useOnboardingStore } from '@/store/onboarding-store';

export default function ContactsImportScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const permissions = useOnboardingStore((s) => s.permissions);
  const t = useStrings(language);
  const importFromDevice = useDeviceContactsStore((s) => s.importFromDevice);
  const alreadyImported = useDeviceContactsStore((s) => s.imported);
  const setPeople = usePeopleStore((s) => s.setPeople);

  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (permissions.contacts === 'granted') {
        const n = alreadyImported
          ? useDeviceContactsStore.getState().contacts.length
          : await importFromDevice();
        if (!alive) return;
        const contacts = useDeviceContactsStore.getState().contacts;
        if (contacts.length) {
          setPeople(
            contacts.map((c) => ({
              id: `p_${c.id}`,
              name: c.name,
              aliases: [c.name.split(' ')[0]],
              phone: c.phone,
              source: 'contact' as const,
              contactId: c.id,
            }))
          );
          setCount(n);
        } else {
          seedDemo(setPeople);
          setCount(DEMO_PEOPLE.length);
        }
        return;
      }
      seedDemo(setPeople);
      if (alive) setCount(DEMO_PEOPLE.length);
    })();
    return () => { alive = false; };
  }, [alreadyImported, permissions.contacts, importFromDevice, setPeople]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-center text-2xl font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
          {t.contactsImportTitle}
        </Text>
        {count === null ? (
          <ActivityIndicator size="large" color={Porcelain.saffronDeep} />
        ) : (
          <Text className="text-center text-base text-muted" style={{ fontFamily: AppFonts.body }}>
            {count > 0 ? t.contactsImportBody(count) : t.contactsImportEmpty}
          </Text>
        )}
      </View>

      <View className="px-6 pb-6">
        <Pressable
          disabled={count === null}
          onPress={() => router.push('/onboarding/map')}
          className="rounded-2xl py-4"
          style={{ backgroundColor: count === null ? Porcelain.line : Porcelain.saffronDeep }}>
          <Text
            className="text-center text-base font-bold"
            style={{
              fontFamily: AppFonts.displayBold,
              color: count === null ? Porcelain.muted : '#fff',
            }}>
            {t.continueLabel}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function seedDemo(setPeople: (people: Person[]) => void) {
  setPeople(
    DEMO_PEOPLE.map((p, i) => ({
      ...p,
      id: `demo_${i + 1}`,
    }))
  );
}
