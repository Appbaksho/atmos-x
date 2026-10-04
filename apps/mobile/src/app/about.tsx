import React from 'react';
import { Linking, View } from 'react-native';

import { Card, I, Icon, Screen, ScreenHeader, Txt } from '@/components/cz/ui';
import { useCz } from '@/context/prefs';

const SECTIONS: { icon: string; title: string; body: string; link?: string }[] = [
  {
    icon: I.sat,
    title: 'Land surface temperature: NASA MODIS & Landsat',
    body: 'Roof & road temperatures come from satellite land surface temperature (MODIS MOD11A2 at 1 km, refined with Landsat 9 at 30 m). Clouds are removed by taking the median of recent clear passes.',
    link: 'https://modis.ornl.gov/data/modis_webservice.html',
  },
  {
    icon: I.lst,
    title: 'How heat zones are found',
    body: 'Each cell is compared with the neighbourhood median. Cells at least 1 °C hotter are grouped into zones and ranked. Scores within ±3 are flagged as near-ties instead of being ranked.',
  },
  {
    icon: I.sun,
    title: 'Air temperature: NASA POWER & Open-Meteo',
    body: 'Air temperature and its anomaly vs. the 2001–2020 normal come from NASA POWER. “Feels like” uses the NOAA heat index from the live Open-Meteo forecast.',
    link: 'https://power.larc.nasa.gov/',
  },
  {
    icon: I.drop,
    title: 'Air quality',
    body: 'PM2.5 blends reference stations, humidity-corrected community sensors (OpenAQ, Sensor.Community) and the NASA GEOS-CF forecast, compared with the WHO 24-hour guideline of 15 μg/m³.',
    link: 'https://gmao.gsfc.nasa.gov/weather_prediction/GEOS-CF/',
  },
  {
    icon: I.tree,
    title: 'Cooling estimates',
    body: 'Each +1 % of tree canopy in a km² lowers daytime surface temperature by roughly 0.1–0.2 °C; cool roofs about 0.04 °C per 1 % of a km². Projections are shown as ranges, never promises — species, survival and layout matter.',
  },
  {
    icon: I.plan,
    title: 'Farmer alerts',
    body: 'Rules use forecasts, NASA POWER rainfall and upstream rain for haor flash floods. Thresholds follow BMD, BRRI and DAE guidance, e.g. heat ≥ 35 °C at rice flowering.',
  },
  {
    icon: I.pin,
    title: 'Nurseries',
    body: 'Nursery locations are curated by admins and checked against OpenStreetMap. Atmos X never sells plants.',
    link: 'https://www.openstreetmap.org/',
  },
];

export default function AboutScreen() {
  const { c } = useCz();
  return (
    <Screen>
      <ScreenHeader title="Data & science" sub="Where every number comes from" />
      {SECTIONS.map((s) => (
        <Card key={s.title} gap={8} onPress={s.link ? () => Linking.openURL(s.link!) : undefined} label={s.link ? `${s.title}, opens ${s.link}` : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={s.icon} size={17} sw={2} />
            </View>
            <Txt size={14.5} w={600} style={{ flex: 1 }}>
              {s.title}
            </Txt>
          </View>
          <Txt size={13} dim>
            {s.body}
          </Txt>
          {s.link ? (
            <Txt size={12} w={600} color={c.leaf}>
              {s.link.replace(/^https:\/\//, '')}
            </Txt>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
