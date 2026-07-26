import { StyleSheet } from 'react-native';

import type { Draft, DraftLineItem } from '@/agent/types';
import { PressScale } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { toggleDirection } from '@/lib/scan-draft-math';
import { Pressable, Text, TextInput, View } from '@/tw';

interface LineItemCardProps {
  draft: Draft;
  selectPersonLabel: string;
  udhaarLabel: string;
  jamaLabel: string;
  alreadyImportedLabel: string;
  onChange: (patch: Partial<Draft>) => void;
  onSelectPerson: () => void;
}

/**
 * Scan person-card: person (or select) · item rows with amount + direction.
 * No per-card confirm / skip / net — Save at the bottom writes the list.
 */
export function LineItemCard({
  draft,
  selectPersonLabel,
  udhaarLabel,
  jamaLabel,
  alreadyImportedLabel,
  onChange,
  onSelectPerson,
}: LineItemCardProps) {
  const items = draft.items ?? [];
  const imported = !!draft.already_imported;
  const person = draft.person;
  const needsPerson = !person && !imported;
  // OCR name when matcher didn't attach a contact yet.
  const scannedName = (draft.name_spoken || '').trim();

  function patchItem(id: string, patch: Partial<DraftLineItem>) {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    onChange({ items: next });
  }

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: imported ? Porcelain.saffron : Porcelain.line,
          backgroundColor: imported ? Porcelain.saffronMist : Porcelain.white,
          opacity: imported ? 0.94 : 1,
        },
      ]}>
      {imported && (
        <View style={styles.importedBadge}>
          <Text style={styles.importedText}>{alreadyImportedLabel}</Text>
        </View>
      )}

      {/* Person: chip if matched; else “Select person” (+ show scanned token). */}
      {person ? (
        <PressScale scaleTo={0.98} onPress={onSelectPerson} disabled={imported}>
          <View style={[styles.personChip, { backgroundColor: Porcelain.saffronMist }]}>
            <Text style={[styles.personText, { color: Porcelain.saffronDeep }]} numberOfLines={1}>
              {person.name}
            </Text>
          </View>
        </PressScale>
      ) : needsPerson ? (
        <View className="gap-1.5">
          {scannedName ? (
            <Text style={styles.scannedHint} numberOfLines={2}>
              {scannedName}
            </Text>
          ) : null}
          <PressScale scaleTo={0.98} onPress={onSelectPerson}>
            <View style={[styles.personChip, styles.selectChip]}>
              <Text style={[styles.personText, { color: Porcelain.muted }]}>
                {selectPersonLabel}
              </Text>
            </View>
          </PressScale>
        </View>
      ) : null}

      <View className="gap-2">
        {items.map((item) => {
          const pay = item.direction === 'payment';
          return (
            <View key={item.id} style={styles.itemRow}>
              <TextInput
                value={item.label}
                onChangeText={(v) => patchItem(item.id, { label: v })}
                placeholder="—"
                editable={!imported}
                style={styles.labelInput}
                placeholderTextColor={Porcelain.muted}
              />
              <TextInput
                value={String(item.amount)}
                onChangeText={(v) => {
                  const n = Number(v.replace(/[^\d.]/g, ''));
                  patchItem(item.id, { amount: Number.isFinite(n) ? n : 0 });
                }}
                keyboardType="numeric"
                editable={!imported}
                style={styles.amountInput}
              />
              <Pressable
                onPress={() =>
                  !imported && patchItem(item.id, { direction: toggleDirection(item.direction) })
                }
                disabled={imported}
                style={[
                  styles.dirToggle,
                  { backgroundColor: pay ? Porcelain.leafMist : Porcelain.roseMist },
                ]}>
                <Text
                  style={{
                    fontFamily: AppFonts.displayBold,
                    fontSize: 11,
                    color: pay ? Porcelain.leaf : Porcelain.rose,
                    textAlign: 'center',
                  }}>
                  {pay ? jamaLabel : udhaarLabel}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {items.length === 0 && (
          <Text style={{ fontFamily: AppFonts.body, fontSize: 12, color: Porcelain.muted }}>—</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#1c1917',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  importedBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Porcelain.saffronDeep,
  },
  importedText: {
    fontFamily: AppFonts.displayBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: '#fff',
    textTransform: 'uppercase',
  },
  personChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  selectChip: {
    backgroundColor: Porcelain.paper2,
    borderWidth: 1,
    borderColor: Porcelain.line,
  },
  personText: {
    fontFamily: AppFonts.displayBold,
    fontSize: 13,
  },
  scannedHint: {
    fontFamily: AppFonts.body,
    fontSize: 13,
    color: Porcelain.ink,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.paper,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  labelInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: AppFonts.body,
    color: Porcelain.ink,
    paddingVertical: 4,
  },
  amountInput: {
    width: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.white,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'right',
    fontSize: 14,
    fontFamily: AppFonts.displaySemiBold,
    color: Porcelain.ink,
  },
  dirToggle: {
    minWidth: 72,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});
