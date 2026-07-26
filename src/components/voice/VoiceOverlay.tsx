/**
 * The talk-to-Munshi overlay, ported from final_version.html's voice stage:
 * expanding wave rings + pulsing glow + bobbing orb + floating dust, all
 * colored by mood (listening = leaf green, speaking = saffron, idle/thinking
 * = faint ink breathing). Every loop runs on the UI thread — the JS thread is
 * busy with Saaras/model calls exactly when these need to look alive.
 *
 * NOT a Modal on purpose: it renders in-tree over the home screen so the
 * Munshi face can fly from the FAB up to the center as one continuous object.
 * (A Modal is a separate native layer — nothing can animate across it.)
 */
import { useEffect } from 'react';
import { BackHandler, Image, Pressable as RNPressable, StyleSheet, View as RNView, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Draft } from '@/agent/types';
import { fadeUp, GlowDisc, PressScale } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { Text } from '@/tw';
import type { VoiceState, VoiceView } from '@/voice/session';

interface Props {
  open: boolean;
  view: VoiceView;
  onClose: () => void;
  onBargeIn: () => void;
  /** Distance from the screen bottom to the FAB's center — the fly-in origin. */
  fabCenterFromBottom?: number;
}

const STAGE = 300;
const ORB = 132;
const FAB = 74;

const AnimatedDismiss = Animated.createAnimatedComponent(RNPressable);

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
    p.set(0);
    p.set(withDelay(
      delay,
      withRepeat(withTiming(1, { duration: period, easing: Easing.bezier(0.22, 0.7, 0.3, 1) }), -1, false),
    ));
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
    p.set(withDelay(delay, withRepeat(withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.sin) }), -1, true)));
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

/**
 * The "working on it" signature: three saffron motes orbiting the face while
 * the model is thinking — unmistakably different from the breathing idle and
 * the outward listening/speaking waves.
 */
const ORBIT = 176;

function ThinkingOrbit() {
  const r = useSharedValue(0);
  useEffect(() => {
    r.set(withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }] }));
  const radius = ORBIT / 2 - 5;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: ORBIT, height: ORBIT, top: (STAGE - ORBIT) / 2, left: (STAGE - ORBIT) / 2 },
        spin,
      ]}>
      {[0, 1, 2].map((i) => {
        const angle = (i * 2 * Math.PI) / 3;
        const size = 8 - i * 2;
        return (
          <RNView
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: `rgba(217,119,6,${0.85 - i * 0.25})`,
              left: ORBIT / 2 - size / 2 + radius * Math.cos(angle),
              top: ORBIT / 2 - size / 2 + radius * Math.sin(angle),
            }}
          />
        );
      })}
    </Animated.View>
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
    p.set(withDelay(delay, withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true)));
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
    if (active) p.set(withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.sin) }), -1, true));
    else p.set(withTiming(0, { duration: 250 }));
  }, [active, p]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: -3 * p.value }] }));
}

/** Same card the home listing uses: avatar initial, name + detail, serif amount. */
function DraftCard({ d, index }: { d: Draft; index: number }) {
  const name = d.person?.name || d.name_spoken || '—';
  const pay = d.kind === 'payment';
  const sub =
    d.status === 'ambiguous'
      ? d.options.map((o) => o.name).join(' / ')
      : d.status === 'needs_amount'
        ? '…'
        : d.label || d.kind;
  const amt = d.amount != null ? `₹${d.amount}` : '…';
  return (
    <Animated.View entering={fadeUp(index, 0)} style={styles.card}>
      <RNView style={styles.cardAva}>
        <Text style={{ fontFamily: AppFonts.serifSemiBold, color: Porcelain.saffronDeep, fontSize: 19 }}>
          {name.charAt(0)}
        </Text>
      </RNView>
      <RNView style={{ flex: 1, minWidth: 0 }}>
        <Text className="text-base font-bold text-ink" numberOfLines={1} style={{ fontFamily: AppFonts.displaySemiBold }}>
          {name}
        </Text>
        <Text className="text-xs text-muted" numberOfLines={1}>
          {sub}
        </Text>
      </RNView>
      <Text style={{ fontFamily: AppFonts.serifSemiBold, fontSize: 19, color: pay ? Porcelain.leaf : Porcelain.rose }}>
        {pay ? '−' : '+'}{amt}
      </Text>
    </Animated.View>
  );
}

