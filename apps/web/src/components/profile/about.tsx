'use client';
/** About · Data & science: where every number comes from (v0, honest about estimates), credits and licences. */
import { useTranslations } from 'next-intl';

import { Card, I, Icon, Screen, ScreenHeader, Txt, View, useCz } from '@/components/cz';

const SECTIONS: { k: string; icon: string; link?: string }[] = [
  { k: 'heat', icon: I.lst, link: 'https://www.openstreetmap.org/copyright' },
  { k: 'zones', icon: I.map },
  { k: 'air', icon: I.sun, link: 'https://open-meteo.com/' },
  { k: 'aq', icon: I.wind, link: 'https://open-meteo.com/en/docs/air-quality-api' },
  { k: 'cooling', icon: I.tree },
  { k: 'farm', icon: I.plan, link: 'https://power.larc.nasa.gov/' },
  { k: 'ai', icon: I.sparkleOne, link: 'https://openai.com/' },
  { k: 'community', icon: I.community },
  { k: 'nurseries', icon: I.pin, link: 'https://www.openstreetmap.org/' },
];

const CREDITS: { k: string; link?: string }[] = [
  { k: 'osm', link: 'https://www.openstreetmap.org/copyright' },
  { k: 'ofm', link: 'https://openfreemap.org/' },
  { k: 'meteo', link: 'https://open-meteo.com/en/license' },
  { k: 'era5', link: 'https://cds.climate.copernicus.eu/' },
  { k: 'power', link: 'https://power.larc.nasa.gov/' },
  { k: 'gibs', link: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api' },
  { k: 'openai', link: 'https://openai.com/' },
  { k: 'photos', link: 'https://unsplash.com/license' },
  { k: 'fonts' },
];

export function AboutScreen() {
  const t = useTranslations('profile.about');
  const { c } = useCz();
  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('sub')} />
      {SECTIONS.map((s) => {
        const title = t(`sections.${s.k}.title`);
        const body = (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={s.icon} size={17} sw={2} />
              </View>
              <Txt size={14.5} w={600} as="h2" style={{ flex: 1 }}>
                {title}
              </Txt>
            </View>
            <Txt size={13} dim>
              {t(`sections.${s.k}.body`)}
            </Txt>
            {s.link ? (
              <Txt size={12} w={600} color={c.leaf} style={{ direction: 'ltr', textAlign: 'start' }}>
                {s.link.replace(/^https:\/\//, '').replace(/\/$/, '')}
              </Txt>
            ) : null}
          </>
        );
        return (
          <Card key={s.k} gap={8} href={s.link} label={s.link ? t('opens', { title, url: s.link }) : undefined}>
            {body}
          </Card>
        );
      })}

      <Card gap={10}>
        <Txt label as="h2">
          {t('credits')}
        </Txt>
        {CREDITS.map((cr) =>
          cr.link ? (
            <a key={cr.k} href={cr.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', minHeight: 24 }}>
              <Txt size={12.5}>{t(`credit.${cr.k}`)}</Txt>
            </a>
          ) : (
            <Txt key={cr.k} size={12.5}>
              {t(`credit.${cr.k}`)}
            </Txt>
          ),
        )}
      </Card>
      <Txt size={11} dim center>
        {t('version')}
      </Txt>
    </Screen>
  );
}
