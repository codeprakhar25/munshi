# KhataBol / Munshi — Hackathon Context (2026-07-26)

**Status:** LIVE at Sarvam Epoch Buildathon. Do not forget this session.

## Where we build
- **Host:** Windows directly (NOT Expo-from-WSL hectic path)
- **WSL path (same folder):** `/mnt/d/sarvam-epoch/munshi`
- **Windows path:** `D:\sarvam-epoch\munshi`
- **Shell cwd when working:** `prakh@Prakhar:/mnt/d/sarvam-epoch/munshi`

## Product
- **App:** KhataBol / Munshi — conversational khata for kirana shopkeepers
- **Stack intent:** Expo (Windows) + Sarvam (STT/TTS); HTML prototype lives in `/home/prakh/sarvam-epoch/khatabol` (earlier demo)
- **Core flows:** voice add credit/payment · confirm-lock · identity disambiguation · contacts ask · demo scanner · notify preview
- **UX locks:** list home + floating mic opens full voice mode · no chat bubbles · scanner top-right · no bottom tabs · confirm buttons + voice हाँ/नहीं

## Rules for agents today
1. Default all file work to `/mnt/d/sarvam-epoch/munshi` unless asked otherwise.
2. Assume Expo/dev client runs on **Windows**, not WSL Android glue.
3. Keep shopkeeper UX simple, light, multilingual, voice-first.
4. Ledger = event source of truth (not chat log).
