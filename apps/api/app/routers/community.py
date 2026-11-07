"""Community (prompt-v1 §9 'Community'): teams, orgs, leaderboards, follows, people, feed, posts,
comments, likes, reports, blocks, moderation, notifications and events."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import DB, FullUser, Moderator, ViewerDep
from ..errors import AppError, forbidden, not_found
from ..models import Comment, Org, OrgMember, Team, TeamMember
from ..services import events as EV
from ..services import leaderboard as LB
from ..services import people
from ..services import social as SO
from ..services import teams as TM
from ..services.photos import MAX_BYTES, ingest

router = APIRouter(tags=["community"])


def _viewer_user(viewer):
    return viewer.user if viewer.user is not None and not viewer.is_guest else None


async def _photo(db, user, f: UploadFile | None, purpose: str):
    if f is None:
        return None
    data = await f.read(MAX_BYTES + 1)
    if not data:
        return None
    return await ingest(db, user.id, data, f.content_type or "application/octet-stream", purpose)


def _dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise AppError(400, "time.invalid", "Send the time as ISO 8601")
    return d if d.tzinfo else d.replace(tzinfo=UTC)


# ─────────────────────────── teams ───────────────────────────


class TeamIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    is_public: bool = True
    emoji: str | None = Field(default=None, max_length=8)
    org_id: uuid.UUID | None = None
    max_members: int = Field(default=5, ge=2, le=5)


class TeamPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    is_public: bool | None = None
    emoji: str | None = Field(default=None, max_length=8)
    org_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None


class CodeIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


@router.get("/teams", operation_id="teams_list")
async def teams(
    db: DB, viewer: ViewerDep, mine: bool = False, q: str | None = Query(None, max_length=80)
) -> list[dict]:
    """`mine=true`: teams I'm in. Otherwise public teams to discover (search by name)."""
    user = _viewer_user(viewer)
    if mine:
        if user is None:
            return []
        rows = (
            (
                await db.execute(
                    select(Team)
                    .join(TeamMember, TeamMember.team_id == Team.id)
                    .where(TeamMember.user_id == user.id)
                    .order_by(TeamMember.joined_at)
                )
            )
            .scalars()
            .all()
        )
    else:
        stmt = select(Team).where(Team.is_public.is_(True), people.demo_filter(Team.is_demo, viewer.user))
        if q:
            stmt = stmt.where(Team.name.ilike(f"%{q.strip()}%"))
        rows = (await db.execute(stmt.order_by(Team.created_at.desc()).limit(50))).scalars().all()
    return [await TM.team_out(db, t, user, full=False) for t in rows]


@router.post("/teams", operation_id="teams_create")
async def create_team(body: TeamIn, db: DB, user: FullUser) -> dict:
    t = await TM.create(
        db,
        user,
        name=body.name,
        description=body.description,
        is_public=body.is_public,
        emoji=body.emoji,
        org_id=body.org_id,
        max_members=body.max_members,
    )
    return await TM.team_out(db, t, user)


@router.get("/teams/by-code/{code}", operation_id="teams_by_code")
async def team_by_code(code: str, db: DB, viewer: ViewerDep) -> dict:
    """Invite preview (guests too): name, size, org. Joining needs an account."""
    t = await TM.by_code(db, code)
    return await TM.team_out(db, t, _viewer_user(viewer), full=False)


@router.post("/teams/join-by-code", operation_id="teams_join_by_code")
async def join_by_code(body: CodeIn, db: DB, user: FullUser) -> dict:
    t = await TM.join(db, user, await TM.by_code(db, body.code), by_code=True)
    return await TM.team_out(db, t, user)


@router.get("/teams/{team_id}", operation_id="teams_get")
async def get_team(team_id: uuid.UUID, db: DB, viewer: ViewerDep) -> dict:
    user = _viewer_user(viewer)
    t = await TM.get_team(db, team_id)
    if not t.is_public and not await TM.is_member(db, t, user):
        raise not_found("team.not_found", "Team not found")
    return await TM.team_out(db, t, user)


