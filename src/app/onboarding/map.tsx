import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuietButton, SaffronButton } from '@/components/ui/buttons';
import { Rise } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { ScrollView, Text, TextInput, View } from '@/tw';
import { DEMO_PEOPLE, usePeopleStore } from '@/store/people-store';
import { useOnboardingStore } from '@/store/onboarding-store';

export default function AliasMapScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const t = useStrings(language);
  const people = usePeopleStore((s) => s.people);
  const setPeople = usePeopleStore((s) => s.setPeople);
  const setAlias = usePeopleStore((s) => s.setAlias);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Purge old "import entire address book" sessions that freeze this screen.
  useEffect(() => {
    if (people.length > 40) {
      setPeople(
        DEMO_PEOPLE.map((p, i) => ({
          ...p,
          id: `demo_${i + 1}`,
        })),
      );
    } else if (people.length === 0) {
      setPeople(
        DEMO_PEOPLE.map((p, i) => ({
          ...p,
          id: `demo_${i + 1}`,
        })),
      );
    }
  }, [people.length, setPeople]);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of people) {
        if (next[p.id] == null) next[p.id] = p.aliases[0] || p.name.split(' ')[0];
      }
      return next;
    });
  }, [people]);

  function saveAndGo() {
    for (const p of people) {
      setAlias(p.id, drafts[p.id] ?? p.aliases[0] ?? '');
    }
    router.push('/onboarding/first-scan-prompt');
  }

  function skip() {
    for (const p of people) {
      const alias = p.aliases[0] || p.name.split(' ')[0];
      setAlias(p.id, alias);
    }
    router.push('/onboarding/first-scan-prompt');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
        <Text className="text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 24, letterSpacing: -0.5 }}>
          {t.mapTitle}
        </Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="gap-3 pb-4">
        <Text className="mb-1 text-sm text-muted" style={{ fontFamily: AppFonts.body }}>
          {t.mapHint}
        </Text>
        {people.map((p, i) => (
          <Rise key={p.id} index={Math.min(i, 5)}>
            <View
              className="rounded-2xl border border-line bg-surface px-4 py-3"
              style={{ backgroundColor: Porcelain.white }}>
              <Text className="mb-2 text-base font-bold text-ink" style={{ fontFamily: AppFonts.displaySemiBold }}>
                {p.name}
              </Text>
              <TextInput
                value={drafts[p.id] ?? ''}
                onChangeText={(v) => setDrafts((d) => ({ ...d, [p.id]: v }))}
                placeholder={t.mapAliasPh}
                placeholderTextColor={Porcelain.muted}
                className="border-b border-line px-0 py-2 text-lg text-ink"
                style={{ fontFamily: AppFonts.serifMedium, backgroundColor: 'transparent' }}
              />
            </View>
          </Rise>
        ))}
      </ScrollView>

      <View className="gap-1.5 px-5 pb-6">
        <SaffronButton label={t.mapDone} onPress={saveAndGo} />
        <QuietButton label={t.mapSkip} onPress={skip} />
      </View>
    </SafeAreaView>
  );
}
