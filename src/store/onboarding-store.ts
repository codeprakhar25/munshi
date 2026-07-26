import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AppLanguage = 'hi' | 'en' | 'mr' | 'ta';
export type PermissionStatus = 'unknown' | 'granted' | 'denied';

interface OnboardingState {
  hasHydrated: boolean;
  onboardingComplete: boolean;
  language: AppLanguage;
  permissions: {
    contacts: PermissionStatus;
    notifications: PermissionStatus;
  };
  setLanguage: (language: AppLanguage) => void;
  setPermission: (kind: 'contacts' | 'notifications', status: PermissionStatus) => void;
  completeOnboarding: () => void;
  _setHasHydrated: (value: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      onboardingComplete: false,
      language: 'hi',
      permissions: { contacts: 'unknown', notifications: 'unknown' },
      setLanguage: (language) => set({ language }),
      setPermission: (kind, status) =>
        set((state) => ({ permissions: { ...state.permissions, [kind]: status } })),
      completeOnboarding: () => set({ onboardingComplete: true }),
      _setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'munshi/onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        onboardingComplete: state.onboardingComplete,
        language: state.language,
        permissions: state.permissions,
      }),
      onRehydrateStorage: () => (state) => {
        state?._setHasHydrated(true);
      },
    }
  )
);
