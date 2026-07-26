import type { Entry, Khata } from '@/agent/types';

/**
 * Demo ledger. Seeded into AsyncStorage on first run; resetKhata() restores it.
 *
 * Two Rameshes on purpose — Kumar and Joshi. "Ramesh ne 200 diye" is therefore
 * genuinely ambiguous, which is what exercises the pick_person path instead of
 * leaving it theoretical.
 *
 * Each customer gets a scripted passbook (HISTORY below) whose fold equals the
 * `balance` figure on the row — so the person screen opens onto a lived-in
 * timeline instead of a single synthetic "opening" entry.
 */

/** [daysAgo, action, amount, label] — before/after and timestamps are derived. */
type HistoryRow = [number, 'new_udhaar' | 'payment', number, string];

const HISTORY: Record<string, HistoryRow[]> = {
  c1: [[12, 'new_udhaar', 120, 'दूध'], [9, 'new_udhaar', 260, 'चीनी'], [5, 'new_udhaar', 320, 'दूध-दही'], [2, 'payment', 200, 'जमा']],
  c2: [[14, 'new_udhaar', 480, 'आटा'], [10, 'new_udhaar', 350, 'तेल'], [6, 'new_udhaar', 620, 'किराना सामान'], [3, 'payment', 200, 'जमा']],
  c3: [[8, 'new_udhaar', 45, 'बीड़ी'], [4, 'new_udhaar', 60, 'माचिस-बीड़ी'], [1, 'payment', 20, 'जमा']],
  c4: [[11, 'new_udhaar', 180, 'साबुन'], [7, 'new_udhaar', 150, 'शैम्पू'], [4, 'new_udhaar', 250, 'किराना'], [2, 'payment', 150, 'जमा']],
  c5: [[15, 'new_udhaar', 900, 'चावल'], [9, 'new_udhaar', 700, 'दाल-चावल'], [5, 'new_udhaar', 800, 'किराना सामान'], [3, 'payment', 300, 'जमा']],
  c6: [[6, 'new_udhaar', 120, 'नमकीन'], [3, 'new_udhaar', 95, 'गुटखा'], [1, 'new_udhaar', 60, 'नमकीन']],
  c7: [[10, 'new_udhaar', 240, 'बिस्कुट-चाय'], [6, 'new_udhaar', 180, 'चाय पत्ती'], [2, 'new_udhaar', 200, 'बिस्कुट'], [2, 'payment', 100, 'जमा']],
  c8: [[9, 'new_udhaar', 200, 'चाय पत्ती'], [5, 'new_udhaar', 240, 'किराना'], [2, 'payment', 100, 'जमा']],
};

function entriesFor(id: string): Entry[] {
  const rows = HISTORY[id] ?? [];
  let bal = 0;
  return rows.map(([daysAgo, action, amount, label], i) => {
    const before = bal;
    bal = action === 'payment' ? bal - amount : bal + amount;
    // Shop hours, morning-ish, minutes varied so same-day rows keep their order.
    const ts = new Date(Date.now() - daysAgo * 86_400_000);
    ts.setHours(9 + (i % 3) * 2, 10 + i * 7, 0, 0);
    return { ts: ts.toISOString(), action, amount, before, after: bal, label };
  });
}

const RAW: Khata = {
  "shop": "राज किराना स्टोर",
  "currency": "INR",
  "customers": [
    {
      "id": "c1",
      "name": "रमेश कुमार",
      "name_en": "Ramesh Kumar",
      "aliases": [
        "रमेश",
        "Ramesh",
        "ramesh bhai",
        "रमेश भाई"
      ],
      "items": "दूध, चीनी",
      "lang": "hi-IN",
      "phone": null,
      "balance": 500,
      "entries": []
    },
    {
      "id": "c2",
      "name": "सुनीता देवी",
      "name_en": "Sunita Devi",
      "aliases": [
        "सुनीता",
        "Sunita",
        "sunita ji"
      ],
      "items": "आटा, तेल",
      "lang": "hi-IN",
      "phone": null,
      "balance": 1250,
      "entries": []
    },
    {
      "id": "c3",
      "name": "अब्दुल मियाँ",
      "name_en": "Abdul Miyan",
      "aliases": [
        "अब्दुल",
        "Abdul",
        "abdul bhai"
      ],
      "items": "बीड़ी, माचिस",
      "lang": "ur-IN",
      "phone": null,
      "balance": 85,
      "entries": []
    },
    {
      "id": "c4",
      "name": "लक्ष्मी बेन",
      "name_en": "Lakshmi Ben",
      "aliases": [
        "लक्ष्मी",
        "Lakshmi",
        "laxmi",
        "lakshmi ben"
      ],
      "items": "साबुन, शैम्पू",
      "lang": "mr-IN",
      "phone": null,
      "balance": 430,
      "entries": []
    },
    {
      "id": "c5",
      "name": "गोपाल यादव",
      "name_en": "Gopal Yadav",
      "aliases": [
        "गोपाल",
        "Gopal",
        "gopal bhai"
      ],
      "items": "चावल, दाल",
      "lang": "hi-IN",
      "phone": null,
      "balance": 2100,
      "entries": []
    },
    {
      "id": "c6",
      "name": "हरी सिंह",
      "name_en": "Hari Singh",
      "aliases": [
        "हरी",
        "Hari",
        "hari ji"
      ],
      "items": "गुटखा, नमकीन",
      "lang": "pa-IN",
      "phone": null,
      "balance": 275,
      "entries": []
    },
    {
      "id": "c7",
      "name": "कविता शर्मा",
      "name_en": "Kavita Sharma",
      "aliases": [
        "कविता",
        "Kavita",
        "kavita di"
      ],
      "items": "बिस्कुट, चाय",
      "lang": "bn-IN",
      "phone": null,
      "balance": 520,
      "entries": []
    },
    {
      "id": "c8",
      "name": "रमेश जोशी",
      "name_en": "Ramesh Joshi",
      "aliases": [
        "रमेश",
        "Ramesh",
        "ramesh joshi",
        "रमेश जोशी",
        "joshi",
        "जोशी"
      ],
      "items": "चाय पत्ती",
      "lang": "mr-IN",
      "phone": null,
      "balance": 340,
      "entries": []
    }
  ],
  "audit": []
};

export const SEED: Khata = {
  ...RAW,
  customers: RAW.customers.map((c) => ({ ...c, entries: entriesFor(c.id) })),
};
