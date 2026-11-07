"""Demo mode story (prompt-v1 §8.4): Nadia's trees, actions, goal, field and team, plus a shared,
clearly invented demo community (people, teams, an organization, posts and an event) around the demo
point in Mohammadpur, Dhaka. Every row is `is_demo`, so real boards and feeds never show it, and
demo users never see real people. Heat data stays real. No real organization is ever named (E5).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..engines import trees as TR
from ..models import (
    Action,
    ActionType,
    Event,
    EventRsvp,
    FarmField,
    Org,
    Post,
    Profile,
    Team,
    TeamMember,
    Tree,
    TreeCheck,
    User,
)
from . import points as PTS
from .notify import notify
from .profile import point_wkt

NS = uuid.UUID("6f1c2a52-6b1e-4d2c-9a0e-5f6d8f0a7c11")


def _id(name: str) -> uuid.UUID:
    return uuid.uuid5(NS, name)


# Invented people and groups only.
ORG = ("Campus Green Society", "school", "🎓")
TEAMS = [
    ("Shade Street Collective", "🌳"),
    ("Ward 7 Volunteers", "🧑‍🤝‍🧑"),
    ("Riverbank Greeners", "🌊"),
    ("Rooftop Cool Crew", "🏠"),
]
PEOPLE = [
    # name, team index, points this month, points before, trees
    ("Tanvir Hossain", 1, 420, 900, 9),
    ("Farzana Akter", 1, 310, 650, 6),
    ("Rafiq Uddin", 2, 280, 400, 5),
    ("Shirin Sultana", 2, 190, 520, 4),
    ("Imran Kabir", 3, 160, 300, 3),
    ("Laila Noor", 3, 120, 210, 2),
    ("Mahmud Hasan", 0, 90, 150, 2),
]
POSTS = [
    (0, "Planted 3 neem saplings along the lane behind the school. Guards on, watering rota set."),
    (1, "Ward 7 shade walk this Friday: we map the hottest stretch and pick 10 spots for trees."),
    (2, "Our riverbank strip is greener after the rain. Survival so far: 5 of 5."),
    (4, "Painted 40 m² of our roof white. The room under it feels cooler already."),
]


def _demo_point() -> tuple[float, float]:
    return settings.next_public_demo_lat, settings.next_public_demo_lng


async def ensure_community(db: AsyncSession) -> dict:
    """Create the shared demo community once (fixed ids, safe to call again)."""
    lat, lng = _demo_point()
    now = datetime.now(UTC)
    people_ids = [_id(f"person:{i}") for i in range(len(PEOPLE))]
    owners: dict[int, uuid.UUID] = {}
    for i, p in enumerate(PEOPLE):
        owners.setdefault(p[1], people_ids[i])
    for i, (name, *_rest) in enumerate(PEOPLE):
        if await db.get(User, people_ids[i]) is not None:
            continue
        db.add(
            User(id=people_ids[i], role="user", display_name=name, is_demo=True, created_at=now - timedelta(days=120))
        )
        await db.flush()
        plat, plng = lat + 0.004 * ((i % 3) - 1), lng + 0.004 * ((i % 2) - 0.5)
        db.add(
            Profile(
                user_id=people_ids[i],
                area="Mohammadpur",
                city="Dhaka",
                country_code="BD",
                home_lat=plat,
                home_lng=plng,
                home_geom=point_wkt(plat, plng),
                onboarded=True,
            )
        )
    org = await db.get(Org, _id("org"))
    if org is None:
        org = Org(
            id=_id("org"),
            name=ORG[0],
            kind=ORG[1],
            logo_emoji=ORG[2],
            city="Dhaka",
            country="BD",
            lat=lat,
            lng=lng,
            description="Students and neighbours cooling Mohammadpur (demo).",
            is_demo=True,
        )
        db.add(org)
    await db.flush()
    for i, (name, emoji) in enumerate(TEAMS):
        if await db.get(Team, _id(f"team:{i}")) is None:
            tl, tg = lat + 0.002 * i, lng - 0.002 * i
            db.add(
                Team(
                    id=_id(f"team:{i}"),
                    name=name,
                    code=f"DEMO{i}{_id('code').hex[:3].upper()}",
                    owner_id=owners.get(i, people_ids[0]),
                    max_members=5,
                    is_public=True,
                    area="Mohammadpur",
                    city="Dhaka",
                    country="BD",
                    lat=tl,
                    lng=tg,
                    geom=point_wkt(tl, tg),
                    emoji=emoji,
                    org_id=org.id if i < 3 else None,
                    is_demo=True,
                )
            )
    await db.flush()
    month_start = now.replace(day=1, hour=6, minute=0, second=0, microsecond=0)
    has_types = await db.get(ActionType, "plant_tree") is not None  # reference data (make seed)
    for i, (_, ti, month_pts, before_pts, trees) in enumerate(PEOPLE):
        uid, tid = people_ids[i], _id(f"team:{ti}")
        if not (
            await db.execute(select(TeamMember).where(TeamMember.team_id == tid, TeamMember.user_id == uid))
        ).first():
            db.add(
                TeamMember(
                    team_id=tid,
                    user_id=uid,
                    role="lead" if owners.get(ti) == uid else "member",
                    joined_at=now - timedelta(days=90),
                )
            )
        if not has_types or (await db.execute(select(Action.id).where(Action.user_id == uid))).first():
            continue
        db.add(
            Action(
                id=_id(f"action:{i}"),
                user_id=uid,
                action_type="plant_tree",
                quantity=trees,
                lat=lat,
                lng=lng,
                status="verified",
                checks=[],
                reason_code="demo",
                points=50 * trees,
                cooling_c=round(0.0006 * trees / 0.1, 4),
                team_id=tid,
                capture_source="camera",
                created_at=now - timedelta(days=40),
                verified_at=now - timedelta(days=40),
            )
        )
        await PTS.earn(
            db,
            uid,
            before_pts,
            rule_id="PT1",
            source_type="action",
            source_id=str(_id(f"action:{i}")),
            state="spendable",
            at=now - timedelta(days=45),
        )
        await PTS.earn(
            db,
            uid,
            month_pts,
            rule_id="ACTION",
            source_type="action",
            source_id=str(_id(f"action:{i}")),
            state="spendable",
            at=max(month_start, now - timedelta(hours=2)),
        )
    if not (await db.execute(select(Post.id).where(Post.is_demo.is_(True)))).first():
        for k, (pi, body) in enumerate(POSTS):
            db.add(
                Post(
                    user_id=people_ids[pi],
                    body=body,
                    team_id=_id(f"team:{PEOPLE[pi][1]}"),
                    area="Mohammadpur",
                    city="Dhaka",
                    country="BD",
                    geom=point_wkt(round(lat, 2), round(lng, 2)),
                    is_demo=True,
                    created_at=now - timedelta(hours=6 + 20 * k),
                )
            )
    if not (await db.execute(select(Event.id).where(Event.is_demo.is_(True), Event.starts_at > now))).first():
        start = (now + timedelta(days=3)).replace(hour=3, minute=0, second=0, microsecond=0)
        e = Event(
            id=_id(f"event:{start.date()}"),
            title="Lane planting drive",
            description="Bring gloves; saplings and guards provided (demo event).",
            starts_at=start,
            ends_at=start + timedelta(hours=3),
            place_name="Asad Gate lane",
            lat=lat + 0.001,
            lng=lng + 0.001,
            geom=point_wkt(lat + 0.001, lng + 0.001),
            organizer_id=people_ids[0],
            team_id=_id("team:1"),
            org_id=org.id,
            capacity=40,
            is_demo=True,
        )
        db.add(e)
        await db.flush()
        for uid in people_ids[:4]:
            db.add(EventRsvp(event_id=e.id, user_id=uid, status="going"))
    await db.flush()
    return {"org_id": org.id, "team_id": _id("team:0")}


async def seed_nadia(db: AsyncSession, user: User) -> None:
    """Nadia's own story: lead of Shade Street Collective, 4 trees (one due today), verified actions, a field."""
    lat, lng = _demo_point()
    comm = await ensure_community(db)
    team = await db.get(Team, comm["team_id"])
    n = len((await db.execute(select(TeamMember).where(TeamMember.team_id == team.id))).all())
    if n < team.max_members:
        db.add(TeamMember(team_id=team.id, user_id=user.id, role="member"))
    now = datetime.now(UTC)
    plant = await db.get(ActionType, "plant_tree")
    roof = await db.get(ActionType, "cool_roof")
    trees_spec = [
        ("Shanti", "neem", 3, 0.0),
        ("Chhaya", "krish", 40, 25.0),
        ("Bokul", "bokul", 95, 30.0),
        ("Arjun", "arjun", 130, 50.0),
    ]
    for k, (nick, sp, days, _h) in enumerate(trees_spec if plant else []):
        a = Action(
            user_id=user.id,
            action_type="plant_tree",
            quantity=1,
            lat=lat + 0.0003 * k,
            lng=lng + 0.0002 * k,
            accuracy_m=8,
            taken_at=now - timedelta(days=days),
            capture_source="camera",
            status="verified",
            checks=[],
            reason_code="demo",
            points=0,
            cooling_c=0.006,
            team_id=team.id,
            species_id=sp,
            nickname=nick,
            created_at=now - timedelta(days=days),
            verified_at=now - timedelta(days=days),
        )
        db.add(a)
        await db.flush()
        planted = now - timedelta(days=days)
        # One tree is due today; the others were checked on schedule.
        last = planted if days < 15 else planted + timedelta(days=15 * (days // 15))
        due = now if k == 1 else TR.next_due(last)
        t = Tree(
            user_id=user.id,
            action_id=a.id,
            team_id=team.id,
            species_id=sp,
            nickname=nick,
            planted_at=planted,
            lat=a.lat,
            lng=a.lng,
            last_check_at=last if days >= 15 else None,
            next_due_at=due,
        )
        db.add(t)
        await db.flush()
        for c in range(days // 15):
            db.add(
                TreeCheck(
                    tree_id=t.id,
                    user_id=user.id,
                    health="healthy",
                    height_cm=40 + 12 * c,
                    on_time=True,
                    checks=[],
                    points=10,
                    created_at=planted + timedelta(days=15 * (c + 1)),
                )
            )
        if plant:
            from .actions import award

            await award(db, a, plant)
        if days >= 90:
            t.milestones = {"d90": (planted + timedelta(days=90)).isoformat()}
            await PTS.earn(
                db, user.id, 50, rule_id="PT3", source_type="tree", source_id=str(t.id), tree_id=t.id, state="spendable"
            )
            await PTS.unlock_tree(db, t.id)
    if roof:
        a = Action(
            user_id=user.id,
            action_type="cool_roof",
            quantity=4,
            lat=lat,
            lng=lng,
            taken_at=now - timedelta(days=100),
            capture_source="camera",
            status="verified",
            checks=[],
            reason_code="demo",
            points=0,
            cooling_c=0.016,
            team_id=team.id,
            created_at=now - timedelta(days=100),
            verified_at=now - timedelta(days=100),
        )
        db.add(a)
        await db.flush()
        from .actions import award

        await award(db, a, roof)
    db.add(
        FarmField(user_id=user.id, name="North plot", crop="boro", stage="flowering", lat=23.7712, lng=90.342, area=1.2)
    )
    await notify(
        db,
        user.id,
        "tree_due",
        {"code": "notif.tree.due_on", "params": {"name": "Chhaya", "date": date.today().isoformat()}},
        screen="S20",
        params={},
    )
    from . import badges as B

    await B.evaluate(db, user.id)
    await db.flush()
    # A team goal on the scanned zone at the demo point, when the heat precompute has run.
    import h3

    from ..models import ScanZone

    cell = h3.latlng_to_cell(lat, lng, 10)
    z = (
        await db.execute(
            select(ScanZone).where(ScanZone.h3.contains([cell])).order_by(ScanZone.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if z is not None:
        from ..errors import AppError
        from . import goals as G

        try:
            await G.create(
                db,
                user,
                zone_id=z.id,
                target_c=-1.0,
                by_date=date.today().replace(year=date.today().year + 2),
                team_id=team.id,
                lang="en",
            )
        except AppError:
            pass


SEEDERS: list = [seed_nadia]


async def seed_story(db: AsyncSession, user: User) -> None:
    for fn in SEEDERS:
        await fn(db, user)


async def purge_old(db: AsyncSession, days: int = 7) -> int:
    """Delete demo users older than `days` (their rows cascade). The shared community stays."""
    cutoff = datetime.now(UTC) - timedelta(days=days)
    keep = {_id(f"person:{i}") for i in range(len(PEOPLE))}
    rows = (await db.execute(select(User.id).where(User.is_demo.is_(True), User.created_at < cutoff))).scalars().all()
    gone = [u for u in rows if u not in keep]
    if gone:
        from sqlalchemy import text

        await db.execute(text("SET LOCAL atmos.allow_ledger_delete = 'on'"))
        from ..models import PointsLedger

        await db.execute(delete(PointsLedger).where(PointsLedger.user_id.in_(gone)))
        await db.execute(delete(User).where(User.id.in_(gone)))
    await db.commit()
    return len(gone)
