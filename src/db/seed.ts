import type { Khata } from '@/agent/types';

/**
 * Demo ledger. Seeded into AsyncStorage on first run; resetKhata() restores it.
 *
 * Two Rameshes on purpose — Kumar and Joshi. "Ramesh ne 200 diye" is therefore
 * genuinely ambiguous, which is what exercises the pick_person path instead of
 * leaving it theoretical.
 *
 * Balances here are opening figures; normalizeKhata() turns each into an
 * `opening` entry so balance stays derived from the passbook.
 */
export const SEED: Khata = {
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
