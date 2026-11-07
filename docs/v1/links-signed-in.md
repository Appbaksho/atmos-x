# L7 · Links rechecked while signed in

Run on 2026-11-08 against the dev stack (Next on :3001, API on :8000) with a freshly registered, onboarded account in Chromium at 1280 px. The crawler started from every sidebar and avatar-menu destination, followed every same-site link it found and stopped at 90 pages. It failed on any console error and on any response of 400 or more (except the expected empty-zone lookups).

**Result:** 90 pages, 0 console errors, 0 failed requests.

Redirects that are intended:

- `/app/farm` → `/app/farm/fields` (P6)
- `/app/zone` → `/app/map` (P7)

Screens reached only through role-gated links (partner portal, moderation, admin) show their "not for you" state for an ordinary account, without a 403 in the console.

Pages visited:

- `/app/about`
- `/app/admin`
- `/app/air`
- `/app/air/add`
- `/app/air/devices`
- `/app/budget`
- `/app/community`
- `/app/company`
- `/app/event`
- `/app/farm`
- `/app/farm/fields`
- `/app/goal`
- `/app/goal/new`
- `/app/log-action`
- `/app/map`
- `/app/moderation`
- `/app/notifications`
- `/app/nurseries`
- `/app/org`
- `/app/partner`
- `/app/plan`
- `/app/post/1c15d9c9-348e-4746-8c9e-1da6c4cd1ddd`
- `/app/post/28675340-cc60-46cc-9cc2-7ef24892a9a8`
- `/app/post/7659e8d1-063e-41fb-bad5-8e76fdaceac5`
- `/app/post/8de80bd6-45a1-40d7-8f29-70c553ef897c`
- `/app/post/9beb7846-01aa-4484-b678-abcf941597d7`
- `/app/post/c71f5541-375e-4288-8869-65e11352a45a`
- `/app/post/cb0cac01-8ea6-4ad2-87e7-1779bb79db11`
- `/app/profile`
- `/app/settings`
- `/app/species`
- `/app/species/aam`
- `/app/species/arjun`
- `/app/species/bokul`
- `/app/species/bot`
- `/app/species/champa`
- `/app/species/chhatim`
- `/app/species/debdaru`
- `/app/species/jam`
- `/app/species/jarul`
- `/app/species/kadam`
- `/app/species/kanchan`
- `/app/species/kathal`
- `/app/species/krish`
- `/app/species/madhabilata`
- `/app/species/neem`
- `/app/species/peepal`
- `/app/species/pitraj`
- `/app/species/radha`
- `/app/species/rain`
- `/app/species/sonalu`
- `/app/species/tetul`
- `/app/store`
- `/app/team`
- `/app/team/new`
- `/app/tree`
- `/app/u/0696ed7a-453b-405a-876f-da22a3ca5000`
- `/app/u/4ae42cd6-c535-4ec6-9c9e-960fff22d841`
- `/app/u/61404755-620e-4ce9-9f84-e37ef11af52d`
- `/app/u/812f367c-6a70-401f-b73a-98305ac1db7b`
- `/app/u/a0489869-6a7d-4fb4-9aca-a85f05141974`
- `/app/u/badf91c0-f9d9-469f-b2d4-f918f8990367`
- `/app/u/caeafde8-a5d9-4cda-87f3-06444da9267c`
- `/app/zone`
- `/app/zone/z_8c2f239d_1`
- `/app/zone/z_8c2f239d_1/projection`
