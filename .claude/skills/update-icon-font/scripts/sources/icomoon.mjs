/**
 * Адаптер источника: архив IcoMoon.
 *
 * Контракт адаптера (см. import-icons.mjs):
 *   name          — как источник называется в отчёте
 *   describe      — что искать, если detect не сработал (текст для ошибки)
 *   detect(dir)   — похоже ли содержимое папки на этот источник
 *   read(dir)     — { icons: [{name, code}], files: {ttf, woff, svg}, family }
 *
 * Имена иконок возвращаются БЕЗ префикса: префикс `icon-` навешивает уже сам
 * репозиторий. Так смена настроек в источнике не приводит к переименованию
 * иконок у потребителей.
 */
import fs from 'node:fs';
import path from 'node:path';

export const name = 'IcoMoon';
export const describe = 'style.css + папка fonts/ в корне архива';

export function detect(dir) {
  return fs.existsSync(path.join(dir, 'style.css')) && fs.existsSync(path.join(dir, 'fonts'));
}

export function read(dir) {
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');

  // Имена и коды берём из style.css источника: там уже применён префикс и
  // разведены дубликаты имён — разбирать selection.json смысла нет.
  const icons = [];
  const seen = new Set();
  const re = /\.([A-Za-z0-9_-]+):before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"/g;
  let m;
  while ((m = re.exec(css))) {
    const [, raw, code] = m;
    if (seen.has(raw)) continue;
    seen.add(raw);
    icons.push({ name: stripPrefix(raw), code: code.toLowerCase() });
  }

  return {
    icons,
    family: (css.match(/@font-face\s*\{[\s\S]*?font-family:\s*['"]([^'"]+)['"]/) || [])[1],
    files: collectFonts(path.join(dir, 'fonts')),
  };
}

/**
 * IcoMoon вешает префикс из Preferences → CSS Selector, и он периодически
 * разъезжается между экспортами. Снимаем любой, свой навесит генератор.
 */
function stripPrefix(raw) {
  return raw.replace(/^icon-/, '');
}

function collectFonts(fontsDir) {
  const files = {};
  if (!fs.existsSync(fontsDir)) return files;
  for (const entry of fs.readdirSync(fontsDir)) {
    if (entry.startsWith('.')) continue;
    const ext = path.extname(entry).slice(1).toLowerCase();
    // При нескольких файлах одного формата берём первый — у IcoMoon он всегда один
    if (!files[ext]) files[ext] = path.join(fontsDir, entry);
  }
  return files;
}
