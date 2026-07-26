import { Modal, Pressable as RNPressable, ScrollView as RNScroll, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Customer } from '@/agent/types';
import { fadeUp } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { Text, View } from '@/tw';

interface Props {
  customer: Customer | null;
  onClose: () => void;
}

export function PersonSheet({ customer, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!customer) return null;

  const events = [...customer.entries].reverse();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <RNPressable style={styles.scrim} onPress={onClose}>
        <RNPressable
          style={[styles.panel, { paddingBottom: 16 + insets.bottom }]}
          onPress={(e) => e.stopPropagation()}>
          <View className="mb-2 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-ink" style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 26, letterSpacing: -0.5 }}>
                {customer.name}
              </Text>
              <Text className="mt-1 text-sm text-muted">{customer.phone || customer.aliases[0] || ''}</Text>
            </View>
            <RNPressable onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 18, color: Porcelain.muted }}>✕</Text>
            </RNPressable>
          </View>

          <Text
            className="mb-3"
            style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 32, letterSpacing: -0.8, color: customer.balance > 0 ? Porcelain.rose : Porcelain.leaf }}>
            ₹{Math.max(0, customer.balance).toLocaleString('en-IN')}
          </Text>

          <RNScroll style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
            {events.length === 0 ? (
              <Text className="py-6 text-center text-sm text-muted">—</Text>
            ) : (
              events.map((e, i) => {
                const pay = e.action === 'payment';
                const when = new Date(e.ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                return (
                  <Animated.View key={`${e.ts}-${i}`} entering={fadeUp(Math.min(i, 6), 0)}>
                    <View
                      className="flex-row items-center justify-between rounded-2xl border border-line px-3.5 py-3"
                      style={{ backgroundColor: Porcelain.white }}>
                      <View>
                        <Text className="text-sm font-semibold text-ink">{e.label || (pay ? 'जमा' : 'उधार')}</Text>
                        <Text className="mt-0.5 text-xs text-muted">{when}</Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: AppFonts.serifSemiBold,
                          fontSize: 17,
                          color: pay ? Porcelain.leaf : Porcelain.rose,
                        }}>
                        {pay ? '−' : '+'}₹{e.amount}
                      </Text>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </RNScroll>
        </RNPressable>
      </RNPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.28)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: Porcelain.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    maxHeight: '78%',
  },
});
