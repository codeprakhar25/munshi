import { Redirect } from 'expo-router';

/** Tabs retired — product home is /home. */
export default function ExploreRedirect() {
  return <Redirect href="/home" />;
}
