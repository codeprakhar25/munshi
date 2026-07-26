import { Redirect } from 'expo-router';

/**
 * Removed: dumping the whole address book into people-store hung the app
 * ("2000 contacts ready to map"). Contacts load lazily when the scan picker
 * needs them. This route only exists so old deep-links don't crash.
 */
export default function ContactsImportRemoved() {
  return <Redirect href="/onboarding/map" />;
}
