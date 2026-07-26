import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppFonts, Porcelain } from '@/constants/theme';
import { useStrings } from '@/lib/i18n';
import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';
import { usePeopleStore } from '@/store/people-store';

export default function AliasMapScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const t = useStrings(language);
  const people = usePeopleStore((s) => s.people);
  const setAlias = usePeopleStore((s) => s.setAlias);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
        <Text className="text-xl font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
          {t.mapTitle}
        </Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="gap-3 pb-4">
        <Text className="mb-1 text-sm text-muted" style={{ fontFamily: AppFonts.body }}>
          {t.mapHint}
        </Text>
        {people.map((p) => (
          <View
            key={p.id}
            className="rounded-2xl border border-line bg-surface px-4 py-3"
            style={{ backgroundColor: Porcelain.white }}>
            <Text className="text-base font-bold text-ink" style={{ fontFamily: AppFonts.displaySemiBold }}>
              {p.name}
            </Text>
            <Text className="mb-2 text-xs text-muted">{p.phone || '—'}</Text>
            <TextInput
              value={drafts[p.id] ?? ''}
              onChangeText={(v) => setDrafts((d) => ({ ...d, [p.id]: v }))}
              placeholder={t.mapAliasPh}
              placeholderTextColor={Porcelain.muted}
              className="rounded-xl border border-line px-3 py-2.5 text-base text-ink"
              style={{ fontFamily: AppFonts.body, backgroundColor: Porcelain.paper2 }}
            />
          </View>
        ))}
      </ScrollView>

      <View className="gap-2.5 px-5 pb-6">
        <Pressable
          onPress={saveAndGo}
          className="rounded-2xl py-4"
          style={{ backgroundColor: Porcelain.saffronDeep }}>
          <Text className="text-center text-base font-bold text-white" style={{ fontFamily: AppFonts.displayBold }}>
            {t.mapDone}
          </Text>
        </Pressable>
        <Pressable onPress={skip} className="rounded-2xl py-3">
          <Text className="text-center text-sm font-bold text-muted" style={{ fontFamily: AppFonts.displaySemiBold }}>
            {t.mapSkip}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
