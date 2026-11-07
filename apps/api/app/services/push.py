"""Web push (prompt-v1 §6.13 W2): VAPID subscriptions, quiet hours 22:00–07:00 local, and a short
per-kind line in the person's language. Lock screens never show names, places or post text; the
notification opens the app, which shows the full message.

Push is off when VAPID keys are absent (`settings.push_enabled`). Subscriptions that the push
service reports gone (404/410) are deleted.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..errors import AppError
from ..models import Notification, Profile, PushSubscription, User

log = logging.getLogger("atmos.push")

QUIET_FROM_H = 22
QUIET_TO_H = 7
#: Notifications older than this are never pushed (they are still in the app).
MAX_AGE = timedelta(hours=12)
BATCH = 200

LANGS = ("en", "bn", "hi", "ur", "ar", "es", "fr", "pt", "id", "zh")
# Short, private lines per notification kind. Order follows LANGS.
_TEXT: dict[str, tuple[str, ...]] = {
    "tree_due": (
        "A tree is waiting for its photo",
        "একটি গাছ তার ছবির অপেক্ষায়",
        "एक पेड़ अपनी फ़ोटो का इंतज़ार कर रहा है",
        "ایک درخت اپنی تصویر کا منتظر ہے",
        "شجرة تنتظر صورتها",
        "Un árbol espera su foto",
        "Un arbre attend sa photo",
        "Uma árvore espera a foto dela",
        "Sebuah pohon menunggu fotonya",
        "有一棵树在等它的照片",
    ),
    "tree_milestone": (
        "One of your trees reached a milestone",
        "আপনার একটি গাছ নতুন ধাপে পৌঁছেছে",
        "आपके एक पेड़ ने नया पड़ाव पार किया",
        "آپ کے ایک درخت نے نیا سنگ میل عبور کیا",
        "بلغت إحدى أشجارك مرحلة جديدة",
        "Uno de tus árboles alcanzó un hito",
        "Un de vos arbres a franchi une étape",
        "Uma das suas árvores atingiu um marco",
        "Salah satu pohon Anda mencapai tonggak baru",
        "你的一棵树达到了新里程碑",
    ),
    "verification": (
        "An update on your action",
        "আপনার কাজের একটি আপডেট",
        "आपके काम पर एक अपडेट",
        "آپ کے کام پر ایک اپڈیٹ",
        "تحديث بشأن عملك",
        "Novedades sobre tu acción",
        "Du nouveau sur votre action",
        "Novidade sobre a sua ação",
        "Kabar terbaru tentang aksi Anda",
        "你的行动有新进展",
    ),
    "heat_warning": (
        "Heat warning near you",
        "আপনার কাছে তাপ সতর্কতা",
        "आपके पास गर्मी की चेतावनी",
        "آپ کے قریب گرمی کا انتباہ",
        "تحذير من الحر بالقرب منك",
        "Aviso de calor cerca de ti",
        "Alerte chaleur près de vous",
        "Alerta de calor perto de você",
        "Peringatan panas di dekat Anda",
        "你附近有高温预警",
    ),
    "farm_alert": (
        "A new alert for your field",
        "আপনার জমির জন্য নতুন সতর্কতা",
        "आपके खेत के लिए नई चेतावनी",
        "آپ کے کھیت کے لیے نیا انتباہ",
        "تنبيه جديد لحقلك",
        "Nueva alerta para tu parcela",
        "Nouvelle alerte pour votre parcelle",
        "Novo alerta para a sua lavoura",
        "Peringatan baru untuk lahan Anda",
        "你的田地有新预警",
    ),
    "team_invite": (
        "News from your team",
        "আপনার দলের খবর",
        "आपकी टीम से ख़बर",
        "آپ کی ٹیم کی خبر",
        "أخبار من فريقك",
        "Novedades de tu equipo",
        "Des nouvelles de votre équipe",
        "Novidades da sua equipe",
        "Kabar dari tim Anda",
        "你的团队有新动态",
    ),
    "event": (
        "A planting drive is coming up",
        "একটি রোপণ কর্মসূচি আসছে",
        "एक रोपण अभियान आने वाला है",
        "ایک شجرکاری مہم آنے والی ہے",
        "حملة زراعة قادمة",
        "Se acerca una jornada de plantación",
        "Une journée de plantation approche",
        "Um mutirão de plantio está chegando",
        "Aksi tanam akan segera dimulai",
        "植树活动即将开始",
    ),
    "social": (
        "Someone interacted with you in the community",
        "কমিউনিটিতে কেউ আপনার সাথে যোগাযোগ করেছে",
        "समुदाय में किसी ने आपसे बातचीत की",
        "کمیونٹی میں کسی نے آپ سے رابطہ کیا",
        "تفاعل معك أحدهم في المجتمع",
        "Alguien interactuó contigo en la comunidad",
        "Quelqu'un a interagi avec vous dans la communauté",
        "Alguém interagiu com você na comunidade",
        "Seseorang berinteraksi dengan Anda di komunitas",
        "有人在社区与你互动",
    ),
    "generic": (
        "You have a new notification",
        "আপনার একটি নতুন বিজ্ঞপ্তি আছে",
        "आपके लिए एक नई सूचना है",
        "آپ کے لیے ایک نئی اطلاع ہے",
        "لديك إشعار جديد",
        "Tienes una notificación nueva",
        "Vous avez une nouvelle notification",
        "Você tem uma nova notificação",
        "Anda punya notifikasi baru",
        "你有一条新通知",
    ),
}
_KIND = {
    "tree_due": "tree_due",
    "tree_milestone": "tree_milestone",
    "tree_helper": "tree_milestone",
    "badge": "tree_milestone",
    "verification": "verification",
    "goal_progress": "verification",
    "heat_warning": "heat_warning",
    "farm_alert": "farm_alert",
    "team_invite": "team_invite",
    "event": "event",
    "like": "social",
    "comment": "social",
    "mention": "social",
    "follow": "social",
}


def text_for(kind: str, lang: str) -> str:
    row = _TEXT[_KIND.get(kind, "generic")]
    return row[LANGS.index(lang)] if lang in LANGS else row[0]


def is_quiet(now_utc: datetime, tz_offset_min: int) -> bool:
    """True from 22:00 to 07:00 in the subscriber's local time."""
    local = now_utc + timedelta(minutes=tz_offset_min)
    return local.hour >= QUIET_FROM_H or local.hour < QUIET_TO_H


