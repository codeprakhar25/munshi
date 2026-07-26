import { Modal } from 'react-native';

import type { DraftPerson } from '@/agent/types';
import { ContactsSearchList } from '@/components/scan/contacts-search-list';
import { Pressable, ScrollView, Text, View } from '@/tw';
import type { DeviceContact } from '@/store/device-contacts-store';

interface PickPersonSheetProps {
  visible: boolean;
  mode: 'pick' | 'contacts';
  title: string;
  matches: DraftPerson[];
  contacts: DeviceContact[];
  nameToken: string | null;
  searchPlaceholder: string;
  fromContactsLabel: string;
  walkInLabel: string;
  onPickExisting: (person: DraftPerson) => void;
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
                  <View className="min-w-0 flex-1 pr-2">
                    <Text className="text-sm text-ink">{p.name}</Text>
                    <Text className="text-xs text-muted">
                      {p.name_en !== p.name ? p.name_en : ''}
                      {p.balance > 0 ? ` · ₹${p.balance}` : ''}
                    </Text>
                  </View>
                  <Text className="text-xs text-muted">{p.phone ?? walkInLabel}</Text>
                </Pressable>
              ))}
              {fromContactsLabel ? (
                <Text className="mb-1 mt-1 text-[10px] uppercase tracking-wide text-muted">
                  {fromContactsLabel}
                </Text>
              ) : null}
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