@router.patch("/teams/{team_id}", operation_id="teams_patch")
async def patch_team(team_id: uuid.UUID, body: TeamPatch, db: DB, user: FullUser) -> dict:
    t = await TM.patch(db, user, await TM.get_team(db, team_id), body.model_dump(exclude_unset=True))
    return await TM.team_out(db, t, user)


@router.post("/teams/{team_id}/join", operation_id="teams_join")
async def join_team(team_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    t = await TM.join(db, user, await TM.get_team(db, team_id), by_code=False)
    return await TM.team_out(db, t, user)


@router.delete("/teams/{team_id}/members/me", operation_id="teams_leave", status_code=204)
async def leave_team(team_id: uuid.UUID, db: DB, user: FullUser) -> None:
    await TM.leave(db, user, await TM.get_team(db, team_id))


@router.get("/teams/{team_id}/invite", operation_id="teams_invite")
async def invite(team_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    t = await TM.get_team(db, team_id)
    if not await TM.is_member(db, t, user):
        raise forbidden("team.not_member", "Only members can invite")
    return {"code": t.code, "url": f"/join/{t.code}"}


@router.get("/teams/{team_id}/messages", operation_id="teams_messages")
async def messages(team_id: uuid.UUID, db: DB, user: FullUser, since: str | None = None) -> list[dict]:
    t = await TM.get_team(db, team_id)
    if not await TM.is_member(db, t, user):
        raise forbidden("team.not_member", "Team chat is for members")
    return await TM.messages(db, t, user, _dt(since))


@router.post("/teams/{team_id}/messages", operation_id="teams_message_post")
async def post_message(team_id: uuid.UUID, body: MessageIn, db: DB, user: FullUser) -> dict:
    t = await TM.get_team(db, team_id)
    if not await TM.is_member(db, t, user):
        raise forbidden("team.not_member", "Team chat is for members")
    return await TM.post_message(db, t, user, body.body)


# ─────────────────────────── orgs ───────────────────────────


class OrgIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    kind: str = Field(max_length=12)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=2)
    description: str | None = Field(default=None, max_length=500)
    logo_emoji: str | None = Field(default=None, max_length=8)


@router.get("/orgs", operation_id="orgs_list")
async def orgs(db: DB, viewer: ViewerDep, q: str | None = Query(None, max_length=80)) -> list[dict]:
    stmt = select(Org).where(people.demo_filter(Org.is_demo, viewer.user))
    if q:
        stmt = stmt.where(Org.name.ilike(f"%{q.strip()}%"))
    rows = (await db.execute(stmt.order_by(Org.verified.desc(), Org.name).limit(100))).scalars().all()
    return [await TM.org_out(db, o, _viewer_user(viewer)) for o in rows]


@router.post("/orgs", operation_id="orgs_create")
async def create_org(body: OrgIn, db: DB, user: FullUser) -> dict:
    o = await TM.create_org(
        db,
        user,
        name=body.name,
        kind=body.kind,
        city=body.city,
        country=body.country,
        description=body.description,
        logo_emoji=body.logo_emoji,
    )
    return await TM.org_out(db, o, user)


@router.get("/orgs/{org_id}", operation_id="orgs_get")
async def get_org(org_id: uuid.UUID, db: DB, viewer: ViewerDep) -> dict:
    o = await db.get(Org, org_id)
    if o is None:
        raise not_found("org.not_found", "Organization not found")
    return await TM.org_out(db, o, _viewer_user(viewer))


@router.get("/orgs/{org_id}/export.csv", operation_id="orgs_export", response_class=Response)
async def export_org(org_id: uuid.UUID, db: DB, user: FullUser) -> Response:
    """R9: an org admin downloads its teams' numbers as CSV (no personal data beyond team names)."""
    import csv
    import io

    o = await db.get(Org, org_id)
    if o is None:
        raise not_found("org.not_found", "Organization not found")
    role = (
        await db.execute(select(OrgMember.role).where(OrgMember.org_id == o.id, OrgMember.user_id == user.id))
    ).scalar_one_or_none()
    if role != "admin" and user.role != "admin":
        raise AppError(403, "org.not_admin", "Only the organization's admins can export")
    teams = (await db.execute(select(Team).where(Team.org_id == o.id).order_by(Team.name))).scalars().all()
    stats = await TM.team_stats(db, [t.id for t in teams])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["team", "public", "points", "trees", "actions", "cooling_c_estimate"])
    for t in teams:
        st = stats.get(t.id, {})
        w.writerow(
            [t.name, t.is_public, st.get("points", 0), st.get("trees", 0), st.get("actions", 0), st.get("cooling_c", 0)]
        )
    name = "".join(ch if ch.isalnum() else "-" for ch in o.name.lower()).strip("-") or "org"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="atmos-x-{name}.csv"',
            "Cache-Control": "private, no-store",
        },
    )


