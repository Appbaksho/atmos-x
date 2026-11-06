# Atmos X App Audit and Build Plan

Nov 4, 2026 · @Faisal er Chakor

atmosx.baksho.app is a polished v0, but its core loop breaks in three places: zone names and scores change between the map and the zone page, scans take about 25 seconds, and two goal steps dead-end silently for guests. Accounts, teams and trees live only on the user's device, so points, community and a store cannot be real until the app has a backend.

## What was tested

I tested the live app on 4 November 2026 as a guest, on desktop and at phone width (375 px), at the default Dhaka point (23.759° N, 90.359° E). I walked the main flows (onboarding, map, zone, goal, plan, community, team, profile, air, farm, Ask Atmos) and opened all 36 routes the app's code refers to.

I could not create an account, so flows that need one (logging an action, saving a goal, teams, trees) were checked only up to the sign-up gate. A developer should re-test those signed in.

## Errors in flows

The first six rows block the main loop or risk the pitch; fix those first. Severity: **Critical** blocks a core promise, **High** breaks a flow, **Medium** gives wrong or confusing numbers, **Low** is polish.

| # | Severity | Where | What happens | Fix |
| --- | --- | --- | --- | --- |
| 1 | Critical | Whole app | Accounts, actions, trees and teams are stored only on the device (Data & science page: “live only on this device in v0”). Points can't sync, can't be checked and can't be spent. | Add a server database and real sign-in before points, community or the store. |
| 2 | Critical | Map list → Zone page | Tapping “Road 5 · 93 · 478 m” opens “Road 6 · 87 · 522 m”. On the goal page, tapping “Nurzahan Road · 89” selects “Sher-E-Bangla Road · 88”. The list labels don't match the zone IDs they open. | Use one zone object (ID, name, score, distance) from the scan everywhere; never re-derive the name on the detail page. |
| 3 | High | Map, Home, Ask Atmos | A 500 m zone scan took about 25 seconds. Ask Atmos took about 30 seconds and answered “the heat-zone tool timed out”. | Cache scans by H3 cell, precompute Dhaka, return partial results first. Target under 2 seconds. |
| 4 | High | Goal → Check feasibility | As a guest, tapping Check feasibility did nothing within 12 seconds: no step 2, no sign-up prompt, no error. | Show the sign-up sheet (as “Add to goal” already does), then continue the goal after sign-up. |
| 5 | High | Community, Team pages | The demo leaderboard names real bodies (BRAC University Eco Club, DNCC Ward 33, Bidyanondo Green, BUET Green Club, Dhaka North and South City Corporations). Judges or those bodies may read it as a partnership. | Use invented names until real partners sign on. |
| 6 | High | Pitch vs app | Data & science says the heat map “is not satellite data”; NASA appears only as POWER rainfall and an optional overlay. The pitch says 15 NASA datasets. | Bring Landsat, ECOSTRESS or MODIS surface temperature into the Heat Score, or change the pitch. |
| 7 | Medium | Goal step 1 | Tapping a zone shows nothing for about 8 seconds before the zone loads. | Show a loading state on the tapped row. |
| 8 | Medium | Goal step 1 | Sher-E-Bangla Road shows 78,381 m² of flat roofs and 4.7 km of street edge, while the projection sizes a neighbouring zone at 0.03 km² (30,000 m²). The roof figure looks larger than the zone. | Clip roof area to the zone polygon. |
| 9 | Medium | Goal step 1 | −2.0 °C in 1 year is “recommended” with 0 m² open ground, while the projection says trees reach full effect only in year 8. | Recommend from real space and the timeline; mark goals under 3 years as action goals. |
| 10 | Medium | Home | “Your zone” is Sher-E-Bangla Road at 88, the list below says 84, and the goal card picks Nurzahan Road. | Same fix as #2. |
| 11 | Medium | Map · NASA LST tab | Switching to NASA LST shows no visible layer at street zoom. | Show a message at that zoom, or switch to a finer product. |
| 12 | Medium | Onboarding, Home | The same point is called “Mohammadpur, Dhaka” in onboarding and “Lalmatia, Dhaka” on Home. | Reverse-geocode once and store the name. |
| 13 | Medium | Team page | Lalmatia Roof Club shows 12,800 points, but its three members add up to 6,460. | Compute team points from member actions. |
| 14 | Medium | Nurseries | The page says “Atmos X never sells plants”, which contradicts the tree marketplace business model. | Change the copy when the marketplace launches. |
| 15 | Low | Air · My devices | Sensor readings are simulated (±8% of the area PM2.5). | Keep the label visible, or hide sensors until real uploads work. |
| 16 | Low | Community | Leaderboard rows and people can't be tapped. | Link rows to team, org and profile pages. |
| 17 | Low | Map page console | React hydration error #418 (text mismatch) and repeated 404 resource errors. | Render times and locale-formatted numbers only on the client. |
| 18 | Low | Welcome screen, phone | The hero photo loads late, leaving a blank top half. The “Park edge 36°” chip overlaps the headline. | Preload a small hero image; move the chip above the headline. |

