"""Feed, posts, likes, comments, @mentions, follows, reports, blocks, moderation, notifications and
public profiles (prompt-v1 §6.8 C5–C7, C12–C14).

Posts carry the author's area, city and a location rounded to about 1 km, never a precise point.
Photos on posts are public, so they wait for moderation (§7.12) and show only once approved.
New accounts (under 24 h) get lower posting limits. Blocked people disappear from each other's feed.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import AppError, forbidden, not_found
from ..media import photo_url
from ..models import (
    Action,
    ActionType,
    Block,
    Comment,
    Follow,
    Mention,
    ModerationAction,
    Notification,
    Photo,
    Post,
    PostLike,
    Profile,
    Report,
    Team,
    TeamMember,
    Tree,
    User,
)
from ..ratelimit import day_start_local, hit
from . import badges as B
from . import people
from . import points as PTS
from .notify import notify
from .profile import point_wkt

AREA_M = 3000
MENTION = re.compile(r"@\[([^\]]{1,80})\]\(([0-9a-f-]{36})\)")
REPORT_REASONS = ("spam", "abuse", "nudity", "violence", "fake", "dangerous", "other")
REPORT_TARGETS = ("post", "comment", "photo", "user", "action", "tree")


def _is_mod(u: User | None) -> bool:
    return u is not None and u.role in ("moderator", "admin")


async def _daily_limit(db: AsyncSession, user: User, kind: str, normal: int, new: int) -> None:
    fresh = user.created_at > datetime.now(UTC) - timedelta(hours=24)
    cap = new if fresh else normal
    n = await hit(db, f"{kind}:{user.id}", day_start_local(datetime.now(UTC)))
    if n > cap:
        raise AppError(429, f"{kind}.daily_limit", "Daily limit reached; try again tomorrow")


# ── posts ───────────────────────────────────────────────────────────────────


async def create_post(
    db: AsyncSession,
    user: User,
    *,
    body: str,
    photo: Photo | None,
    team_id: uuid.UUID | None,
    action_id: uuid.UUID | None,
    tree_id: uuid.UUID | None,
    share_photo: bool,
) -> Post:
    await _daily_limit(db, user, "post", 30, 5)
    body = (body or "").strip()[:2000]
    if (
        team_id is not None
        and not (
            await db.execute(
                select(TeamMember.user_id).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
            )
        ).first()
    ):
        raise forbidden("team.not_member", "You are not in that team")
    act = None
    if action_id is not None:
        act = await db.get(Action, action_id)
        if act is None or act.user_id != user.id:
            raise not_found("action.not_found", "Action not found")
        if act.status != "verified":
            raise AppError(409, "post.action_not_verified", "Only verified actions can be shared")
        team_id = team_id or act.team_id
        if photo is None and share_photo and act.photo_id:
            photo = await _public_copy(db, user, act.photo_id)
    if tree_id is not None:
        t = await db.get(Tree, tree_id)
        if t is None or t.user_id != user.id:
            raise not_found("tree.not_found", "Tree not found")
    if not body and photo is None and act is None:
        raise AppError(400, "post.empty", "Write something or add a photo")
    prof = await db.get(Profile, user.id)
    lat = round(prof.home_lat, 2) if prof and prof.home_lat is not None else None
    lng = round(prof.home_lng, 2) if prof and prof.home_lng is not None else None
    p = Post(
        user_id=user.id,
        body=body,
        photo_id=photo.id if photo else None,
        action_id=act.id if act else None,
        tree_id=tree_id,
        team_id=team_id,
        area=prof.area if prof else None,
        city=prof.city if prof else None,
        country=prof.country_code if prof else None,
        geom=point_wkt(lat, lng) if lat is not None else None,
        is_demo=user.is_demo,
    )
    db.add(p)
    await db.flush()
    await _mentions(db, user, body, post_id=p.id)
    await db.commit()
    return p


async def _public_copy(db: AsyncSession, user: User, photo_id: uuid.UUID) -> Photo | None:
    """C14: sharing a verified action publishes a moderated copy of its (EXIF-free) photo."""
    src = await db.get(Photo, photo_id)
    if src is None or src.owner_id != user.id:
        return None
    p = Photo(
        owner_id=user.id,
        purpose="post",
        path_original=src.path_original,
        path_public=src.path_public,
        path_thumb=src.path_thumb,
        mime=src.mime,
        width=src.width,
        height=src.height,
        phash=src.phash,
        moderation="pending",
        private=False,
    )
    db.add(p)
    await db.flush()
    from ..storage import storage
    from .photos import moderate

    try:
        data = storage().path(src.path_public).read_bytes() if src.path_public else None
    except OSError:
        data = None
    if data:
        await moderate(db, p, data)
    return p


async def _mentions(
    db: AsyncSession, author: User, body: str, *, post_id: uuid.UUID | None = None, comment_id: uuid.UUID | None = None
) -> None:
    seen: set[uuid.UUID] = set()
    for _, uid_s in MENTION.findall(body or ""):
        try:
            uid = uuid.UUID(uid_s)
        except ValueError:
            continue
        if uid in seen or uid == author.id or len(seen) >= 10:
            continue
        u = await db.get(User, uid)
        if u is None or u.deleted_at is not None:
            continue
        seen.add(uid)
        db.add(Mention(user_id=uid, post_id=post_id, comment_id=comment_id))
        await notify(
            db,
            uid,
            "mention",
            {"code": "notif.social.mention", "params": {"who": author.display_name}},
            screen="S16",
            params={"post_id": str(post_id) if post_id else ""},
            dedupe_key=f"mention:{post_id or comment_id}:{uid}",
        )


def plain(body: str) -> str:
    """`@[Name](id)` → `@Name` for display without links."""
    return MENTION.sub(lambda m: "@" + m.group(1), body or "")


async def post_out(db: AsyncSession, posts: list[Post], viewer: User | None) -> list[dict]:
    if not posts:
        return []
    ids = [p.id for p in posts]
    likes = dict(
        (
            await db.execute(
                select(PostLike.post_id, func.count()).where(PostLike.post_id.in_(ids)).group_by(PostLike.post_id)
            )
        ).all()
    )
    comments = dict(
        (
            await db.execute(
                select(Comment.post_id, func.count())
                .where(Comment.post_id.in_(ids), Comment.hidden.is_(False))
                .group_by(Comment.post_id)
            )
        ).all()
    )
    mine = set()
    if viewer is not None:
        mine = set(
            (await db.execute(select(PostLike.post_id).where(PostLike.post_id.in_(ids), PostLike.user_id == viewer.id)))
            .scalars()
            .all()
        )
    photos = (
        {
            ph.id: ph
            for ph in (await db.execute(select(Photo).where(Photo.id.in_([p.photo_id for p in posts if p.photo_id]))))
            .scalars()
            .all()
        }
        if any(p.photo_id for p in posts)
        else {}
    )
    acts = (
        {
            a.id: a
            for a in (
                await db.execute(select(Action).where(Action.id.in_([p.action_id for p in posts if p.action_id])))
            )
            .scalars()
            .all()
        }
        if any(p.action_id for p in posts)
        else {}
    )
    teams = (
        {
            t.id: t
            for t in (await db.execute(select(Team).where(Team.id.in_([p.team_id for p in posts if p.team_id]))))
            .scalars()
            .all()
        }
        if any(p.team_id for p in posts)
        else {}
    )
    cards = await people.cards(db, {p.user_id for p in posts}, viewer)
    out = []
    for p in posts:
        ph = photos.get(p.photo_id)
        show = ph is not None and (
            ph.moderation == "approved" or (viewer is not None and (viewer.id == p.user_id or _is_mod(viewer)))
        )
        a = acts.get(p.action_id)
        t = teams.get(p.team_id)
        out.append(
            {
                "id": str(p.id),
                "author": cards.get(p.user_id),
                "body": p.body,
                "photo_url": photo_url(p.photo_id, "public") if show else None,
                "photo_pending": ph is not None and ph.moderation == "pending",
                "action": {
                    "id": str(a.id),
                    "action_type": a.action_type,
                    "quantity": a.quantity,
                    "points": a.points,
                    "cooling_c": a.cooling_c,
                }
                if a
                else None,
                "tree_id": str(p.tree_id) if p.tree_id else None,
                "team": {"id": str(t.id), "name": t.name, "emoji": t.emoji} if t else None,
                "area": p.area,
                "city": p.city,
                "likes": int(likes.get(p.id, 0)),
                "liked": p.id in mine,
                "comments": int(comments.get(p.id, 0)),
                "mine": viewer is not None and viewer.id == p.user_id,
                "can_delete": viewer is not None and (viewer.id == p.user_id or _is_mod(viewer)),
                "is_demo": p.is_demo,
                "hidden": p.hidden,
                "created_at": p.created_at.isoformat(),
            }
        )
    return out


async def feed(
    db: AsyncSession,
    viewer: User | None,
    flt: str,
    *,
    lat: float | None,
    lng: float | None,
    before: datetime | None,
    limit: int = 20,
    user_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> dict:
    q = select(Post).where(people.demo_filter(Post.is_demo, viewer))
    if not _is_mod(viewer):
        q = q.where(Post.hidden.is_(False))
    blocked = await people.blocked_ids(db, viewer.id if viewer else None)
    if blocked:
        q = q.where(Post.user_id.not_in(blocked))
    status = "ready"
    if user_id is not None:
        q = q.where(Post.user_id == user_id)
    elif team_id is not None:
        q = q.where(Post.team_id == team_id)
    elif flt == "following":
        if viewer is None:
            return {"posts": [], "status": "no_follows", "next": None}
        fu = select(Follow.user_id).where(Follow.follower_id == viewer.id, Follow.user_id.is_not(None))
        ft = select(Follow.team_id).where(Follow.follower_id == viewer.id, Follow.team_id.is_not(None))
        q = q.where(or_(Post.user_id.in_(fu), Post.team_id.in_(ft), Post.user_id == viewer.id))
    elif flt in ("area", "city"):
        prof = await db.get(Profile, viewer.id) if viewer is not None else None
        if flt == "area":
            la = lat if lat is not None else (prof.home_lat if prof else None)
            lo = lng if lng is not None else (prof.home_lng if prof else None)
            if la is None:
                return {"posts": [], "status": "no_place", "next": None}
            here = func.ST_GeogFromText(f"SRID=4326;POINT({float(lo)} {float(la)})")
            q = q.where(func.ST_DWithin(Post.geom, here, AREA_M))
        else:
            city = (prof.city or "").strip() if prof else ""
            if not city:
                return {"posts": [], "status": "no_place", "next": None}
            q = q.where(func.lower(Post.city) == city.lower())
    if before:
        q = q.where(Post.created_at < before)
    rows = list((await db.execute(q.order_by(Post.created_at.desc()).limit(limit + 1))).scalars().all())
    nxt = rows[limit - 1].created_at.isoformat() if len(rows) > limit else None
    return {"posts": await post_out(db, rows[:limit], viewer), "status": status, "next": nxt}


async def get_post(db: AsyncSession, post_id: uuid.UUID, viewer: User | None) -> Post:
    p = await db.get(Post, post_id)
    if p is None or (p.hidden and not _is_mod(viewer) and (viewer is None or viewer.id != p.user_id)):
        raise not_found("post.not_found", "Post not found")
    if viewer is not None and p.user_id in await people.blocked_ids(db, viewer.id):
        raise not_found("post.not_found", "Post not found")
    return p


async def delete_post(db: AsyncSession, p: Post, viewer: User) -> None:
    if viewer.id != p.user_id and not _is_mod(viewer):
        raise forbidden("post.not_owner", "Only the author or a moderator can delete it")
    await db.execute(delete(Mention).where(Mention.post_id == p.id))
    await db.execute(delete(Mention).where(Mention.comment_id.in_(select(Comment.id).where(Comment.post_id == p.id))))
    await db.delete(p)
    await db.commit()


async def like(db: AsyncSession, p: Post, user: User, on: bool) -> dict:
    exists = (
        await db.execute(select(PostLike).where(PostLike.post_id == p.id, PostLike.user_id == user.id))
    ).scalar_one_or_none()
    if on and exists is None:
        db.add(PostLike(post_id=p.id, user_id=user.id))
        if p.user_id != user.id:
            await notify(
                db,
                p.user_id,
                "like",
                {"code": "notif.social.like", "params": {"who": user.display_name}},
                screen="S16",
                params={"post_id": str(p.id)},
                dedupe_key=f"like:{p.id}:{user.id}",
            )
    elif not on and exists is not None:
        await db.delete(exists)
    await db.commit()
    n = (await db.execute(select(func.count()).select_from(PostLike).where(PostLike.post_id == p.id))).scalar_one()
    return {"likes": int(n), "liked": on}


async def comments(db: AsyncSession, p: Post, viewer: User | None) -> list[dict]:
    blocked = await people.blocked_ids(db, viewer.id if viewer else None)
    q = select(Comment).where(Comment.post_id == p.id)
    if not _is_mod(viewer):
        q = q.where(Comment.hidden.is_(False))
    rows = [c for c in (await db.execute(q.order_by(Comment.created_at))).scalars().all() if c.user_id not in blocked]
    cards = await people.cards(db, {c.user_id for c in rows}, viewer)
    return [
        {
            "id": str(c.id),
            "author": cards.get(c.user_id),
            "body": c.body,
            "mine": viewer is not None and viewer.id == c.user_id,
            "can_delete": viewer is not None and (viewer.id in (c.user_id, p.user_id) or _is_mod(viewer)),
            "hidden": c.hidden,
            "created_at": c.created_at.isoformat(),
        }
        for c in rows
    ]


async def add_comment(db: AsyncSession, p: Post, user: User, body: str) -> dict:
    await _daily_limit(db, user, "comment", 100, 20)
    if p.user_id in await people.blocked_ids(db, user.id):
        raise forbidden("social.blocked", "You can't comment here")
    c = Comment(post_id=p.id, user_id=user.id, body=body.strip()[:1000])
    db.add(c)
    await db.flush()
    await _mentions(db, user, c.body, comment_id=c.id)
    if p.user_id != user.id:
        await notify(
            db,
            p.user_id,
            "comment",
            {"code": "notif.social.comment", "params": {"who": user.display_name}},
            body={"code": "notif.social.quote", "params": {"text": plain(c.body)[:120]}},
            screen="S16",
            params={"post_id": str(p.id)},
            dedupe_key=f"comment:{c.id}",
        )
    await db.commit()
    return (await comments(db, p, user))[-1]


async def delete_comment(db: AsyncSession, c: Comment, viewer: User) -> None:
    p = await db.get(Post, c.post_id)
    if viewer.id not in (c.user_id, p.user_id if p else None) and not _is_mod(viewer):
        raise forbidden("comment.not_owner", "Not allowed")
    await db.execute(delete(Mention).where(Mention.comment_id == c.id))
    await db.delete(c)
    await db.commit()


# ── follows, blocks, reports ───────────────────────────────────────────────


async def follow(
    db: AsyncSession, user: User, *, user_id: uuid.UUID | None, team_id: uuid.UUID | None, on: bool
) -> dict:
    if (user_id is None) == (team_id is None):
        raise AppError(400, "follow.target", "Follow a person or a team")
    if user_id == user.id:
        raise AppError(400, "follow.self", "You can't follow yourself")
    if user_id is not None and await db.get(User, user_id) is None:
        raise not_found("user.not_found", "Person not found")
    if team_id is not None and await db.get(Team, team_id) is None:
        raise not_found("team.not_found", "Team not found")
    cond = and_(
        Follow.follower_id == user.id,
        Follow.user_id == user_id if user_id else Follow.user_id.is_(None),
        Follow.team_id == team_id if team_id else Follow.team_id.is_(None),
    )
    exists = (await db.execute(select(Follow).where(cond))).scalar_one_or_none()
    if on and exists is None:
        db.add(Follow(follower_id=user.id, user_id=user_id, team_id=team_id))
        if user_id is not None:
            await notify(
                db,
                user_id,
                "follow",
                {"code": "notif.social.follow", "params": {"who": user.display_name}},
                screen="S16",
                params={"user_id": str(user.id)},
                dedupe_key=f"follow:{user.id}",
            )
    elif not on and exists is not None:
        await db.delete(exists)
    await db.commit()
    return {"following": on}


async def block(db: AsyncSession, user: User, target: uuid.UUID, on: bool) -> dict:
    if target == user.id:
        raise AppError(400, "block.self", "You can't block yourself")
    if await db.get(User, target) is None:
        raise not_found("user.not_found", "Person not found")
    exists = await db.get(Block, (user.id, target))
    if on and exists is None:
        db.add(Block(blocker_id=user.id, blocked_id=target))
        await db.execute(
            delete(Follow).where(
                or_(
                    and_(Follow.follower_id == user.id, Follow.user_id == target),
                    and_(Follow.follower_id == target, Follow.user_id == user.id),
                )
            )
        )
    elif not on and exists is not None:
        await db.delete(exists)
    await db.commit()
    return {"blocked": on}


async def report(
    db: AsyncSession, user: User, *, target_type: str, target_id: str, reason: str, note: str | None
) -> Report:
    if target_type not in REPORT_TARGETS:
        raise AppError(400, "report.target", "Unknown report target")
    if reason not in REPORT_REASONS:
        raise AppError(400, "report.reason", "Pick a reason")
    await _daily_limit(db, user, "report", 30, 10)
    dup = (
        await db.execute(
            select(Report).where(
                Report.reporter_id == user.id,
                Report.target_type == target_type,
                Report.target_id == target_id,
                Report.status == "open",
            )
        )
    ).scalar_one_or_none()
    if dup:
        return dup
    r = Report(
        reporter_id=user.id,
        target_type=target_type,
        target_id=target_id[:64],
        reason=reason,
        note=(note or "")[:500] or None,
    )
    db.add(r)
    await db.commit()
    return r


# ── moderation ─────────────────────────────────────────────────────────────


async def queue(db: AsyncSession, mod: User) -> dict:
    reports = (
        (await db.execute(select(Report).where(Report.status == "open").order_by(Report.created_at).limit(100)))
        .scalars()
        .all()
    )
    photos = (
        (
            await db.execute(
                select(Photo)
                .where(Photo.moderation == "pending", Photo.private.is_(False))
                .order_by(Photo.created_at)
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    owners = await people.cards(db, {p.owner_id for p in photos}, mod)
    return {
        "reports": [
            {
                "id": str(r.id),
                "target_type": r.target_type,
                "target_id": r.target_id,
                "reason": r.reason,
                "note": r.note,
                "created_at": r.created_at.isoformat(),
            }
            for r in reports
        ],
        "photos": [
            {
                "id": str(p.id),
                "purpose": p.purpose,
                "owner": owners.get(p.owner_id),
                "photo_url": photo_url(p.id, "thumb"),
                "created_at": p.created_at.isoformat(),
            }
            for p in photos
        ],
    }


async def moderate(
    db: AsyncSession,
    mod: User,
    *,
    target_type: str,
    target_id: str,
    action: str,
    note: str | None,
    report_id: uuid.UUID | None,
) -> dict:
    """hide | restore (posts, comments), approve | reject (photos), block | unblock (users), dismiss (report)."""
    tid = target_id
    if action in ("hide", "restore"):
        model = {"post": Post, "comment": Comment}.get(target_type)
        if model is None:
            raise AppError(400, "moderation.target", "Hide works on posts and comments")
        await db.execute(update(model).where(model.id == uuid.UUID(tid)).values(hidden=action == "hide"))
    elif action in ("approve", "reject"):
        if target_type != "photo":
            raise AppError(400, "moderation.target", "Approve and reject work on photos")
        ph = await db.get(Photo, uuid.UUID(tid))
        if ph is None:
            raise not_found("photo.not_found", "Photo not found")
        ph.moderation = "approved" if action == "approve" else "rejected"
        ph.moderation_reason = f"moderator:{(note or '')[:60]}" if action == "reject" else None
    elif action in ("block", "unblock"):
        if target_type != "user":
            raise AppError(400, "moderation.target", "Block works on people")
        u = await db.get(User, uuid.UUID(tid))
        if u is None:
            raise not_found("user.not_found", "Person not found")
        u.blocked = action == "block"
        u.session_version += 1
    elif action != "dismiss":
        raise AppError(400, "moderation.action", "Unknown moderation action")
    db.add(ModerationAction(moderator_id=mod.id, target_type=target_type, target_id=tid, action=action, note=note))
    if report_id is not None:
        await db.execute(update(Report).where(Report.id == report_id).values(status="resolved", resolved_by=mod.id))
    else:
        await db.execute(
            update(Report)
            .where(Report.target_type == target_type, Report.target_id == tid, Report.status == "open")
            .values(status="resolved", resolved_by=mod.id)
        )
    await db.commit()
    return {"ok": True}


# ── notifications ───────────────────────────────────────────────────────────


async def notifications(db: AsyncSession, user: User, before: datetime | None, limit: int = 50) -> dict:
    q = select(Notification).where(Notification.user_id == user.id)
    if before:
        q = q.where(Notification.created_at < before)
    rows = (await db.execute(q.order_by(Notification.created_at.desc()).limit(limit))).scalars().all()
    unread = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read.is_(False))
        )
    ).scalar_one()
    return {
        "items": [
            {
                "id": str(n.id),
                "kind": n.kind,
                "title": n.title,
                "body": n.body,
                "screen": n.screen,
                "params": n.params,
                "read": n.read,
                "created_at": n.created_at.isoformat(),
            }
            for n in rows
        ],
        "unread": int(unread),
    }


async def mark_read(db: AsyncSession, user: User, ids: list[uuid.UUID] | None) -> int:
    q = update(Notification).where(Notification.user_id == user.id, Notification.read.is_(False))
    if ids:
        q = q.where(Notification.id.in_(ids))
    r = await db.execute(q.values(read=True))
    await db.commit()
    return r.rowcount or 0


# ── public profile ──────────────────────────────────────────────────────────


async def public_profile(db: AsyncSession, uid: uuid.UUID, viewer: User | None) -> dict:
    u = await db.get(User, uid)
    if u is None or u.deleted_at is not None or u.role == "guest" or (u.blocked and not _is_mod(viewer)):
        raise not_found("user.not_found", "Person not found")
    if viewer is not None and uid in await people.blocked_ids(db, viewer.id):
        raise not_found("user.not_found", "Person not found")
    prof = await db.get(Profile, uid)
    card = (await people.cards(db, {uid}, viewer)).get(uid)
    from ..engines.progress import level_for

    earned = await PTS.earned(db, uid)
    trees = (
        await db.execute(select(func.count()).select_from(Tree).where(Tree.user_id == uid, Tree.revoked.is_(False)))
    ).scalar_one()
    acts = (
        await db.execute(
            select(func.count()).select_from(Action).where(Action.user_id == uid, Action.status == "verified")
        )
    ).scalar_one()
    teams = (
        (
            await db.execute(
                select(Team).join(TeamMember, TeamMember.team_id == Team.id).where(TeamMember.user_id == uid)
            )
        )
        .scalars()
        .all()
    )
    followers = (await db.execute(select(func.count()).select_from(Follow).where(Follow.user_id == uid))).scalar_one()
    following = (
        await db.execute(select(func.count()).select_from(Follow).where(Follow.follower_id == uid))
    ).scalar_one()
    is_following = blocked = False
    if viewer is not None:
        is_following = bool(
            (await db.execute(select(Follow.id).where(Follow.follower_id == viewer.id, Follow.user_id == uid))).first()
        )
        blocked = bool(await db.get(Block, (viewer.id, uid)))
    return {
        **(card or {}),
        "bio": prof.bio if prof else None,
        "area": prof.area if prof else None,
        "city": prof.city if prof else None,
        "points": earned,
        "level": level_for(earned),
        "badges": [b for b in await B.list_for(db, uid) if b["earned"]],
        "trees": int(trees),
        "actions": int(acts),
        "teams": [
            {"id": str(t.id), "name": t.name, "emoji": t.emoji}
            for t in teams
            if t.is_public or (viewer is not None and viewer.id == uid)
        ],
        "followers": int(followers),
        "following": int(following),
        "is_following": is_following,
        "blocked": blocked,
        "is_me": viewer is not None and viewer.id == uid,
        "is_demo": u.is_demo,
        "joined_at": u.created_at.isoformat(),
    }


_ = ActionType
