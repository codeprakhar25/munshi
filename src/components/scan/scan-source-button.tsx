import { StyleSheet } from 'react-native';

import { PressScale } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { Text, View } from '@/tw';

interface ScanSourceButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
}

export function ScanSourceButton({ icon, label, onPress }: ScanSourceButtonProps) {
  return (
    <PressScale scaleTo={0.98} onPress={onPress} style={styles.row}>
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
        <Text className="text-xl">{icon}</Text>
      </View>
      <Text className="text-base font-bold text-ink" style={{ fontFamily: AppFonts.displaySemiBold }}>
        {label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.white,
    padding: 16,
  },
});
