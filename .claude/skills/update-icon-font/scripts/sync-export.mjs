#!/usr/bin/env node
/**
 * Синхронизирует репозиторий springpms-font с новым экспортом IcoMoon.
 *
 *   node sync-export.mjs <папка-или-zip-экспорта>            # dry-run, только отчёт
 *   node sync-export.mjs <папка-или-zip-экспорта> --apply    # записать файлы
 *
 * Что делает --apply:
 *   src/fonts/spring-pms.{ttf,woff,svg}  <- бинарники шрифта из экспорта
 *   src/variables.scss                   <- перегенерён в формате репозитория
 *   src/style.scss                       <- перегенерён; preamble .springpms-icon сохраняется байт-в-байт
 *   src/demo.html, src/demo/             <- демо IcoMoon, demo-files/ переписан в demo/
 *
 * Не трогает: package.json, style.css (её собирает `npm run build:demo`), git.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FONT_BASENAME = 'spring-pms';
const SHIPPED_FORMATS = ['ttf', 'woff', 'svg'];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const inputArg = args.find((a) => !a.startsWith('--'));

if (!inputArg) {
  fail('Не указан путь к экспорту.\nusage: node sync-export.mjs <папка-или-zip> [--apply]');
}

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const src = path.join(repoRoot, 'src');
const blockers = [];
const notes = [];

// ---------------------------------------------------------------- экспорт

const exportDir = resolveExportDir(path.resolve(inputArg));

function resolveExportDir(input) {
  if (!fs.existsSync(input)) fail(`Путь не существует: ${input}`);

  let dir = input;
  if (fs.statSync(input).isFile()) {
    if (!/\.zip$/i.test(input)) fail(`Ожидалась папка или .zip, получено: ${input}`);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icomoon-'));
    execFileSync('unzip', ['-q', input, '-d', dir]);
  }

  // IcoMoon-архив часто разворачивается в одну вложенную папку
  if (!looksLikeExport(dir)) {
    const nested = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('__MACOSX') && !e.name.startsWith('.'))
      .map((e) => path.join(dir, e.name))
      .filter(looksLikeExport);
    if (nested.length === 1) return nested[0];
    fail(`В ${dir} не найден экспорт IcoMoon (нужны style.css и папка fonts/).`);
  }
  return dir;
}

function looksLikeExport(dir) {
  return fs.existsSync(path.join(dir, 'style.css')) && fs.existsSync(path.join(dir, 'fonts'));
}

const exportCss = fs.readFileSync(path.join(exportDir, 'style.css'), 'utf8');

// Имена классов и коды берём из style.css самого экспорта — там IcoMoon
// уже применил префикс и развёл дубликаты имён.
const newIcons = [];
{
  const re = /\.([A-Za-z0-9_-]+):before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(exportCss))) {
    const [, name, code] = m;
    if (seen.has(name)) continue;
    seen.add(name);
    newIcons.push({ name, code: code.toLowerCase() });
  }
}
if (!newIcons.length) fail(`В ${path.join(exportDir, 'style.css')} не найдено ни одного правила иконки.`);

const badPrefix = newIcons.filter((i) => !i.name.startsWith('icon-'));
if (badPrefix.length) {
  blockers.push(
    `В экспорте ${badPrefix.length} класс(ов) без префикса "icon-" (${badPrefix
      .slice(0, 5)
      .map((i) => i.name)
      .join(', ')}). В настройках проекта IcoMoon сбит Preferences → CSS Selector (prefix должен быть "icon-").`
  );
}

const exportFamily = (exportCss.match(/@font-face\s*\{[\s\S]*?font-family:\s*['"]([^'"]+)['"]/) || [])[1];
const exportToken = (exportCss.match(/\.(?:ttf|woff2?|svg|eot)\?([A-Za-z0-9]+)/) || [])[1] || '';
const exportBase = (exportCss.match(/fonts\/([A-Za-z0-9_.-]+)\.ttf/) || [])[1];

if (exportBase && exportBase !== FONT_BASENAME) {
  blockers.push(
    `Файлы шрифта в экспорте называются "${exportBase}.*", а репозиторий и @font-face завязаны на "${FONT_BASENAME}.*" ` +
      `(включая фрагмент #${FONT_BASENAME} в svg-ссылке). Переименуйте шрифт в проекте IcoMoon в "${FONT_BASENAME}" и переэкспортируйте.`
  );
}

const exportFonts = fs.existsSync(path.join(exportDir, 'fonts'))
  ? fs.readdirSync(path.join(exportDir, 'fonts')).filter((f) => !f.startsWith('.'))
  : [];
for (const ext of SHIPPED_FORMATS) {
  if (!exportFonts.some((f) => f.toLowerCase().endsWith('.' + ext))) {
    blockers.push(`В экспорте нет файла .${ext} — он нужен, на него ссылается @font-face.`);
  }
}
const extraFormats = exportFonts.filter((f) => !SHIPPED_FORMATS.some((e) => f.toLowerCase().endsWith('.' + e)));
if (extraFormats.length) {
  notes.push(`Экспорт содержит форматы, которые репозиторий не публикует и которые будут пропущены: ${extraFormats.join(', ')}.`);
}

// ------------------------------------------------------------ репозиторий

const currentVarsText = fs.readFileSync(path.join(src, 'variables.scss'), 'utf8');
const currentStyleText = fs.readFileSync(path.join(src, 'style.scss'), 'utf8');

const oldIcons = [];
{
  const re = /^\$(icon-[A-Za-z0-9_-]+):\s*string\.unquote\('"\\\\([0-9a-fA-F]+)"'\);/gm;
  let m;
  while ((m = re.exec(currentVarsText))) oldIcons.push({ name: m[1], code: m[2].toLowerCase() });
}

const currentFamily = (currentVarsText.match(/\$icon-font-family:\s*"([^"]+)"/) || [])[1];
const currentToken = (currentStyleText.match(/\.(?:ttf|woff2?|svg|eot)\?([A-Za-z0-9]+)/) || [])[1] || '';

// ------------------------------------------------------------------ диff

const oldMap = new Map(oldIcons.map((i) => [i.name, i.code]));
const newMap = new Map(newIcons.map((i) => [i.name, i.code]));

const added = newIcons.filter((i) => !oldMap.has(i.name));
const removed = oldIcons.filter((i) => !newMap.has(i.name));
const moved = newIcons
  .filter((i) => oldMap.has(i.name) && oldMap.get(i.name) !== i.code)
  .map((i) => ({ name: i.name, from: oldMap.get(i.name), to: i.code }));

if (exportFamily && currentFamily && exportFamily !== currentFamily) {
  blockers.push(`font-family в экспорте "${exportFamily}" != "${currentFamily}" в репозитории. Потребители подключают шрифт по этому имени.`);
}

const breaking = removed.length > 0;

// --------------------------------------------------------------- вывод

const L = [];
L.push(`Экспорт:      ${exportDir}`);
L.push(`font-family:  ${exportFamily || '?'}${exportFamily === currentFamily ? ' (совпадает)' : ` (в репо: ${currentFamily})`}`);
L.push(`cache-buster: ?${exportToken || '?'}${exportToken === currentToken ? ' (не изменился)' : ` (в репо: ?${currentToken})`}`);
L.push(`Иконок:       ${newIcons.length} (было ${oldIcons.length})`);
L.push('');
L.push(`Добавлено (${added.length}):`);
L.push(added.length ? added.map((i) => `  + ${i.name}  \\${i.code}`).join('\n') : '  —');
L.push(`Удалено (${removed.length}):`);
L.push(removed.length ? removed.map((i) => `  - ${i.name}  \\${i.code}`).join('\n') : '  —');
L.push(`Сменили код (${moved.length}):`);
L.push(moved.length ? moved.map((i) => `  ~ ${i.name}  \\${i.from} -> \\${i.to}`).join('\n') : '  —');

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

// --------------------------------------------------------------- запись

if (!apply) {
  console.log('\n(dry-run — файлы не изменены; повторите с --apply)');
  emitJson({ ok: true, applied: false });
  process.exit(0);
}

// шрифты
for (const ext of SHIPPED_FORMATS) {
  const file = exportFonts.find((f) => f.toLowerCase().endsWith('.' + ext));
  fs.copyFileSync(path.join(exportDir, 'fonts', file), path.join(src, 'fonts', `${FONT_BASENAME}.${ext}`));
}

// variables.scss
const varsOut =
  '@use "sass:string" as string;\n\n' +
  `$icon-font-family: "${currentFamily}";\n\n` +
  newIcons.map((i) => `$${i.name}: string.unquote('"\\\\${i.code}"');`).join('\n') +
  '\n\n';
fs.writeFileSync(path.join(src, 'variables.scss'), varsOut);

// style.scss — @font-face с новым токеном + сохранённый preamble + правила иконок
const preambleStart = currentStyleText.indexOf('.springpms-icon {');
const firstRule = currentStyleText.indexOf('\n  &.icon-');
if (preambleStart === -1 || firstRule === -1 || firstRule < preambleStart) {
  fail('Не удалось разобрать src/style.scss: не найден блок .springpms-icon или первое правило &.icon-*.');
}
const head = currentStyleText.slice(0, preambleStart).replace(/\?[A-Za-z0-9]+/g, `?${exportToken}`);
const preamble = currentStyleText.slice(preambleStart, firstRule);
const rules = newIcons
  .map((i) => `\n  &.${i.name} {\n    &:before {\n      content: springpmsfont.$${i.name};\n    }\n  }`)
  .join('');
fs.writeFileSync(path.join(src, 'style.scss'), head + preamble + rules + '\n}\n');

// демо
const demoHtml = path.join(exportDir, 'demo.html');
if (fs.existsSync(demoHtml)) {
  fs.writeFileSync(path.join(src, 'demo.html'), fs.readFileSync(demoHtml, 'utf8').replace(/(?:\.\/)?demo-files\//g, './demo/'));
}
const demoSrc = path.join(exportDir, 'demo-files');
if (fs.existsSync(demoSrc)) {
  fs.mkdirSync(path.join(src, 'demo'), { recursive: true });
  for (const f of ['demo.css', 'demo.js']) {
    const from = path.join(demoSrc, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(src, 'demo', f));
  }
}

console.log('\nЗаписано: src/fonts/, src/variables.scss, src/style.scss, src/demo.html, src/demo/');
console.log('Дальше: npm run build:demo');
emitJson({ ok: true, applied: true });

// ------------------------------------------------------------- утилиты

function emitJson(extra) {
  const payload = {
    exportDir,
    fontFamily: exportFamily,
    cacheBuster: exportToken,
    total: newIcons.length,
    previousTotal: oldIcons.length,
    added: added.map((i) => i.name),
    removed: removed.map((i) => i.name),
    moved,
    breaking,
    suggestedBump: breaking ? 'major' : added.length ? 'minor' : 'patch',
    ...extra,
  };
  console.log('\n===SUMMARY-JSON===\n' + JSON.stringify(payload, null, 2));
}

function fail(msg) {
  console.error('ОШИБКА: ' + msg);
  process.exit(1);
}
