# Website + widget docs

**Status:** parked (2026-10-07). Sync mechanism: discussion only, nothing
built. Pick up when more of `docs/*.md` is written. State of the site
and links updated 2026-10-12. Short-description constraint added
2026-10-13.

## Context

netlabtoolkit.org is a ~2016 custom WordPress theme (Bootstrap 3, ACF
fields/repeaters for page content, TinyMCE Advanced). Phil edits it
himself, often - mostly to update widget docs after widget changes.

Done on the site (2026-10-07, outside this repo):

- Advanced Editor Tools' "Classic Paragraph as default block" option
  turned off, so new text is Paragraph blocks. Existing pages still hold
  Classic / `tadv/classic-paragraph` blocks - convert as they're edited
  (this was the "text only shows in HTML mode" problem).
- Download and Home pages moved to blocks-only templates
  (`download-blocks.php`, `home-blocks.php`; text capped at 750px via
  inline `max-width` instead of Bootstrap column offsets). Home's
  "Updates" lists the 3 latest posts in PHP, no ACF. Old templates kept
  as rollback.
- Small "NTK Button Style" plugin adds an "NTK button" style to the core
  Button block (matches `.call-to-action-btn-2`, 15px radius).

Done since (2026-10-12):

- Widget pages moved from `/documentation/widgets-old/<widget>/` to
  `/documentation/widgets/<widget>/`. All help links in
  `app/scripts/views/*/template.js` updated to match, and FaceTrack
  given the help link it was missing (41 widgets link to the site, all
  return 200).
- Display and NeoPixel documented: `docs/display.md`, `docs/neopixel.md`,
  and a page for each on the site.
- **Not done:** no redirect from the old URLs.
  `/documentation/widgets-old/<widget>/` now returns 404, so old links,
  bookmarks and released copies of the app (whose help links still point
  there) break. Fix: 301 regex redirect from
  `documentation/widgets-old/(.*)` to `documentation/widgets/$1`.

## The problem

Widget docs live in two places that drift:

- `docs/*.md` in this repo - current, detailed, but only 14 of ~44
  widgets (cloudin, cloudout, concat, display, grovein, ifthen, llm,
  neopixel, objectrecog, oscin, oscout, speechin, speechout, text).
- WordPress pages under `/documentation/widgets/<widget>/` (41 of
  them), each with a header image from an ACF field. Every widget's
  `template.js` help link points here.

## Options discussed

- **A. Docs site from the repo.** MkDocs (Material) builds `docs/`,
  GitHub Action deploys to GitHub Pages (e.g. `docs.netlabtoolkit.org`).
  WordPress keeps Home / Download / Updates. Could also bundle docs into
  the Electron app for offline help.
- **B. Stay in WordPress**, just convert pages to blocks. Keeps two
  copies of the docs.
- **C. Push repo -> WordPress** via REST API (Python script / Action,
  application password). Either overwrite `post_content` (the ACF image
  is separate post meta, so it survives) or write into a dedicated field
  so hand-written text stays editable.
- **C' (preferred variant of C). Pull from GitHub at render time.** The
  widget page template fetches `docs/<slug>.md` from
  `raw.githubusercontent.com`, converts it with Parsedown, caches it in a
  transient (keep the last good copy if GitHub is unreachable), and shows
  it under the ACF image. Slug = lowercase widget name, so no per-page
  setup. Falls back to the existing WordPress text when no `.md` exists,
  so migration can be gradual. Not indexed by WordPress search.

## C' design against the current "Documentation" template (2026-10-12)

Fetch of `raw.githubusercontent.com/netlabtoolkit/ntk/dev/docs/ifthen.md`
returned 200, so the repo looks public (confirm in a private window).
App help-link slugs (`ifthen`, `speechout`, `objectrecog`, ...) match
`docs/*.md` names.

Field-by-field, when `docs/<slug>.md` exists:

