# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@sitespring/springpms-font` — an icon font package (115 glyphs) consumed by springpms projects.
It is installed straight from GitHub, so there is no publish step: **whatever is committed to
`main` is what consumers get**.

Consumers declare `"@sitespring/springpms-font": "github:sitespring-ru/springpms-font"` — **no ref**,
so they track `main` HEAD and pick up changes on their next `npm i`. Tags exist but are
informational. Treat every commit to `main` as a release.

Clones are often shallow and arrive with no tags — run `git fetch --unshallow --tags origin` before
reasoning about version history, or `git tag` will look empty and `git log` will show one commit.

## Commands

```bash
npm ci               # required first — without node_modules, build:css fails with "sass: command not found"
npm run build:css    # sass src/style.scss src/style.css — recompile the shipped CSS
```

There are no tests (`npm test` exits 1). Verification is visual: open `examples/index.html` in a
browser and check glyphs render (it loads the compiled `style.css`, not the SCSS).

## Architecture

```
src/         frozen public contract — see "Consumer contract"
examples/    icon gallery + Vue 3 component
```

Icons come from an **archive produced elsewhere** (currently IcoMoon, but that is an implementation
detail of one adapter — the repo itself is source-agnostic). These are generated together from that
archive and must stay in lockstep; editing one by hand produces a broken package:

- `src/fonts/spring-pms.{ttf,woff,svg}` — the font binaries.
- `src/variables.scss` — `$icon-<name>` → codepoint, plus `$icon-font-family`. Codepoints are
  written as `string.unquote('"\\eXXX"')` so they survive interpolation into `content:`.
- `src/style.scss` — `@font-face` + one nested `&.icon-<name> { &:before { content: … } }` rule per
  glyph, all inside the `.springpms-icon` block.
- `src/style.css` — the **committed build output** of `style.scss`. Consumers that don't compile
  Sass load it directly, so rebuild it in the same commit as any SCSS change.
- `examples/index.html` + `examples/gallery.css` — generated gallery.
- `examples/vue3/iconNames.ts` — generated union type of icon names.

Regenerate all of it with the `update-icon-font` skill; never hand-edit those 600 lines.
Hand edits belong in two places only: the `.springpms-icon` body of `src/style.scss` (carried over
byte-for-byte on each import) and the gallery templates under the skill's `scripts/templates/`.

### Namespacing rule

Icon classes are **only** valid nested under `.springpms-icon` (`.springpms-icon.icon-wifi`), never
as bare `.icon-wifi`. This is deliberate — it prevents collisions with other icon fonts in host apps.

### Font URL cache-buster

`@font-face` URLs carry `?<hash>` — the first 8 hex chars of the sha256 of `spring-pms.woff`,
computed by the import script. Same font ⇒ same token, so re-importing produces no spurious diff.
The `#spring-pms` fragment on the svg url is the `<font id="…">` inside the svg itself, not the
filename.

## Consumer contract

Every path under `src/` is load-bearing. Verified usages across `iloranta/widget-ce`,
`iloranta/apps` and `ladoga/widget`:

```scss
@use "@sitespring/springpms-font/src/variables" as springpmsfont;
@use "@sitespring/springpms-font/src/style";
```
```ts
import "@sitespring/springpms-font/src/style.scss"
import woffUrl from "@sitespring/springpms-font/src/fonts/spring-pms.woff?url"
```

`src/style.css` is imported too. **Do not move or rename anything under `src/`** — consumers float
on `main`, so a path change breaks them immediately, not at a version bump of their choosing. New
public surface goes in `examples/vue3/` (published via `files`).

Because `@font-face` uses relative `./fonts/…` paths, webpack consumers need `resolve-url-loader`
between `css-loader` and `sass-loader` with `sourceMap: true` — do not change those paths to
absolute/aliased ones without accounting for that.

`font-family: 'spring-pms'` is also part of the contract: `iloranta/widget-ce` hardcodes it in a
hand-built `@font-face` injected into `document.head` (inside Shadow DOM `@font-face` does not work).

## Releasing

Tags are `v<x.y.z>` (the prefix-less `2.4.1` is legacy — don't repeat it). Historically
`package.json` lagged behind the tags (it still said `2.4.1` at tag `v2.5.3`) — keep them in sync.

Increment convention from history: **minor** when icons are added (`v2.5.0` "add max and basik"),
**patch** for rebuilds and style fixes (`v2.5.1`–`v2.5.4`), **major** if icons are removed or
renamed — that breaks every project using the class.

Commit subjects are short and lowercase: `add chat icon`, `move icons to font namespace`.
