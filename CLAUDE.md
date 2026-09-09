# Larder — project notes for future chats

Personal, single-user food/dish catalog + meal planner. Static site, deployed
on GitHub Pages, no build step, no backend server. **The GitHub repo itself
is the database** — the app reads and writes `data.json` (and `images/*`)
directly through the GitHub Contents API from the browser.

If you're picking this up in a new chat: read this file first, then skim
`index.html` and `js/state.js` to see how data flows. The user can't cook
much yet and has "dogshit food planning skills" (their words) — the whole
point of this tool is removing friction, so default to simple over clever
when extending it.

## Why it's built this way

- **No backend, no build step.** Plain HTML/CSS/JS with ES modules, loaded
  directly by the browser. Keeps GitHub Pages deployment to "push files,
  flip on Pages" — no CI, no npm install for the end user.
- **GitHub-as-database.** The alternative (localStorage only) would mean
  data added on desktop never appears on phone, which defeated the user's
  stated goal ("data not tied to a physical entity"). Firebase/Supabase
  were considered and rejected — GitHub is something the user already
  decided to use for hosting, so reusing it avoids a second account/service.
- **Images are separate files in `images/`, referenced by path**, not
  embedded as base64 in `data.json`. GitHub's Contents API caps a single
  file write around 1MB (base64-encoded); embedding photos in the JSON
  blob would hit that ceiling after a handful of foods. Each image upload
  uses a fresh UUID filename and is never overwritten, so writes never need
  a `sha` for images (only `data.json` needs sha tracking, for updates).
- **Images are fetched with auth via the Contents API** (`Accept:
  application/vnd.github.raw`) and turned into blob URLs, rather than
  linked directly via `raw.githubusercontent.com`. This is what makes the
  repo safe to set to **private** — a plain `<img src="raw.githubusercontent.com/...">`
  would 401 on a private repo since `<img>` tags can't send an Authorization
  header. The trade-off is images load a beat after the rest of the UI, and
  each view costs one authenticated API call (cached per path in memory for
  the session — see `getImageUrl` in `js/github-store.js`).
- **Token lives in `localStorage`, entered once per device.** This is a
  known, accepted trade-off for a single-user personal tool (see README's
  security note). Do not build any feature that transmits the token
  anywhere other than `api.github.com`.

## File map

```
index.html          Markup shell for all three views + the connect gate + modal shell
css/style.css        Whole design system (see "Design system" below)
js/main.js            Boots the app, tab switching, gate-vs-app-shell decision
js/state.js           In-memory copy of data.json + every mutation + write queue
js/github-store.js    All GitHub Contents API calls (read/write data.json, images)
js/modal.js           Generic modal open/close, used by browse + planner
js/browse.js          Browse tab: grid, search, tag filters, detail view, add/edit form
js/planner.js         Plan tab: working plan, nutrition totals, saved plans
js/settings.js        Settings tab: connection form (shared with the gate), targets, tags
js/utils.js           uid/base64/image-resize/toast/escapeHtml/etc — no app state here
data.json              Seed file. App also auto-creates this on first connect if missing.
.nojekyll               Stops GitHub Pages running the site through Jekyll
```

No bundler, no `node_modules`. Opening `index.html` via `file://` will NOT
work (ES module fetches are blocked under `file://`) — always test through
a local server, e.g. `python3 -m http.server` from the project root, or the
deployed GitHub Pages URL.

## Data schema (`data.json`)

```jsonc
{
  "version": 1,
  "foods": [
    {
      "id": "uuid",
      "name": "Chicken burrito",
      "type": "dish",                 // "dish" | "ingredient"
      "image": "images/<uuid>.jpg",   // repo-relative path, or null
      "tags": ["tagId", "tagId"],
      "notes": "free text",
      "ingredients": ["Tortilla", "Grilled chicken", "..."], // free text, not linked to other foods
      "serving": { "label": "1 burrito (350g)" },
      "nutrition": { "calories": 650, "protein": 35, "carbs": 70, "fat": 22 }, // any/all optional
      "createdAt": "ISO", "updatedAt": "ISO"
    }
  ],
  "tags": [{ "id": "protein", "name": "Protein", "color": "#A85C32" }],
  "plans": [
    {
      "id": "uuid", "name": "Tue Sep 10", "date": "2026-09-10",
      "items": [{ "foodId": "uuid", "qty": 1.5 }],
      "createdAt": "ISO", "updatedAt": "ISO"
    }
  ],
  "settings": { "dailyTargets": { "calories": 2000, "protein": 150, "carbs": 225, "fat": 70 } }
}
```

Nutrition values are per the `serving` defined on that food, not per 100g.
Planner totals multiply each food's nutrition by the plan item's `qty`.

## Known limitations / deliberate simplifications

- **Tag filters use OR logic** (show a food if it matches *any* selected
  tag), not AND. Felt more forgiving for browsing a small personal list.
  Easy to flip in `browse.js`'s `getFilteredFoods` if the user wants AND.
- **Ingredients are free text**, not linked to other food entries. Linking
  them (so e.g. editing "Tortilla" the ingredient updates every dish that
  lists it) would add real relational complexity for little benefit at
  this scale — revisit only if the user explicitly asks.
- **Deleted/replaced images are orphaned**, not cleaned up in `images/`.
  Harmless for a personal repo at this scale; a cleanup pass could diff
  `images/*` against every food's `image` field if it ever matters.
- **Last-write-wins.** No conflict UI beyond a "sync failed, reload" toast
  on a 409. Fine for one user on one plan at a time; would need real work
  before this could support multiple simultaneous editors.
- **No offline mode.** Every read/write hits the GitHub API live. Could add
  a localStorage cache-then-refresh pattern if the user wants it to feel
  faster or to work with a flaky connection, but wasn't asked for.

## Design system

Deliberately avoided the generic "AI app" look (warm cream + terracotta,
SaaS card-with-shadow kit, dark-mode-with-one-accent). Went with a
market/pantry-label feel instead — grounded in the subject matter (food),
distinct from those defaults:

- **Colors** (`css/style.css` `:root`): `--paper` (#efeae0, muted parchment,
  not the cliché #F4F1EA), `--pine` (#2f5d50, primary action color),
  `--paprika` (#b5461c, used sparingly — "over target" states, danger
  accents), plus a curated 8-color tag palette (`TAG_COLORS` in
  `js/utils.js`) so user-created tags always stay visually cohesive.
- **Type**: Fraunces (display/headings, has personality without being a
  cliché serif) + Inter (UI/body, dense and legible for forms/filters/numbers).
- **Cards over shadows**: hairline borders (`--line`) do the separating
  work, not soft drop shadows — reads more like index cards than SaaS
  widgets. Small border-radius throughout (4–14px depending on element),
  never the large "bubble card" radius.
- **Responsive images-grid → list**: `css/style.css`'s `.food-grid` media
  query at 640px turns cards from a grid into horizontal rows (image left,
  text right) rather than just narrowing the grid — this was an explicit
  ask ("list for compatibility" on phone).

If extending the UI, keep using CSS custom properties from `:root` rather
than hardcoding new colors, and keep the hairline-border/no-shadow language
consistent.

## Possible future asks (not built, but plausible next requests)

- Linking ingredients to actual food entries (see limitation above).
- An "AND" toggle for tag filtering.
- A history/trends view over saved plans (e.g. average calories per week).
- Barcode/photo-based nutrition lookup (would reintroduce the "public food
  API" question the user explicitly opted out of early on — check with them
  before adding any external API dependency).
- Cleaning up orphaned images in the repo.