| Current field / section | Plan |
|---|---|
| `about_header_image` (hero) | Keep, unchanged |
| `docbar-1` sidebar | Keep |
| `documentation_sections` repeater + "On This Page" nav | Replace with the `.md`'s `##` headings: anchor ids via `sanitize_title()`, nav built from them using the same `section-link` / `data-target` markup so the theme's scroll JS still works |
| `documentation_related_pages` / `_tutorials` | Keep as ACF (they link WordPress pages) |
| Page title | Keep WordPress title; strip the `.md`'s `# Title` |
| `documentation_excerpt` | Undecided - see "The short description" below |
| `documentation_image` + `doc_image_double_resolution` | Keep as ACF for now (no images in `.md` yet) |
| `the_content()` + "Instructions" `<h1>` | Replaced by the `.md` body |

No `.md` (e.g. "create-your-own-widget") -> render exactly as today.
Cache misses as well as hits, so non-widget pages don't hit GitHub on
every view.

Deliverables when built: small plugin (Parsedown + fetch/cache, ref as a
one-line setting) and a `documentation-md.php` template named
"Documentation (md)". Trial on one page (IfThen), rest stay on the old
template.

## The short description is used in two places (2026-10-13)

The one-line description at the top of a widget's page is not only that
page's subtitle (`<h3 class="widget-doc-excerpt">`). The widgets main
page, https://www.netlabtoolkit.org/documentation/widgets/, lists every
widget by category with the same text under its name
(`<li class="widget-excerpt">`), e.g. IfThen: "Compare input to a number
or text to decide what to output". Presumably both read
`documentation_excerpt` - confirm in the theme.

So whatever the widget page does with the description, the main page
has to keep working and show the same text:

- If the description moves into the `.md`, the main page must read it
  from there too, for every widget at once (41+), not just the widget
  page's template. One GitHub fetch per widget on a cold cache is too
  slow for that page - it needs one combined source (e.g. a generated
  `docs/index.json` of slug -> description, or the descriptions cached
  as each widget page is fetched, with the ACF excerpt as fallback).
- If it stays in ACF, the main page needs no change, but the
  description is then the one piece of a widget's docs still edited in
  WordPress, and it can drift from the `.md`.
- Mixed state during migration: widgets with no `.md` keep the ACF
  excerpt, so the main page must handle both sources side by side.

The `.md` first paragraph can't be used as-is. The main page needs one
short line (about 40-70 characters, no trailing full stop on most), and
only some docs start that way: `docs/display.md` opens with a one-line
summary, while `docs/ifthen.md` and `docs/concat.md` open with a full
paragraph.

## Open questions

- Short description source (decides the subtitle and the widgets main
  page together): (a) ACF excerpt stays the source for both, `.md`
  supplies only the body; (b) a one-line description in the `.md` is
  the source for both, ACF excerpt becomes the fallback for widgets
  with no `.md`; or (c) ACF excerpt for the main page and subtitle,
  and the `.md` intro shown as well under it?
- If (b): where the line lives in the `.md` - first paragraph under the
  title (as `display.md` does), or front matter (`description:`), which
  is unambiguous to parse but shows as a table on GitHub.
- Which ref should the site show: `dev` (ahead of the released app) or a
  release tag / `main` (docs fixes wait for a release)?

Resolved: the `widgets-old` parent slug is now `widgets` and the help
links follow it (see "Done since" above; the redirect is still missing).

## Conventions to keep in the meantime

- `docs/<widget>.md`, lowercase widget name (matches the WordPress slug).
- Same shape as existing docs: title, short intro, "How it works".
- Start each doc with a one-line description that could stand alone on
  the widgets main page (see `docs/display.md`), then the longer intro
  as a second paragraph. Costs nothing now and keeps option (b) open.
- Screenshots, if any, in `docs/images/` with relative links.

## Speeding up doc writing (also parked)

The slow part is checking behavior and matching Phil's voice, not the
writing. Ideas, cheapest first:

1. `docs/STYLE.md` extracted from the existing docs, edited once by Phil.
2. Defaults / ranges / inlet and outlet names taken mechanically from
   each widget's `initialize()` and template.
3. Drafts come with a short list of inferred claims + the source lines
   behind them, so review is targeted.
4. `CLAUDE.md` rule: a widget behavior change updates `docs/<widget>.md`
   in the same commit.

Suggested trial: style guide, then one draft for a widget Phil knows
well.
