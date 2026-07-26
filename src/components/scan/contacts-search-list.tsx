import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput as RNTextInput } from 'react-native';

import { AppFonts, Porcelain } from '@/constants/theme';
import { Text, View } from '@/tw';
import type { DeviceContact } from '@/store/device-contacts-store';

interface ContactsSearchListProps {
  contacts: DeviceContact[];
  placeholder: string;
  onSelect: (contact: DeviceContact) => void;
}

const PAGE = 40;

/** Simple name cards — no phone clutter. Virtualized for large address books. */
export function ContactsSearchList({ contacts, placeholder, onSelect }: ContactsSearchListProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim().toLowerCase()), 120);
    return () => clearTimeout(id);
  }, [query]);

  const indexed = useMemo(
    () => contacts.map((c) => ({ c, key: c.name.toLowerCase() })),
    [contacts],
  );

  const filtered = useMemo(() => {
    if (!debounced) return indexed.slice(0, PAGE).map((x) => x.c);
    const hits: DeviceContact[] = [];
    for (const row of indexed) {
      if (row.key.includes(debounced)) {
        hits.push(row.c);
        if (hits.length >= PAGE) break;
      }
    }
    return hits;
  }, [indexed, debounced]);

  return (
    <View style={styles.wrap}>
      <RNTextInput
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={Porcelain.muted}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
      />
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={5}
        removeClippedSubviews
        ListEmptyComponent={<Text style={styles.empty}>—</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.paper,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: AppFonts.body,
    color: Porcelain.ink,
  },
  list: {
    maxHeight: 280,
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.paper,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardPressed: {
    backgroundColor: Porcelain.saffronMist,
    borderColor: Porcelain.saffron,
  },
  name: {
    fontSize: 16,
    fontFamily: AppFonts.displaySemiBold,
    color: Porcelain.ink,
  },
  empty: {
    paddingVertical: 16,
    textAlign: 'center',
    color: Porcelain.muted,
    fontFamily: AppFonts.body,
  },
});
