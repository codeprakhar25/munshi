import { Redirect } from 'expo-router';

/** Tabs retired — product home is /home. */
export default function TabsHomeRedirect() {
  return <Redirect href="/home" />;
}
