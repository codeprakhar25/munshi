/**
 * Full-screen passbook for one customer: balance, udhaar/jama totals, and the
 * complete entry timeline with running balances — the digital page of the bahi.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View as RNView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Customer } from '@/agent/types';
import { AmbientBackdrop, PressScale, Rise } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { loadKhata } from '@/db/khata';
import { ScrollView, Text, View } from '@/tw';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null | 'missing'>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const khata = await loadKhata();
      if (!alive) return;
      setCustomer(khata.customers.find((c) => c.id === id) ?? 'missing');
    })();
    return () => { alive = false; };
  }, [id]);

  if (customer === null) {
    return (
      <SafeAreaView style={styles.fill}>
        <ActivityIndicator color={Porcelain.saffronDeep} />
      </SafeAreaView>
    );
  }
  if (customer === 'missing') {
    return (
      <SafeAreaView style={styles.fill}>
        <Text className="text-base text-muted">—</Text>
      </SafeAreaView>
    );
  }

  const events = [...customer.entries].reverse();
  const inCredit = customer.balance < 0;
  const totalUdhaar = customer.entries
    .filter((e) => e.action === 'new_udhaar' || e.action === 'opening')
    .reduce((s, e) => s + e.amount, 0);
  const totalPaid = customer.entries
    .filter((e) => e.action === 'payment')
    .reduce((s, e) => s + e.amount, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }} edges={['top']}>
      <AmbientBackdrop image="linear-gradient(200deg, rgba(255,237,213,0.75) 0%, rgba(255,237,213,0) 38%)" />

      <View className="flex-row items-center justify-between px-4 pb-1 pt-2">
        <PressScale onPress={() => router.back()} style={styles.ghostIcon}>
          <Text className="text-xl text-ink">←</Text>
        </PressScale>
        <View style={{ width: 40 }} />
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
            events.map((e, i) => {
              const pay = e.action === 'payment';
              const when = new Date(e.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              return (
                <Rise key={`${e.ts}-${i}`} index={3 + Math.min(i, 5)}>
                  <View className="flex-row items-center justify-between rounded-2xl border border-line px-4 py-3.5" style={{ backgroundColor: Porcelain.white }}>
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
                  </View>
                </Rise>
              );
            })
          )}
        </View>
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
});
