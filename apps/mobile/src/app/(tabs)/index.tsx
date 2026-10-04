import { Redirect } from 'expo-router';

import { useCz } from '@/context/prefs';
import FarmerHome from '@/screens/farm/farm-home';
import Home from '@/screens/home/home';

/** S04 Home, or F01 Farmer home in farmer mode. First launch goes through onboarding. */
export default function HomeTab() {
  const { prefs } = useCz();
  if (!prefs.onboarded) return <Redirect href="/onboarding/welcome" />;
  return prefs.farmer ? <FarmerHome /> : <Home />;
}
