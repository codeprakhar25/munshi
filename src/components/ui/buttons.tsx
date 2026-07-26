/**
 * The mock's button family: .btn-saffron (gradient + glow), .btn-ink,
 * .btn-line, .btn-quiet — all with the press-scale acknowledgment.
 */
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Gradient, PressScale } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { Text } from '@/tw';

interface ButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** Saffron gradient CTA — the "hero" action on a screen. */
export function SaffronButton({ label, onPress, style, disabled }: ButtonProps) {
  return (
    <PressScale scaleTo={0.985} onPress={onPress} disabled={disabled} style={[styles.saffronShadow, style, disabled && { opacity: 0.45 }]}>
      <Gradient image="linear-gradient(135deg, #f59e0b 0%, #b45309 100%)" style={styles.base}>
        <Text style={[styles.label, { color: '#fff' }]}>{label}</Text>
      </Gradient>
    </PressScale>
  );
}

/** Solid ink — strong but quieter than saffron. */
export function InkButton({ label, onPress, style, disabled }: ButtonProps) {
  return (
    <PressScale scaleTo={0.985} onPress={onPress} disabled={disabled} style={[styles.base, styles.ink, style, disabled && { opacity: 0.45 }]}>
      <Text style={[styles.label, { color: Porcelain.paper }]}>{label}</Text>
    </PressScale>
  );
}

/** Outlined on white. */
export function LineButton({ label, onPress, style, disabled }: ButtonProps) {
  return (
    <PressScale scaleTo={0.985} onPress={onPress} disabled={disabled} style={[styles.base, styles.line, style, disabled && { opacity: 0.45 }]}>
      <Text style={[styles.label, { color: Porcelain.ink }]}>{label}</Text>
    </PressScale>
  );
}

/** Bare text — "not now" affordances. */
export function QuietButton({ label, onPress, style }: ButtonProps) {
  return (
    <PressScale scaleTo={0.97} onPress={onPress} style={[styles.base, style]}>
      <Text style={[styles.label, { color: Porcelain.muted, fontFamily: AppFonts.displaySemiBold }]}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ink: {
    backgroundColor: Porcelain.ink,
  },
  line: {
    backgroundColor: Porcelain.white,
    borderWidth: 1,
    borderColor: Porcelain.line,
  },
  saffronShadow: {
    borderRadius: 999,
    shadowColor: '#D97706',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  label: {
    fontFamily: AppFonts.displayBold,
    fontSize: 16,
    textAlign: 'center',
  },
});
