import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable as RNPressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Customer, Khata } from '@/agent/types';
import { PersonSheet } from '@/components/home/PersonSheet';
import { VoiceOverlay } from '@/components/voice/VoiceOverlay';
import { AppFonts, Porcelain } from '@/constants/theme';
import { loadKhata, totalDue } from '@/db/khata';
import { persistPeopleIntoKhata } from '@/lib/khata-sync';
import { useStrings } from '@/lib/i18n';
import { Pressable, ScrollView, Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';
import { usePeopleStore } from '@/store/people-store';
import { VoiceSession, type VoiceView } from '@/voice/session';

export default function HomeScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const t = useStrings(language);
  const [khata, setKhata] = useState<Khata | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [person, setPerson] = useState<Customer | null>(null);
  const [view, setView] = useState<VoiceView>({
    state: 'idle', heard: '', reply: '', stage: 'idle', drafts: [], error: null,
  });

  const voice = useRef<VoiceSession | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let k = await loadKhata();
      k = await persistPeopleIntoKhata(k, usePeopleStore.getState().people);
      if (!alive) return;
      setKhata(k);
      voice.current = new VoiceSession(k, {
        onView: (patch) => setView((v) => ({ ...v, ...patch })),
        onKhata: (next) => setKhata({ ...next }),
      });
    })();
    return () => {
      alive = false;
      void voice.current?.dispose();
    };
  }, []);

  // Keep voice session khata in sync when people change externally
  useEffect(() => {
    if (!khata || !voice.current) return;
    voice.current.setKhata(khata);
  }, [khata]);

  const openVoice = useCallback(async () => {
    setVoiceOpen(true);
    const greet =
      language === 'en'
        ? 'Namaste. Say a name and amount — like Rajesh doodh 50.'
        : 'नमस्ते। नाम और रकम बोलो — जैसे राजेश दूध पचास।';
    await voice.current?.startConversation(greet);
  }, [language]);

  const closeVoice = useCallback(async () => {
    await voice.current?.stopConversation();
    setVoiceOpen(false);
    setView((v) => ({ ...v, state: 'idle', heard: '', drafts: v.drafts }));
  }, []);

  if (!khata) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Porcelain.paper }}>
        <ActivityIndicator color={Porcelain.saffronDeep} />
      </SafeAreaView>
    );
  }

  const owing = khata.customers
    .filter((c) => c.balance > 0)
    .slice()
    .sort((a, b) => b.balance - a.balance);
  const due = totalDue(khata);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }} edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Text className="text-2xl font-bold text-ink" style={{ fontFamily: AppFonts.displayExtraBold, letterSpacing: -0.5 }}>
          Munshi
        </Text>
        <View className="flex-row gap-1.5">
          <Pressable
            onPress={() => router.push('/onboarding/map')}
            className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface">
            <Text style={{ color: Porcelain.muted }}>✎</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/onboarding')}
            className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface">
            <Text style={{ fontFamily: AppFonts.displayBold, color: Porcelain.ink }}>अ</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-32">
        <View className="mb-4 overflow-hidden rounded-3xl" style={{ height: 140, backgroundColor: Porcelain.paper2 }}>
          <Image
            source={require('../../assets/images/bahi-hero.png')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 14,
            }}>
            <Text
              className="text-xs font-bold uppercase tracking-widest text-white"
              style={{ opacity: 0.85, fontFamily: AppFonts.displayBold }}>
              {t.homeKicker}
            </Text>
            <Text className="text-2xl font-bold text-white" style={{ fontFamily: AppFonts.displayBold }}>
              {t.homeHero}
            </Text>
          </View>
        </View>

        <View className="mb-4 flex-row items-end justify-between">
          <View>
            <Text className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">
              {t.pendingTotal}
            </Text>
            <Text className="text-4xl font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
              <Text style={{ fontSize: 22 }}>₹</Text>
              {due.toLocaleString('en-IN')}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/scan?entry=general')}
            className="rounded-full border border-line bg-surface px-4 py-2.5">
            <Text className="text-sm font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
              {t.scanPill}
            </Text>
          </Pressable>
        </View>

        <View className="mb-2.5 flex-row items-baseline justify-between">
          <Text className="text-lg font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
            {t.pendingList}
          </Text>
          <Text className="text-xs font-semibold text-muted">{t.entriesN(owing.length)}</Text>
        </View>

        {owing.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-line px-4 py-8">
            <Text className="text-center text-sm text-muted">{t.pendingEmpty}</Text>
          </View>
        ) : (
          <View className="gap-2">
            {owing.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setPerson(c)}
                className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3.5">
                <View
                  className="h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: Porcelain.paper2 }}>
                  <Text style={{ fontFamily: AppFonts.displayBold, color: Porcelain.saffronDeep, fontSize: 18 }}>
                    {(c.name || '?').charAt(0)}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-bold text-ink" numberOfLines={1} style={{ fontFamily: AppFonts.displaySemiBold }}>
                    {c.name}
                  </Text>
                  <Text className="text-xs text-muted" numberOfLines={1}>
                    {c.phone || c.aliases[0] || '—'} · {t.entriesN(c.entries.length)}
                  </Text>
                </View>
                <Text style={{ fontFamily: AppFonts.displayBold, fontSize: 18, color: Porcelain.rose }}>
                  ₹{c.balance.toLocaleString('en-IN')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Text
        className="absolute bottom-28 self-center text-xs font-bold uppercase tracking-widest text-muted"
        style={{ fontFamily: AppFonts.displayBold }}>
        {t.talkMunshi}
      </Text>
      <RNPressable
        onPress={openVoice}
        style={{
          position: 'absolute',
          alignSelf: 'center',
          bottom: 28,
          width: 74,
          height: 74,
          borderRadius: 37,
          overflow: 'hidden',
          backgroundColor: Porcelain.ink,
          elevation: 10,
          shadowColor: '#1c1917',
          shadowOpacity: 0.28,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 10 },
        }}>
        <Image source={require('../../assets/images/munshi-face.png')} style={{ width: '100%', height: '100%' }} />
      </RNPressable>

      <VoiceOverlay
        open={voiceOpen}
        view={view}
        onClose={closeVoice}
        onBargeIn={() => void voice.current?.bargeIn()}
      />
      <PersonSheet customer={person} onClose={() => setPerson(null)} />
    </SafeAreaView>
  );
}
