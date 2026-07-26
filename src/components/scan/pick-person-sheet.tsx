import { Modal, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import type { DraftPerson } from '@/agent/types';
import { ContactsSearchList } from '@/components/scan/contacts-search-list';
import { AppFonts, Porcelain } from '@/constants/theme';
import { Text, View } from '@/tw';
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
      <RNView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <RNView style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          {mode === 'pick' ? (
            <ScrollView
              style={styles.matchList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {matches.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => onPickExisting(p)}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {p.name_en && p.name_en !== p.name ? (
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {p.name_en}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
              {fromContactsLabel ? (
                <Text style={styles.sectionLabel}>{fromContactsLabel}</Text>
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
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                <Text style={styles.cardName}>
                  {walkInLabel}
                  {nameToken ? `: ${nameToken}` : ''}
                </Text>
              </Pressable>
            </View>
          )}
        </RNView>
      </RNView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,25,23,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Porcelain.white,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '78%',
    shadowColor: '#1c1917',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  title: {
    fontFamily: AppFonts.serifSemiBold,
    fontSize: 20,
    color: Porcelain.ink,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  matchList: {
    maxHeight: 300,
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
  cardName: {
    fontFamily: AppFonts.displaySemiBold,
    fontSize: 16,
    color: Porcelain.ink,
  },
  cardSub: {
    marginTop: 2,
    fontFamily: AppFonts.body,
    fontSize: 13,
    color: Porcelain.muted,
  },
  sectionLabel: {
    marginTop: 8,
    fontFamily: AppFonts.displayBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: Porcelain.muted,
    textTransform: 'uppercase',
  },
});
