"""Planting drives (prompt-v1 §6.8 C10): date, place, RSVP, check-in at the spot (GPS within 300 m),
group photo, optional sponsor. Reminders go out the day before.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines.heat import haversine_m
from ..errors import AppError, forbidden, not_found
from ..media import photo_url
from ..models import Event, EventCheckin, EventRsvp, Org, Photo, Team, TeamMember, User
from . import people
from .notify import notify
from .profile import point_wkt

CHECKIN_M = 300
NEAR_KM = 25
EARLY = timedelta(hours=2)
LATE = timedelta(hours=2)
DEFAULT_LENGTH = timedelta(hours=6)


def _window(e: Event) -> tuple[datetime, datetime]:
    return e.starts_at - EARLY, (e.ends_at or e.starts_at + DEFAULT_LENGTH) + LATE


async def event_out(db: AsyncSession, events: list[Event], viewer: User | None) -> list[dict]:
    if not events:
        return []
    ids = [e.id for e in events]
    going = dict(
        (
            await db.execute(
                select(EventRsvp.event_id, func.count())
                .where(EventRsvp.event_id.in_(ids), EventRsvp.status == "going")
                .group_by(EventRsvp.event_id)
            )
        ).all()
    )
    checked = dict(
        (
            await db.execute(
                select(EventCheckin.event_id, func.count())
                .where(EventCheckin.event_id.in_(ids))
                .group_by(EventCheckin.event_id)
            )
        ).all()
    )
    my_rsvp, my_in = {}, set()
    if viewer is not None:
        my_rsvp = dict(
            (
                await db.execute(
                    select(EventRsvp.event_id, EventRsvp.status).where(
                        EventRsvp.event_id.in_(ids), EventRsvp.user_id == viewer.id
                    )
                )
            ).all()
        )
        my_in = set(
            (
                await db.execute(
                    select(EventCheckin.event_id).where(
                        EventCheckin.event_id.in_(ids), EventCheckin.user_id == viewer.id
                    )
                )
            )
            .scalars()
            .all()
        )
    cards = await people.cards(db, {e.organizer_id for e in events}, viewer)
    teams = (
        {
            t.id: t
            for t in (await db.execute(select(Team).where(Team.id.in_([e.team_id for e in events if e.team_id]))))
            .scalars()
            .all()
        }
        if any(e.team_id for e in events)
        else {}
    )
    orgs = (
        {
            o.id: o
            for o in (await db.execute(select(Org).where(Org.id.in_([e.org_id for e in events if e.org_id]))))
            .scalars()
            .all()
        }
        if any(e.org_id for e in events)
        else {}
    )
    gp = (
        {
            p.id: p
            for p in (
                await db.execute(
                    select(Photo).where(Photo.id.in_([e.group_photo_id for e in events if e.group_photo_id]))
                )
            )
            .scalars()
            .all()
        }
        if any(e.group_photo_id for e in events)
        else {}
    )
    now = datetime.now(UTC)
    out = []
    for e in events:
        w0, w1 = _window(e)
        ph = gp.get(e.group_photo_id)
        show = ph is not None and (ph.moderation == "approved" or (viewer is not None and viewer.id == e.organizer_id))
        out.append(
            {
                "id": str(e.id),
                "title": e.title,
                "description": e.description,
                "starts_at": e.starts_at.isoformat(),
                "ends_at": e.ends_at.isoformat() if e.ends_at else None,
                "place_name": e.place_name,
                "location": {"lat": e.lat, "lng": e.lng},
                "organizer": cards.get(e.organizer_id),
                "team": {"id": str(e.team_id), "name": teams[e.team_id].name} if e.team_id in teams else None,
                "org": {"id": str(e.org_id), "name": orgs[e.org_id].name} if e.org_id in orgs else None,
                "sponsor_name": e.sponsor_name,
                "capacity": e.capacity,
                "going": int(going.get(e.id, 0)),
                "checked_in": int(checked.get(e.id, 0)),
                "my_rsvp": my_rsvp.get(e.id),
                "i_checked_in": e.id in my_in,
                "checkin_open": w0 <= now <= w1,
                "group_photo_url": photo_url(e.group_photo_id, "public") if show else None,
                "mine": viewer is not None and viewer.id == e.organizer_id,
                "is_demo": e.is_demo,
            }
        )
    return out


async def listing(
    db: AsyncSession, viewer: User | None, lat: float | None, lng: float | None, past: bool = False
) -> list[dict]:
    now = datetime.now(UTC)
    q = select(Event).where(people.demo_filter(Event.is_demo, viewer))
    q = q.where(Event.starts_at < now - EARLY) if past else q.where(Event.starts_at >= now - DEFAULT_LENGTH)
    if lat is not None and lng is not None:
        here = func.ST_GeogFromText(f"SRID=4326;POINT({float(lng)} {float(lat)})")
        q = q.where(func.ST_DWithin(Event.geom, here, NEAR_KM * 1000))
    rows = (await db.execute(q.order_by(Event.starts_at.desc() if past else Event.starts_at).limit(50))).scalars().all()
    return await event_out(db, list(rows), viewer)


async def get(db: AsyncSession, event_id: uuid.UUID, viewer: User | None) -> Event:
    e = await db.get(Event, event_id)
    if e is None or e.is_demo != bool(viewer is not None and viewer.is_demo):
        raise not_found("event.not_found", "Event not found")
    return e


async def create(db: AsyncSession, user: User, data: dict) -> Event:
    starts = data["starts_at"]
    if starts.tzinfo is None:
        starts = starts.replace(tzinfo=UTC)
    if starts < datetime.now(UTC) - timedelta(minutes=5):
        raise AppError(400, "event.past", "Pick a time in the future", fields={"starts_at": "past"})
    ends = data.get("ends_at")
    if ends is not None:
        ends = ends if ends.tzinfo else ends.replace(tzinfo=UTC)
        if ends <= starts:
            raise AppError(400, "event.ends", "The end must be after the start", fields={"ends_at": "before_start"})
    team_id = data.get("team_id")
    if (
        team_id is not None
        and not (
            await db.execute(
                select(TeamMember.user_id).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
            )
        ).first()
    ):
        raise forbidden("team.not_member", "You are not in that team")
    if data.get("org_id") is not None and await db.get(Org, data["org_id"]) is None:
        raise not_found("org.not_found", "Organization not found")
    e = Event(
        title=data["title"].strip()[:120],
        description=(data.get("description") or "").strip()[:2000] or None,
        starts_at=starts,
        ends_at=ends,
        place_name=data["place_name"].strip()[:200],
        lat=data["lat"],
        lng=data["lng"],
        geom=point_wkt(data["lat"], data["lng"]),
        organizer_id=user.id,
        team_id=team_id,
        org_id=data.get("org_id"),
        sponsor_name=(data.get("sponsor_name") or "").strip()[:120] or None,
        capacity=data.get("capacity"),
        is_demo=user.is_demo,
    )
    db.add(e)
    await db.flush()
    db.add(EventRsvp(event_id=e.id, user_id=user.id, status="going"))
    await db.commit()
    return e


async def rsvp(db: AsyncSession, e: Event, user: User, status: str) -> None:
    if status not in ("going", "maybe", "no"):
        raise AppError(400, "event.rsvp", "Pick going, maybe or no")
    r = await db.get(EventRsvp, (e.id, user.id))
    if status == "going" and e.capacity and (r is None or r.status != "going"):
        n = (
            await db.execute(
                select(func.count())
                .select_from(EventRsvp)
                .where(EventRsvp.event_id == e.id, EventRsvp.status == "going")
            )
        ).scalar_one()
        if n >= e.capacity:
            raise AppError(409, "event.full", "This event is full")
    if r is None:
        db.add(EventRsvp(event_id=e.id, user_id=user.id, status=status))
    else:
        r.status = status
    await db.commit()


async def checkin(db: AsyncSession, e: Event, user: User, lat: float, lng: float, accuracy_m: float | None) -> dict:
    w0, w1 = _window(e)
    now = datetime.now(UTC)
    if not (w0 <= now <= w1):
        raise AppError(
            409, "event.checkin_closed", "Check-in opens 2 hours before the start and closes 2 hours after the end"
        )
    if accuracy_m is not None and accuracy_m > 100:
        raise AppError(400, "event.gps_inaccurate", "Your location isn't accurate enough; try again outdoors")
    d = haversine_m(lat, lng, e.lat, e.lng)
    if d > CHECKIN_M:
        raise AppError(
            409, "event.too_far", "You need to be within 300 m of the event", fields={"dist_m": str(round(d))}
        )
    if await db.get(EventCheckin, (e.id, user.id)) is None:
        db.add(EventCheckin(event_id=e.id, user_id=user.id, dist_m=round(d, 1)))
        if await db.get(EventRsvp, (e.id, user.id)) is None:
            db.add(EventRsvp(event_id=e.id, user_id=user.id, status="going"))
    await db.commit()
    return {"checked_in": True, "dist_m": round(d)}


async def set_group_photo(db: AsyncSession, e: Event, user: User, photo: Photo) -> None:
    if user.id != e.organizer_id:
        raise forbidden("event.not_organizer", "Only the organizer can add the group photo")
    e.group_photo_id = photo.id
    await db.commit()


async def remind(db: AsyncSession) -> int:
    """Reminders for events in the next 24 h, once per event."""
    now = datetime.now(UTC)
    rows = (
        (
            await db.execute(
                select(Event).where(
                    Event.starts_at > now, Event.starts_at <= now + timedelta(hours=24), Event.reminded_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    n = 0
    for e in rows:
        for uid in (
            (
                await db.execute(
                    select(EventRsvp.user_id).where(
                        EventRsvp.event_id == e.id, EventRsvp.status.in_(("going", "maybe"))
                    )
                )
            )
            .scalars()
            .all()
        ):
            await notify(
                db,
                uid,
                "event",
                {"code": "notif.event.reminder", "params": {"title": e.title, "date": e.starts_at.date().isoformat()}},
                screen="S16",
                params={"event_id": str(e.id)},
                dedupe_key=f"event:{e.id}:remind",
            )
            n += 1
        e.reminded_at = now
    await db.commit()
    return n
