/**
 * Full-screen passbook for one customer: balance, udhaar/jama totals, and the
 * complete entry timeline with running balances — the digital page of the bahi.
 *
 * Deleting: trash in the header removes the whole khata (confirmed first);
 * long-pressing an entry removes just that line. Removal re-runs the fold —
 * before/after are rebuilt for every remaining entry and the balance re-derived,
 * so the passbook stays arithmetically consistent (never hand-edited).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View as RNView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deriveBalance } from '@/agent/agent';
import type { Entry, Khata } from '@/agent/types';
import { AmbientBackdrop, PressScale, Rise } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { loadKhata, saveKhata } from '@/db/khata';
import { ScrollView, Text, View } from '@/tw';

/** Recompute the frozen before/after chain after an entry is removed. */
function rebuildChain(entries: Entry[]): void {
  let b = 0;
  for (const e of entries) {
    e.before = b;
    b = e.action === 'payment' ? b - e.amount : e.action === 'correction' ? e.amount : b + e.amount;
    e.after = b;
  }
}

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [khata, setKhata] = useState<Khata | null>(null);

  useEffect(() => {
    let alive = true;
    void loadKhata().then((k) => { if (alive) setKhata(k); });
    return () => { alive = false; };
  }, [id]);

  const customer = khata?.customers.find((c) => c.id === id) ?? null;

  function confirmDeleteCustomer() {
    if (!khata || !customer) return;
    Alert.alert('खाता हटाएँ?', `${customer.name} का पूरा खाता और सारी एंट्री हट जाएँगी।`, [
      { text: 'नहीं', style: 'cancel' },
      {
        text: 'हटाओ',
        style: 'destructive',
        onPress: () => {
          khata.customers = khata.customers.filter((c) => c.id !== customer.id);
          void saveKhata(khata).then(() => router.back());
        },
      },
    ]);
  }

  function confirmDeleteEntry(entryIndex: number) {
    if (!khata || !customer) return;
    const e = customer.entries[entryIndex];
    if (!e) return;
    Alert.alert('यह एंट्री हटाएँ?', `${e.label || (e.action === 'payment' ? 'जमा' : 'उधार')} — ₹${e.amount}`, [
      { text: 'नहीं', style: 'cancel' },
      {
        text: 'हटाओ',
        style: 'destructive',
        onPress: () => {
          customer.entries.splice(entryIndex, 1);
          rebuildChain(customer.entries);
          customer.balance = deriveBalance(customer.entries);
          void saveKhata(khata).then(() => setKhata({ ...khata }));
        },
      },
    ]);
  }

  if (!khata) {
    return (
      <SafeAreaView style={styles.fill}>
        <ActivityIndicator color={Porcelain.saffronDeep} />
      </SafeAreaView>
    );
  }
  if (!customer) {
    return (
      <SafeAreaView style={styles.fill}>
        <Text className="text-base text-muted">—</Text>
      </SafeAreaView>
    );
  }

  const events = customer.entries
    .map((e, entryIndex) => ({ e, entryIndex }))
    .reverse();
  const inCredit = customer.balance < 0;
  const totalUdhaar = customer.entries
    .filter((x) => x.action === 'new_udhaar' || x.action === 'opening')
    .reduce((s, x) => s + x.amount, 0);
  const totalPaid = customer.entries
    .filter((x) => x.action === 'payment')
    .reduce((s, x) => s + x.amount, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }} edges={['top']}>
      <AmbientBackdrop image="linear-gradient(200deg, rgba(255,237,213,0.75) 0%, rgba(255,237,213,0) 38%)" />

      <View className="flex-row items-center justify-between px-4 pb-1 pt-2">
        <PressScale onPress={() => router.back()} style={styles.ghostIcon}>
          <Text className="text-xl text-ink">←</Text>
        </PressScale>
        <PressScale onPress={confirmDeleteCustomer} style={styles.ghostIcon}>
          <Text style={{ fontSize: 15 }}>🗑️</Text>
        </PressScale>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-10">
        <Rise index={0}>
          <Text className="text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 34, letterSpacing: -1, lineHeight: 40 }}>
            {customer.name}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {customer.phone || customer.aliases[0] || ''}
          </Text>
        </Rise>

        <Rise index={1}>
          <Text
            className="mt-3"
            style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 44, letterSpacing: -1.2, color: inCredit ? Porcelain.leaf : Porcelain.rose }}>
            ₹{Math.abs(customer.balance).toLocaleString('en-IN')}
          </Text>
          <Text className="mb-4 mt-0.5 text-xs font-semibold uppercase tracking-widest text-muted">
            {inCredit ? 'जमा (शॉप को देना है)' : 'बाकी'}
          </Text>
        </Rise>

        <Rise index={2}>
          <View className="mb-5 flex-row gap-2">
            <RNView style={[styles.stat, { backgroundColor: Porcelain.roseMist }]}>
              <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: Porcelain.rose }}>
                कुल उधार
              </Text>
              <Text style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 20, color: Porcelain.rose }}>
                ₹{totalUdhaar.toLocaleString('en-IN')}
              </Text>
            </RNView>
            <RNView style={[styles.stat, { backgroundColor: Porcelain.leafMist }]}>
              <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: Porcelain.leaf }}>
                कुल जमा
              </Text>
              <Text style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 20, color: Porcelain.leaf }}>
                ₹{totalPaid.toLocaleString('en-IN')}
              </Text>
            </RNView>
          </View>
        </Rise>

        <View className="gap-2">
          {events.length === 0 ? (
            <View className="items-center rounded-2xl border border-dashed border-line px-4 py-8">
              <Text className="text-sm text-muted">—</Text>
            </View>
          ) : (
            events.map(({ e, entryIndex }, i) => {
              const pay = e.action === 'payment';
              const when = new Date(e.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              return (
                <Rise key={`${e.ts}-${entryIndex}`} index={3 + Math.min(i, 5)}>
                  <PressScale
                    scaleTo={0.985}
                    onLongPress={() => confirmDeleteEntry(entryIndex)}
                    style={styles.entryRow}>
                    <View className="min-w-0 flex-1 pr-3">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {e.label || (pay ? 'जमा' : e.action === 'correction' ? 'सुधार' : 'उधार')}
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted">{when}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 18, color: pay ? Porcelain.leaf : Porcelain.rose }}>
                        {pay ? '−' : '+'}₹{e.amount.toLocaleString('en-IN')}
                      </Text>
                      {/* Running balance, frozen at write time — the passbook feel. */}
                      <Text className="mt-0.5 text-xs text-muted">बाकी ₹{e.after.toLocaleString('en-IN')}</Text>
                    </View>
                  </PressScale>
                </Rise>
              );
            })
          )}
        </View>
        {events.length > 0 && (
          <Text className="mt-3 text-center text-xs text-muted">एंट्री हटाने के लिए देर तक दबाएँ</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Porcelain.paper,
  },
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
  stat: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
