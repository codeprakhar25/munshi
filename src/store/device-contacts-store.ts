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
  imported: boolean;
  contacts: DeviceContact[];
  importFromDevice: () => Promise<number>;
}

export const useDeviceContactsStore = create<DeviceContactsState>()(
  persist(
    (set) => ({
      imported: false,
      contacts: [],
      importFromDevice: async () => {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== 'granted') {
          set({ imported: true, contacts: [] });
          return 0;
        }
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
        });
        const contacts: DeviceContact[] = data
          .filter((c) => !!c.name)
          .map((c) => ({
            id: c.id ?? `${c.name}-${Math.random()}`,
            name: c.name!,
            phone: c.phoneNumbers?.[0]?.number ?? null,
          }));
        set({ imported: true, contacts });
        return contacts.length;
      },
    }),
    {
      name: 'munshi/device-contacts',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
