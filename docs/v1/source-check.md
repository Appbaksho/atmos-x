# Source check

Run 2026-11-08 10:43 UTC by `make verify-sources` from the build machine (Mohammadpur, Dhaka).

| Source | Status | Latency | Latest data | Sample | Note |
| --- | --- | --- | --- | --- | --- |
| Landsat 8/9 C2 L2 (Planetary Computer) | pass | 3810 ms | 2026-11-02 | 35.9 °C surface (2026-11-02) |  |
| HLS v2.0 | pass | 1174 ms | 2026-11-02 | 20 granules in 60 days |  |
| MODIS LST 11A2 | pass | 2154 ms | 2026-10-16 | 24.5 °C night surface |  |
| ESA WorldCover v200 | pass | 2167 ms | 2021 (v200) | class 50 at Mohammadpur |  |
| ECOSTRESS ECO_L2T_LSTE.002 | pass | 3623 ms | 2026-10-30 | 32 passes in 60 days; asset HTTP 200 |  |
| NASA POWER daily | pass | 955 ms | 2026-11-05 | T2M_MAX 30.8 C |  |
| GEOS-FP (NCCS) | pass | 63448 ms | run 20261107_12 | t2m 31.0 °C |  |
| GEOS-CF v2 (NCCS) | pass | 2064 ms | run 20261107_09z | PM2.5 45.6 µg/m³ |  |
| GPM IMERG Early V07 | pass | 4458 ms | 2026-11-07 | ranged GET HTTP 206 |  |
| SMAP L4 SPL4SMGP v008 | pass | 2777 ms | 2026-11-05T21:00 | granule HTTP 200 |  |
| LIS/OTD HRMC v2.3 | pass | 3143 ms | climatology 1995–2014 | file HTTP 200 |  |
| NEX-GDDP-CMIP6 (NCCS THREDDS) | pass | 79637 ms | ssp245 2040 | tasmax April 2040 mean 36.3 °C (28 days) |  |
| ORNL MODIS web service | pass | 2735 ms | 2026-10-24 | 1225 composites listed |  |
| NASA GIBS | pass | 2381 ms | 2026-11-08 | tile z6 HTTP 200 |  |
| GPWv4.11 (SEDAC) | pass | 674 ms | 2020 grid | 1 collection(s) in CMR | GeoTIFF needs `make static-data`; not sampled live |
| Open-Meteo forecast | pass | 768 ms | 2026-11-08T16:30 | 30.4 °C air |  |
| OpenAQ v3 | pass | 2679 ms |  | 20 PM2.5 locations; nearest 2.5 km | coordinates order lat,lng confirmed (stations are near Dhaka) |
| Nominatim | pass | 320 ms | live | Lalmatia, Dhaka |  |
| Overpass mirrors | pass | 76073 ms | live | 1/3 mirrors answered |  |
| DB-IP City Lite (local) | pass | 4 ms | dbip-city-lite-2026-11.mmdb | local file present |  |

20 of 20 passed.