## Pages that aren't connected

Seven parent routes return “Page not found”, and several working pages can only be reached by typing the address. The sidebar shows only Home, Map, Plan, Community, Profile, Air quality, Notifications, Settings and About.

**Parent routes that 404 — build these pages**

| Route | Build it as |
| --- | --- |
| /app/tree | **My trees**: the new sidebar page (see My trees, badges and points) |
| /app/goal | My goals: each goal's progress, target, date and next task |
| /app/team | My teams: the teams I'm in, invites, and a Discover link |
| /app/org | Organizations directory, linked from the Orgs leaderboard |
| /app/species | Full species catalog (Plan's “Show all 21” should open it) |
| /app/farm | Farm home: redirect to /app/farm/fields |
| /app/zone | Redirect to /app/map |

**Working pages with no link — connect these**

| Page | What it does | Link it from |
| --- | --- | --- |
| /app/log-action | Log a tree, roof coat or shade with a GPS photo | A “+ Log action” button in the sidebar and bottom bar, and every goal task |
| /app/nurseries | 40 nurseries near you | Plan, each species page (already there), and the future Store |
| /app/budget | Cost of the plan | Plan page, once a goal exists |
| /app/farm/fields | Farmer mode fields and alerts | A “Farm” sidebar item, not only the Settings mode switch |
| /app/org/\[id\] | An organization's page | Orgs leaderboard rows |
| /app/team/\[id\] | A team's page | Teams leaderboard rows (only Discover cards link today) |

I checked links as a guest; signed-in users may see more links, so recheck after sign-in.

**Proposed sidebar:** Home, Map, Plan, My trees, Community, Store, Farm, then Air quality, Notifications, Settings, About. On phones keep five tabs (Home, Map, Plan, My trees, Community) and move Store and Profile into a header avatar menu.

## Hexagon scan, real location, real zones and goals

### Hexagon scan area at 200 m

The zones are already H3 hexagons at resolution 10 (zone IDs start with `8a`); only the scan outline is a dashed circle. Change it:

- Draw the scan area as the outline of the hex ring around the user: `gridDisk(center, k)` merged with `cellsToMultiPolygon`. At resolution 10, cell centres sit about 130 m apart, so 200 m is k = 2 (19 hexes).
- Add a **200 m** preset and make it the default: 200 m · 500 m · 1 km. Keep 100 m and 300 m only if testing shows people use them.
- Show the hex count beside the radius (“19 hexes · 200 m”), as onboarding already does for 500 m.
- Fill every hex in the ring, so there are no gaps.

### Real location

Today every guest starts at a fixed Mohammadpur point unless they tap “Use my location”.

- Ask for location on the first open, with one line on why. If refused, fall back to the city from IP and a search box.
- Use the browser's geolocation with high accuracy. Show the accuracy circle, and re-scan when the user moves more than 100 m.
- Reverse-geocode once per scan and reuse that name everywhere (fixes error #12).
- Keep “Try the Dhaka demo” as an option, labelled as a demo.

### Real zones and reasoning

- **One zone object end to end.** The scan returns ID, name, score, distance and drivers; map, Home, goal and zone page all read that same object (fixes errors #2 and #10).
- **Satellite heat first.** Score each hex from Landsat 8/9 surface temperature, sharpened with ECOSTRESS where a pass exists, and keep OpenStreetMap land cover as the explanation layer. Label each zone “satellite” or “estimate”.
- **Speed.** Precompute Dhaka hexes nightly and cache by H3 cell, so a scan is a database read.
- **Reasoning from measured numbers.** Each driver shows its value and its °C share, as the zone page does now. The AI text only restates those numbers in plain words and never adds new ones.

### Real goals

- Space comes from the zone polygon: roof area clipped to the zone (fixes #8), open ground, street edge and planting spots.
- The recommended target comes from that space and the timeline. Goals under 3 years are action goals (“plant 40 trees, coat 1,200 m² of roof”), with the °C shown as the long-term result (fixes #9).
- Save goals on the server with tasks, owners and dates, and show progress on My goals (/app/goal).
- Guests can draft a goal; saving it opens sign-up and keeps the draft (fixes #4).

## Community

Today Community is a demo: fixed leaderboards, three sample teams and initials instead of faces. A standard community needs real accounts first (error #1).

### Profile photos

- Upload from camera or gallery, crop to a circle, compress to about 256 px.
- Initials on a coloured circle stay as the fallback.
- Show the photo on leaderboards, team members, activity, posts, comments and the header avatar.
- Check uploads automatically for nudity and violence, and let people report a photo.

### Full-featured community (standard)

| Feature | What it includes |
| --- | --- |
| Accounts and profiles | Phone OTP and Google sign-in; name, photo, area, bio, trees, badges, points, teams |
| Feed | Posts with photo and text, likes, comments, @mentions; filter by Area, City or Following |
| Follow | Follow people and teams; a Following feed |
| Teams | Create, invite by link or code, roles (lead, member), team goal, team chat, team activity |
| Organizations | Schools, NGOs and wards with many teams, an org page and an org leaderboard |
| Events | Planting drives with date, place, RSVP, check-in at the spot, and group photo |
| Leaderboards | Real points by person, team and org, by area, city and country, by week, month and all time |
| Notifications | Likes, comments, invites, event reminders, tree check-in due, badge unlocked |
| Safety | Report and block, moderator queue, hide a post, rate limits for new accounts |

The action verification that already exists (GPS photo, teammate confirmation) should feed the feed: every verified action becomes a post the user can share.

## My trees, badges and points

My trees becomes its own sidebar page at /app/tree. It is where people show off what they planted, and the main reason to come back every 15 days.

### My trees page

- **Top strip:** trees planted, trees alive, total points, and estimated cooling added.
- **Tree grid:** each card shows the latest photo, nickname, species, age and a state badge.
- **States:** Verifying · Healthy · Check-in due · Needs water · At risk · Lost (with “Replant”).
- **Map view:** pins of all my trees.

### Tree detail (/app/tree/\[id\])

- A photo timeline from planting day, one photo every 15 days, with height and health at each check-in.
- Species care tips, the next check-in date, and its cooling estimate.
- Share as a post, or invite a friend to water it.

### Badges

| Badge | Unlocks when |
| --- | --- |
| First Seed | First tree verified |
| Grove | 10 trees alive |
| 3-Month Survivor | A tree passes its 90-day check-in |
| One-Year Guardian | A tree passes its 1-year check-in |
| Monsoon Planter | A tree planted June to September |
| Roof Cooler | 100 m² of cool roof verified |
| Team Player | First team goal reached |
| Streak | 6 check-ins in a row on time |

### Points

Proposed values; tune them once real data comes in. Log action already gives 150 points for 3 trees, so 50 per tree matches today's app.

| Action | Points |
| --- | --- |
| Tree planted and verified | 50 per tree |
| On-time 15-day check-in photo | 10 |
| Tree alive at 90 days | 50 |
| Tree alive at 1 year | 200 |
| Cool roof verified | 30 per 100 m² |
| Team goal reached | 100 to each member |
| Friend joins and plants | 25 |

Points start as **pending** and become **spendable** only after the 90-day check-in. That stops people logging trees just to cash out in the store.

## Points store with CSR partner products

The Store is a sidebar page where people spend verified points on products that companies give through their CSR programs. A company such as PRAN would list products; people who plant and keep trees alive redeem them. No partner has signed yet, so launch with one pilot partner and say so in the Store.

### Store page (/app/store)

- **Header:** spendable points, pending points, and when pending points unlock.
- **Partner rows:** each partner's logo, CSR line (“PRAN rewards Dhaka's tree planters”) and their products.
- **Product card:** photo, name, points price, stock left, “Pickup” or “Delivery”.
- **Filters:** Can afford · Food · Home · Garden · Vouchers.
- **Second tab, Buy saplings:** saplings and planting kits from nearby nurseries, paid in taka. This is the tree marketplace and the main revenue stream.

### Redeem flow

1. Tap a product and see its details, partner, pickup points or delivery area, and terms.
2. Tap Redeem; confirm the points to spend.
3. Get a voucher code and QR, valid for 14 days, or enter a delivery address.
4. Show the QR at a partner outlet, or receive the delivery; the order moves to Collected.
5. My orders lists every redemption with its status.

### Partner portal (web, for companies)

- Add products, set points price and stock, choose pickup outlets or delivery areas.
- See redemptions and scan or enter voucher codes at outlets.
- Download a CSR impact report: verified trees, survival rate, estimated cooling and people reached, with photos. This report is what the company pays for.

### Rules that keep it honest

- Only spendable points (after the 90-day check-in) can be redeemed.
- Limits per person per month, and per device.
- Every tree behind the points has a GPS photo and an AI location check; flagged trees go to manual review.
- Atmos X holds no cash value for points; they can't be transferred or sold.

## Company marketplace: carbon credits and products

Carbon-emitting companies register on Atmos X, pay for carbon credits from the trees people plant, and give products to the points store. Their money pays for the trees; their products reward the people who plant and care for them.

&#91;embedded content: company marketplace loop · 4 parties\]

Read the loop clockwise: the company's payment funds saplings and points, people spend those points on the company's products, and the company gets credits and a report back.

### Company sign-up

1. Register: company name, trade licence, TIN or BIN, contact person, industry and logo.
2. Atmos X checks the documents before the account goes live.
3. Emissions profile: the company enters its yearly emissions in tonnes of CO₂e, from its own report, and how much it wants to offset.
4. Pick a package, pay, and list products.

### What companies buy

| Package | What the company gets | Priced by |
| --- | --- | --- |
| Tree impact package | Trees planted by local people and cared for over 3 years, with photos, survival rate and estimated CO₂ removal | Per tree |
| Carbon credits | Certified tonnes of CO₂e removed, retired in the company's name with serial numbers | Per tonne |
| Store listing | Its products in the points store with its logo, plus redemption data | Listing fee; products given in kind |

### Company dashboard pages

| Page | What it shows |
| --- | --- |
| Overview | Trees funded and alive, estimated and certified CO₂e, people reached, products redeemed |
| Buy | Packages and credits, cart, checkout |
| Products | Add products, set points price and stock, choose pickup outlets or delivery areas |
| Redemptions | Voucher list; scan a QR or type a code at an outlet |
| Certificates and reports | Retirement certificates and the CSR impact report as PDF |
| Billing | VAT invoices and payment history |

### Checkout and payment

- Pay by bKash, Nagad, card through a gateway such as SSLCommerz, or bank transfer for large orders.
- Every order gets a VAT invoice.
- Money for trees is held and paid to nurseries and planters only after each tree is verified.

### Credit ledger

Each credit is one tonne of CO₂e, tied to specific trees: tree ID, GPS, photos, species and planting date. The ledger moves each lot from Estimated to Verified to Sold to Retired, so no tonne is sold twice. The company's certificate lists the serial numbers retired in its name.

### Before selling “carbon credits”

- A tonne can be sold as a carbon credit only after the trees are registered under a recognised standard such as Verra (VCS) or Gold Standard and checked by an independent auditor. Credits are usually issued after the carbon is measured, years after planting.
- Until then, sell **tree impact packages** with estimated CO₂ removal, labelled as an estimate and not an offset. Selling estimates as offsets is greenwashing and puts both the company and Atmos X at risk.
- Many small urban plantings are usually grouped into one larger project so the cost of certification makes sense.
- Check Bangladesh's rules with a lawyer before selling credits; this section is a starting point, not legal advice.

### Keeping points fair

- Points come only from verified tree care, never directly from a company's payment.
- Companies set each product's points price within limits Atmos X sets, so 1,000 points buy about the same value in every listing.
- The store rules above still apply: points are spendable after the 90-day check-in, with monthly limits and fraud review.

## Profit and sustainability

Atmos X earns when trees are bought and when companies pay for verified impact; it stays sustainable by keeping its own running costs low. Everything for citizens and farmers stays free.

### Ways to earn

| Feature | Who pays | How Atmos X earns |
| --- | --- | --- |
| Tree marketplace | Tree buyers | Commission on each sapling or planting kit sold from partner nurseries |
| Planting service | Busy buyers, companies | Fee to have a local team plant and water the tree, with photo proof |
| CSR partner store | Companies | Listing fee plus a fee per verified tree their rewards drive |
| Sponsored drives | Companies, brands | A company funds a named drive (“1,000 neem for Mohammadpur”) with its logo on the event and certificate |
| CSR impact reports | Companies, city wards | Subscription for verified reports: trees, survival, cooling, photos |
| Adopt a tree | People abroad, gift buyers | Fund a tree planted by a local volunteer, with 15-day photo updates |
| Cool-roof leads | Paint brands, roofers | Referral fee when a goal's cool-roof task becomes a job |
| Org dashboards | Schools, NGOs, wards | Paid plan for many teams, exports and branded certificates |
| Carbon credits and grants | Carbon-emitting companies, climate funds | Companies pay per tree now (tree impact packages) and per certified tonne once the trees are registered and audited; see Company marketplace |

### Keeping costs down

- **Cache zone scans by H3 cell.** This fixes the 25-second scan and cuts map and weather API calls.
- **Limit AI calls.** Keep the 5-a-day guest limit, cache answers to common questions, and use a smaller model for photo checks.
- **Store photos small.** Compress check-in photos on the phone before upload.
- **Let partners fund rewards.** The store's products come from CSR budgets, so points cost Atmos X nothing to honour.

### Keeping people coming back

- The 15-day tree check-in, with a streak badge.
- Monthly area leaderboards that reset, so newcomers can win.
- Store products that people actually want, refreshed each month.

## Build order

Each phase depends on the one before it: the store can't launch before points are real, and points can't be real before accounts are.

1. **Fix the loop.** Errors #2, #3, #4, #7 to #12, and replace the real organization names (#5).
2. **Backend and accounts.** Server database, phone and Google sign-in, and move device data to the server (#1).
3. **Real map.** Real location, the 200 m hexagon scan, satellite heat in the Heat Score (#6), and saved goals with the My goals page.
4. **My trees, badges and points.** The My trees page, 15-day check-ins, badges, and pending versus spendable points.
5. **Community.** Profile photos, feed, follow, teams with chat, events, real leaderboards and moderation.
6. **Store.** Buy saplings first (it earns money from day one), then the company marketplace: company sign-up, tree impact packages, the points store and the company dashboard, with one pilot company. Carbon credits come later, once the trees are certified.

Also connect the unlinked pages and build the seven missing parent pages during phases 1 and 4.
