import { StyleSheet } from 'react-native';

import { PressScale } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { LANGUAGE_LABELS } from '@/lib/i18n';
import { Text, View } from '@/tw';
import type { AppLanguage } from '@/store/onboarding-store';

interface LanguageGridProps {
  value: AppLanguage;
  onChange: (lang: AppLanguage) => void;
}

/** The mock's .lang-rail: centered pills, selected pill flips to ink. */
export function LanguageGrid({ value, onChange }: LanguageGridProps) {
  return (
    <View className="mt-3 flex-row flex-wrap justify-center gap-2">
      {LANGUAGE_LABELS.map((lang) => {
        const selected = lang.code === value;
        return (
          <PressScale
            key={lang.code}
            scaleTo={0.95}
            onPress={() => onChange(lang.code)}
            style={[styles.pill, selected && styles.pillSelected]}>
            <Text
              style={{
                fontFamily: AppFonts.displaySemiBold,
                fontSize: 15,
                color: selected ? Porcelain.paper : Porcelain.muted,
              }}>
              {lang.native}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pillSelected: {
    backgroundColor: Porcelain.ink,
    borderColor: Porcelain.ink,
  },
});
