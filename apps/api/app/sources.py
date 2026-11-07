"""Catalog of every data source (prompt-v1 §5.1, §4 rule 9, §11 Attribution).

`SRC[id]` gives the Source shown in `meta.sources`; `/sources` adds live status and latest data date.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .schemas.common import Source


@dataclass(frozen=True)
class SourceInfo:
    id: str
    name: str
    url: str
    kind: str
    licence: str
    credit: str
    used_for: str
    nasa: bool = False
    needs: str | None = None  # 'earthdata' | 'openaq' | None
    resolution_m: float | None = None
    breaker: str | None = None
    tags: tuple[str, ...] = field(default_factory=tuple)

    def src(self, as_of: str | None = None, kind: str | None = None, resolution_m: float | None = None) -> Source:
        return Source(
            id=self.id,
            name=self.name,
            url=self.url,
            as_of=as_of,
            kind=kind or self.kind,  # type: ignore[arg-type]
            resolution_m=resolution_m if resolution_m is not None else self.resolution_m,
        )


_ALL = [
    SourceInfo(
        "landsat",
        "Landsat 8/9 Collection 2 Level-2 surface temperature (NASA/USGS)",
        "https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2",
        "observation",
        "Public domain (USGS)",
        "Landsat-8/9 image courtesy of the U.S. Geological Survey",
        "Hex surface temperature, reflectance, albedo",
        nasa=True,
        resolution_m=30,
        breaker="planetary_computer",
    ),
    SourceInfo(
        "hls",
        "Harmonized Landsat Sentinel-2 (HLS v2.0, NASA)",
        "https://planetarycomputer.microsoft.com/dataset/hls2-l30",
        "observation",
        "Public domain (NASA LP DAAC)",
        "HLS data courtesy of NASA LP DAAC",
        "Vegetation index (NDVI)",
        nasa=True,
        resolution_m=30,
        breaker="planetary_computer",
    ),
    SourceInfo(
        "modis_lst",
        "MODIS Land Surface Temperature MOD11/MYD11 v6.1 (NASA)",
        "https://planetarycomputer.microsoft.com/dataset/modis-11A2-061",
        "observation",
        "Public domain (NASA LP DAAC)",
        "MODIS data courtesy of NASA LP DAAC",
        "Night heat, 20-year history, 1 km fallback",
        nasa=True,
        resolution_m=1000,
        breaker="planetary_computer",
    ),
    SourceInfo(
        "worldcover",
        "ESA WorldCover 10 m v200 (2021)",
        "https://planetarycomputer.microsoft.com/dataset/esa-worldcover",
        "observation",
        "CC BY 4.0",
        "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021)",
        "Sealed, green and water shares",
        resolution_m=10,
        breaker="planetary_computer",
    ),
    SourceInfo(
        "ecostress",
        "ECOSTRESS ECO_L2T_LSTE v002 (NASA JPL)",
        "https://lpdaac.usgs.gov/products/eco_l2t_lstev002/",
        "observation",
        "Public domain (NASA LP DAAC)",
        "ECOSTRESS data courtesy of NASA JPL and LP DAAC",
        "Sharpening the daytime heat pattern; night heat",
        nasa=True,
        needs="earthdata",
        resolution_m=70,
        breaker="lpdaac",
    ),
    SourceInfo(
        "power",
        "NASA POWER daily (Langley Research Center)",
        "https://power.larc.nasa.gov/",
        "model",
        "Public domain (NASA)",
        "Data obtained from the NASA Langley Research Center (LaRC) POWER Project",
        "Normals, recent observed weather, rain deficit",
        nasa=True,
        breaker="power",
    ),
    SourceInfo(
        "geos_fp",
        "GEOS-FP forecast (NASA GMAO)",
        "https://gmao.gsfc.nasa.gov/GMAO_products/NRT_products.php",
        "forecast",
        "Public domain (NASA)",
        "GEOS data provided by NASA's Global Modeling and Assimilation Office (GMAO)",
        "5-day temperature forecast",
        nasa=True,
        resolution_m=28000,
        breaker="nccs",
    ),
    SourceInfo(
        "geos_cf",
        "GEOS-CF v2 composition forecast (NASA GMAO)",
        "https://gmao.gsfc.nasa.gov/weather_prediction/GEOS-CF/",
        "forecast",
        "Public domain (NASA)",
        "GEOS data provided by NASA's Global Modeling and Assimilation Office (GMAO)",
        "PM2.5 forecast",
        nasa=True,
        resolution_m=28000,
        breaker="nccs",
    ),
    SourceInfo(
        "imerg",
        "GPM IMERG Early V07 (NASA GES DISC)",
        "https://gpm.nasa.gov/data/imerg",
        "observation",
        "Public domain (NASA)",
        "GPM IMERG data courtesy of NASA GES DISC",
        "Rain in the last 72 hours (satellite estimate)",
        nasa=True,
        needs="earthdata",
        resolution_m=11000,
        breaker="gesdisc",
    ),
    SourceInfo(
        "smap",
        "SMAP L4 soil moisture SPL4SMGP v008 (NASA NSIDC)",
        "https://nsidc.org/data/spl4smgp/versions/8",
        "observation",
        "Public domain (NASA)",
        "SMAP data courtesy of NASA NSIDC DAAC",
        "Soil wetness for drought alerts",
        nasa=True,
        needs="earthdata",
        resolution_m=9000,
        breaker="nsidc",
    ),
    SourceInfo(
        "lisotd",
        "LIS/OTD lightning climatology HRMC v2.3 (NASA GHRC)",
        "https://ghrc.nsstc.nasa.gov/",
        "reference",
        "Public domain (NASA)",
        "LIS/OTD data courtesy of NASA GHRC DAAC",
        "Lightning risk weighting",
        nasa=True,
        needs="earthdata",
        resolution_m=55000,
        breaker="ghrc",
    ),
    SourceInfo(
        "cmip6",
        "NEX-GDDP-CMIP6 downscaled projections (NASA NCCS)",
        "https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6",
        "model",
        "CC BY-SA 4.0 (per model terms)",
        "NEX-GDDP-CMIP6 courtesy of NASA Earth Exchange and NCCS",
        "Future warming in the projection",
        nasa=True,
        resolution_m=25000,
        breaker="nccs_thredds",
    ),
    SourceInfo(
        "ornl_modis",
        "ORNL DAAC MODIS web service (NASA)",
        "https://modis.ornl.gov/data/modis_webservice.html",
        "observation",
        "Public domain (NASA)",
        "MODIS subsets courtesy of ORNL DAAC",
        "Fallback land surface temperature",
        nasa=True,
        resolution_m=1000,
        breaker="ornl",
    ),
    SourceInfo(
        "gibs",
        "NASA GIBS (MODIS Terra LST, daily)",
        "https://nasa-gibs.github.io/gibs-api-docs/",
        "observation",
        "Public domain (NASA)",
        "Imagery from NASA Worldview / GIBS",
        "City-scale map layer",
        nasa=True,
        resolution_m=1000,
        breaker="gibs",
    ),
    SourceInfo(
        "gpw",
        "Gridded Population of the World v4.11 (NASA SEDAC)",
        "https://sedac.ciesin.columbia.edu/data/collection/gpw-v4",
        "reference",
        "CC BY 4.0",
        "CIESIN, Columbia University, GPWv4.11, NASA SEDAC",
        "Population density",
        nasa=True,
        needs="earthdata",
        resolution_m=1000,
    ),
    SourceInfo(
        "open_meteo",
        "Open-Meteo forecast and air quality (CAMS)",
        "https://open-meteo.com/",
        "model",
        "CC BY 4.0",
        "Weather data by Open-Meteo.com",
        "Current readings, forecast cross-check, PM2.5 model",
        breaker="open_meteo",
    ),
    SourceInfo(
        "openaq",
        "OpenAQ v3 stations",
        "https://openaq.org/",
        "observation",
        "Per provider (mostly CC BY 4.0)",
        "Air quality data from OpenAQ",
        "Measured PM2.5 stations",
        needs="openaq",
        breaker="openaq",
    ),
    SourceInfo(
        "nominatim",
        "OpenStreetMap Nominatim",
        "https://nominatim.org/",
        "reference",
        "ODbL",
        "© OpenStreetMap contributors",
        "Place names",
        breaker="nominatim",
    ),
    SourceInfo(
        "osm",
        "OpenStreetMap (Overpass)",
        "https://www.openstreetmap.org/copyright",
        "reference",
        "ODbL",
        "© OpenStreetMap contributors",
        "Buildings, roads, names, nurseries, planting spots",
        breaker="overpass",
    ),
    SourceInfo(
        "dbip",
        "DB-IP City Lite",
        "https://db-ip.com",
        "reference",
        "CC BY 4.0",
        "IP Geolocation by DB-IP",
        "City from IP when location is refused",
    ),
    SourceInfo(
        "bmd_thresholds",
        "Bangladesh Meteorological Department thresholds",
        "https://live6.bmd.gov.bd/",
        "reference",
        "Public thresholds",
        "Heat-wave, cold-wave and rain classes from BMD bulletins (computed by Atmos X, not official warnings)",
        "Heat, cold and rain levels in Bangladesh",
    ),
    SourceInfo(
        "atmos",
        "Atmos X calculations",
        "/sources",
        "derived",
        "—",
        "Atmos X",
        "Heat Score, drivers, plans, checks",
    ),
    SourceInfo(
        "atmos_reference",
        "Atmos X reference tables",
        "/sources",
        "reference",
        "—",
        "Atmos X",
        "Species, costs, cooling coefficients",
    ),
]

SRC: dict[str, SourceInfo] = {s.id: s for s in _ALL}
ALL_SOURCES = _ALL
