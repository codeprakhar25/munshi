import { AppFonts, Porcelain } from '@/constants/theme';
import { itemNet, toggleDirection } from '@/lib/scan-draft-math';
import { Pressable, Text, TextInput, View } from '@/tw';
import type { Draft, DraftLineItem } from '@/agent/types';

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
  const canConfirm = !imported && !confirmed && !!person && draft.status === 'ready' && items.length > 0;

  const net = items.length ? itemNet(items) : (draft.amount ?? 0) * (draft.kind === 'payment' ? -1 : 1);

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
    <View
      className="gap-3 rounded-2xl border p-3.5"
      style={{ borderColor, backgroundColor: bg, opacity: imported ? 0.92 : 1 }}>
      {imported && (
        <View
          className="self-start rounded-full px-2.5 py-1"
          style={{ backgroundColor: Porcelain.saffronDeep }}>
          <Text className="text-[10px] font-bold uppercase tracking-wide text-white">
            {alreadyImportedLabel}
          </Text>
        </View>
      )}

      {/* Person chip */}
      <Pressable
        onPress={onSelectPerson}
        disabled={locked}
        className="self-start rounded-full px-3 py-1.5"
        style={{
          backgroundColor: person ? Porcelain.saffronMist : Porcelain.paper2,
          borderWidth: person ? 0 : 1,
          borderColor: Porcelain.line,
        }}>
        <Text
          className="text-xs font-bold"
          style={{
            fontFamily: AppFonts.displayBold,
            color: person ? Porcelain.saffronDeep : Porcelain.muted,
          }}>
          {person ? person.name : selectPersonLabel}
          {person
            ? ` · ${person.balance < 0 ? '−' : ''}₹${Math.abs(person.balance).toLocaleString('en-IN')}`
            : ''}
        </Text>
      </Pressable>

      {/* Itemized rows — direction toggle is the critical control */}
      <View className="gap-2">
        {items.map((item) => {
          const pay = item.direction === 'payment';
          return (
            <View
              key={item.id}
              className="flex-row items-center gap-2 rounded-xl border border-line px-2.5 py-2"
              style={{ backgroundColor: Porcelain.paper }}>
              <TextInput
                value={item.label}
                onChangeText={(v) => patchItem(item.id, { label: v })}
                placeholder="—"
                editable={!locked}
                className="min-w-0 flex-1 text-sm text-ink"
                style={{ fontFamily: AppFonts.body }}
              />
              <TextInput
                value={String(item.amount)}
                onChangeText={(v) => {
                  const n = Number(v.replace(/[^\d.]/g, ''));
                  patchItem(item.id, { amount: Number.isFinite(n) ? n : 0 });
                }}
                keyboardType="numeric"
                editable={!locked}
                className="w-16 rounded-lg border border-line px-2 py-1.5 text-right text-sm text-ink"
                style={{ backgroundColor: Porcelain.white, fontFamily: AppFonts.displaySemiBold }}
              />
              <Pressable
                onPress={() => !locked && patchItem(item.id, { direction: toggleDirection(item.direction) })}
                disabled={locked}
                className="min-w-[72px] rounded-full px-2.5 py-1.5"
                style={{
                  backgroundColor: pay ? Porcelain.leafMist : Porcelain.roseMist,
                }}>
                <Text
                  className="text-center text-[11px] font-bold"
                  style={{ color: pay ? Porcelain.leaf : Porcelain.rose, fontFamily: AppFonts.displayBold }}>
                  {pay ? jamaLabel : udhaarLabel}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {items.length === 0 && (
          <Text className="text-xs text-muted">—</Text>
        )}
      </View>

      {/* Net + before → after */}
      <View className="flex-row items-end justify-between border-t border-line pt-2.5">
        <View>
          <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">{netLabel}</Text>
          <Text
            style={{
              fontFamily: AppFonts.displayBold,
              fontSize: 20,
              color: net < 0 ? Porcelain.leaf : Porcelain.rose,
            }}>
            {net < 0 ? '−' : '+'}₹{Math.abs(net).toLocaleString('en-IN')}
          </Text>
        </View>
        {draft.before != null && draft.after != null && (
          <Text className="text-sm text-muted" style={{ fontFamily: AppFonts.bodyMedium }}>
            ₹{draft.before.toLocaleString('en-IN')} → ₹{draft.after.toLocaleString('en-IN')}
          </Text>
        )}
      </View>

      {!locked && (
        <View className="flex-row gap-2">
          <Pressable onPress={onDiscard} className="flex-1 rounded-xl border border-line bg-app-bg py-2.5">
            <Text className="text-center text-sm font-bold text-ink">{discardLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={!canConfirm}
            className="flex-1 rounded-xl py-2.5"
            style={{ backgroundColor: canConfirm ? Porcelain.saffronDeep : Porcelain.line }}>
            <Text
              className="text-center text-sm font-bold"
              style={{ color: canConfirm ? '#fff' : Porcelain.muted }}>
              {confirmLabel}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
