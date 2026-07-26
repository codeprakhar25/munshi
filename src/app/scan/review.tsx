import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { commitDrafts } from '@/agent/agent';
import type { Draft, DraftPerson } from '@/agent/types';
import { LineItemCard } from '@/components/scan/line-item-card';
import { PickPersonSheet } from '@/components/scan/pick-person-sheet';
import { LineButton, SaffronButton } from '@/components/ui/buttons';
import { AmbientBackdrop, Rise } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { loadKhata, saveKhata } from '@/db/khata';
import { useStrings } from '@/lib/i18n';
import { ensureCustomersForDrafts } from '@/lib/khata-sync';
import { priceDraft } from '@/lib/scan-draft-math';
import { attachPerson } from '@/lib/sarvam/scan-parsing';
import { ScrollView, Text, View } from '@/tw';
import { useDeviceContactsStore } from '@/store/device-contacts-store';
import { useOnboardingStore } from '@/store/onboarding-store';
import { usePeopleStore } from '@/store/people-store';
import { type ScanEntry, useScanStore } from '@/store/scan-store';

function personFromPeople(
  p: { id: string; name: string; phone: string | null; aliases: string[] },
  balance = 0,
  fromContacts = false,
): DraftPerson {
  return {
    id: p.id,
    name: p.name,
    name_en: p.name,
    balance,
    phone: p.phone,
    from_contacts: fromContacts,
  };
}

