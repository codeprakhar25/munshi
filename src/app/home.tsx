import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View as RNView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Khata } from '@/agent/types';
import { AmbientBackdrop, Gradient, PressScale, Rise, useBreath, useCountUp } from '@/components/ui/motion';
import { VoiceOverlay } from '@/components/voice/VoiceOverlay';
import { AppFonts, Porcelain } from '@/constants/theme';
import { loadKhata, resetKhata, totalDue } from '@/db/khata';
import { persistPeopleIntoKhata } from '@/lib/khata-sync';
import { useStrings } from '@/lib/i18n';
import { Pressable, ScrollView, Text, View } from '@/tw';
import { useOnboardingStore } from '@/store/onboarding-store';
import { usePeopleStore } from '@/store/people-store';
import { VoiceSession, type VoiceView } from '@/voice/session';

import Animated from 'react-native-reanimated';

export default function HomeScreen() {
  const router = useRouter();
  const language = useOnboardingStore((s) => s.language);
  const t = useStrings(language);
  const [khata, setKhata] = useState<Khata | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
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
    // Just "ji boliye". A long scripted opener is dead air on every single
    // activation, and reciting an example in English sets the merchant up to
    // reply in English when the whole point is that they speak however they like.
    await voice.current?.startConversation('जी बोलिए');
  }, []);

  const closeVoice = useCallback(async () => {
    // Dismiss the UI first — audio teardown must never hold the overlay open.
    setVoiceOpen(false);
    setView({ state: 'idle', heard: '', reply: '', stage: 'idle', drafts: [], error: null });
    await voice.current?.stopConversation();
    // Reset the conversation so the next tap starts a fresh session — pending
    // (unconfirmed) drafts die with the overlay, exactly like the mock.
    voice.current?.resetConversation();
  }, []);

  const due = khata ? totalDue(khata) : 0;
  const dueShown = useCountUp(due);
  const fabHalo = useBreath({ peak: 1.1, lo: 0.35, hi: 0.8, ms: 2400 });

  if (!khata) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Porcelain.paper }}>
        <ActivityIndicator color={Porcelain.saffronDeep} />
      </SafeAreaView>
    );
  }

  // Most recently touched first: after speaking an entry the merchant looks at
  // the top of the list to check it, and a balance-ordered list buries it.
  const lastTouched = (c: (typeof khata.customers)[number]) =>
    c.entries.length ? c.entries[c.entries.length - 1].ts : '';
  const owing = khata.customers
    .filter((c) => c.balance !== 0)
    .slice()
    .sort((a, b) => {
      const t = lastTouched(b).localeCompare(lastTouched(a));
      return t !== 0 ? t : b.balance - a.balance;
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }} edges={['top']}>
      {/* The mock's #screen-shell ambience: warm saffron top-right, cool indigo bottom-left. */}
      <AmbientBackdrop image="radial-gradient(circle at 85% 0%, #ffedd5 0%, rgba(255,237,213,0) 55%)" />
      <AmbientBackdrop image="radial-gradient(circle at 0% 100%, #e0e7ff 0%, rgba(224,231,255,0) 45%)" />

      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        {/* Long-press: restore the seed ledger — the between-demos reset. */}
        <Pressable
          onLongPress={() => {
            void resetKhata().then((k) => {
              setKhata(k);
              voice.current?.setKhata(k);
              voice.current?.resetConversation();
            });
          }}>
          <Text className="text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 26, letterSpacing: -0.8 }}>
            Munshi
          </Text>
        </Pressable>
        <View className="flex-row gap-1.5">
          <PressScale
            onPress={() => router.push('/onboarding/map')}
            style={styles.ghostIcon}>
            <Text style={{ color: Porcelain.muted }}>✎</Text>
          </PressScale>
          <PressScale
            onPress={() => router.push('/onboarding')}
            style={styles.ghostIcon}>
            <Text style={{ fontFamily: AppFonts.displayBold, color: Porcelain.ink }}>अ</Text>
          </PressScale>
        </View>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-32">
        <Rise index={0}>
          <View className="mb-4 overflow-hidden rounded-3xl" style={{ height: 168, backgroundColor: Porcelain.paper2, ...styles.heroShadow }}>
            <Image
              source={require('../../assets/images/bahi-hero.png')}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            {/* Legibility scrim — the mock's ::after ink gradient. */}
            <Gradient
              pointerEvents="none"
              image="linear-gradient(180deg, rgba(28,25,23,0) 25%, rgba(28,25,23,0.55) 100%)"
              style={StyleSheet.absoluteFill}
            />
            <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
              <Text
                className="text-xs font-bold uppercase tracking-widest text-white"
                style={{ opacity: 0.85, fontFamily: AppFonts.displayBold }}>
                {t.homeKicker}
              </Text>
              <Text className="text-white" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 24, letterSpacing: -0.5 }}>
                {t.homeHero}
              </Text>
            </View>
          </View>
        </Rise>

        <Rise index={1}>
          <View className="mb-4 flex-row items-end justify-between">
            <View>
              <Text className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">
                {t.pendingTotal}
              </Text>
              <Text className="text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 40, letterSpacing: -1, lineHeight: 44 }}>
                <Text style={{ fontFamily: AppFonts.serifMedium, fontSize: 22, color: Porcelain.muted }}>₹</Text>
                {dueShown.toLocaleString('en-IN')}
              </Text>
            </View>
            <PressScale
              onPress={() => router.push('/scan?entry=general')}
              style={styles.scanPill}>
              <Text className="text-sm font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
                {t.scanPill}
              </Text>
            </PressScale>
          </View>
        </Rise>

        <Rise index={2}>
          <View className="mb-2.5 flex-row items-baseline justify-between">
            <Text className="text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 20, letterSpacing: -0.3 }}>
              {t.pendingList}
            </Text>
            <Text className="text-xs font-semibold text-muted">{t.entriesN(owing.length)}</Text>
          </View>
        </Rise>

        {owing.length === 0 ? (
          <Rise index={3}>
            <View className="items-center rounded-2xl border border-dashed border-line px-4 py-8" style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}>
              <Text className="text-center text-sm text-muted">{t.pendingEmpty}</Text>
            </View>
          </Rise>
        ) : (
          <View className="gap-2">
            {owing.map((c, i) => (
              <Rise key={c.id} index={3 + Math.min(i, 4)}>
                <PressScale scaleTo={0.985} onPress={() => router.push(`/person/${c.id}`)} style={styles.row}>
                  <View
                    className="h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: Porcelain.paper2 }}>
                    <Text style={{ fontFamily: AppFonts.serifSemiBold, color: Porcelain.saffronDeep, fontSize: 19 }}>
                      {(c.name || '?').charAt(0)}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-bold text-ink" numberOfLines={1} style={{ fontFamily: AppFonts.displaySemiBold }}>
                      {c.name}
                    </Text>
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {c.entries[c.entries.length - 1]?.label || c.phone || c.aliases[0] || '—'} · {t.entriesN(c.entries.length)}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 19, color: Porcelain.rose }}>
                    ₹{c.balance.toLocaleString('en-IN')}
                  </Text>
                </PressScale>
              </Rise>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB leaves the bottom while the overlay is up — the flying orb IS the face. */}
      {!voiceOpen && (
        <>
          {/* Munshi FAB — breathing saffron halo behind, warm gradient wash over the face. */}
          <RNView pointerEvents="box-none" style={styles.fabWrap}>
            <Animated.View pointerEvents="none" style={[styles.fabHalo, fabHalo]}>
              <Gradient
                image="radial-gradient(circle at 50% 50%, rgba(245,158,11,0.4) 0%, rgba(245,158,11,0) 70%)"
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <PressScale scaleTo={0.94} onPress={openVoice} style={styles.fab}>
              <Image source={require('../../assets/images/munshi-face.png')} style={{ width: '100%', height: '100%' }} />
              <Gradient
                pointerEvents="none"
                image="linear-gradient(180deg, rgba(217,119,6,0) 45%, rgba(217,119,6,0.35) 100%)"
                style={StyleSheet.absoluteFill}
              />
            </PressScale>
          </RNView>
        </>
      )}

      <VoiceOverlay
        open={voiceOpen}
        view={view}
        onClose={closeVoice}
        onBargeIn={() => void voice.current?.bargeIn()}
        fabCenterFromBottom={28 + 37}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ghostIcon: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.white,
  },
  heroShadow: {
    shadowColor: '#1c1917',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  scanPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.white,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fabWrap: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabHalo: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    overflow: 'hidden',
  },
  fab: {
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
  },
});
