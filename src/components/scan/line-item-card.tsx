import { Pressable, Text, TextInput, View } from '@/tw';
import type { Person } from '@/store/people-store';
import type { ScanLineDraft } from '@/store/scan-store';

interface LineItemCardProps {
  draft: ScanLineDraft;
  matchedPerson: Person | null;
  selectPersonLabel: string;
  confirmLabel: string;
  discardLabel: string;
  onChange: (patch: Partial<ScanLineDraft>) => void;
  onSelectPerson: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
}

export function LineItemCard({
  draft,
  matchedPerson,
  selectPersonLabel,
  confirmLabel,
  discardLabel,
  onChange,
  onSelectPerson,
  onConfirm,
  onDiscard,
}: LineItemCardProps) {
  const canConfirm = !!matchedPerson && !draft.confirmed;

  return (
    <View
      className={`gap-2.5 rounded-2xl border p-3.5 ${
        draft.confirmed ? 'border-success bg-success-soft' : 'border-line bg-surface'
      }`}>
      <View className="flex-row gap-2">
        <TextInput
          value={draft.date ?? ''}
          onChangeText={(v) => onChange({ date: v })}
          placeholder="Date"
          editable={!draft.confirmed}
          className="w-24 rounded-lg border border-line bg-app-bg px-2.5 py-2 text-sm text-ink"
        />
        <TextInput
          value={draft.amount !== null ? String(draft.amount) : ''}
          onChangeText={(v) => onChange({ amount: v ? Number(v.replace(/[^\d.]/g, '')) : null })}
          placeholder="₹ amount"
          keyboardType="numeric"
          editable={!draft.confirmed}
          className="flex-1 rounded-lg border border-line bg-app-bg px-2.5 py-2 text-sm text-ink"
        />
      </View>

      <TextInput
        value={draft.particulars}
        onChangeText={(v) => onChange({ particulars: v })}
        placeholder="Item / particulars"
        editable={!draft.confirmed}
        className="rounded-lg border border-line bg-app-bg px-2.5 py-2 text-sm text-ink"
      />

      <Pressable
        onPress={onSelectPerson}
        disabled={draft.confirmed}
        className={`self-start rounded-full px-3 py-1.5 ${matchedPerson ? 'bg-accent-soft' : 'border border-line bg-app-bg'}`}>
        <Text className={`text-xs font-bold ${matchedPerson ? 'text-accent' : 'text-muted'}`}>
          {matchedPerson ? matchedPerson.name : selectPersonLabel}
        </Text>
      </Pressable>

      {!draft.confirmed && (
        <View className="flex-row gap-2">
          <Pressable onPress={onDiscard} className="flex-1 rounded-xl border border-line bg-app-bg py-2.5">
            <Text className="text-center text-sm font-bold text-ink">{discardLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={!canConfirm}
            className={`flex-1 rounded-xl py-2.5 ${canConfirm ? 'bg-accent' : 'bg-line'}`}>
            <Text className={`text-center text-sm font-bold ${canConfirm ? 'text-white' : 'text-muted'}`}>
              {confirmLabel}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
