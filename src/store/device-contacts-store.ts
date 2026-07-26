import AsyncStorage from '@react-native-async-storage/async-storage';
// SDK 57's expo-contacts moved to a new class-based API; the legacy import
// keeps requestPermissionsAsync/getContactsAsync/Fields working as-is.
import * as Contacts from 'expo-contacts/legacy';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface DeviceContact {
  id: string;
  name: string;
  phone: string | null;
}

interface DeviceContactsState {
  /** Permission was asked; does NOT mean the full book is in memory. */
  imported: boolean;
  contacts: DeviceContact[];
  loading: boolean;
  /** Lazy load names only — never dump the whole book into people-store or AsyncStorage. */
  ensureLoaded: () => Promise<number>;
  /** @deprecated use ensureLoaded */
  importFromDevice: () => Promise<number>;
  clear: () => void;
}

export const useDeviceContactsStore = create<DeviceContactsState>()(
  persist(
    (set, get) => ({
      imported: false,
      contacts: [],
      loading: false,
      ensureLoaded: async () => {
        if (get().contacts.length > 0) return get().contacts.length;
        if (get().loading) return get().contacts.length;
        set({ loading: true });
        try {
          const { status } = await Contacts.getPermissionsAsync();
          if (status !== 'granted') {
            set({ imported: true, contacts: [], loading: false });
            return 0;
          }
          // Names only — no phone field. Cap so picker never freezes.
          const { data } = await Contacts.getContactsAsync({
            fields: [],
            pageSize: 500,
            pageOffset: 0,
            sort: Contacts.SortTypes.FirstName,
          });
          const contacts: DeviceContact[] = [];
          const seen = new Set<string>();
          for (const c of data) {
            const name = (c.name || '').trim();
            if (!name || seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            contacts.push({
              id: c.id ?? `n_${contacts.length}`,
              name,
              phone: null,
            });
            if (contacts.length >= 500) break;
          }
          set({ imported: true, contacts, loading: false });
          return contacts.length;
        } catch {
          set({ imported: true, contacts: [], loading: false });
          return 0;
        }
      },
      importFromDevice: async () => get().ensureLoaded(),
      clear: () => set({ contacts: [], imported: false, loading: false }),
    }),
    {
      name: 'munshi/device-contacts-v2',
      // Never persist the contact list — that was freezing onboarding with 2k rows.
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ imported: s.imported }),
    },
  ),
);