export function VoiceOverlay({ open, view, onClose, onBargeIn, fabCenterFromBottom = 65 }: Props) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const mood = view.state as VoiceState;
  const active: ActiveMood | null = mood === 'listening' || mood === 'speaking' ? mood : null;
  const spec = active ? MOOD[active] : null;

  const bob = useBob(mood === 'speaking');

  const cards = view.drafts
    .filter((d) => d.status === 'ready' || d.status === 'needs_amount' || d.status === 'ambiguous')
    .slice(-4);

  // When entries appear, Munshi glides up to make room and the cards fill the
  // space beneath him.
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.set(withSpring(cards.length ? 1 : 0, { damping: 18, stiffness: 120 }));
  }, [cards.length, lift]);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -175 * lift.value }],
  }));

  // Fly-in: the orb starts life exactly where the FAB sits (small, low) and
  // springs up to the stage center; rings/glow/dust bloom in behind it.
  const fly = useSharedValue(0);
  useEffect(() => {
    if (open) {
      fly.set(0);
      fly.set(withSpring(1, { damping: 18, stiffness: 130, mass: 0.9 }));
    }
  }, [open, fly]);

  // The overlay is centered on the full screen, so the orb's resting center is
  // at screenH / 2; the FAB's center is fabCenterFromBottom above the bottom.
  const startOffsetY = screenH / 2 - fabCenterFromBottom;

  const flyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - fly.value) * startOffsetY },
      { scale: FAB / ORB + (1 - FAB / ORB) * fly.value },
    ],
  }));
  /** Everything except the orb fades/scales in as the face arrives. */
  const bloomStyle = useAnimatedStyle(() => ({
    opacity: interpolate(fly.value, [0, 0.6, 1], [0, 0, 1]),
    transform: [{ scale: 0.92 + 0.08 * fly.value }],
  }));

  const glowPulse = useSharedValue(0);
  useEffect(() => {
    glowPulse.set(withRepeat(withTiming(1, { duration: active === 'listening' ? 1400 : 1100, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [active, glowPulse]);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: active ? 0.5 + 0.5 * glowPulse.value : 0.4,
    transform: [{ scale: active ? 1 + 0.12 * glowPulse.value : 1 }],
  }));

  // No Modal → Android back must close the overlay by hand.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  if (!open) return null;

  return (
    // The ROOT is the dismiss pressable: any tap that no inner control (orb, ✕)
    // claims bubbles up here and closes the agent. Ancestor bubbling is
    // guaranteed by the responder system — sibling fall-through is not.
    <AnimatedDismiss
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(220)}
      onPress={onClose}
      // NO elevation here: Android renders an elevated translucent view's own
      // shadow THROUGH it as a rectangle. The overlay is the last sibling, so
      // plain document order + zIndex already puts it on top.
      // NO gradient washes either — every decorative layer here must be a plain
      // View or a GlowDisc until the backgroundImage renderer proves trustworthy.
      style={[StyleSheet.absoluteFill, { zIndex: 40, backgroundColor: 'rgba(251,249,246,0.58)' }]}>

      <RNView pointerEvents="box-none" style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <PressScale onPress={onClose} scaleTo={0.92} style={[styles.close, { top: insets.top + 10 }]}>
          <Text style={{ fontSize: 16, color: Porcelain.muted }}>✕</Text>
        </PressScale>

        {/* box-none: taps between the rings (outside the orb) fall through to the
            frost layer and close the agent. */}
        <Animated.View pointerEvents="box-none" style={[styles.stage, liftStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, bloomStyle]} pointerEvents="none">
            {/* keyed by mood so ring loops restart in phase on every mood change */}
            {spec ? (
              <RNView key={active} style={StyleSheet.absoluteFill}>
                {RING_SIZES.map((size, i) => (
                  <WaveRing key={i} size={size} delay={i * spec.stagger} color={spec.ring} period={spec.period} />
                ))}
                {DUST.map((m, i) => (
                  <DustMote key={i} {...m} color={spec.dust} />
                ))}
              </RNView>
            ) : (
              <RNView style={StyleSheet.absoluteFill}>
                <BreathRing size={RING_SIZES[1]} delay={0} tint={mood === 'thinking' ? 'rgba(217,119,6,0.35)' : 'rgba(28,25,23,0.16)'} />
                <BreathRing size={RING_SIZES[2]} delay={1200} tint={mood === 'thinking' ? 'rgba(217,119,6,0.22)' : 'rgba(28,25,23,0.1)'} />
                {mood === 'thinking' && <ThinkingOrbit />}
              </RNView>
            )}

            {/* Glow halo behind the orb — stacked discs, never renders square. */}
            <Animated.View style={[styles.glow, glowStyle]}>
              <GlowDisc size={190} rgb={active === 'listening' ? '34,197,94' : '245,158,11'} />
            </Animated.View>
          </Animated.View>

          <Animated.View style={flyStyle}>
            <Animated.View style={bob}>
              <PressScale scaleTo={0.96} onPress={onBargeIn} style={styles.orb}>
                <Image source={require('../../../assets/images/munshi-face.png')} style={styles.face} />
              </PressScale>
            </Animated.View>
          </Animated.View>
        </Animated.View>

        {/* Session cards — one appears for each entry as you speak, filling the
            space Munshi vacates. */}
        <RNView style={styles.session} pointerEvents="none">
          {cards.map((d, i) => (
            <DraftCard key={d.id} d={d} index={i} />
          ))}
        </RNView>
      </RNView>
    </AnimatedDismiss>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
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
    backgroundColor: 'rgba(255,255,255,0.7)',
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
    top: (STAGE - 190) / 2,
    left: (STAGE - 190) / 2,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
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
    // Round the IMAGE itself: the source is circular art on a white square
    // canvas, and Android drops parent overflow-clipping under an animated
    // transform — which showed the canvas as a square box around the face.
    borderRadius: ORB / 2,
  },
  session: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '50%',
    marginTop: -35,
    bottom: 24,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.white,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#1c1917',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardAva: {
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: Porcelain.paper2,
  },
});
