import { Modal } from 'react-native';

import { ContactsSearchList } from '@/components/scan/contacts-search-list';
import { Pressable, ScrollView, Text, View } from '@/tw';
import type { DeviceContact } from '@/store/device-contacts-store';
import type { Person } from '@/store/people-store';

interface PickPersonSheetProps {
  visible: boolean;
  mode: 'pick' | 'contacts';
  title: string;
  matches: Person[];
  contacts: DeviceContact[];
  nameToken: string | null;
  searchPlaceholder: string;
  fromContactsLabel: string;
  walkInLabel: string;
  onPickExisting: (person: Person) => void;
  onPickContact: (contact: DeviceContact) => void;
  onWalkIn: (name: string) => void;
  onClose: () => void;
}

export function PickPersonSheet({
  visible,
  mode,
  title,
  matches,
  contacts,
  nameToken,
  searchPlaceholder,
  fromContactsLabel,
  walkInLabel,
  onPickExisting,
  onPickContact,
  onWalkIn,
  onClose,
}: PickPersonSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/35" onPress={onClose}>
        <Pressable className="rounded-t-[20px] bg-surface p-[18px]" onPress={() => {}}>
          <Text
            className="mb-2.5 text-lg font-bold text-ink"
            style={{ fontFamily: 'Urbanist_700Bold' }}>
            {title}
          </Text>

          {mode === 'pick' ? (
            <ScrollView className="max-h-72">
              {matches.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => onPickExisting(p)}
                  className="mb-2 flex-row items-center justify-between rounded-xl border border-line bg-app-bg px-3 py-3">
                  <Text className="text-sm text-ink">{p.name}</Text>
                  <Text className="text-xs text-muted">{p.phone ?? walkInLabel}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View className="gap-3">
              <ContactsSearchList
                contacts={contacts}
                placeholder={searchPlaceholder}
                onSelect={onPickContact}
              />
              <Pressable
                onPress={() => onWalkIn(nameToken ?? 'Walk-in')}
                className="rounded-xl border border-line bg-app-bg px-3 py-3">
                <Text className="text-sm font-bold text-ink">
                  {walkInLabel}: {nameToken ?? '?'}
                </Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
