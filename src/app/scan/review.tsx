import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LineItemCard } from '@/components/scan/line-item-card';
import { PickPersonSheet } from '@/components/scan/pick-person-sheet';
import { AppFonts, Porcelain } from '@/constants/theme';
import { loadKhata } from '@/db/khata';
import { commitScanDrafts } from '@/lib/khata-sync';
import { useStrings } from '@/lib/i18n';
import { extractNameToken, findMatches } from '@/lib/matching';
import { Pressable, ScrollView, Text, View } from '@/tw';
import { useDeviceContactsStore } from '@/store/device-contacts-store';
import { useOnboardingStore } from '@/store/onboarding-store';
import { usePeopleStore } from '@/store/people-store';
import { type ScanEntry, useScanStore } from '@/store/scan-store';

export default function ScanReviewScreen() {
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  const entry: ScanEntry = entryParam === 'onboarding' ? 'onboarding' : 'general';
  const language = useOnboardingStore((s) => s.language);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const t = useStrings(language);

  const drafts = useScanStore((s) => s.drafts);
  const updateDraft = useScanStore((s) => s.updateDraft);
  const setDrafts = useScanStore((s) => s.setDrafts);
  const resetScan = useScanStore((s) => s.reset);

  const people = usePeopleStore((s) => s.people);
  const addPerson = usePeopleStore((s) => s.addPerson);
  const deviceContacts = useDeviceContactsStore((s) => s.contacts);

  const [resolved, setResolved] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (resolved || drafts.length === 0) return;
    for (const draft of drafts) {
      const nameToken = extractNameToken(draft.particulars || draft.rawText, people);
      const matches = findMatches(nameToken, people);
      updateDraft(draft.id, {
        nameToken,
        matchedPersonId: matches.length === 1 ? matches[0].id : null,
        matchState: matches.length === 1 ? 'auto' : 'unresolved',
      });
    }
    setResolved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts.length, resolved]);

  const activeDraft = drafts.find((d) => d.id === activeDraftId) ?? null;
  const activeMatches = activeDraft ? findMatches(activeDraft.nameToken, people) : [];
  const sheetMode: 'pick' | 'contacts' = activeMatches.length > 0 ? 'pick' : 'contacts';

  function closeSheet() {
    setActiveDraftId(null);
  }

  function handlePickExisting(personId: string) {
    if (!activeDraftId) return;
    updateDraft(activeDraftId, { matchedPersonId: personId, matchState: 'auto' });
    closeSheet();
  }

  function handlePickContact(contact: { name: string; phone: string | null; id: string }) {
    if (!activeDraftId) return;
    const firstName = contact.name.split(' ')[0];
    const person = addPerson({
      name: contact.name,
      aliases: [firstName, contact.name],
      phone: contact.phone,
      source: 'contact',
      contactId: contact.id,
    });
    updateDraft(activeDraftId, { matchedPersonId: person.id, matchState: 'auto' });
    closeSheet();
  }

  function handleWalkIn(name: string) {
    if (!activeDraftId) return;
    const person = addPerson({
      name,
      aliases: [name],
      phone: null,
      source: 'walk-in',
    });
    updateDraft(activeDraftId, { matchedPersonId: person.id, matchState: 'auto' });
    closeSheet();
  }

  const confirmedCount = drafts.filter((d) => d.confirmed).length;

  async function finish() {
    if (saving || confirmedCount === 0) return;
    setSaving(true);
    try {
      const khata = await loadKhata();
      const confirmed = useScanStore.getState().drafts.filter((d) => d.confirmed);
      await commitScanDrafts(khata, confirmed, usePeopleStore.getState().people);
      resetScan();
      if (entry === 'onboarding') completeOnboarding();
      router.replace('/home');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }}>
      <View className="px-5 pb-2 pt-3">
        <Text className="text-xl font-bold text-ink" style={{ fontFamily: AppFonts.displayBold }}>
          {t.reviewTitle}
        </Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="gap-2.5 pb-4">
        {drafts.length === 0 && (
          <Text className="mt-8 text-center text-sm text-muted">{t.reviewEmpty}</Text>
        )}
        {drafts.map((draft) => {
          const matchedPerson = people.find((p) => p.id === draft.matchedPersonId) ?? null;
          return (
            <LineItemCard
              key={draft.id}
              draft={draft}
              matchedPerson={matchedPerson}
              selectPersonLabel={t.selectPerson}
              confirmLabel={t.confirmLine}
              discardLabel={t.discardLine}
              onChange={(patch) => updateDraft(draft.id, patch)}
              onSelectPerson={() => setActiveDraftId(draft.id)}
              onConfirm={() => updateDraft(draft.id, { confirmed: true, matchState: 'confirmed' })}
              onDiscard={() => setDrafts(drafts.filter((d) => d.id !== draft.id))}
            />
          );
        })}
      </ScrollView>

      <View className="px-5 pb-5 pt-2">
        <Pressable
          disabled={confirmedCount === 0 || saving}
          onPress={finish}
          className="rounded-2xl py-4"
          style={{
            backgroundColor: confirmedCount > 0 && !saving ? Porcelain.saffronDeep : Porcelain.line,
          }}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              className="text-center text-base font-bold"
              style={{
                fontFamily: AppFonts.displayBold,
                color: confirmedCount > 0 ? '#fff' : Porcelain.muted,
              }}>
              {t.saveConfirmed(confirmedCount)}
            </Text>
          )}
        </Pressable>
      </View>

      <PickPersonSheet
        visible={activeDraftId !== null}
        mode={sheetMode}
        title={t.whoIsThis}
        matches={activeMatches}
        contacts={deviceContacts}
        nameToken={activeDraft?.nameToken ?? null}
        searchPlaceholder={t.searchContacts}
        fromContactsLabel={t.fromContacts}
        walkInLabel={t.walkIn}
        onPickExisting={(p) => handlePickExisting(p.id)}
        onPickContact={handlePickContact}
        onWalkIn={handleWalkIn}
        onClose={closeSheet}
      />
    </SafeAreaView>
  );
}
