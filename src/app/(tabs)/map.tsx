import { useCz } from '@/context/prefs';
import MyFields from '@/screens/farm/fields';
import HeatMap from '@/screens/map/heat-map';

/** S05 Heat map, or F03 My fields in farmer mode. */
export default function MapTab() {
  const { prefs } = useCz();
  return prefs.farmer ? <MyFields /> : <HeatMap />;
}
