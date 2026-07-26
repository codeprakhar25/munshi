import { Image, Modal, Pressable as RNPressable, StyleSheet, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Draft } from '@/agent/types';
import { AppFonts, Porcelain } from '@/constants/theme';
import { Text, View } from '@/tw';
import type { VoiceState, VoiceView } from '@/voice/session';

interface Props {
  open: boolean;
  view: VoiceView;
  onClose: () => void;
  onBargeIn: () => void;
}

function WaveRings({ mood }: { mood: VoiceState }) {
  const active = mood === 'listening' || mood === 'speaking';
  const color = mood === 'listening' ? 'rgba(21,128,61,0.35)' : 'rgba(245,158,11,0.45)';
  return (
    <RNView style={StyleSheet.absoluteFill} pointerEvents="none">
      {[0, 1, 2, 3, 4].map((i) => {
        const pad = Math.max(0, 14 - i * 12);
        return (
          <RNView
            key={i}
            style={[
              styles.ring,
              {
                top: pad,
                left: pad,
                right: pad,
                bottom: pad,
                borderColor: active ? color : 'rgba(28,25,23,0.08)',
                opacity: active ? 0.55 - i * 0.08 : i === 1 || i === 2 ? 0.2 : 0,
              },
            ]}
          />
        );
      })}
    </RNView>
  );
}

function DraftChip({ d }: { d: Draft }) {
  if (d.status !== 'ready' && d.status !== 'needs_amount' && d.status !== 'ambiguous') return null;
  const name = d.person?.name || d.name_spoken || '—';
  const amt = d.amount != null ? `₹${d.amount}` : '…';
  const pay = d.kind === 'payment';
  return (
    <View
      className="flex-row items-center gap-2 rounded-full border border-line px-3.5 py-2.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.82)', maxWidth: '100%' }}>
      <Text className="text-sm font-bold text-ink" numberOfLines={1} style={{ fontFamily: AppFonts.displaySemiBold, maxWidth: 100 }}>
        {name}
      </Text>
      <Text className="text-xs text-muted" numberOfLines={1} style={{ maxWidth: 80 }}>
        {d.label || d.kind}
      </Text>
      <Text
        className="ml-auto text-base font-bold"
        style={{ fontFamily: AppFonts.displayBold, color: pay ? Porcelain.leaf : Porcelain.rose }}>
        {pay ? '−' : '+'}{amt}
      </Text>
    </View>
  );
}

export function VoiceOverlay({ open, view, onClose, onBargeIn }: Props) {
  const insets = useSafeAreaInsets();
  const mood = view.state;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <RNView style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <RNPressable onPress={onClose} style={styles.close} hitSlop={12}>
          <Text style={{ fontSize: 16, color: Porcelain.muted }}>✕</Text>
        </RNPressable>

        <RNView style={styles.stage}>
          <WaveRings mood={mood} />
          <RNPressable onPress={onBargeIn} style={styles.orb}>
            <Image
              source={require('../../../assets/images/munshi-face.png')}
              style={styles.face}
            />
          </RNPressable>
        </RNView>

        <RNView style={styles.session}>
          {view.drafts.slice(-4).map((d) => (
            <DraftChip key={d.id} d={d} />
          ))}
        </RNView>
      </RNView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(251,249,246,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    top: 54,
    right: 18,
    zIndex: 5,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  orb: {
    width: 132,
    height: 132,
    borderRadius: 66,
    overflow: 'hidden',
    zIndex: 2,
    shadowColor: '#1c1917',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  face: {
    width: '100%',
    height: '100%',
  },
  session: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 48,
    gap: 8,
    alignItems: 'center',
  },
});
