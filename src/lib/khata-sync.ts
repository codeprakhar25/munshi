/**
 * Bridge people-store ↔ khata customers, and OCR drafts → ledger writes.
 */
import { deriveBalance, normalizeKhata } from '@/agent/agent';
import type { Customer, Entry, Khata } from '@/agent/types';
import { saveKhata } from '@/db/khata';
import type { Person } from '@/store/people-store';
import type { ScanLineDraft } from '@/store/scan-store';

function nextId(prefix: string, used: string[]): string {
  let n = 1;
  while (used.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Ensure every mapped person exists as a khata customer (for voice matching). */
export function mergePeopleIntoKhata(khata: Khata, people: Person[]): Khata {
  const next = structuredClone(khata);
  for (const p of people) {
    const phone = p.phone ?? null;
    let cust = next.customers.find(
      (c) => c.id === p.id || (phone && c.phone === phone) || c.name_en.toLowerCase() === p.name.toLowerCase()
    );
    if (!cust) {
      cust = {
        id: p.id.startsWith('c') || p.id.startsWith('p_') ? p.id : nextId('c', next.customers.map((c) => c.id)),
        name: p.name,
        name_en: p.name,
        aliases: p.aliases.length ? [...p.aliases] : [p.name.split(' ')[0]],
        phone,
        balance: 0,
        entries: [],
      };
      next.customers.push(cust);
    } else {
      const aliases = new Set([...(cust.aliases || []), ...p.aliases, p.name.split(' ')[0]]);
      cust.aliases = [...aliases].filter(Boolean);
      if (phone) cust.phone = phone;
      cust.name = p.name;
      cust.name_en = p.name;
    }
  }
  return normalizeKhata(next);
}

export async function persistPeopleIntoKhata(khata: Khata, people: Person[]): Promise<Khata> {
  return saveKhata(mergePeopleIntoKhata(khata, people));
}

/** Write confirmed OCR lines into the passbook. */
export async function commitScanDrafts(
  khata: Khata,
  drafts: ScanLineDraft[],
  people: Person[]
): Promise<{ khata: Khata; count: number }> {
  let next = mergePeopleIntoKhata(khata, people);
  const ts = new Date().toISOString();
  let count = 0;

  for (const d of drafts) {
    if (!d.confirmed || d.amount == null || d.amount <= 0) continue;

    let cust: Customer | undefined;
    if (d.matchedPersonId) {
      cust = next.customers.find((c) => c.id === d.matchedPersonId);
      const person = people.find((p) => p.id === d.matchedPersonId);
      if (!cust && person) {
        next = mergePeopleIntoKhata(next, [person]);
        cust = next.customers.find(
          (c) => c.id === person.id || c.name_en.toLowerCase() === person.name.toLowerCase()
        );
      }
    }
    if (!cust) {
      const name = d.nameToken || d.particulars || 'Walk-in';
      cust = {
        id: nextId('c', next.customers.map((c) => c.id)),
        name,
        name_en: name,
        aliases: [name],
        phone: null,
        balance: 0,
        entries: [],
      };
      next.customers.push(cust);
    }

    const before = cust.balance;
    const action = d.type === 'payment' ? 'payment' : 'new_udhaar';
    const after = d.type === 'payment' ? before - d.amount : before + d.amount;
    const entry: Entry = {
      ts,
      action,
      amount: d.amount,
      before,
      after,
      label: d.particulars || d.rawText || undefined,
    };
    cust.entries.push(entry);
    cust.balance = deriveBalance(cust.entries);
    next.audit.push({ ...entry, customer_id: cust.id });
    count += 1;
  }

  next = normalizeKhata(next);
  await saveKhata(next);
  return { khata: next, count };
}
