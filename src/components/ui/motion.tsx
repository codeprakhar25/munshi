/**
 * Shared motion + gradient primitives, tuned to final_version.html.
 *
 * Everything here runs on the UI thread via Reanimated — no JS-driven loops —
 * so the animations stay smooth even while a turn's model calls saturate the
 * JS thread. Gradients use RN's built-in `experimental_backgroundImage`
 * (Fabric, RN 0.76+): CSS gradient syntax, zero native dependencies.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View as RNView, type StyleProp, type ViewStyle, type PressableProps } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** The mock's signature curve: cubic-bezier(0.22, 1, 0.36, 1). */
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/** Entrance used by every `.stagger > *` in the mock: fade + 18px rise. */
export const fadeUp = (index = 0, base = 50) =>
  FadeInDown.duration(550).delay(base + index * 80).easing(EASE_OUT);

/** Plain fade for overlays (mock's voiceIn). */
export const softFade = (ms = 450) => FadeIn.duration(ms).easing(EASE_OUT);

interface RiseProps {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** A View that enters like the mock's fadeUp keyframe. Order via `index`. */
export function Rise({ index = 0, style, children, ...rest }: RiseProps) {
  return (
    <Animated.View entering={fadeUp(index)} style={style} {...rest}>
      {children}
    </Animated.View>
  );
}

interface PressScaleProps extends PressableProps {
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The mock's `:active { transform: scale(0.985) }` — a springy press
 * acknowledgment on anything tappable.
 *
 * ONE node, not a Pressable wrapping a styled view: the style (including any
 * `position: absolute`) must live on the Pressable itself, or its hit box is
 * zero-sized and Android — which never hit-tests children outside the parent's
 * bounds — makes the control untappable.
 */
export function PressScale({ scaleTo = 0.97, style, children, ...press }: PressScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...press}
      style={[style, animated]}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, { damping: 20, stiffness: 400 }));
        press.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 16, stiffness: 300 }));
        press.onPressOut?.(e);
      }}>
      {children}
    </AnimatedPressable>
  );
}

/**
 * Gradient container. `image` takes CSS syntax:
 *   linear-gradient(135deg, #f59e0b, #b45309)
 *   radial-gradient(circle at 80% 0%, #ffedd5 0%, transparent 50%)
 * Falls back to nothing (transparent) if the runtime rejects the value.
 */
export function Gradient({
  image,
  style,
  children,
  pointerEvents,
}: {
  image: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: 'none' | 'auto' | 'box-none';
}) {
  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[style, { experimental_backgroundImage: image } as unknown as ViewStyle]}>
      {children}
    </Animated.View>
  );
}

/** Full-bleed ambient wash behind a screen. Sits absolute, never intercepts touches. */
export function AmbientBackdrop({ image }: { image: string }) {
  return <Gradient image={image} pointerEvents="none" style={StyleSheet.absoluteFill} />;
}

/**
 * A soft circular glow built from stacked translucent discs — used where a
 * radial gradient would sit behind a face/FAB. Pure Views: cannot ever render
 * as a square, which the gradient version did on some Android renderers.
 */
export function GlowDisc({ size, rgb }: { size: number; rgb: string }) {
  const layers: [number, number][] = [
    [1, 0.07],
    [0.72, 0.1],
    [0.48, 0.16],
  ];
  return (
    <RNView pointerEvents="none" style={{ width: size, height: size }}>
      {layers.map(([s, a], i) => {
        const d = size * s;
        return (
          <RNView
            key={i}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              left: (size - d) / 2,
              top: (size - d) / 2,
              backgroundColor: `rgba(${rgb},${a})`,
            }}
          />
        );
      })}
    </RNView>
  );
}

/**
 * A slow breathing loop (mock's breathRing / glowPulse). Returns an animated
 * style oscillating scale [1 → peak] and opacity [lo → hi].
 */
export function useBreath({ peak = 1.04, lo = 0.55, hi = 1, ms = 2200, delay = 0 } = {}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (peak - 1) * t.value }],
    opacity: lo + (hi - lo) * t.value,
  }));
}

/**
 * Count-up for the big rupee figure. Timing-based, ~350ms, snaps to the exact
 * target at the end — the displayed number is always our arithmetic's number.
 */
export function useCountUp(target: number, ms = 420): number {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    const from = shown;
    if (from === target) return;
    const t0 = Date.now();
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const eased = 1 - (1 - p) ** 3;
      setShown(p >= 1 ? target : Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return shown;
}
