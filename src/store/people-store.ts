import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { findMatches as findMatchesImpl } from '@/lib/matching';

export interface Person {
  id: string;
  name: string;
  aliases: string[];
  phone: string | null;
  source: 'contact' | 'walk-in';
  contactId?: string;
}

interface PeopleState {
  people: Person[];
  setPeople: (people: Person[]) => void;
  addPerson: (p: Omit<Person, 'id'>) => Person;
  setAlias: (id: string, alias: string) => void;
  findMatches: (nameToken: string | null) => Person[];
}

export const DEMO_PEOPLE: Omit<Person, 'id'>[] = [
  { name: 'Rajesh Sharma', aliases: ['राजेश'], phone: '+91 98765 44001', source: 'contact' },
  { name: 'Seema Devi', aliases: ['सीमा'], phone: '+91 98765 44003', source: 'contact' },
  { name: 'Amit Kumar', aliases: ['अमित'], phone: '+91 98765 44004', source: 'contact' },
  { name: 'Priya Nair', aliases: ['प्रिया'], phone: '+91 98765 11101', source: 'contact' },
  { name: 'Ramesh Uncle', aliases: ['रमेश'], phone: '+91 98765 11102', source: 'contact' },
];

export const usePeopleStore = create<PeopleState>()(
  persist(
    (set, get) => ({
      people: [],
      setPeople: (people) => set({ people }),
      addPerson: (p) => {
        const person: Person = { ...p, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
        set((state) => ({ people: [...state.people, person] }));
        return person;
      },
      setAlias: (id, alias) =>
        set((state) => ({
          people: state.people.map((p) =>
            p.id === id ? { ...p, aliases: [alias.trim() || p.aliases[0] || p.name.split(' ')[0]] } : p
          ),
        })),
      findMatches: (nameToken) => findMatchesImpl(nameToken, get().people),
    }),
    {
      name: 'munshi/people',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
