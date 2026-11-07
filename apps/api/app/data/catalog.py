"""Reference tables seeded by `make seed` (prompt-v1 §6.7, §7.10). Configuration, not measurements.

Quantities follow the action's unit: trees and structures are counts; cool_roof and rooftop_garden
are units of 10 m²; green_wall units of 5 m²; shrubs units of 10 plants (as in V0).
"""

from __future__ import annotations

U = "https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w={w}&h={h}&q=70{x}"
NEEM_IMG, NURSERY_IMG, SAPLING_IMG = (
    "1663074898186-21b020623d09",
    "1523284998774-f6d3960be911",
    "1683994857980-280afa59a3f8",
)


def img(i: str, w: int = 600, h: int = 500, x: str = "") -> str:
    return U.format(id=i, w=w, h=h, x=x)


# id, title, unit, points, points_per (units per award), cooling per unit (°C per km²), unit m², tree, ground, content check, emoji, daily limit
ACTION_TYPES = [
    ("plant_tree", "action.plant_tree", "unit.tree", 50, 1, 0.0006, 0, True, True, "green", "🌳", 20),
    ("plant_shrubs", "action.plant_shrubs", "unit.plants_10", 12, 1, 0.0001, 0, False, True, "green", "🪴", 10),
    ("rooftop_garden", "action.rooftop_garden", "unit.m2_10", 40, 1, 0.0003, 10, False, False, "green", "🏡", 10),
    # PT5: 30 points per 100 m² of verified cool roof (V0 gave 30 per 10 m²): 10 units of 10 m².
    ("cool_roof", "action.cool_roof", "unit.m2_10", 30, 10, 0.0004, 10, False, False, "roof", "⬜", 20),
    ("green_wall", "action.green_wall", "unit.m2_5", 20, 1, 0.00015, 5, False, False, "green", "🌿", 10),
    ("shade_structure", "action.shade_structure", "unit.structure", 25, 1, 0.0002, 0, False, True, "none", "⛱️", 5),
    ("water_tree", "action.water_tree", "unit.session", 5, 1, 0.0, 0, False, True, "green", "💧", 10),
    ("awareness", "action.awareness", "unit.event", 30, 1, 0.0, 0, False, True, "none", "📣", 3),
]

# PT1–PT7 (§6.7). unlock: tree_90d = after that tree's 90-day check-in; verified_90d = 90 days after
# verification (assumption for non-tree actions, recorded in decisions); immediate.
POINT_RULES = [
    ("PT1", "Tree planted and verified", 50, "tree", "tree_90d"),
    ("PT2", "On-time 15-day check-in photo", 10, "check", "tree_90d"),
    ("PT3", "Tree alive at 90 days", 50, "tree", "immediate"),
    ("PT4", "Tree alive at 1 year", 200, "tree", "immediate"),
    ("PT5", "Cool roof verified", 30, "100 m2", "verified_90d"),
    ("PT6", "Team goal reached", 100, "member", "immediate"),
    ("PT7", "Friend joins and plants", 25, "friend", "verified_90d"),
    ("ACTION", "Other verified actions (V0 values)", 0, "action", "verified_90d"),
]

BADGES = [
    ("first_seed", "🌱", "badge.first_seed", {"kind": "trees_verified", "n": 1}),
    ("grove", "🌳", "badge.grove", {"kind": "trees_alive", "n": 10}),
    ("survivor_3m", "🛡️", "badge.survivor_3m", {"kind": "tree_milestone", "m": "d90"}),
    ("guardian_1y", "🏅", "badge.guardian_1y", {"kind": "tree_milestone", "m": "y1"}),
    ("monsoon", "🌧️", "badge.monsoon", {"kind": "planted_months", "months": [6, 7, 8, 9]}),
    ("roof_cooler", "⬜", "badge.roof_cooler", {"kind": "roof_m2_verified", "n": 100}),
    ("team_player", "🤝", "badge.team_player", {"kind": "team_goal_reached", "n": 1}),
    ("streak", "🔥", "badge.streak", {"kind": "ontime_checks_streak", "n": 6}),
    ("trees100", "🌲", "badge.trees100", {"kind": "trees_verified", "n": 100}),
    ("p1000", "⭐", "badge.p1000", {"kind": "points_earned", "n": 1000}),
]

