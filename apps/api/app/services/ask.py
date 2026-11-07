"""Ask Atmos without an LLM (prompt-v1 §6.12 K1–K9).

A message is classified into an intent with keyword lists in 10 languages (suggestion chips send the
intent id directly). Each intent reads the same services as the screens and returns I18nText parts
(`ask.answer.*` templates in the web `server` namespace), so every answer is complete sentences with
real numbers in the person's language and digits. Warnings come first. Unknown questions get a plain
"here is what I can answer" with chips; medical and chemical-dose questions get fixed safety text.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

import h3
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import AppError
from ..http import UpstreamError
from ..models import FarmField, Goal, Profile, ScanZone, Tree, User
from ..sources import SRC
from . import air as AIR
from . import conditions as COND
from . import farm as FARM
from . import goals as G
from . import nurseries as NURS
from . import plan as PLAN
from . import stats as ST
from . import trees as TREES
from . import zone_detail as ZD

log = logging.getLogger("atmos.ask")

INTENTS = [
    "why_hot",
    "temp_now",
    "forecast",
    "normal",
    "air_now",
    "air_advice",
    "farm_alerts",
    "tree_care",
    "tree_due",
    "nurseries",
    "species",
    "goal_progress",
    "points",
    "data_sources",
    "help",
]
SAFETY = ["safety_chemicals", "safety_medical"]
ALL = set(INTENTS) | set(SAFETY)

# Keyword lists per language (lowercase substrings; short Latin words match whole words only).
KW: dict[str, list[str]] = {
    "safety_chemicals": [
        "pesticide",
        "insecticide",
        "fungicide",
        "herbicide",
        "fertiliser",
        "fertilizer",
        "urea",
        "dose",
        "dosage",
        "how much spray",
        "কীটনাশক",
        "ছত্রাকনাশক",
        "সার",
        "ইউরিয়া",
        "মাত্রা",
        "কতটুকু স্প্রে",
        "کیڑے مار",
        "کھاد",
        "یوریا",
        "سپرے کی مقدار",
        "مبيد",
        "سماد",
        "جرعة",
        "कीटनाशक",
        "फफूंदनाशक",
        "खाद",
        "उर्वरक",
        "यूरिया",
        "छिड़काव की मात्रा",
        "pesticida",
        "insecticida",
        "fungicida",
        "fertilizante",
        "abono",
        "dosis",
        "fongicide",
        "engrais",
        "dose",
        "agrotóxico",
        "adubo",
        "pestisida",
        "fungisida",
        "pupuk",
        "dosis",
        "农药",
        "杀虫剂",
        "杀菌剂",
        "化肥",
        "肥料",
        "剂量",
    ],
    "safety_medical": [
        "doctor",
        "medicine",
        "medication",
        "sick",
        "fever",
        "symptom",
        "diagnos",
        "headache",
        "dizzy",
        "faint",
        "pills",
        "treatment",
        "ডাক্তার",
        "ওষুধ",
        "অসুস্থ",
        "জ্বর",
        "মাথাব্যথা",
        "মাথা ঘোরা",
        "চিকিৎসা",
        "ڈاکٹر",
        "دوا",
        "بیمار",
        "بخار",
        "سردرد",
        "چکر",
        "علاج",
        "طبيب",
        "دواء",
        "مريض",
        "حمى",
        "صداع",
        "دوار",
        "علاج",
        "डॉक्टर",
        "दवा",
        "बीमार",
        "बुखार",
        "सिरदर्द",
        "चक्कर",
        "इलाज",
        "médico",
        "medicina",
        "enfermo",
        "fiebre",
        "síntoma",
        "mareo",
        "médecin",
        "médicament",
        "malade",
        "fièvre",
        "symptôme",
        "vertige",
        "remédio",
        "doente",
        "febre",
        "sintoma",
        "tontura",
        "dokter",
        "obat",
        "demam",
        "gejala",
        "pusing",
        "医生",
        "药",
        "生病",
        "发烧",
        "症状",
        "头晕",
    ],
    "data_sources": [
        "source",
        "data",
        "nasa",
        "satellite",
        "landsat",
        "how do you know",
        "where does",
        "উৎস",
        "তথ্য",
        "ডেটা",
        "স্যাটেলাইট",
        "নাসা",
        "ذریعہ",
        "ڈیٹا",
        "سیٹلائٹ",
        "ناسا",
        "مصدر",
        "بيانات",
        "قمر صناعي",
        "ناسا",
        "स्रोत",
        "डेटा",
        "उपग्रह",
        "नासा",
        "fuente",
        "datos",
        "satélite",
        "données",
        "fonte",
        "dados",
        "sumber",
        "satelit",
        "来源",
        "数据",
        "卫星",
    ],
    "points": [
        "point",
        "badge",
        "level",
        "rank",
        "leaderboard",
        "unlock",
        "spend",
        "পয়েন্ট",
        "ব্যাজ",
        "লেভেল",
        "র‍্যাঙ্ক",
        "پوائنٹ",
        "بیج",
        "لیول",
        "نقاط",
        "نقطة",
        "شارة",
        "مستوى",
        "अंक",
        "पॉइंट",
        "बैज",
        "लेवल",
        "रैंक",
        "puntos",
        "insignia",
        "nivel",
        "badge",
        "niveau",
        "classement",
        "pontos",
        "medalha",
        "nível",
        "poin",
        "lencana",
        "peringkat",
        "积分",
        "徽章",
        "等级",
        "排名",
    ],
    "goal_progress": [
        "goal",
        "target",
        "progress",
        "my plan",
        "লক্ষ্য",
        "অগ্রগতি",
        "পরিকল্পনা",
        "ہدف",
        "پیش رفت",
        "منصوبہ",
        "هدف",
        "تقدم",
        "خطة",
        "लक्ष्य",
        "प्रगति",
        "योजना",
        "meta",
        "objetivo",
        "progreso",
        "objectif",
        "progrès",
        "progresso",
        "tujuan",
        "kemajuan",
        "rencana",
        "目标",
        "进度",
        "计划",
    ],
    "nurseries": [
        "nursery",
        "nurseries",
        "buy sapling",
        "buy a sapling",
        "where to buy",
        "নার্সারি",
        "চারা কিন",
        "কোথায় পাব",
        "نرسری",
        "پودے کہاں",
        "مشتل",
        "مشاتل",
        "नर्सरी",
        "पौधे कहाँ",
        "vivero",
        "pépinière",
        "viveiro",
        "pembibitan",
        "beli bibit",
        "苗圃",
        "买树苗",
    ],
    "species": [
        "which tree",
        "what tree",
        "species",
        "best tree",
        "what to plant",
        "what should i plant",
        "which trees",
        "কোন গাছ",
        "কী গাছ",
        "প্রজাতি",
        "কোন চারা",
        "کون سا درخت",
        "کون سے درخت",
        "قسم کے درخت",
        "أي شجرة",
        "أي الأشجار",
        "أنواع الأشجار",
        "कौन सा पेड़",
        "कौन से पेड़",
        "प्रजाति",
        "क्या लगाएं",
        "qué árbol",
        "qué árboles",
        "especie",
        "quel arbre",
        "quels arbres",
        "espèce",
        "que árvore",
        "qual árvore",
        "espécie",
        "pohon apa",
        "jenis pohon",
        "spesies",
        "种什么树",
        "哪种树",
        "树种",
    ],
    "tree_due": [
        "check-in",
        "check in",
        "checkin",
        "photo due",
        "overdue",
        "next photo",
        "চেক-ইন",
        "চেক ইন",
        "কবে ছবি",
        "ছবি দিতে",
        "چیک ان",
        "چیک اِن",
        "کب تصویر",
        "موعد المتابعة",
        "متى أصور",
        "चेक-इन",
        "चेक इन",
        "कब फ़ोटो",
        "revisión",
        "suivi",
        "jadwal foto",
        "打卡",
        "什么时候拍照",
    ],
    "tree_care": [
        "water my tree",
        "watering",
        "tree care",
        "care for",
        "leaves yellow",
        "yellow leaves",
        "my tree",
        "my sapling",
        "how much water",
        "গাছে পানি",
        "গাছের যত্ন",
        "পাতা হলুদ",
        "আমার গাছ",
        "চারার যত্ন",
        "درخت کو پانی",
        "دیکھ بھال",
        "پتے پیلے",
        "میرا درخت",
        "سقي",
        "رعاية الشجرة",
        "أوراق صفراء",
        "شجرتي",
        "पानी दें",
        "देखभाल",
        "पत्ते पीले",
        "मेरा पेड़",
        "regar",
        "cuidar el árbol",
        "hojas amarillas",
        "mi árbol",
        "arroser",
        "feuilles jaunes",
        "mon arbre",
        "cuidar da árvore",
        "folhas amarelas",
        "minha árvore",
        "menyiram",
        "merawat pohon",
        "daun kuning",
        "pohon saya",
        "浇水",
        "养护",
        "叶子发黄",
        "我的树",
        "কতটুকু পানি",
        "কত পানি",
        "کتنا پانی",
        "كم ماء",
        "मेरे पेड़",
        "कितना पानी",
        "पेड़ को पानी",
        "cuánta agua",
        "combien d'eau",
        "combien d’eau",
        "quanta água",
        "berapa banyak air",
        "浇多少水",
    ],
    "farm_alerts": [
        "crop",
        "rice",
        "paddy",
        "field",
        "farm",
        "harvest",
        "irrigat",
        "boro",
        "aman",
        "potato",
        "wheat",
        "jute",
        "ধান",
        "ফসল",
        "জমি",
        "সেচ",
        "চাষ",
        "বোরো",
        "আমন",
        "আলু",
        "গম",
        "পাট",
        "فصل",
        "چاول",
        "کھیت",
        "آبپاشی",
        "کٹائی",
        "گندم",
        "محصول",
        "أرز",
        "حقل",
        "مزرعة",
        "حصاد",
        "ري",
        "फसल",
        "धान",
        "खेत",
        "सिंचाई",
        "कटाई",
        "गेहूं",
        "cultivo",
        "arroz",
        "campo",
        "cosecha",
        "riego",
        "culture",
        "riz",
        "champ",
        "récolte",
        "lavoura",
        "colheita",
        "irrigação",
        "safra",
        "padi",
        "sawah",
        "ladang",
        "panen",
        "irigasi",
        "庄稼",
        "水稻",
        "稻田",
        "农田",
        "收割",
        "灌溉",
    ],
    "air_advice": [
        "mask",
        "window",
        "go out",
        "outside",
        "jog",
        "exercise",
        "safe to",
        "মাস্ক",
        "জানালা",
        "বাইরে যাব",
        "বাইরে যাওয়া",
        "ماسک",
        "کھڑکی",
        "باہر جا",
        "كمامة",
        "نافذة",
        "الخروج",
        "मास्क",
        "खिड़की",
        "बाहर जा",
        "mascarilla",
        "ventana",
        "salir",
        "masque",
        "fenêtre",
        "sortir",
        "máscara",
        "janela",
        "sair",
        "masker",
        "jendela",
        "keluar rumah",
        "口罩",
        "开窗",
        "出门",
    ],
    "air_now": [
        "air",
        "aqi",
        "pm2.5",
        "pm",
        "pollution",
        "smog",
        "dust",
        "air quality",
        "বাতাস",
        "বায়ু",
        "দূষণ",
        "ধুলা",
        "ধোঁয়াশা",
        "ہوا",
        "آلودگی",
        "دھول",
        "سموگ",
        "الهواء",
        "تلوث",
        "غبار",
        "हवा",
        "प्रदूषण",
        "धूल",
        "स्मॉग",
        "वायु",
        "aire",
        "contaminación",
        "polvo",
        "pollution",
        "poussière",
        "poluição",
        "poeira",
        "udara",
        "polusi",
        "debu",
        "空气",
        "污染",
        "雾霾",
        "灰尘",
    ],
    "normal": [
        "normal",
        "usual",
        "average",
        "than usual",
        "climate",
        "স্বাভাবিক",
        "গড়",
        "معمول",
        "اوسط",
        "المعتاد",
        "المعدل",
        "सामान्य",
        "औसत",
        "habitual",
        "promedio",
        "normale",
        "habituel",
        "moyenne",
        "média",
        "biasanya",
        "rata-rata",
        "正常",
        "往年",
        "平均",
    ],
    "forecast": [
        "tomorrow",
        "forecast",
        "this week",
        "next days",
        "will it rain",
        "rain",
        "আগামীকাল",
        "পূর্বাভাস",
        "বৃষ্টি",
        "সপ্তাহ",
        "کل کا",
        "پیشگوئی",
        "بارش",
        "ہفتے",
        "غدا",
        "توقعات",
        "مطر",
        "الأسبوع",
        "कल का",
        "पूर्वानुमान",
        "बारिश",
        "हफ़्ते",
        "mañana",
        "pronóstico",
        "lluvia",
        "semana",
        "demain",
        "prévision",
        "pluie",
        "semaine",
        "amanhã",
        "previsão",
        "chuva",
        "besok",
        "prakiraan",
        "hujan",
        "明天",
        "预报",
        "下雨",
        "本周",
    ],
    "temp_now": [
        "temperature",
        "right now",
        "feels like",
        "how hot",
        "degrees",
        "তাপমাত্রা",
        "এখন",
        "কত ডিগ্রি",
        "درجہ حرارت",
        "ابھی",
        "درجة الحرارة",
        "الآن",
        "तापमान",
        "अभी",
        "temperatura",
        "ahora",
        "température",
        "maintenant",
        "agora",
        "suhu",
        "sekarang",
        "温度",
        "现在",
        "多少度",
    ],
    "help": [
        "help",
        "what can you",
        "hello",
        "who are you",
        "সাহায্য",
        "কী করতে পার",
        "مدد",
        "کیا کر سکتے",
        "مساعدة",
        "ماذا تستطيع",
        "मदद",
        "क्या कर सकते",
        "ayuda",
        "aide",
        "ajuda",
        "bantuan",
        "帮助",
    ],
}
WHY = ["why", "কেন", "کیوں", "لماذا", "क्यों", "por qué", "porque", "pourquoi", "por que", "kenapa", "mengapa", "为什么"]
HEAT = [
    "hot",
    "heat",
    "warm",
    "গরম",
    "তাপ",
    "گرم",
    "گرمی",
    "حار",
    "حرارة",
    "الحر",
    "गर्म",
    "गर्मी",
    "calor",
    "caliente",
    "chaud",
    "chaleur",
    "quente",
    "panas",
    "热",
]
PRIORITY = SAFETY + [
    "why_hot",
    "farm_alerts",
    "tree_due",
    "tree_care",
    "nurseries",
    "species",
    "goal_progress",
    "points",
    "air_advice",
    "air_now",
    "normal",
    "forecast",
    "temp_now",
    "data_sources",
    "help",
]

# Screen → default topic (K1), used for short follow-ups like "why?" or "and tomorrow?".
SCREEN_DEFAULT = {
    "S04": "why_hot",
    "S05": "why_hot",
    "S06": "why_hot",
    "S07": "why_hot",
    "S08": "goal_progress",
    "S09": "goal_progress",
    "S10": "goal_progress",
    "S11": "species",
    "S12": "nurseries",
    "S13": "goal_progress",
    "S14": "points",
    "S15": "points",
    "S16": "points",
    "S17": "points",
    "S18": "points",
    "S19": "points",
    "S20": "tree_due",
    "S21": "help",
    "S22": "help",
    "S26": "air_now",
    "S27": "air_now",
    "S28": "air_now",
    "S29": "help",
    "F01": "farm_alerts",
    "F02": "farm_alerts",
    "F03": "farm_alerts",
}
CHIPS = {
    "why_hot": ["temp_now", "forecast", "species"],
    "temp_now": ["why_hot", "forecast", "normal"],
    "forecast": ["normal", "why_hot", "air_now"],
    "normal": ["why_hot", "forecast"],
    "air_now": ["air_advice", "forecast"],
    "air_advice": ["air_now", "temp_now"],
    "farm_alerts": ["forecast", "temp_now"],
    "tree_care": ["tree_due", "points"],
    "tree_due": ["tree_care", "points"],
    "nurseries": ["species", "tree_care"],
    "species": ["nurseries", "goal_progress"],
    "goal_progress": ["species", "points"],
    "points": ["tree_due", "goal_progress"],
    "data_sources": ["why_hot", "help"],
    "help": ["why_hot", "air_now", "tree_due", "farm_alerts"],
    "unknown": ["why_hot", "air_now", "tree_due", "farm_alerts", "data_sources"],
    "safety_medical": ["temp_now", "air_advice"],
    "safety_chemicals": ["farm_alerts", "forecast"],
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def _has(text: str, kw: str) -> bool:
    if kw.isascii() and len(kw) <= 4:
        return re.search(rf"(?<![a-z]){re.escape(kw)}(?![a-z])", text) is not None
    return kw in text


def classify(message: str, screen: str | None, farmer: bool = False) -> str:
    """Intent id, or 'unknown' (K5). Short messages without keywords fall back to the screen topic."""
    t = _norm(message)
    if not t:
        return _screen_default(screen, farmer)
    for s in SAFETY:
        if any(_has(t, k) for k in KW[s]):
            return s
    score = {i: sum(1 for k in KW.get(i, []) if _has(t, k)) for i in INTENTS}
    why, heat = any(_has(t, k) for k in WHY), any(_has(t, k) for k in HEAT)
    if heat:
        score["why_hot"] += 3 if why else 1
    best = max(score.values())
    if best == 0:
        return _screen_default(screen, farmer) if len(t.split()) <= 3 else "unknown"
    return next(i for i in PRIORITY if i in score and score[i] == best)


def _screen_default(screen: str | None, farmer: bool) -> str:
    if farmer and screen in ("S04", "S05", None):
        return "farm_alerts"
    return SCREEN_DEFAULT.get(screen or "", "help")


# ── answers ─────────────────────────────────────────────────────────────────


def T(code: str, **params) -> dict:  # noqa: N802
    return {"code": f"ask.answer.{code}", "params": params} if params else {"code": f"ask.answer.{code}"}


@dataclass
class Answer:
    intent: str
    parts: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    sources: list[dict] = field(default_factory=list)
    actions: list[dict] = field(default_factory=list)
    notices: list[dict] = field(default_factory=list)
    answered: bool = True

    def src(self, items) -> None:
        seen = {s["id"] for s in self.sources}
        for s in items or []:
            if s.get("id") not in seen:
                self.sources.append(s)
                seen.add(s.get("id"))

    def act(self, label: str, screen: str, **params) -> None:
        if len(self.actions) < 2:
            self.actions.append(
                {
                    "label": {"code": f"ask.action.{label}"},
                    "screen": screen,
                    "params": {k: str(v) for k, v in params.items()},
                }
            )


@dataclass
class Ctx:
    db: AsyncSession
    user: User | None  # None for guests and anonymous visitors
    lang: str
    lat: float | None
    lng: float | None
    zone_id: str | None
    tree_id: str | None
    field_id: str | None
    crop: str
    stage: str
    _cond: dict | None = None
    _cond_done: bool = False

    async def conditions(self) -> dict | None:
        if not self._cond_done:
            self._cond_done = True
            if self.lat is not None:
                try:
                    self._cond = await COND.conditions(self.db, self.lat, self.lng, self.lang)
                except UpstreamError:
                    self._cond = None
        return self._cond


async def _zone_at(db: AsyncSession, lat: float, lng: float) -> ScanZone | None:
    cell = h3.latlng_to_cell(lat, lng, 10)
    return (
        await db.execute(
            select(ScanZone).where(ScanZone.h3.contains([cell])).order_by(ScanZone.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()


def _need_place(a: Answer) -> Answer:
    a.parts.append(T("need_place"))
    a.act("open_map", "S05")
    a.answered = False
    return a


async def why_hot(c: Ctx, a: Answer) -> Answer:
    zid = c.zone_id
    if zid is None and c.lat is not None:
        z = await _zone_at(c.db, c.lat, c.lng)
        zid = z.id if z else None
    if zid is None:
        cond = await c.conditions()
        if cond is None:
            return _need_place(a)
        a.parts.append(T("temp_now", air=cond["air_c"], feels=cond["feels_c"], risk=cond["heat_risk"]))
        a.parts.append(T("why_hot_no_zone"))
        a.src(cond["meta"]["sources"])
        a.act("open_map", "S05")
        return a
    try:
        d = await ZD.detail(c.db, zid, c.lang)
    except AppError:
        return _need_place(a)
    dr = d.get("drivers") or {}
    if d.get("name"):
        a.parts.append(
            T(
                "why_hot_zone",
                zone=d["name"],
                score=d["score"],
                lst=round(d["lst_c"]) if d.get("lst_c") is not None else "–",
            )
        )
    else:
        a.parts.append(
            T(
                "why_hot_zone_n",
                n=d["rank"],
                score=d["score"],
                lst=round(d["lst_c"]) if d.get("lst_c") is not None else "–",
            )
        )
    a.parts.append(
        T(
            "why_hot_cover",
            sealed=round(dr.get("sealed_pct") or 0),
            green=round(dr.get("green_pct") or 0),
            water=round(dr.get("water_pct") or 0),
        )
    )
    a.parts.extend((d.get("causes") or [])[:2])
    wig = d.get("what_if_green") or {}
    if wig.get("lst_drop_c"):
        a.parts.append(T("why_hot_green", pct=wig.get("add_green_pct"), drop=round(wig["lst_drop_c"], 1)))
    if d.get("air_c") is not None:
        a.parts.append(T("air_feels", air=d["air_c"], feels=d["feels_c"]))
    a.src(d["meta"]["sources"])
    a.act("open_zone", "S06", id=zid)
    a.act("set_goal", "S08", zone=zid)
    return a


async def temp_now(c: Ctx, a: Answer) -> Answer:
    cond = await c.conditions()
    if cond is None:
        return _need_place(a)
    fc = cond.get("forecast") or []
    a.parts.append(T("temp_now", air=cond["air_c"], feels=cond["feels_c"], risk=cond["heat_risk"]))
    if fc:
        a.parts.append(
            T(
                "today_high",
                tmax=round(fc[0]["tmax_c"]),
                tmin=round(fc[0]["tmin_c"]) if fc[0].get("tmin_c") is not None else "–",
            )
        )
    if cond.get("humidity") is not None:
        a.parts.append(T("humidity", rh=cond["humidity"]))
    a.src(cond["meta"]["sources"])
    a.act("see_forecast", "S04")
    return a


async def forecast(c: Ctx, a: Answer) -> Answer:
    cond = await c.conditions()
    if cond is None:
        return _need_place(a)
    days = (cond.get("forecast") or [])[1:4]
    a.parts.append(T("forecast_intro", n=len(days)))
    for d in days:
        a.parts.append(
            T(
                "forecast_day",
                day=d["date"],
                tmax=round(d["tmax_c"]),
                tmin=round(d["tmin_c"]) if d.get("tmin_c") is not None else "–",
                rain=round(d.get("rain_mm") or 0),
            )
        )
    a.src(cond["meta"]["sources"])
    return a


async def normal(c: Ctx, a: Answer) -> Answer:
    cond = await c.conditions()
    if cond is None:
        return _need_place(a)
    fc = cond.get("forecast") or []
    if cond.get("normal_c") is None or not fc:
        a.parts.append(T("normal_pending"))
    else:
        diff = round(cond["anomaly_c"], 1)
        a.parts.append(
            T(
                "normal",
                tmax=round(fc[0]["tmax_c"]),
                normal=round(cond["normal_c"], 1),
                diff=abs(diff),
                dir="above" if diff > 0.2 else "below" if diff < -0.2 else "same",
            )
        )
    a.src(cond["meta"]["sources"])
    return a


async def air_now(c: Ctx, a: Answer) -> Answer:
    if c.lat is None:
        return _need_place(a)
    try:
        r = await AIR.air(c.db, c.lat, c.lng, c.user)
    except UpstreamError:
        a.parts.append(T("air_unavailable"))
        a.answered = False
        return a
    a.parts.append(T("air_now", pm25=round(r["pm25"]), aqi=r["aqi"], category=r["category"]))
    if r.get("nasa_pm25") is not None:
        a.parts.append(T("air_nasa", pm25=round(r["nasa_pm25"])))
    if r.get("advice"):
        a.parts.append(r["advice"][0])
    a.src(r["meta"]["sources"])
    a.act("open_air", "S26")
    return a


async def air_advice(c: Ctx, a: Answer) -> Answer:
    if c.lat is None:
        return _need_place(a)
    try:
        r = await AIR.air(c.db, c.lat, c.lng, c.user)
    except UpstreamError:
        a.parts.append(T("air_unavailable"))
        a.answered = False
        return a
    a.parts.append(T("air_advice_intro", aqi=r["aqi"], category=r["category"]))
    a.parts.extend((r.get("advice") or [])[:3])
    a.src(r["meta"]["sources"])
    a.act("open_air", "S26")
    return a


async def farm_alerts(c: Ctx, a: Answer) -> Answer:
    f = None
    if c.user is not None:
        q = select(FarmField).where(FarmField.user_id == c.user.id)
        if c.field_id:
            try:
                q = q.where(FarmField.id == uuid.UUID(c.field_id))
            except ValueError:
                pass
        f = (await c.db.execute(q.order_by(FarmField.created_at).limit(1))).scalar_one_or_none()
    lat, lng, crop, stage = (f.lat, f.lng, f.crop, f.stage) if f else (c.lat, c.lng, c.crop, c.stage)
    if lat is None:
        return _need_place(a)
    try:
        r = await FARM.alerts(c.db, lat, lng, crop, stage, user=c.user, field_id=f.id if f else None)
    except (UpstreamError, AppError):
        a.parts.append(T("farm_unavailable"))
        a.answered = False
        return a
    if not r["alerts"]:
        a.parts.append(T("farm_none"))
    else:
        a.parts.append(T("farm_some", n=len(r["alerts"])))
        for al in r["alerts"][:2]:
            a.parts.extend([al["title"], al["body"]])
            if al["actions"]:
                a.parts.append(al["actions"][0])
        top = r["alerts"][0]
        a.act("open_alert", "F02", id=top["id"], **({"field": str(f.id)} if f else {}))
    if not f:
        a.notices.append(T("farm_preview"))
    a.src(r["meta"]["sources"])
    return a


async def _my_trees(c: Ctx) -> list[Tree]:
    if c.user is None:
        return []
    return list(
        (
            await c.db.execute(
                select(Tree).where(Tree.user_id == c.user.id, Tree.revoked.is_(False)).order_by(Tree.next_due_at)
            )
        )
        .scalars()
        .all()
    )


async def tree_care(c: Ctx, a: Answer) -> Answer:
    if c.user is None:
        a.parts.append(T("trees_guest"))
        a.act("create_account", "register")
        return a
    t = None
    if c.tree_id:
        try:
            t = await TREES.get_owned(c.db, uuid.UUID(c.tree_id), c.user)
        except (AppError, ValueError):
            t = None
    trees = await _my_trees(c)
    t = t or (trees[0] if trees else None)
    if t is None:
        a.parts.append(T("trees_none"))
        a.act("log_planting", "S14", type="plant_tree")
        return a
    out = await TREES.tree_out(c.db, t, c.user, with_checks=True)
    a.parts.append(T("tree_care_intro", name=t.nickname or t.species_id, state=out["state"]))
    a.parts.extend(out.get("tips") or [])
    if out.get("rain_7d_mm") is not None:
        a.parts.append(T("tree_rain", mm=round(out["rain_7d_mm"])))
        a.src([SRC["imerg" if out["rain_source"] == "imerg" else "power"].src().model_dump()])
    a.act("open_tree", "tree", id=t.id)
    return a


async def tree_due(c: Ctx, a: Answer) -> Answer:
    if c.user is None:
        a.parts.append(T("trees_guest"))
        a.act("create_account", "register")
        return a
    trees = await _my_trees(c)
    if not trees:
        a.parts.append(T("trees_none"))
        a.act("log_planting", "S14", type="plant_tree")
        return a
    now = datetime.now(UTC)
    due = [t for t in trees if (t.next_due_at - now).days <= 2]
    if due:
        late = [t for t in due if t.next_due_at < now]
        a.parts.append(
            T(
                "tree_due_some",
                count=len(due),
                late=len(late),
                name=due[0].nickname or due[0].species_id,
                date=due[0].next_due_at.date().isoformat(),
            )
        )
        a.act("open_tree", "tree", id=due[0].id)
    else:
        a.parts.append(
            T(
                "tree_due_none",
                count=len(trees),
                name=trees[0].nickname or trees[0].species_id,
                date=trees[0].next_due_at.date().isoformat(),
            )
        )
        a.act("my_trees", "trees")
    a.parts.append(T("tree_due_rule"))
    return a


async def nurseries(c: Ctx, a: Answer) -> Answer:
    if c.lat is None:
        return _need_place(a)
    r = await NURS.nearby(c.db, c.lat, c.lng, 5000)
    items = r["nurseries"]
    if items:
        n = items[0]
        a.parts.append(T("nurseries_some", count=len(items), name=n["name"] or "–", dist=n["dist_m"]))
    elif r["status"] == "pending":
        a.parts.append(T("nurseries_pending"))
    else:
        a.parts.append(T("nurseries_none"))
    a.src(r["meta"]["sources"])
    a.act("open_nurseries", "S12")
    return a


async def species(c: Ctx, a: Answer) -> Answer:
    r = await PLAN.species_list(c.db, c.lat, c.lng, c.lang)
    top = r["species"][:3]
    if not top:
        a.parts.append(T("species_none"))
        return a
    names = [s.get("name") or s["id"] for s in top] + ["–", "–"]
    a.parts.append(T("species", a=names[0], b=names[1], c=names[2]))
    a.parts.append(T("species_bd" if r["region"] == "BD" else "species_estimate"))
    a.src(r["meta"]["sources"])
    a.act("open_species", "species")
    return a


async def goal_progress(c: Ctx, a: Answer) -> Answer:
    if c.user is None:
        a.parts.append(T("goal_guest"))
        a.act("set_goal", "S08")
        return a
    goals = await G.mine(c.db, c.user)
    g: Goal | None = next((x for x in goals if (x.status or "active") == "active"), goals[0] if goals else None)
    if g is None:
        a.parts.append(T("goal_none"))
        a.act("set_goal", "S08")
        return a
    p = await G.progress(c.db, g)
    out = await G.goal_out(c.db, g, c.lang)
    a.parts.append(
        T(
            "goal",
            zone=out.get("zone_name") or "–",
            pct=p["pct"],
            modeled=round(p["modeled_c"], 2),
            target=g.target_c,
            date=g.by_date.isoformat(),
        )
    )
    if g.kind == "action":
        t = g.targets or {}
        a.parts.append(
            T(
                "goal_actions",
                trees=int(p["done"]["trees"]),
                trees_target=int(t.get("trees") or 0),
                roof=int(p["done"]["roof_m2"]),
                roof_target=int(t.get("roof_m2") or 0),
            )
        )
    a.act("open_goals", "goals")
    return a


async def points(c: Ctx, a: Answer) -> Answer:
    if c.user is None:
        a.parts.append(T("points_guest"))
        a.act("create_account", "register")
        return a
    s = await ST.stats(c.db, c.user)
    p = s["points"]
    a.parts.append(
        T("points", earned=p["earned"], spendable=p["spendable"], pending=p["pending"], level=s["level"]["level"])
    )
    if p["pending"] and p["next_unlock_at"]:
        a.parts.append(T("points_unlock", date=p["next_unlock_at"][:10]))
    a.parts.append(T("points_rule"))
    a.act("my_trees", "trees")
    return a


async def data_sources(c: Ctx, a: Answer) -> Answer:
    a.parts.extend([T("sources_1"), T("sources_2"), T("sources_3")])
    a.src([SRC[s].src().model_dump() for s in ("landsat", "power", "imerg", "open_meteo")])
    a.act("about", "about")
    return a


async def help_(c: Ctx, a: Answer) -> Answer:
    a.parts.append(T("help"))
    return a


async def unknown(c: Ctx, a: Answer) -> Answer:
    a.parts.append(T("unknown"))
    a.answered = False
    return a


async def safety_medical(c: Ctx, a: Answer) -> Answer:
    a.parts.extend([T("safety_medical"), T("safety_medical_heat")])
    return a


async def safety_chemicals(c: Ctx, a: Answer) -> Answer:
    a.parts.append(T("safety_chemicals"))
    return a


HANDLERS = {
    "why_hot": why_hot,
    "temp_now": temp_now,
    "forecast": forecast,
    "normal": normal,
    "air_now": air_now,
    "air_advice": air_advice,
    "farm_alerts": farm_alerts,
    "tree_care": tree_care,
    "tree_due": tree_due,
    "nurseries": nurseries,
    "species": species,
    "goal_progress": goal_progress,
    "points": points,
    "data_sources": data_sources,
    "help": help_,
    "unknown": unknown,
    "safety_medical": safety_medical,
    "safety_chemicals": safety_chemicals,
}
WEATHER_WARNINGS = {
    "why_hot",
    "temp_now",
    "forecast",
    "normal",
    "air_now",
    "air_advice",
    "farm_alerts",
    "tree_care",
    "help",
    "unknown",
    "safety_medical",
}


async def resolve_place(
    db: AsyncSession,
    user: User | None,
    lat: float | None,
    lng: float | None,
    zone_id: str | None,
    tree_id: str | None,
    field_id: str | None,
) -> tuple[float | None, float | None]:
    if lat is not None and lng is not None:
        return lat, lng
    if zone_id:
        z = await db.get(ScanZone, zone_id)
        if z:
            return z.centroid_lat, z.centroid_lng
    if user is not None:
        if field_id:
            try:
                f = await db.get(FarmField, uuid.UUID(field_id))
            except ValueError:
                f = None
            if f and f.user_id == user.id:
                return f.lat, f.lng
        prof = await db.get(Profile, user.id)
        if prof and prof.home_lat is not None:
            return prof.home_lat, prof.home_lng
    return None, None


async def answer(c: Ctx, intent: str) -> Answer:
    a = Answer(intent=intent)
    await HANDLERS[intent](c, a)
    if intent in WEATHER_WARNINGS and c.lat is not None:
        cond = await c.conditions()
        for w in (cond or {}).get("warnings", []):
            a.warnings.append({"source": w.get("source", "local"), "text": w["text"], "level": w.get("level")})
    return a
