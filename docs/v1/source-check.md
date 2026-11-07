# Source check

Run 2026-11-07 18:21 UTC by `make verify-sources` from the build machine (Mohammadpur, Dhaka).

| Source | Status | Latency | Latest data | Sample | Note |
| --- | --- | --- | --- | --- | --- |
| Landsat 8/9 C2 L2 (Planetary Computer) | pass | 3796 ms | 2026-11-02 | 35.9 °C surface (2026-11-02) |  |
| HLS v2.0 | pass | 888 ms | 2026-11-02 | 20 granules in 60 days |  |
| MODIS LST 11A2 | pass | 2201 ms | 2026-10-16 | 24.5 °C night surface |  |
| ESA WorldCover v200 | pass | 4895 ms | 2021 (v200) | class 50 at Mohammadpur |  |
| ECOSTRESS ECO_L2T_LSTE.002 | pass | 3512 ms | 2026-10-30 | 32 passes in 60 days; asset HTTP 200 |  |
| NASA POWER daily | pass | 1009 ms | 2026-11-04 | T2M_MAX 30.9 C |  |
| GEOS-FP (NCCS) | pass | 3192 ms | run 20261107_06 | t2m 26.2 °C |  |
| GEOS-CF v2 (NCCS) | pass | 2625 ms | run 20261106_09z | PM2.5 49.5 µg/m³ |  |
| GPM IMERG Early V07 | pass | 2710 ms | 2026-11-06 | daily file HTTP 200, 27 MB |  |
| SMAP L4 SPL4SMGP v008 | pass | 2834 ms | 2026-11-04T21:00 | granule HTTP 200 |  |
| LIS/OTD HRMC v2.3 | pass | 2078 ms | climatology 1995–2014 | file HTTP 200 |  |
| NEX-GDDP-CMIP6 (NCCS THREDDS) | pass | 2390 ms | ssp245 2040 | tasmax April 2040 mean 36.3 °C (28 days) |  |
| ORNL MODIS web service | pass | 2439 ms | 2026-10-24 | 1225 composites listed |  |
| NASA GIBS | pass | 2178 ms | 2026-11-08 | tile z6 HTTP 200 |  |
| GPWv4.11 (SEDAC) | pass | 610 ms | 2020 grid | 1 collection(s) in CMR | GeoTIFF needs `make static-data`; not sampled live |
| Open-Meteo forecast | pass | 810 ms | 2026-11-08T00:15 | 24.5 °C air |  |
| OpenAQ v3 | pass | 3729 ms |  | 20 PM2.5 locations; nearest 2.5 km | coordinates order lat,lng confirmed (stations are near Dhaka) |
| Nominatim | pass | 625 ms | live | Lalmatia, Dhaka |  |
| Overpass mirrors | pass | 79368 ms | live | 1/3 mirrors answered |  |
| DB-IP City Lite (local) | pass | 2 ms | dbip-city-lite-2026-11.mmdb | local file present |  |

20 of 20 passed.