# §7.10 REF_COSTS. BD: taka; default: USD. Humans refine these (§14).
COSTS = [
    ("BD", "tree", 450, "BDT", "tree", "V0 reference (Dhaka nursery prices + planting)"),
    ("BD", "roof_m2", 90, "BDT", "m2", "V0 reference (lime wash / reflective paint)"),
    ("BD", "shade", 18000, "BDT", "structure", "V0 reference"),
    ("BD", "care_tree_year", 300, "BDT", "tree-year", "V0 reference"),
    ("BD", "water_l_week_tree", 20, "L", "tree-week", "V0 reference"),
    ("default", "tree", 25, "USD", "tree", "V0 reference"),
    ("default", "roof_m2", 6, "USD", "m2", "V0 reference"),
    ("default", "shade", 600, "USD", "structure", "V0 reference"),
    ("default", "care_tree_year", 10, "USD", "tree-year", "V0 reference"),
    ("default", "water_l_week_tree", 20, "L", "tree-week", "V0 reference"),
]

# Curated Bangladesh list (V0 species-data.ts). Row: id, en, bn, ur, scientific, cat, canopy m,
# price low ৳, price high ৳, listed online (1) or estimate (0).
TREES = [
    ("neem", "Neem", "নিম", "نیم", "Azadirachta indica", "s", 10, 60, 60, 1),
    ("krish", "Krishnachura", "কৃষ্ণচূড়া", "گل مہر", "Delonix regia", "f", 14, 140, 200, 1),
    ("arjun", "Arjun", "অর্জুন", "ارجن", "Terminalia arjuna", "s", 12, 110, 350, 1),
    ("jarul", "Jarul", "জারুল", "جارول", "Lagerstroemia speciosa", "f", 8, 90, 90, 1),
    ("bokul", "Bokul", "বকুল", "مولسری", "Mimusops elengi", "n", 8, 70, 160, 1),
    ("kadam", "Kadam", "কদম", "کدم", "Neolamarckia cadamba", "s", 12, 80, 150, 0),
    ("sonalu", "Sonalu", "সোনালু", "املتاس", "Cassia fistula", "f", 7, 80, 150, 0),
    ("radha", "Radhachura", "রাধাচূড়া", "پیلا گل مہر", "Peltophorum pterocarpum", "f", 12, 100, 180, 0),
    ("rain", "Rain tree", "রেইনট্রি", "رین ٹری", "Samanea saman", "s", 20, 60, 120, 0),
    ("kanchan", "Kanchan", "কাঞ্চন", "کچنار", "Bauhinia variegata", "n", 6, 100, 200, 0),
    ("pitraj", "Pitraj", "পিতরাজ", "پترج", "Aphanamixis polystachya", "s", 9, 60, 120, 0),
    ("chhatim", "Chhatim", "ছাতিম", "چھتون", "Alstonia scholaris", "s", 10, 100, 200, 0),
    ("debdaru", "Debdaru", "দেবদারু", "اشوک", "Polyalthia longifolia", "n", 4, 80, 150, 0),
    ("bot", "Banyan", "বট", "برگد", "Ficus benghalensis", "s", 25, 150, 300, 0),
    ("peepal", "Peepal", "অশ্বত্থ", "پیپل", "Ficus religiosa", "s", 18, 150, 300, 0),
    ("jam", "Jamun", "কালোজাম", "جامن", "Syzygium cumini", "r", 11, 80, 150, 0),
    ("aam", "Mango", "আম", "آم", "Mangifera indica", "r", 12, 120, 250, 0),
    ("kathal", "Jackfruit", "কাঁঠাল", "کٹہل", "Artocarpus heterophyllus", "r", 10, 100, 200, 0),
    ("tetul", "Tamarind", "তেঁতুল", "املی", "Tamarindus indica", "r", 12, 80, 150, 0),
    ("champa", "Champa", "চাঁপা", "چمپا", "Magnolia champaca", "n", 7, 150, 250, 0),
]
EMOJI = {"s": "🌳", "f": "🌸", "r": "🥭", "n": "🌲"}
DETAIL = {
    "neem": {"water": "low", "growth": "fast", "care": "tree", "price": (150, 300), "img": img(NEEM_IMG, 900, 800)},
    "krish": {
        "water": "medium",
        "growth": "fast",
        "care": "krish",
        "price": (140, 200),
        "img": img(NURSERY_IMG, 900, 800),
    },
    "arjun": {
        "water": "low",
        "growth": "medium",
        "care": "tree",
        "price": (110, 350),
        "img": img(NEEM_IMG, 900, 800, "&crop=focalpoint&fp-x=.2&fp-y=.5&fp-z=1.6"),
    },
}
MADHABILATA = {
    "id": "madhabilata", "en": "Madhabilata", "bn": "মাধবীলতা", "ur": "مادھوی لتا", "sci": "Hiptage benghalensis",
    "canopy": 3, "water": "medium", "growth": "fast", "price": (80, 150), "img": img(SAPLING_IMG, 900, 800),
}  # fmt: skip