# ─────────────────────────── leaderboard, people, follows ───────────────────────────


@router.get("/leaderboard", operation_id="leaderboard")
async def leaderboard(
    db: DB,
    viewer: ViewerDep,
    subject: str = Query("user", pattern="^(user|team|org)$"),
    scope: str = Query("area", pattern="^(area|city|country)$"),
    period: str = Query("month", pattern="^(week|month|all)$"),
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
) -> dict:
    return await LB.board(db, _viewer_user(viewer) or viewer.user, subject, scope, period, lat, lng)


@router.get("/users/{user_id}", operation_id="users_get")
async def user_profile(user_id: uuid.UUID, db: DB, viewer: ViewerDep) -> dict:
    return await SO.public_profile(db, user_id, _viewer_user(viewer))


class FollowIn(BaseModel):
    user_id: uuid.UUID | None = None
    team_id: uuid.UUID | None = None


@router.post("/follows", operation_id="follows_add")
async def follow(body: FollowIn, db: DB, user: FullUser) -> dict:
    return await SO.follow(db, user, user_id=body.user_id, team_id=body.team_id, on=True)


@router.delete("/follows", operation_id="follows_remove")
async def unfollow(db: DB, user: FullUser, user_id: uuid.UUID | None = None, team_id: uuid.UUID | None = None) -> dict:
    return await SO.follow(db, user, user_id=user_id, team_id=team_id, on=False)


class BlockIn(BaseModel):
    user_id: uuid.UUID


@router.post("/blocks", operation_id="blocks_add")
async def block(body: BlockIn, db: DB, user: FullUser) -> dict:
    return await SO.block(db, user, body.user_id, True)


