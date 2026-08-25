#!/usr/bin/env node
/**
 * Импортирует набор иконок из архива-источника в springpms-font.
 *
 *   node import-icons.mjs [путь]            # dry-run, только отчёт
 *   node import-icons.mjs [путь] --apply    # записать файлы
 *
 * Путь — папка или .zip. Если не указан, ищем свежий подходящий архив в
 * ~/Downloads (переопределяется через --downloads=<путь>).
 *
 * Что пишет --apply:
 *   src/fonts/spring-pms.{ttf,woff,svg}   бинарники шрифта
 *   src/variables.scss                    $icon-* -> кодпоинт
 *   src/style.scss                        @font-face + правила в namespace .springpms-icon
 *   examples/index.html, examples/gallery.css   галерея (генерируется из шаблона)
 *   examples/vue3/iconNames.ts            union-тип имён для Vue-компонента
 *
 * Не трогает: package.json, src/style.css (её собирает `npm run build:css`), git.
 *
 * Источник спрятан за адаптером (scripts/sources/*.mjs) — сменить его можно, не
 * трогая этот файл. Ни одно поле формата источника наружу не протекает:
 * cache-buster считаем сами, префикс классов и namespace — наши.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as icomoon from './sources/icomoon.mjs';

const ADAPTERS = [icomoon];

const FONT_BASENAME = 'spring-pms';   // имя файлов шрифта, на него ссылается @font-face
const BASE_CLASS = 'springpms-icon';  // namespace стилей, см. src/style.scss
const PREFIX = 'icon-';               // префикс классов и scss-переменных
const SHIPPED_FORMATS = ['ttf', 'woff', 'svg'];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const src = path.join(repoRoot, 'src');
const examples = path.join(repoRoot, 'examples');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const downloadsArg = args.find((a) => a.startsWith('--downloads='));
const downloads = downloadsArg ? downloadsArg.slice('--downloads='.length) : path.join(os.homedir(), 'Downloads');
const inputArg = args.find((a) => !a.startsWith('--'));

const blockers = [];
const notes = [];

// ------------------------------------------------------------ источник

const sourceDir = inputArg ? resolveDir(path.resolve(inputArg)) : discover();
const adapter = ADAPTERS.find((a) => a.detect(sourceDir));
if (!adapter) {
  fail(
    `В ${sourceDir} не опознан ни один источник иконок. Ожидалось одно из:\n` +
      ADAPTERS.map((a) => `  - ${a.name}: ${a.describe}`).join('\n')
  );
}

const source = adapter.read(sourceDir);
if (!source.icons.length) fail(`Источник ${adapter.name} не отдал ни одной иконки (${sourceDir}).`);

for (const ext of SHIPPED_FORMATS) {
  if (!source.files[ext]) blockers.push(`В источнике нет файла .${ext} — он нужен, на него ссылается @font-face.`);
}
const extra = Object.keys(source.files).filter((e) => !SHIPPED_FORMATS.includes(e));
if (extra.length) notes.push(`Форматы, которые пакет не публикует и которые пропущены: ${extra.join(', ')}.`);

const dupes = source.icons.map((i) => i.name).filter((n, idx, all) => all.indexOf(n) !== idx);
if (dupes.length) blockers.push(`В источнике повторяются имена иконок: ${[...new Set(dupes)].join(', ')}.`);

// --------------------------------------------------------- репозиторий

const currentVars = fs.readFileSync(path.join(src, 'variables.scss'), 'utf8');
const currentStyle = fs.readFileSync(path.join(src, 'style.scss'), 'utf8');
const family = (currentVars.match(/\$icon-font-family:\s*"([^"]+)"/) || [])[1];

const oldIcons = [];
{
  const re = new RegExp(`^\\$${PREFIX}([A-Za-z0-9_-]+):\\s*string\\.unquote\\('"\\\\\\\\([0-9a-fA-F]+)"'\\);`, 'gm');
  let m;
  while ((m = re.exec(currentVars))) oldIcons.push({ name: m[1], code: m[2].toLowerCase() });
}

if (source.family && family && source.family !== family) {
  blockers.push(
    `font-family в источнике "${source.family}" != "${family}" в пакете. Потребители подключают шрифт по этому имени ` +
      `(в iloranta/widget-ce оно захардкожено в инъекции @font-face).`
  );
}

// ---------------------------------------------------------------- диф

const oldMap = new Map(oldIcons.map((i) => [i.name, i.code]));
const newMap = new Map(source.icons.map((i) => [i.name, i.code]));

const added = source.icons.filter((i) => !oldMap.has(i.name));
const removed = oldIcons.filter((i) => !newMap.has(i.name));
const moved = source.icons
  .filter((i) => oldMap.has(i.name) && oldMap.get(i.name) !== i.code)
  .map((i) => ({ name: i.name, from: oldMap.get(i.name), to: i.code }));

// Cache-buster — хеш содержимого шрифта, а не токен источника: одинаковый шрифт
// даёт одинаковый токен, поэтому повторный импорт не создаёт ложного диффа.
const token = source.files.woff
  ? crypto.createHash('sha256').update(fs.readFileSync(source.files.woff)).digest('hex').slice(0, 8)
  : '';
const currentToken = (currentStyle.match(/\.(?:ttf|woff2?|svg)\?([A-Za-z0-9]+)/) || [])[1] || '';

// -------------------------------------------------------------- отчёт

const L = [];
L.push(`Источник:     ${sourceDir}`);
L.push(`Формат:       ${adapter.name}`);
L.push(`font-family:  ${source.family || '?'}${source.family === family ? ' (совпадает)' : ` (в пакете: ${family})`}`);
L.push(`cache-buster: ?${token}${token === currentToken ? ' (шрифт не изменился)' : ` (было ?${currentToken})`}`);
L.push(`Иконок:       ${source.icons.length} (было ${oldIcons.length})`);
L.push('');
L.push(`Добавлено (${added.length}):`);
L.push(added.length ? added.map((i) => `  + ${PREFIX}${i.name}  \\${i.code}`).join('\n') : '  —');
L.push(`Удалено (${removed.length}):`);
L.push(removed.length ? removed.map((i) => `  - ${PREFIX}${i.name}  \\${i.code}`).join('\n') : '  —');
L.push(`Сменили код (${moved.length}):`);
L.push(moved.length ? moved.map((i) => `  ~ ${PREFIX}${i.name}  \\${i.from} -> \\${i.to}`).join('\n') : '  —');

if (notes.length) L.push('', 'Заметки:', ...notes.map((n) => `  ! ${n}`));
if (removed.length) {
  L.push(
    '',
    'ВНИМАНИЕ: удалённые иконки ломают потребителей — классы .icon-* и переменные',
    '$icon-* используются в проектах экосистемы springpms напрямую.'
  );
}
if (blockers.length) L.push('', 'БЛОКЕРЫ:', ...blockers.map((b) => `  x ${b}`));
console.log(L.join('\n'));

if (blockers.length) {
  emitJson({ ok: false, blockers });
  process.exit(2);
}

if (!apply) {
  console.log('\n(dry-run — файлы не изменены; повторите с --apply)');
  emitJson({ ok: true, applied: false });
  process.exit(0);
}

// -------------------------------------------------------------- запись

for (const ext of SHIPPED_FORMATS) {
  fs.copyFileSync(source.files[ext], path.join(src, 'fonts', `${FONT_BASENAME}.${ext}`));
}

// Фрагмент в url(...svg#...) — это id шрифта внутри самого svg, а не имя файла
const svgFontId =
  (fs.readFileSync(path.join(src, 'fonts', `${FONT_BASENAME}.svg`), 'utf8').match(/<font\s+id="([^"]+)"/) || [])[1] ||
  FONT_BASENAME;

writeVariables();
writeStyle();
writeGallery();
writeIconNames();

console.log('\nЗаписано:');
console.log('  src/fonts/, src/variables.scss, src/style.scss');
console.log('  examples/index.html, examples/gallery.css, examples/vue3/iconNames.ts');
console.log('Дальше: npm run build:css');
emitJson({ ok: true, applied: true });

function writeVariables() {
  const body = source.icons.map((i) => `$${PREFIX}${i.name}: string.unquote('"\\\\${i.code}"');`).join('\n');
  fs.writeFileSync(
    path.join(src, 'variables.scss'),
    `@use "sass:string" as string;\n\n$icon-font-family: "${family}";\n\n${body}\n\n`
  );
}

function writeStyle() {
  // @font-face выводится целиком: он полностью производный (семейство, форматы,
  // cache-buster, фрагмент svg). Тело .springpms-icon переносим из текущего
  // файла байт-в-байт — там живут ручные правки (font-smoothing, !important).
  const head =
    `@use "variables" as springpmsfont;\n\n` +
    `@font-face {\n` +
    `  font-family: springpmsfont.$icon-font-family;\n` +
    `  src:\n` +
    `    url('./fonts/${FONT_BASENAME}.ttf?${token}') format('truetype'),\n` +
    `    url('./fonts/${FONT_BASENAME}.woff?${token}') format('woff'),\n` +
    `    url('./fonts/${FONT_BASENAME}.svg?${token}#${svgFontId}') format('svg');\n` +
    `  font-weight: normal;\n` +
    `  font-style: normal;\n` +
    `  font-display: block;\n` +
    `}\n\n`;

  const preambleStart = currentStyle.indexOf(`.${BASE_CLASS} {`);
  const firstRule = currentStyle.indexOf(`\n  &.${PREFIX}`);
  if (preambleStart === -1 || firstRule === -1 || firstRule < preambleStart) {
    fail(`Не удалось разобрать src/style.scss: не найден блок .${BASE_CLASS} или первое правило &.${PREFIX}*.`);
  }
  const preamble = currentStyle.slice(preambleStart, firstRule);
  const rules = source.icons
    .map(
      (i) =>
        `\n  &.${PREFIX}${i.name} {\n    &:before {\n      content: springpmsfont.$${PREFIX}${i.name};\n    }\n  }`
    )
    .join('');

  fs.writeFileSync(path.join(src, 'style.scss'), head + preamble + rules + '\n}\n');
}

function writeGallery() {
  fs.mkdirSync(examples, { recursive: true });
  const tiles = source.icons
    .map(
      (i) =>
        `    <button class="tile" type="button" data-name="${i.name}">\n` +
        `        <span class="${BASE_CLASS} ${PREFIX}${i.name}"></span>\n` +
        `        <span class="name">${PREFIX}${i.name}</span>\n` +
        `        <span class="code">\\${i.code}</span>\n` +
        `    </button>`
    )
    .join('\n');

  const html = fs
    .readFileSync(path.join(here, 'templates', 'gallery.html'), 'utf8')
    .replaceAll('{{COUNT}}', String(source.icons.length))
    .replaceAll('{{FAMILY}}', family)
    .replace('{{ICONS}}', tiles);

  fs.writeFileSync(path.join(examples, 'index.html'), html);
  fs.copyFileSync(path.join(here, 'templates', 'gallery.css'), path.join(examples, 'gallery.css'));
}

function writeIconNames() {
  const dir = path.join(examples, 'vue3');
  fs.mkdirSync(dir, { recursive: true });
  const list = source.icons.map((i) => `    '${i.name}',`).join('\n');
  fs.writeFileSync(
    path.join(dir, 'iconNames.ts'),
    `// Сгенерировано скилом update-icon-font из шрифта. Не редактировать вручную.\n` +
      `export const iconNames = [\n${list}\n] as const\n\n` +
      `export type IconName = (typeof iconNames)[number]\n`
  );
}

// ------------------------------------------------------------- утилиты

function resolveDir(input) {
  if (!fs.existsSync(input)) fail(`Путь не существует: ${input}`);

  let dir = input;
  if (fs.statSync(input).isFile()) {
    if (!/\.zip$/i.test(input)) fail(`Ожидалась папка или .zip, получено: ${input}`);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
    execFileSync('unzip', ['-q', input, '-d', dir]);
  }

  if (ADAPTERS.some((a) => a.detect(dir))) return dir;

  // Архивы часто разворачиваются в одну вложенную папку
  const nested = subdirs(dir).filter((d) => ADAPTERS.some((a) => a.detect(d)));
  if (nested.length === 1) return nested[0];
  return dir; // пусть детект упадёт выше, с внятным сообщением
}

/** Свежий подходящий архив в ~/Downloads. При неоднозначности — не гадаем. */
function discover() {
  if (!fs.existsSync(downloads)) fail(`Путь к источнику не указан, и папки ${downloads} нет.`);

  const candidates = [];
  for (const entry of fs.readdirSync(downloads, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(downloads, entry.name);
    if (entry.isDirectory()) {
      const hit = [full, ...subdirs(full)].find((d) => ADAPTERS.some((a) => a.detect(d)));
      if (hit) candidates.push({ path: hit, mtime: fs.statSync(hit).mtimeMs });
    } else if (/\.zip$/i.test(entry.name) && zipLooksLikeSource(full)) {
      candidates.push({ path: full, mtime: fs.statSync(full).mtimeMs });
    }
  }

  if (!candidates.length) {
    fail(
      `Путь к источнику не указан, и в ${downloads} ничего подходящего не нашлось. Искали:\n` +
        ADAPTERS.map((a) => `  - ${a.name}: ${a.describe}`).join('\n')
    );
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  if (candidates.length > 1) {
    fail(
      `В ${downloads} несколько подходящих источников — укажите нужный явно:\n` +
        candidates.map((c) => `  ${c.path}`).join('\n')
    );
  }
  return resolveDir(candidates[0].path);
}

/** Заглядываем в zip списком файлов, чтобы не распаковывать всё подряд. */
function zipLooksLikeSource(zip) {
  try {
    const list = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
    return /(^|\/)style\.css$/m.test(list) && /(^|\/)fonts\//m.test(list);
  } catch {
    return false;
  }
}

function subdirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '__MACOSX')
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

function emitJson(extra) {
  console.log(
    '\n===SUMMARY-JSON===\n' +
      JSON.stringify(
        {
          sourceDir,
          sourceFormat: adapter?.name,
          fontFamily: source?.family,
          cacheBuster: token,
          total: source?.icons.length,
          previousTotal: oldIcons.length,
          added: added.map((i) => PREFIX + i.name),
          removed: removed.map((i) => PREFIX + i.name),
          moved: moved.map((i) => ({ ...i, name: PREFIX + i.name })),
          breaking: removed.length > 0,
          suggestedBump: removed.length ? 'major' : added.length ? 'minor' : 'patch',
          ...extra,
        },
        null,
        2
      )
  );
}

function fail(msg) {
  console.error('ОШИБКА: ' + msg);
  process.exit(1);
}
