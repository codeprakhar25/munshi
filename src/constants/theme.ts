/**
 * Porcelain Munshi tokens — aligned with final_version.html.
 */
import '@/global.css';

import { Platform } from 'react-native';

export const Porcelain = {
  paper: '#FBF9F6',
  paper2: '#F5F0E8',
  white: '#FFFFFF',
  ink: '#1C1917',
  muted: '#78716C',
  line: '#E7E5E4',
  saffron: '#F59E0B',
  saffronDeep: '#B45309',
  saffronMist: '#FEF3C7',
  rose: '#E11D48',
  roseMist: '#FFE4E6',
  leaf: '#15803D',
  leafMist: '#DCFCE7',
} as const;

export const Colors = {
  light: {
    text: Porcelain.ink,
    background: Porcelain.paper,
    backgroundElement: Porcelain.paper2,
    backgroundSelected: Porcelain.saffronMist,
    textSecondary: Porcelain.muted,
    accent: Porcelain.saffronDeep,
    accentSoft: Porcelain.saffronMist,
    danger: Porcelain.rose,
    dangerSoft: Porcelain.roseMist,
    success: Porcelain.leaf,
    successSoft: Porcelain.leafMist,
    line: Porcelain.line,
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: '#FBBF24',
    accentSoft: '#3F2E0A',
    danger: '#F87171',
    dangerSoft: '#3F1D1D',
    success: '#34D399',
    successSoft: '#0F3D2E',
    line: '#2E3135',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const AppFonts = {
  displayExtraBold: 'Urbanist_800ExtraBold',
  displayBold: 'Urbanist_700Bold',
  displaySemiBold: 'Urbanist_600SemiBold',
  displayMedium: 'Urbanist_500Medium',
  body: 'Roboto_400Regular',
  bodyMedium: 'Roboto_500Medium',
  bodyBold: 'Roboto_700Bold',
  indicDevanagari: 'NotoSansDevanagari_400Regular',
  indicTamil: 'NotoSansTamil_400Regular',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
