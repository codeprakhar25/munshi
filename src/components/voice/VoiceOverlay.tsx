/**
 * The talk-to-Munshi overlay, ported from final_version.html's voice stage:
 * expanding wave rings + pulsing glow + bobbing orb + floating dust, all
 * colored by mood (listening = leaf green, speaking = saffron, idle/thinking
 * = faint ink breathing). Every loop runs on the UI thread — the JS thread is
 * busy with Saaras/model calls exactly when these need to look alive.
 */
import { useEffect } from 'react';
import { Image, Modal, StyleSheet, View as RNView } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Draft } from '@/agent/types';
import { fadeUp, Gradient, PressScale, softFade, useBreath } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { Text, View } from '@/tw';
import type { VoiceState, VoiceView } from '@/voice/session';

interface Props {
  open: boolean;
  view: VoiceView;
  onClose: () => void;
  onBargeIn: () => void;
}

const STAGE = 300;

const MOOD = {
  listening: { ring: 'rgba(21,128,61,0.35)', glow: 'rgba(34,197,94,0.22)', dust: 'rgba(34,197,94,0.4)', period: 2800, stagger: 350 },
  speaking: { ring: 'rgba(245,158,11,0.45)', glow: 'rgba(245,158,11,0.22)', dust: 'rgba(245,158,11,0.45)', period: 2400, stagger: 280 },
} as const;

type ActiveMood = keyof typeof MOOD;

/** Ring diameters from the mock's insets (14%, 4%, −8%, −22%, −38% of the stage). */
const RING_SIZES = [216, 276, 348, 432, 528];

function WaveRing({ size, delay, color, period }: { size: number; delay: number; color: string; period: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: period, easing: Easing.bezier(0.22, 0.7, 0.3, 1) }), -1, false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, period, color]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(p.value, [0, 1], [0.78, 1.08]) }],
    opacity: interpolate(p.value, [0, 0.18, 0.7, 1], [0, 0.7, 0.22, 0]),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        style,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          top: (STAGE - size) / 2,
          left: (STAGE - size) / 2,
        },
      ]}
    />
  );
}

/** Idle/thinking: two faint rings breathing, like the mock's breathRing. */
function BreathRing({ size, delay, tint }: { size: number; delay: number; tint: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.sin) }), -1, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.96 + 0.08 * p.value }],
    opacity: 0.1 + 0.18 * p.value,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        style,
        { width: size, height: size, borderRadius: size / 2, borderColor: tint, top: (STAGE - size) / 2, left: (STAGE - size) / 2 },
      ]}
    />
  );
}

const DUST = [
  { left: 0.18, top: 0.3, delay: 0, size: 4 },
  { left: 0.78, top: 0.28, delay: 400, size: 3 },
  { left: 0.22, top: 0.72, delay: 800, size: 5 },
  { left: 0.74, top: 0.68, delay: 1100, size: 4 },
  { left: 0.5, top: 0.12, delay: 550, size: 3 },
  { left: 0.48, top: 0.86, delay: 1400, size: 4 },
];

function DustMote({ left, top, delay, size, color }: (typeof DUST)[number] & { color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -10 * p.value }, { scale: 1 + 0.3 * p.value }],
    opacity: 0.15 + 0.55 * p.value,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          position: 'absolute',
          left: left * STAGE,
          top: top * STAGE,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    />
  );
}

/** Soft vertical bob while Munshi is talking. */
function useBob(active: boolean) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (active) p.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.sin) }), -1, true);
    else p.value = withTiming(0, { duration: 250 });
  }, [active, p]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: -3 * p.value }] }));
}