# Outside Bangladesh (§7.10): widely planted urban trees by climate band, labelled "commonly planted,
# check with a local nursery". No prices, no native claim.
INTL = {
    "tropical_wet": [("i_rain_tree", "Rain tree", "Samanea saman", 20, "medium"), ("i_mahogany", "Mahogany", "Swietenia macrophylla", 14, "medium"), ("i_almond", "Indian almond", "Terminalia catappa", 12, "medium"), ("i_pink_trumpet", "Pink trumpet tree", "Handroanthus impetiginosus", 8, "low"), ("i_flame", "Flame tree", "Delonix regia", 14, "medium")],
    "tropical_dry": [("i_neem", "Neem", "Azadirachta indica", 10, "low"), ("i_tamarind", "Tamarind", "Tamarindus indica", 12, "low"), ("i_khaya", "African mahogany", "Khaya senegalensis", 14, "low"), ("i_yellow_flame", "Yellow flame tree", "Peltophorum pterocarpum", 12, "low"), ("i_jacaranda", "Jacaranda", "Jacaranda mimosifolia", 10, "medium")],
    "arid": [("i_date", "Date palm", "Phoenix dactylifera", 6, "medium"), ("i_sidr", "Christ's thorn jujube", "Ziziphus spina-christi", 8, "low"), ("i_umbrella_thorn", "Umbrella thorn acacia", "Vachellia tortilis", 10, "low"), ("i_olive", "Olive", "Olea europaea", 7, "low"), ("i_carob", "Carob", "Ceratonia siliqua", 9, "low")],
    "temperate": [("i_plane", "London plane", "Platanus × acerifolia", 15, "medium"), ("i_linden", "Small-leaved lime", "Tilia cordata", 12, "medium"), ("i_ginkgo", "Ginkgo", "Ginkgo biloba", 9, "low"), ("i_honey_locust", "Honey locust", "Gleditsia triacanthos", 12, "low"), ("i_red_maple", "Red maple", "Acer rubrum", 11, "medium")],
    "cold": [("i_birch", "Silver birch", "Betula pendula", 8, "medium"), ("i_norway_maple", "Norway maple", "Acer platanoides", 12, "medium"), ("i_rowan", "Rowan", "Sorbus aucuparia", 6, "medium"), ("i_elm", "Siberian elm", "Ulmus pumila", 10, "low"), ("i_larch", "European larch", "Larix decidua", 7, "medium")],
}  # fmt: skip


def mid_price(lo: int, hi: int) -> int:
    return round((lo + hi) / 20) * 10
