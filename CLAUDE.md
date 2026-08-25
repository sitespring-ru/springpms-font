# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@sitespring/springpms-font` — an icon font package (114 glyphs) consumed by springpms projects.
It is installed straight from GitHub (`npm i sitespring-ru/springpms-font --save-dev`), so there is
no publish step: **whatever is committed to `main` is what consumers get**, and downstream projects
pin by tag. See "Releasing" below.

Clones are often shallow and arrive with no tags — run `git fetch --unshallow --tags origin` before
reasoning about version history, or `git tag` will look empty and `git log` will show one commit.

## Commands

```bash
npm ci               # required first — without node_modules, build:demo fails with "sass: command not found"
npm run build:demo   # sass src/style.scss src/style.css — recompile the shipped CSS
```

There are no tests (`npm test` exits 1). Verification is visual: open `src/demo.html` in a browser
and check every glyph renders (it loads the compiled `style.css`, not the SCSS).

Note: `readme.md` says `npm run build:dev` — that script does not exist; the real name is `build:demo`.

## Architecture

The source of truth is an **IcoMoon export**. All four of these are generated together and must stay
in lockstep — editing one by hand without the others produces a broken package:

- `src/fonts/spring-pms.{ttf,woff,svg}` — the font binaries.
- `src/variables.scss` — `$icon-<name>` → codepoint map, plus `$icon-font-family`. Codepoints are
  written as `string.unquote('"\\eXXX"')` so they survive interpolation into `content:`.
- `src/style.scss` — `@font-face` + one nested `&.icon-<name> { &:before { content: … } }` rule per
  glyph, all inside the `.springpms-icon` block.
- `src/style.css` — the **committed build output** of `style.scss`. It is what `demo.html` and any
  non-Sass consumer loads, so regenerate it (`npm run build:demo`) in the same commit as any SCSS change.
- `src/demo.html` + `src/demo/` — the IcoMoon demo page, also regenerated on export.

`src/style.css.map` is gitignored (`src/.gitignore`); the `files` field in `package.json` ships only
`style.css`, `style.scss`, `variables.scss` and `fonts/`.

### Namespacing rule

Icon classes are **only** valid nested under `.springpms-icon` (`.springpms-icon.icon-wifi`), never
as bare `.icon-wifi`. This is deliberate — it prevents collisions with other icon fonts in host apps.
Keep new icons inside that block.

### Font URL cache-buster

`@font-face` URLs carry `?4jfbtf`. IcoMoon regenerates this token on each export; when replacing the
font binaries, update the token consistently in `style.scss` **and** rebuild `style.css`.

## Releasing

Tags are `v<x.y.z>` (`v2.5.0`…`v2.5.3`; the prefix-less `2.4.1` is legacy — don't repeat it).
Historically `package.json` lagged behind the tags (it still said `2.4.1` at tag `v2.5.3`) — keep
them in sync from now on, since the version is the only signal consumers have.

Increment convention from history: **minor** when icons are added (`v2.5.0` "add max and basik"),
**patch** for rebuilds and style fixes (`v2.5.1`–`v2.5.3`), **major** if icons are removed or
renamed — that breaks every project using the class.

Commit subjects are short and lowercase: `add max and basik`, `move icons to font namespace`.

For the whole flow — ingesting a new IcoMoon export, diffing the icon set, rebuilding, bumping and
tagging — use the `update-icon-font` skill (`.claude/skills/update-icon-font/`). Its
`scripts/sync-export.mjs` regenerates `variables.scss`/`style.scss` from an export deterministically;
don't hand-edit those 600 lines.

## Consumer contract

Downstream projects use it as:

```scss
@use "@sitespring/springpms-font/src/variables" as springpmsfont;  // in their vars file
@use "@sitespring/springpms-font/src/style" as springpmsfont;      // in the app component
```

Because `@font-face` uses relative `./fonts/…` paths, webpack consumers need `resolve-url-loader`
between `css-loader` and `sass-loader` with `sourceMap: true` — do not change those paths to
absolute/aliased ones without accounting for that.