def config() -> dict:
    return {
        "enabled": settings.push_enabled,
        "public_key": settings.vapid_public_key if settings.push_enabled else None,
        "quiet_hours": {"from": QUIET_FROM_H, "to": QUIET_TO_H},
    }


def _require() -> None:
    if not settings.push_enabled:
        raise AppError(503, "push.unavailable", "Push notifications aren't set up on this server")


async def subscribe(db: AsyncSession, user: User, endpoint: str, p256dh: str, auth: str, tz_offset_min: int) -> dict:
    _require()
    if not endpoint.startswith("https://"):
        raise AppError(400, "push.endpoint", "Not a push endpoint")
    stmt = insert(PushSubscription).values(
        id=uuid.uuid4(), user_id=user.id, endpoint=endpoint, p256dh=p256dh, auth=auth, tz_offset_min=tz_offset_min
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["endpoint"],
        set_={"user_id": user.id, "p256dh": p256dh, "auth": auth, "tz_offset_min": tz_offset_min},
    )
    await db.execute(stmt)
    prof = await db.get(Profile, user.id)
    if prof is not None:
        prof.push_on = True
    await db.commit()
    return {"ok": True, "push_on": True}


async def unsubscribe(db: AsyncSession, user: User, endpoint: str | None) -> dict:
    q = delete(PushSubscription).where(PushSubscription.user_id == user.id)
    if endpoint:
        q = q.where(PushSubscription.endpoint == endpoint)
    await db.execute(q)
    left = (await db.execute(select(PushSubscription.id).where(PushSubscription.user_id == user.id))).first()
    prof = await db.get(Profile, user.id)
    if prof is not None:
        prof.push_on = left is not None
    await db.commit()
    return {"ok": True, "push_on": left is not None}


def _send_one(sub: PushSubscription, payload: dict) -> int:
    """Blocking pywebpush call (run in a thread). Returns the HTTP status (0 on network failure)."""
    from pywebpush import WebPushException, webpush

    try:
        r = webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject or "mailto:push@atmos-x.invalid"},
            ttl=6 * 3600,
            timeout=10,
        )
        return getattr(r, "status_code", 201) or 201
    except WebPushException as e:
        return getattr(getattr(e, "response", None), "status_code", 0) or 0


async def send_pending(db: AsyncSession, now: datetime | None = None) -> dict:
    """Push recent, unpushed notifications to people who turned push on. Quiet hours hold them back
    until morning (while they are still under MAX_AGE)."""
    if not settings.push_enabled:
        return {"skipped": "disabled"}
    now = now or datetime.now(UTC)
    rows = (
        await db.execute(
            select(Notification, Profile.lang)
            .join(Profile, Profile.user_id == Notification.user_id)
            .where(
                Notification.pushed_at.is_(None),
                Notification.read.is_(False),
                Notification.created_at >= now - MAX_AGE,
                Profile.push_on.is_(True),
            )
            .order_by(Notification.created_at)
            .limit(BATCH)
        )
    ).all()
    sent = held = gone = 0
    for n, lang in rows:
        subs = (await db.execute(select(PushSubscription).where(PushSubscription.user_id == n.user_id))).scalars().all()
        awake = [s for s in subs if not is_quiet(now, s.tz_offset_min)]
        if subs and not awake:
            held += 1
            continue
        payload = {
            "title": "Atmos X",
            "body": text_for(n.kind, lang or "en"),
            "tag": n.dedupe_key or str(n.id),
            "url": "/app/notifications",
            "id": str(n.id),
        }
        for s in awake:
            status = await asyncio.to_thread(_send_one, s, payload)
            if status in (404, 410):
                await db.delete(s)
                gone += 1
            elif 200 <= status < 300:
                sent += 1
        n.pushed_at = now
    await db.commit()
    return {"notifications": len(rows), "sent": sent, "held_quiet": held, "gone": gone}