export default function ScanReviewScreen() {
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  const entry: ScanEntry = entryParam === 'onboarding' ? 'onboarding' : 'general';
  const language = useOnboardingStore((s) => s.language);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const t = useStrings(language);

  const drafts = useScanStore((s) => s.drafts);
  const updateDraft = useScanStore((s) => s.updateDraft);
  const setDrafts = useScanStore((s) => s.setDrafts);
  const setSource = useScanStore((s) => s.setSource);
  const resetScan = useScanStore((s) => s.reset);

  const addPerson = usePeopleStore((s) => s.addPerson);
  const deviceContacts = useDeviceContactsStore((s) => s.contacts);

  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeDraft = drafts.find((d) => d.id === activeDraftId) ?? null;
  const sheetMode: 'pick' | 'contacts' =
    activeDraft && activeDraft.options.length > 0 ? 'pick' : 'contacts';

  const sheetMatches: DraftPerson[] = useMemo(() => {
    if (!activeDraft) return [];
    return activeDraft.options.length ? activeDraft.options : [];
  }, [activeDraft]);

  function closeSheet() {
    setActiveDraftId(null);
  }

  function reprice(draft: Draft, person: DraftPerson | null): Partial<Draft> {
    const bal = person?.balance ?? 0;
    return priceDraft({ ...draft, person }, bal);
  }

  function handlePickExisting(person: DraftPerson) {
    if (!activeDraftId) return;
    const draft = drafts.find((d) => d.id === activeDraftId);
    if (!draft) return;
    updateDraft(activeDraftId, attachPerson(draft, person));
    closeSheet();
  }

  function handlePickContact(contact: { name: string; phone: string | null; id: string }) {
    if (!activeDraftId) return;
    const draft = drafts.find((d) => d.id === activeDraftId);
    if (!draft) return;
    const firstName = contact.name.split(' ')[0];
    const person = addPerson({
      name: contact.name,
      aliases: [firstName, contact.name],
      phone: contact.phone,
      source: 'contact',
      contactId: contact.id,
    });
    updateDraft(activeDraftId, attachPerson(draft, personFromPeople(person, 0, true)));
    closeSheet();
  }

  function handleWalkIn(name: string) {
    if (!activeDraftId) return;
    const draft = drafts.find((d) => d.id === activeDraftId);
    if (!draft) return;
    const person = addPerson({
      name,
      aliases: [name],
      phone: null,
      source: 'walk-in',
    });
    updateDraft(activeDraftId, attachPerson(draft, personFromPeople(person, 0)));
    closeSheet();
  }

  function onCardChange(id: string, patch: Partial<Draft>) {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    const next = { ...draft, ...patch };
    const priced = reprice(next, next.person);
    updateDraft(id, { ...patch, ...priced, confirmed: false });
  }

  const confirmedCount = drafts.filter((d) => d.confirmed && !d.already_imported).length;

  async function addMore() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setSource(result.assets[0].uri, 'image', entry, { append: true });
    router.push(`/scan/processing?entry=${entry}`);
  }

  async function finish() {
    if (saving || confirmedCount === 0) return;
    setSaving(true);
    try {
      const khata = await loadKhata();
      const confirmed = useScanStore
        .getState()
        .drafts
        .filter((d) => d.confirmed && !d.already_imported && d.status === 'ready');

      const expanded: Draft[] = [];
      for (const d of confirmed) {
        const items = d.items ?? [];
        if (!items.length) {
          expanded.push({ ...d, status: 'ready' });
          continue;
        }
        for (const item of items) {
          expanded.push({
            ...d,
            id: item.id,
            kind: item.direction === 'payment' ? 'payment' : 'udhaar',
            amount: item.amount,
            label: item.label || d.label,
            status: 'ready',
            items: undefined,
            confirmed: true,
          });
        }
      }

      const ready = ensureCustomersForDrafts(khata, expanded);
      commitDrafts(khata, ready);
      await saveKhata(khata);
      resetScan();
      if (entry === 'onboarding') completeOnboarding();
      router.replace('/home');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Porcelain.paper }} edges={['top', 'bottom']}>
      <AmbientBackdrop image="radial-gradient(circle at 85% 0%, #ffedd5 0%, rgba(255,237,213,0) 50%)" />
      <AmbientBackdrop image="radial-gradient(circle at 0% 100%, #e0e7ff 0%, rgba(224,231,255,0) 42%)" />

      <View className="px-5 pb-3 pt-2">
        <Text
          style={{
            fontFamily: AppFonts.serifSemiBold,
            fontSize: 26,
            color: Porcelain.ink,
            letterSpacing: -0.6,
          }}>
          {t.reviewTitle}
        </Text>
        <Text
          style={{
            fontFamily: AppFonts.body,
            fontSize: 14,
            color: Porcelain.muted,
            marginTop: 4,
          }}>
          {t.reviewSubtitle(drafts.length)}
        </Text>
        {confirmedCount > 0 && (
          <View style={styles.progressPill}>
            <Text
              style={{
                fontFamily: AppFonts.displayBold,
                fontSize: 12,
                color: Porcelain.saffronDeep,
              }}>
              {confirmedCount}/{drafts.filter((d) => !d.already_imported).length} ✓
            </Text>
          </View>
        )}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="gap-3 pb-6">
        {drafts.length === 0 && (
          <Text
            className="mt-10 text-center"
            style={{ fontFamily: AppFonts.body, color: Porcelain.muted }}>
            {t.reviewEmpty}
          </Text>
        )}
        {drafts.map((draft, i) => (
          <Rise key={draft.id} index={Math.min(i, 6)}>
            <LineItemCard
              draft={draft}
              selectPersonLabel={t.selectPerson}
              confirmLabel={t.confirmLine}
              discardLabel={t.discardLine}
              udhaarLabel={t.udhaarShort}
              jamaLabel={t.jamaShort}
              netLabel={t.netLabel}
              alreadyImportedLabel={t.alreadyImported}
              onChange={(patch) => onCardChange(draft.id, patch)}
              onSelectPerson={() => setActiveDraftId(draft.id)}
              onConfirm={() => updateDraft(draft.id, { confirmed: true })}
              onDiscard={() => setDrafts(drafts.filter((d) => d.id !== draft.id))}
            />
          </Rise>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {saving ? (
          <View style={styles.savingBar}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <>
            <SaffronButton
              label={t.saveConfirmed(confirmedCount)}
              onPress={finish}
              disabled={confirmedCount === 0}
            />
            <LineButton label={t.addMorePages} onPress={addMore} style={{ marginTop: 10 }} />
          </>
        )}
      </View>

      <PickPersonSheet
        visible={activeDraftId !== null}
        mode={sheetMode}
        title={t.whoIsThis}
        matches={sheetMatches}
        contacts={deviceContacts}
        nameToken={activeDraft?.name_spoken ?? null}
        searchPlaceholder={t.searchContacts}
        fromContactsLabel={t.fromContacts}
        walkInLabel={t.walkIn}
        onPickExisting={handlePickExisting}
        onPickContact={handlePickContact}
        onWalkIn={handleWalkIn}
        onClose={closeSheet}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progressPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Porcelain.saffronMist,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Porcelain.line,
    backgroundColor: 'rgba(251,249,246,0.92)',
  },
  savingBar: {
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 16,
    backgroundColor: Porcelain.saffronDeep,
  },
});
