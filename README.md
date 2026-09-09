# Larder — setup

A private food/dish catalog and meal planner. No install, no build step —
it's a handful of static files that GitHub Pages serves, and the GitHub
repo itself acts as the database.

## 1. Create the repo

1. On GitHub, create a **new repository** (Settings → your call on public vs
   private — see the security note at the bottom before deciding).
   Any name works, e.g. `larder`.
2. Upload every file in this project **to the root of that repo**, keeping
   the folder structure: `index.html`, `css/`, `js/`, `data.json`,
   `.nojekyll`, plus these two docs. Easiest way: on the repo's page, drag
   the whole unzipped folder onto "Add file → Upload files", or use
   `git push` if you're comfortable with git.

## 2. Turn on GitHub Pages

1. In the repo: **Settings → Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a branch".
3. Set **Branch** to `main` (or whichever branch you pushed to) and folder
   to `/ (root)`. Save.
4. GitHub will give you a URL, usually `https://<your-username>.github.io/<repo-name>/`.
   It can take a minute to go live the first time.

## 3. Create a personal access token

The app needs permission to read and write files in *this one repo* on
your behalf. A fine-grained token scoped to just this repo is the safest
way to do that.

1. Go to **github.com/settings/personal-access-tokens/new**
   (GitHub: profile photo → Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token).
2. Give it a name like `larder-app`.
3. **Repository access**: choose "Only select repositories" and pick the
   repo you just created.
4. **Permissions**: expand "Repository permissions" and set **Contents** to
   **Read and write**. Leave everything else as-is.
5. Set an expiration you're comfortable with (you can always generate a new
   one later).
6. Generate the token and **copy it now** — GitHub only shows it once.

## 4. Connect the app

1. Open your Pages URL from step 2.
2. Fill in:
   - **Repo owner**: your GitHub username
   - **Repository name**: what you named it in step 1
   - **Branch**: `main` (or whatever you used)
   - **Personal access token**: the one you just copied
3. Hit **Connect**. If it works, you're straight into the app.

The token is saved in this browser's local storage so you won't need to
re-enter it here. On your phone, you'll do this same one-time step in your
phone's browser — it's a separate device, so it needs its own copy of the
token. (This is also why edits on desktop just show up on phone: both
devices are really just reading and writing the same repo.)

## Using it day to day

- **Browse**: search, filter by tag, tap a food for the full view — photo,
  notes, ingredients (for dishes), nutrition, and a quick "add to plan".
- **Plan**: build a day's plan, see running totals against your daily
  targets (edit those in Settings), save it, reload a saved one later.
- **Settings**: manage tags, daily targets, and the GitHub connection
  itself (e.g. if you ever rotate your token).

Every add/edit/delete writes straight back to the repo, so you can also
always open `data.json` on GitHub directly if you ever want to see or
bulk-edit the raw data.

## A note on security

The access token lives in your browser's local storage on each device you
connect. It only ever talks to `api.github.com`, but treat it like a
password — don't share your Pages URL publicly (there's nothing stopping
someone with the URL from opening it, though they'd need their *own* token
to edit anything; they could still see food names via the repo if it's
public). A **private repo** is a reasonable default, since the app fetches
images through an authenticated request either way — nothing here depends
on the repo being public. If a token ever leaks, revoke it from the same
Personal access tokens page and generate a new one.

## If something breaks

Open your browser's dev tools console (F12) — errors from the app or from
GitHub's API will show up there and usually explain exactly what's wrong
(most commonly: token typo, token expired, or the token's repo access
doesn't match what you typed into the app). See `CLAUDE.md` in this project
for the technical architecture if you (or a future Claude chat) need to dig
deeper or extend it.
