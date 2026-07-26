import { Pressable, Text, View } from '@/tw';
import { LANGUAGE_LABELS } from '@/lib/i18n';
import type { AppLanguage } from '@/store/onboarding-store';

interface LanguageGridProps {
  value: AppLanguage;
  onChange: (lang: AppLanguage) => void;
}

export function LanguageGrid({ value, onChange }: LanguageGridProps) {
  return (
    <View className="mt-3 flex-row flex-wrap gap-2.5">
      {LANGUAGE_LABELS.map((lang) => {
        const selected = lang.code === value;
        return (
          <Pressable
            key={lang.code}
            onPress={() => onChange(lang.code)}
            className={`w-[47%] rounded-2xl border px-3 py-3.5 ${
              selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
            }`}>
            <Text
              className={`text-base font-medium ${selected ? 'text-accent' : 'text-ink'}`}
              style={{ fontFamily: 'Urbanist_600SemiBold' }}>
              {lang.native}
            </Text>
            <Text className="mt-0.5 text-xs uppercase tracking-wide text-muted">
              {lang.english}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
