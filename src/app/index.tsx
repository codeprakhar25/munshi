/**
 * The entire app, for now.
 *
 * Deliberately ugly — plain list, plain buttons, no avatar, no cards, no
 * animation. This exists to prove the machinery: that a draft stages without
 * writing, that ambiguity asks, that a voice amend lands on the pending line,
 * and that हाँ commits. The design overhaul comes after (ARCHITECTURE.md §8).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Customer, Khata } from '@/agent/types';
import { loadKhata, resetKhata, totalDue } from '@/db/khata';
// metro.config.js sets globalClassNamePolyfill:false, so `className` only works
// on these wrappers — raw react-native components silently ignore it.
import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';
import { VoiceSession, type VoiceView } from '@/voice/session';

const STATE_LABEL: Record<VoiceView['state'], string> = {
  idle: 'ready',
  listening: 'listening…',
  thinking: 'thinking…',
  speaking: 'speaking…',
};

export default function Home() {
  const [khata, setKhata] = useState<Khata | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [view, setView] = useState<VoiceView>({
    state: 'idle', heard: '', reply: '', stage: 'idle', drafts: [], error: null,
  });

  const voice = useRef<VoiceSession | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const k = await loadKhata();
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

  const send = useCallback(async () => {
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    await voice.current?.say(text);
  }, [typed]);

  const wipe = useCallback(async () => {
    const k = await resetKhata();
    setKhata(k);
    voice.current?.setKhata(k);
    voice.current?.resetConversation();
  }, []);

  if (!khata) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const busy = view.state === 'thinking' || view.state === 'speaking';

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-6">
        <View className="flex-row items-center justify-between py-3">
          <Text className="text-xl font-bold">{khata.shop}</Text>
          <Pressable onPress={wipe} className="rounded bg-neutral-200 px-3 py-1.5">
            <Text className="text-xs font-semibold">reset</Text>
          </Pressable>
        </View>

        <Text className="pb-3 text-sm text-neutral-500">
          कुल उधार ₹{totalDue(khata).toLocaleString('en-IN')} · {khata.customers.length} खाते
        </Text>

        {/* ---- voice state ---- */}
        <View className="mb-3 rounded border border-neutral-300 p-3">
          <Text className="mb-1 text-xs uppercase text-neutral-500">
            {STATE_LABEL[view.state]} · stage: {view.stage}
          </Text>
          {!!view.heard && <Text className="mb-1 text-base">heard: {view.heard}</Text>}
          {!!view.reply && <Text className="mb-1 text-base font-semibold">munshi: {view.reply}</Text>}
          {!!view.error && <Text className="text-sm text-red-600">{view.error}</Text>}
        </View>

        {/* ---- pending drafts: nothing here is saved yet ---- */}
        {view.drafts.length > 0 && (
          <View className="mb-3 rounded border-2 border-amber-500 bg-amber-50 p-3">
            <Text className="mb-2 text-xs font-bold uppercase text-amber-700">
              pending — not saved
            </Text>
            {view.drafts.map((d) => (
              <View key={d.id} className="mb-1.5">
                <Text className="text-base">
                  {d.person?.name ?? d.name_spoken ?? '?'} · {d.kind} · ₹{d.amount ?? '?'}
                </Text>
                <Text className="text-xs text-neutral-600">
                  {d.status === 'ready'
                    ? `₹${d.before} → ₹${d.after}`
                    : d.status}
                  {d.options.length > 0 && `  →  ${d.options.map((o) => o.name_en).join(' | ')}`}
                </Text>
              </View>
            ))}
            <Text className="mt-1 text-xs text-neutral-600">
              say हाँ to save · नहीं to cancel · or correct it out loud
            </Text>
          </View>
        )}

        {/* ---- the ledger ---- */}
        {khata.customers.map((c) => (
          <PersonRow
            key={c.id}
            c={c}
            open={open === c.id}
            onPress={() => setOpen(open === c.id ? null : c.id)}
          />
        ))}
      </ScrollView>

      {/* ---- hold to talk, plus a typed path for loud rooms ---- */}
      <View className="border-t border-neutral-200 px-4 pb-2 pt-2">
        <View className="mb-2 flex-row gap-2">
          <TextInput
            className="flex-1 rounded border border-neutral-300 px-3 py-2"
            placeholder="or type: कविता को साबुन चालीस का"
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={send}
            editable={!busy}
          />
          <Pressable onPress={send} disabled={busy} className="rounded bg-neutral-800 px-4 py-2">
            <Text className="font-semibold text-white">send</Text>
          </Pressable>
        </View>

        <Pressable
          onPressIn={() => void voice.current?.press()}
          onPressOut={() => void voice.current?.release()}
          disabled={busy}
          className={`items-center rounded-full py-4 ${
            view.state === 'listening' ? 'bg-green-600' : busy ? 'bg-neutral-400' : 'bg-teal-700'
          }`}
        >
          <Text className="text-base font-bold text-white">
            {view.state === 'listening' ? 'सुन रहा हूँ — छोड़ें' : 'दबाकर बोलें'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PersonRow({ c, open, onPress }: { c: Customer; open: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="border-b border-neutral-200 py-2.5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-base">{c.name}</Text>
          <Text className="text-xs text-neutral-500">{c.name_en}{c.phone ? ` · ${c.phone}` : ''}</Text>
        </View>
        <Text className={`text-base font-bold ${c.balance > 0 ? 'text-red-600' : 'text-green-700'}`}>
          {c.balance > 0 ? `₹${c.balance.toLocaleString('en-IN')}` : '✓'}
        </Text>
      </View>

      {open && (
        <View className="mt-2 rounded bg-neutral-50 p-2">
          {c.entries.length === 0 && <Text className="text-xs text-neutral-500">no entries</Text>}
          {c.entries.map((e, i) => (
            <View key={`${e.ts}-${i}`} className="flex-row justify-between py-0.5">
              <Text className="text-xs text-neutral-600">
                {e.action}{e.label ? ` · ${e.label}` : ''}
              </Text>
              <Text className="text-xs">
                {e.action === 'payment' ? '−' : '+'}₹{e.amount} → ₹{e.after}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}
