# Stage 6 sweep (prompt-v1 §Stage 6 exit)

Run on 2026-11-08 against the dev stack in Chromium with the demo story (`?demo=1`).

**Matrix:** 10 screens × en, bn, ur × light, dark × 360 px, 1280 px = 120 screenshots.

**Screens:** landing, Home, Map, Plan, My trees, Community, Store, Profile, Settings, About.

**Automatic checks on every shot:** no horizontal scroll, no console error, and no failed same-site request. Result: 0 problems in 120 shots.

**Manual review of contact sheets.** Found and fixed:

| Where | Problem | Fix |
| --- | --- | --- |
| My trees, 360 px, all locales | The cooling tile's value and label were truncated ("−0.04…", "Cooling o…") | The stat strip is a 2 × 2 grid on phones and one row when there is room |
| Landing hero | Headline lines overlapped the subtitle, and "NEIGHBOURHOOD" broke mid-word at 360 px | String line heights and a viewport-scaled headline |
| Phone tab bar | "Community", "Communauté", "Comunidad" and "Minhas árvores" clipped at 360 px | Tabs size to their labels; short "trees" tab label |
| Welcome (E18) | Hero image loaded late; the "Park edge" chip could overlap the headline | Phone-sized preloaded hero with high fetch priority; chips moved above the headline |

**Checked with no issue:**
- RTL (ur): the sidebar sits on the right, the avatar menu and "+" sit at the start, and Urdu digits render.
- bn: Bengali digits render throughout.
- Dark mode: all screens.
- The about page in all three languages.

The Next dev-tools badge (bottom corner) appears only in development.
