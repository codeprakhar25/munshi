import { useMemo, useState } from 'react';

import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';
import type { DeviceContact } from '@/store/device-contacts-store';

interface ContactsSearchListProps {
  contacts: DeviceContact[];
  placeholder: string;
  onSelect: (contact: DeviceContact) => void;
}

export function ContactsSearchList({ contacts, placeholder, onSelect }: ContactsSearchListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 20);
    return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 20);
  }, [contacts, query]);

  return (
    <View className="gap-2">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        className="rounded-xl border border-line bg-app-bg px-3 py-2.5 text-base text-ink"
      />
      <ScrollView className="max-h-48" keyboardShouldPersistTaps="handled">
        {filtered.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onSelect(c)}
            className="flex-row items-center justify-between border-b border-line px-1 py-2.5">
            <Text className="text-sm text-ink">{c.name}</Text>
            <Text className="text-xs text-muted">{c.phone ?? ''}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
