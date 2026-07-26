import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Porcelain } from '@/constants/theme';
import { useOnboardingStore } from '@/store/onboarding-store';

/** Boot shim — real product lives at /home or /onboarding. */
export default function Index() {
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated);
  const onboardingComplete = useOnboardingStore((s) => s.onboardingComplete);

  if (!hasHydrated) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Porcelain.paper }}>
        <ActivityIndicator color={Porcelain.saffronDeep} />
      </SafeAreaView>
    );
  }

  return <Redirect href={onboardingComplete ? '/home' : '/onboarding'} />;
}
