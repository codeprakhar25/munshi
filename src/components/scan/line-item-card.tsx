import { StyleSheet } from 'react-native';

import type { Draft, DraftLineItem } from '@/agent/types';
import { Gradient, PressScale } from '@/components/ui/motion';
import { AppFonts, Porcelain } from '@/constants/theme';
import { itemNet, toggleDirection } from '@/lib/scan-draft-math';
import { Pressable, Text, TextInput, View } from '@/tw';

interface LineItemCardProps {
  draft: Draft;
  selectPersonLabel: string;
  confirmLabel: string;
  discardLabel: string;
  udhaarLabel: string;
  jamaLabel: string;
  netLabel: string;
  alreadyImportedLabel: string;
  onChange: (patch: Partial<Draft>) => void;
  onSelectPerson: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
}

export function LineItemCard({
  draft,
  selectPersonLabel,
  confirmLabel,
  discardLabel,
  udhaarLabel,
  jamaLabel,
  netLabel,
  alreadyImportedLabel,
  onChange,
  onSelectPerson,
  onConfirm,
  onDiscard,
}: LineItemCardProps) {
  const items = draft.items ?? [];
  const imported = !!draft.already_imported;
  const confirmed = !!draft.confirmed;
  const locked = imported || confirmed;
  const person = draft.person;
  const canConfirm =
    !imported && !confirmed && !!person && draft.status === 'ready' && items.length > 0;

  const net = items.length
    ? itemNet(items)
    : (draft.amount ?? 0) * (draft.kind === 'payment' ? -1 : 1);

  function patchItem(id: string, patch: Partial<DraftLineItem>) {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    onChange({ items: next });
  }

  const borderColor = imported
    ? Porcelain.saffron
    : confirmed
      ? Porcelain.leaf
      : Porcelain.line;
  const bg = imported
    ? Porcelain.saffronMist
    : confirmed
      ? Porcelain.leafMist
      : Porcelain.white;

  return (
    <View style={[styles.card, { borderColor, backgroundColor: bg, opacity: imported ? 0.94 : 1 }]}>
      {imported && (
        <View style={styles.importedBadge}>
          <Text
            style={{
              fontFamily: AppFonts.displayBold,
              fontSize: 10,
              letterSpacing: 0.6,
              color: '#fff',
              textTransform: 'uppercase',
            }}>
            {alreadyImportedLabel}
          </Text>
        </View>
      )}

      {confirmed && !imported && (
        <View style={styles.confirmedBadge}>
          <Text
            style={{
              fontFamily: AppFonts.displayBold,
              fontSize: 10,
              color: Porcelain.leaf,
            }}>
            ✓
          </Text>
        </View>
      )}

      {/* Person chip */}
      <PressScale scaleTo={0.98} onPress={onSelectPerson} disabled={locked}>
        <View
          style={[
            styles.personChip,
            {
              backgroundColor: person ? Porcelain.saffronMist : Porcelain.paper2,
              borderWidth: person ? 0 : 1,
              borderColor: Porcelain.line,
            },
          ]}>
          <Text
            style={{
              fontFamily: AppFonts.displayBold,
              fontSize: 13,
              color: person ? Porcelain.saffronDeep : Porcelain.muted,
            }}>
            {person ? person.name : selectPersonLabel}
            {person
              ? ` · ${person.balance < 0 ? '−' : ''}₹${Math.abs(person.balance).toLocaleString('en-IN')}`
              : ''}
          </Text>
        </View>
      </PressScale>

      {/* Itemized rows — direction toggle is the critical control */}
      <View className="gap-2">
        {items.map((item) => {
          const pay = item.direction === 'payment';
          return (
            <View key={item.id} style={styles.itemRow}>
              <TextInput
                value={item.label}
                onChangeText={(v) => patchItem(item.id, { label: v })}
                placeholder="—"
                editable={!locked}
                style={[styles.labelInput, { fontFamily: AppFonts.body }]}
                placeholderTextColor={Porcelain.muted}
              />
              <TextInput
                value={String(item.amount)}
                onChangeText={(v) => {
                  const n = Number(v.replace(/[^\d.]/g, ''));
                  patchItem(item.id, { amount: Number.isFinite(n) ? n : 0 });
                }}
                keyboardType="numeric"
                editable={!locked}
                style={[styles.amountInput, { fontFamily: AppFonts.displaySemiBold }]}
              />
              <Pressable
                onPress={() =>
                  !locked && patchItem(item.id, { direction: toggleDirection(item.direction) })
                }
                disabled={locked}
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

      {/* Net + before → after */}
      <View style={styles.netRow}>
        <View>
          <Text
            style={{
              fontFamily: AppFonts.displayBold,
              fontSize: 10,
              letterSpacing: 0.8,
              color: Porcelain.muted,
              textTransform: 'uppercase',
            }}>
            {netLabel}
          </Text>
          <Text
            style={{
              fontFamily: AppFonts.serifSemiBold,
              fontSize: 22,
              color: net < 0 ? Porcelain.leaf : Porcelain.rose,
              letterSpacing: -0.4,
            }}>
            {net < 0 ? '−' : '+'}₹{Math.abs(net).toLocaleString('en-IN')}
          </Text>
        </View>
        {draft.before != null && draft.after != null && (
          <Text
            style={{
              fontFamily: AppFonts.bodyMedium,
              fontSize: 14,
              color: Porcelain.muted,
            }}>
            ₹{draft.before.toLocaleString('en-IN')} → ₹{draft.after.toLocaleString('en-IN')}
          </Text>
        )}
      </View>

      {!locked && (
        <View className="flex-row gap-2">
          <PressScale scaleTo={0.98} onPress={onDiscard} style={{ flex: 1 }}>
            <View style={styles.discardBtn}>
              <Text
                style={{
                  fontFamily: AppFonts.displayBold,
                  fontSize: 14,
                  color: Porcelain.ink,
                  textAlign: 'center',
                }}>
                {discardLabel}
              </Text>
            </View>
          </PressScale>
          <PressScale
            scaleTo={0.98}
            onPress={onConfirm}
            disabled={!canConfirm}
            style={{ flex: 1, opacity: canConfirm ? 1 : 0.45 }}>
            {canConfirm ? (
              <Gradient
                image="linear-gradient(135deg, #f59e0b 0%, #b45309 100%)"
                style={styles.confirmBtn}>
                <Text
                  style={{
                    fontFamily: AppFonts.displayBold,
                    fontSize: 14,
                    color: '#fff',
                    textAlign: 'center',
                  }}>
                  {confirmLabel}
                </Text>
              </Gradient>
            ) : (
              <View style={[styles.confirmBtn, { backgroundColor: Porcelain.line }]}>
                <Text
                  style={{
                    fontFamily: AppFonts.displayBold,
                    fontSize: 14,
                    color: Porcelain.muted,
                    textAlign: 'center',
                  }}>
                  {confirmLabel}
                </Text>
              </View>
            )}
          </PressScale>
        </View>
      )}
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
  confirmedBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    height: 22,
    width: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Porcelain.leafMist,
  },
  personChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    color: Porcelain.ink,
  },
  dirToggle: {
    minWidth: 72,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Porcelain.line,
    paddingTop: 12,
  },
  discardBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Porcelain.line,
    backgroundColor: Porcelain.paper,
    paddingVertical: 12,
  },
  confirmBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
