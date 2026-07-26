import type { Person } from '@/store/people-store';

const STOPWORDS_RE = /को|का|के|ने|ला|ले|paid|दिए|दिये|दिले|रुपये|₹|rs\.?/gi;

export function extractNameToken(text: string, people: Person[]): string | null {
  const lower = text.toLowerCase();
  for (const p of people) {
    for (const a of p.aliases) {
      if (lower.includes(a.toLowerCase()) || text.includes(a)) return a;
    }
  }
  const cleaned = text
    .replace(STOPWORDS_RE, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').filter((w) => w.length > 1)[0] ?? null;
}

export function findMatches(nameToken: string | null, people: Person[]): Person[] {
  if (!nameToken) return [];
  const n = nameToken.toLowerCase();
  return people.filter(
    (p) =>
      p.aliases.some((a) => a.toLowerCase().includes(n) || n.includes(a.toLowerCase())) ||
      p.name.toLowerCase().includes(n)
  );
}
