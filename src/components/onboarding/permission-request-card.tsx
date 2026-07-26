import { Pressable, Text, View } from '@/tw';

interface PermissionRequestCardProps {
  icon: string;
  title: string;
  body: string;
  status: 'unknown' | 'granted' | 'denied';
  allowLabel: string;
  notNowLabel: string;
  onAllow: () => void;
  onNotNow: () => void;
}

export function PermissionRequestCard({
  icon,
  title,
  body,
  status,
  allowLabel,
  notNowLabel,
  onAllow,
  onNotNow,
}: PermissionRequestCardProps) {
  const resolved = status !== 'unknown';
  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      <Text className="text-2xl">{icon}</Text>
      <Text className="mt-2 text-lg font-bold text-ink" style={{ fontFamily: 'Urbanist_700Bold' }}>
        {title}
      </Text>
      <Text className="mt-1 text-sm text-muted">{body}</Text>

      {resolved ? (
        <View
          className={`mt-3 self-start rounded-full px-3 py-1.5 ${
            status === 'granted' ? 'bg-success-soft' : 'bg-danger-soft'
          }`}>
          <Text
            className={`text-xs font-bold ${status === 'granted' ? 'text-success' : 'text-danger'}`}>
            {status === 'granted' ? '✓' : '✕'} {status}
          </Text>
        </View>
      ) : (
        <View className="mt-3 flex-row gap-2">
          <Pressable onPress={onNotNow} className="flex-1 rounded-xl border border-line bg-app-bg py-3">
            <Text className="text-center text-sm font-bold text-ink">{notNowLabel}</Text>
          </Pressable>
          <Pressable onPress={onAllow} className="flex-1 rounded-xl bg-accent py-3">
            <Text className="text-center text-sm font-bold text-white">{allowLabel}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