function DraftChip({ d, index }: { d: Draft; index: number }) {
  if (d.status !== 'ready' && d.status !== 'needs_amount' && d.status !== 'ambiguous') return null;
  const name = d.person?.name || d.name_spoken || '—';
  const amt = d.amount != null ? `₹${d.amount}` : '…';
  const pay = d.kind === 'payment';
  return (
    <Animated.View entering={fadeUp(index, 0)} style={styles.chip}>
      <Text className="text-sm font-bold text-ink" numberOfLines={1} style={{ fontFamily: AppFonts.displaySemiBold, maxWidth: 110 }}>
        {name}
      </Text>
      <Text className="text-xs text-muted" numberOfLines={1} style={{ maxWidth: 80 }}>
        {d.label || d.kind}
      </Text>
      <Text style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 16, marginLeft: 'auto', color: pay ? Porcelain.leaf : Porcelain.rose }}>
        {pay ? '−' : '+'}{amt}
      </Text>
    </Animated.View>
  );
}

export function VoiceOverlay({ open, view, onClose, onBargeIn }: Props) {
  const insets = useSafeAreaInsets();
  const mood = view.state as VoiceState;
  const active: ActiveMood | null = mood === 'listening' || mood === 'speaking' ? mood : null;
  const spec = active ? MOOD[active] : null;

  const glowPulse = useBreath({ peak: 1.12, lo: 0.5, hi: 1, ms: active === 'listening' ? 1400 : 1100 });
  const bob = useBob(mood === 'speaking');

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <RNView style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Warm glass ambience over the home screen. */}
        <Gradient
          pointerEvents="none"
          image="radial-gradient(circle at 50% 46%, rgba(255,248,235,0.6) 0%, rgba(255,248,235,0) 70%)"
          style={StyleSheet.absoluteFill}
        />

        <PressScale onPress={onClose} scaleTo={0.92} style={[styles.close, { top: insets.top + 10 }]}>
          <Text style={{ fontSize: 16, color: Porcelain.muted }}>✕</Text>
        </PressScale>

        <RNView style={styles.stage}>
          {/* keyed by mood so ring loops restart in phase on every mood change */}
          {spec ? (
            <RNView key={active} style={StyleSheet.absoluteFill} pointerEvents="none">
              {RING_SIZES.map((size, i) => (
                <WaveRing key={i} size={size} delay={i * spec.stagger} color={spec.ring} period={spec.period} />
              ))}
              {DUST.map((m, i) => (
                <DustMote key={i} {...m} color={spec.dust} />
              ))}
            </RNView>
          ) : (
            <RNView style={StyleSheet.absoluteFill} pointerEvents="none">
              <BreathRing size={RING_SIZES[1]} delay={0} tint={mood === 'thinking' ? 'rgba(217,119,6,0.35)' : 'rgba(28,25,23,0.16)'} />
              <BreathRing size={RING_SIZES[2]} delay={1200} tint={mood === 'thinking' ? 'rgba(217,119,6,0.22)' : 'rgba(28,25,23,0.1)'} />
            </RNView>
          )}

          {/* Glow halo behind the orb. */}
          <Animated.View pointerEvents="none" style={[styles.glow, active ? glowPulse : { opacity: 0.4 }]}>
            <Gradient
              image={`radial-gradient(circle at 50% 50%, ${spec?.glow ?? 'rgba(245,158,11,0.14)'} 0%, rgba(245,158,11,0) 68%)`}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <Animated.View entering={softFade()} style={bob}>
            <PressScale scaleTo={0.96} onPress={onBargeIn} style={styles.orb}>
              <Image source={require('../../../assets/images/munshi-face.png')} style={styles.face} />
            </PressScale>
          </Animated.View>
        </RNView>

        <RNView style={styles.session} pointerEvents="none">
          {view.drafts.slice(-4).map((d, i) => (
            <DraftChip key={d.id} d={d} index={i} />
          ))}
        </RNView>
      </RNView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(251,249,246,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    right: 18,
    zIndex: 5,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1c1917',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  glow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  orb: {
    width: 132,
    height: 132,
    borderRadius: 66,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.75)',
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(28,25,23,0.06)',
    maxWidth: '100%',
    shadowColor: '#1c1917',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});
