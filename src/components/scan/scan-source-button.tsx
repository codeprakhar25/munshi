import { Pressable, Text, View } from '@/tw';

interface ScanSourceButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
}

export function ScanSourceButton({ icon, label, onPress }: ScanSourceButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4">
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
        <Text className="text-xl">{icon}</Text>
      </View>
      <Text className="text-base font-bold text-ink" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
        {label}
      </Text>
    </Pressable>
  );
}
