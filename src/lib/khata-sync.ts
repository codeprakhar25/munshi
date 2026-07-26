/**
 * Bridge people-store ↔ khata customers.
 * Scan commits go through agent `commitDrafts` from the review screen.
 */
import { normalizeKhata } from '@/agent/agent';
import type { Draft, DraftPerson, Khata } from '@/agent/types';
import { saveKhata } from '@/db/khata';
import type { Person } from '@/store/people-store';

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

/**
 * Ensure every draft person exists as a khata customer before `commitDrafts`.
 * Contact-sourced cards often arrive with `customer_id: null` + `from_contacts`.
 * Mutates `khata` and returns patched drafts with `customer_id` filled.
 */
export function ensureCustomersForDrafts(khata: Khata, drafts: Draft[]): Draft[] {
  const used = khata.customers.map((c) => c.id);

  const upsert = (person: DraftPerson, preferredId: string | null): string => {
    const phone = person.phone ?? null;
    const existing = khata.customers.find(
      (c) =>
        (preferredId && c.id === preferredId) ||
        (phone && c.phone === phone) ||
        c.name_en.toLowerCase() === (person.name_en || person.name).toLowerCase() ||
        c.name === person.name,
    );
    if (existing) {
      if (phone) existing.phone = phone;
      const aliases = new Set([...(existing.aliases || []), person.name.split(' ')[0], person.name_en]);
      existing.aliases = [...aliases].filter(Boolean) as string[];
      return existing.id;
    }
    const id =
      preferredId && !used.includes(preferredId)
        ? preferredId
        : nextId('c', used);
    used.push(id);
    khata.customers.push({
      id,
      name: person.name,
      name_en: person.name_en || person.name,
      aliases: [person.name.split(' ')[0], person.name_en].filter(Boolean) as string[],
      phone,
      balance: 0,
      entries: [],
    });
    return id;
  };

  return drafts.map((d) => {
    if (!d.person) return d;
    const customer_id = upsert(d.person, d.customer_id);
    return { ...d, customer_id };
  });
}
