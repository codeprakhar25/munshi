/**
 * The khata, on the device. One AsyncStorage key holding a JSON document shaped
 * exactly like the POC's khata.json — see ARCHITECTURE.md §1 for why that shape
 * is load-bearing rather than incidental.
 *
 * Entries are append-only and `balance` is derived by `normalizeKhata`/the agent's
 * fold, never assigned here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeKhata } from '@/agent/agent';
import type { Khata } from '@/agent/types';
import { SEED } from '@/db/seed';

const KEY = 'khata.v1';

/** Seeds on first run. Always returns a normalized ledger. */
export async function loadKhata(): Promise<Khata> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return resetKhata();
  try {
    return normalizeKhata(JSON.parse(raw) as Khata);
  } catch {
    // A corrupt blob should not brick the app mid-demo.
    return resetKhata();
  }
}

export async function saveKhata(k: Khata): Promise<Khata> {
  await AsyncStorage.setItem(KEY, JSON.stringify(k));
  return k;
}

/** Restore the demo ledger. One tap between runs. */
export async function resetKhata(): Promise<Khata> {
  const fresh = normalizeKhata(structuredClone(SEED));
  await saveKhata(fresh);
  return fresh;
}

export const totalDue = (k: Khata): number =>
  k.customers.reduce((sum, c) => sum + Math.max(0, c.balance), 0);