@router.delete("/blocks/{user_id}", operation_id="blocks_remove")
async def unblock(user_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    return await SO.block(db, user, user_id, False)


class ReportIn(BaseModel):
    target_type: str = Field(max_length=12)
    target_id: str = Field(max_length=64)
    reason: str = Field(max_length=24)
    note: str | None = Field(default=None, max_length=500)


@router.post("/reports", operation_id="reports_add")
async def report(body: ReportIn, db: DB, user: FullUser) -> dict:
    r = await SO.report(
        db, user, target_type=body.target_type, target_id=body.target_id, reason=body.reason, note=body.note
    )
    return {"id": str(r.id), "status": r.status}


# ─────────────────────────── feed and posts ───────────────────────────


@router.get("/feed", operation_id="feed")
async def feed(
    db: DB,
    viewer: ViewerDep,
    filter: str = Query("area", pattern="^(area|city|following)$"),  # noqa: A002
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    before: str | None = None,
    user_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> dict:
    return await SO.feed(
        db,
        _viewer_user(viewer) or viewer.user,
        filter,
        lat=lat,
        lng=lng,
        before=_dt(before),
        user_id=user_id,
        team_id=team_id,
    )


@router.post("/posts", operation_id="posts_create")
async def create_post(
    db: DB,
    user: FullUser,
    body: Annotated[str, Form(max_length=2000)] = "",
    team_id: Annotated[str | None, Form(max_length=40)] = None,
    action_id: Annotated[str | None, Form(max_length=40)] = None,
    tree_id: Annotated[str | None, Form(max_length=40)] = None,
    share_photo: Annotated[bool, Form()] = True,
    photo: Annotated[UploadFile | None, File()] = None,
) -> dict:
    def uid(s):
        try:
            return uuid.UUID(s) if s else None
        except ValueError:
            raise AppError(400, "id.invalid", "Not a valid id")

    ph = await _photo(db, user, photo, "post")
    p = await SO.create_post(
        db,
        user,
        body=body,
        photo=ph,
        team_id=uid(team_id),
        action_id=uid(action_id),
        tree_id=uid(tree_id),
        share_photo=share_photo,
    )
    return (await SO.post_out(db, [p], user))[0]


@router.get("/posts/{post_id}", operation_id="posts_get")
async def get_post(post_id: uuid.UUID, db: DB, viewer: ViewerDep) -> dict:
    user = _viewer_user(viewer)
    p = await SO.get_post(db, post_id, user)
    return {**(await SO.post_out(db, [p], user))[0], "comment_list": await SO.comments(db, p, user)}


@router.delete("/posts/{post_id}", operation_id="posts_delete", status_code=204)
async def delete_post(post_id: uuid.UUID, db: DB, user: FullUser) -> None:
    await SO.delete_post(db, await SO.get_post(db, post_id, user), user)


@router.post("/posts/{post_id}/like", operation_id="posts_like")
async def like(post_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    return await SO.like(db, await SO.get_post(db, post_id, user), user, True)


@router.delete("/posts/{post_id}/like", operation_id="posts_unlike")
async def unlike(post_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    return await SO.like(db, await SO.get_post(db, post_id, user), user, False)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


@router.get("/posts/{post_id}/comments", operation_id="posts_comments")
async def comments(post_id: uuid.UUID, db: DB, viewer: ViewerDep) -> list[dict]:
    user = _viewer_user(viewer)
    return await SO.comments(db, await SO.get_post(db, post_id, user), user)


@router.post("/posts/{post_id}/comments", operation_id="posts_comment_add")
async def add_comment(post_id: uuid.UUID, body: CommentIn, db: DB, user: FullUser) -> dict:
    return await SO.add_comment(db, await SO.get_post(db, post_id, user), user, body.body)


@router.delete("/comments/{comment_id}", operation_id="comments_delete", status_code=204)
async def delete_comment(comment_id: uuid.UUID, db: DB, user: FullUser) -> None:
    c = await db.get(Comment, comment_id)
    if c is None:
        raise not_found("comment.not_found", "Comment not found")
    await SO.delete_comment(db, c, user)


# ─────────────────────────── moderation and notifications ───────────────────────────


class ModerateIn(BaseModel):
    target_type: str = Field(max_length=12)
    target_id: str = Field(max_length=64)
    action: str = Field(max_length=12)
    note: str | None = Field(default=None, max_length=500)


@router.get("/moderation/queue", operation_id="moderation_queue")
async def mod_queue(db: DB, mod: Moderator) -> dict:
    return await SO.queue(db, mod)


@router.post("/moderation/{report_id}", operation_id="moderation_act")
async def mod_act(report_id: str, body: ModerateIn, db: DB, mod: Moderator) -> dict:
    """`report_id` is a report's id, or `-` to act on a target directly (e.g. a pending photo)."""
    rid = None
    if report_id != "-":
        try:
            rid = uuid.UUID(report_id)
        except ValueError:
            raise AppError(400, "id.invalid", "Not a valid id")
    return await SO.moderate(
        db,
        mod,
        target_type=body.target_type,
        target_id=body.target_id,
        action=body.action,
        note=body.note,
        report_id=rid,
    )


@router.get("/notifications", operation_id="notifications_list")
async def notifications(db: DB, user: FullUser, before: str | None = None) -> dict:
    return await SO.notifications(db, user, _dt(before))


class ReadIn(BaseModel):
    ids: list[uuid.UUID] | None = Field(default=None, max_length=200)


@router.post("/notifications/read", operation_id="notifications_read")
async def notifications_read(body: ReadIn, db: DB, user: FullUser) -> dict:
    return {"marked": await SO.mark_read(db, user, body.ids)}


# ─────────────────────────── events ───────────────────────────


class EventIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: datetime
    ends_at: datetime | None = None
    place_name: str = Field(min_length=2, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    team_id: uuid.UUID | None = None
    org_id: uuid.UUID | None = None
    sponsor_name: str | None = Field(default=None, max_length=120)
    capacity: int | None = Field(default=None, ge=2, le=5000)


class RsvpIn(BaseModel):
    status: str = Field(pattern="^(going|maybe|no)$")


class CheckinIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0)


@router.get("/events", operation_id="events_list")
async def events(
    db: DB,
    viewer: ViewerDep,
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    past: bool = False,
) -> list[dict]:
    return await EV.listing(db, _viewer_user(viewer) or viewer.user, lat, lng, past)


@router.post("/events", operation_id="events_create")
async def create_event(body: EventIn, db: DB, user: FullUser) -> dict:
    e = await EV.create(db, user, body.model_dump())
    return (await EV.event_out(db, [e], user))[0]


@router.get("/events/{event_id}", operation_id="events_get")
async def get_event(event_id: uuid.UUID, db: DB, viewer: ViewerDep) -> dict:
    user = _viewer_user(viewer) or viewer.user
    return (await EV.event_out(db, [await EV.get(db, event_id, user)], user))[0]


@router.post("/events/{event_id}/rsvp", operation_id="events_rsvp")
async def rsvp(event_id: uuid.UUID, body: RsvpIn, db: DB, user: FullUser) -> dict:
    e = await EV.get(db, event_id, user)
    await EV.rsvp(db, e, user, body.status)
    return (await EV.event_out(db, [e], user))[0]


@router.post("/events/{event_id}/checkin", operation_id="events_checkin")
async def checkin(event_id: uuid.UUID, body: CheckinIn, db: DB, user: FullUser) -> dict:
    e = await EV.get(db, event_id, user)
    r = await EV.checkin(db, e, user, body.lat, body.lng, body.accuracy_m)
    return {**(await EV.event_out(db, [e], user))[0], **r}


@router.post("/events/{event_id}/sponsor-logo", operation_id="events_sponsor_logo")
async def event_sponsor_logo(event_id: uuid.UUID, db: DB, user: FullUser, photo: Annotated[UploadFile, File()]) -> dict:
    e = await EV.get(db, event_id, user)
    ph = await _photo(db, user, photo, "event")
    if ph is None:
        raise AppError(400, "photo.missing", "Choose a photo")
    await EV.set_sponsor_logo(db, e, user, ph)
    return (await EV.event_out(db, [e], user))[0]


@router.get("/events/{event_id}/certificate.pdf", operation_id="events_certificate", response_class=Response)
async def event_certificate(event_id: uuid.UUID, db: DB, user: FullUser) -> Response:
    e = await EV.get(db, event_id, user)
    pdf = await EV.certificate(db, e, user)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="atmos-x-certificate.pdf"',
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/events/{event_id}/photo", operation_id="events_photo")
async def event_photo(event_id: uuid.UUID, db: DB, user: FullUser, photo: Annotated[UploadFile, File()]) -> dict:
    e = await EV.get(db, event_id, user)
    ph = await _photo(db, user, photo, "event")
    if ph is None:
        raise AppError(400, "photo.missing", "Choose a photo")
    await EV.set_group_photo(db, e, user, ph)
    return (await EV.event_out(db, [e], user))[0]
