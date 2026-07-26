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

/**
 * Virtualized + debounced search. Mapping thousands of contacts into a
 * ScrollView (old path) froze the JS thread so taps never registered.
 */
export function ContactsSearchList({ contacts, placeholder, onSelect }: ContactsSearchListProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim().toLowerCase()), 120);
    return () => clearTimeout(id);
  }, [query]);

  // Pre-lower names once per contacts identity — avoids lowercasing every keystroke.
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
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={5}
        removeClippedSubviews
        ListEmptyComponent={
          <Text style={styles.empty}>—</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: Porcelain.saffronMist }]}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.phone} numberOfLines={1}>
              {item.phone ?? ''}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
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
    maxHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Porcelain.line,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontFamily: AppFonts.body,
    color: Porcelain.ink,
  },
  phone: {
    fontSize: 12,
    fontFamily: AppFonts.body,
    color: Porcelain.muted,
    maxWidth: '40%',
  },
  empty: {
    paddingVertical: 16,
    textAlign: 'center',
    color: Porcelain.muted,
    fontFamily: AppFonts.body,
  },
});
