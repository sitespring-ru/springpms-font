---
name: update-icon-font
description: Импортирует новый набор иконок из архива-источника в springpms-font — раскладывает шрифты и scss, генерирует галерею и типы, поднимает версию и делает коммит с тегом. Использовать, когда пользователь даёт папку/zip с новым шрифтом или просит «добавить иконки», «обновить шрифт», «выкатить новую версию springpms-font».
---

# Импорт иконок в springpms-font

Шрифт тянут несколько проектов экосистемы springpms из приватного
`sitespring-ru/springpms-font`, причём **без ref** — то есть с HEAD ветки `main`.
Обновление прилетает им на ближайшем `npm i`, а не когда они сами решат. Отсюда
главная задача скила: не потерять и не переименовать существующие иконки и не
сдвинуть публичные пути.

Работу делает `scripts/import-icons.mjs`. Вручную scss не переписывать — там 600+
строк, легко разъехаться.

## Что публично

Замороженный контракт, эти пути импортируют потребители:

```
src/variables.scss   src/style.scss   src/style.css   src/fonts/spring-pms.{ttf,woff,svg}
examples/vue3/       (FontIcon.vue + iconNames.ts)
```

`examples/index.html`, `examples/gallery.css` и `examples/plain/` не публикуются — это витрина.

Генерируются при импорте только `index.html`, `gallery.css` и `vue3/iconNames.ts`.
`examples/plain/` и `vue3/FontIcon.vue` написаны руками и скриптом не трогаются — но
`plain/index.html` ссылается на конкретные иконки (`icon-chat`, `icon-done`,
`icon-search`, `icon-favourite`, `icon-booking`, `icon-wifi`) и кодпоинт `\e970`.
Если такая иконка удалена или сменила код — поправить пример.

## Источник за адаптером

Скрипт не знает, откуда пришли иконки. Формат распознаёт адаптер в
`scripts/sources/*.mjs`:

```js
export const name, describe
export function detect(dir)   // -> boolean
export function read(dir)     // -> { icons: [{name, code}], files: {ttf,woff,svg}, family }
```

Сейчас реализован один — `icomoon.mjs`. Новый источник = ещё один файл в `sources/` и
строка в массиве `ADAPTERS`; остальной скрипт не трогается.

Имена от адаптера приходят **без префикса** (`chat`), префикс `icon-` навешивает
генератор. Поэтому смена настроек в источнике не переименовывает иконки у потребителей.

## 0. Подготовка

```bash
cd "$(git rev-parse --show-toplevel)"
[ -d node_modules ] || npm ci          # без этого `npm run build:css` упадёт: sass не найден
git fetch --tags origin                # клон бывает shallow и вообще без тегов
git status --short                     # рабочее дерево должно быть чистым
```

Грязное дерево — остановиться и спросить, что делать с правками.

Отметить, если `HEAD` ушёл вперёд последнего тега — эти коммиты попадут в новый тег:

```bash
git log --oneline "$(git tag --list 'v*' --sort=-v:refname | head -1)"..HEAD
```

## 1. Сухой прогон

```bash
node .claude/skills/update-icon-font/scripts/import-icons.mjs [путь]
```

Путь можно не указывать — скрипт сам найдёт свежий подходящий архив в `~/Downloads`
(папку или `.zip`). При неоднозначности он не гадает, а печатает список кандидатов.

Выводится отчёт и блок `===SUMMARY-JSON===` с полями `added`, `removed`, `moved`,
`breaking`, `suggestedBump`. Показать пользователю список добавленных иконок.

### Ворота

- **`БЛОКЕРЫ` (exit 2)** — не применять, передать текст пользователю. Осталось три:
  нет одного из форматов шрифта, дубли имён в источнике, разъехалось `font-family`
  (его потребители используют напрямую — в `iloranta/widget-ce` оно захардкожено в
  инъекции `@font-face` для Shadow DOM).
- **`removed` непустой** — остановиться и спросить. Удаление иконки ломает все проекты,
  где используется её класс. Продолжать только по прямому «да», и тогда это major.
- **`moved` непустой** — не блокер (потребители обращаются к `$icon-*` и `.icon-*`, а не
  к кодпоинтам), но упомянуть: где-то захардкоженные `\e9xx` перестанут совпадать.

## 2. Применить и собрать

```bash
node .claude/skills/update-icon-font/scripts/import-icons.mjs [путь] --apply
npm run build:css
```

Скрипт пишет `src/fonts/`, `src/variables.scss`, `src/style.scss`,
`examples/index.html`, `examples/gallery.css`, `examples/vue3/iconNames.ts`.

`src/style.css` — коммитимый артефакт сборки, его делает `build:css`; в коммит он
должен попасть обязательно.

Что скрипт делает сам, не спрашивая источник:

- **cache-buster** — первые 8 символов sha256 от `spring-pms.woff`. Одинаковый шрифт даёт
  одинаковый токен, поэтому повторный импорт не создаёт ложного диффа.
- **фрагмент `url(...svg#...)`** — берётся из `<font id="…">` внутри самого svg.
- **галерея** — генерируется из `scripts/templates/`. Правки в витрину вносить **в шаблон**,
  иначе следующий импорт их затрёт.

Тело `.springpms-icon` в `style.scss` переносится из текущего файла байт-в-байт — там
живут ручные правки (font-smoothing, `!important`).

## 3. Проверить

```bash
grep -cE '^\$icon-' src/variables.scss              # иконки + 1 ($icon-font-family)
grep -c '&\.icon-' src/style.scss                   # на 1 меньше
grep -c '^\.springpms-icon\.icon-' src/style.css    # == предыдущему
grep -c 'class="tile"' examples/index.html          # == предыдущему
```

Наборы имён должны совпадать (оба вывода пустые):

```bash
comm -3 \
  <(grep -oE '^\$icon-[A-Za-z0-9_-]+' src/variables.scss | sed 's/^\$//' | grep -v '^icon-font-family$' | sort) \
  <(grep -oE '&\.icon-[A-Za-z0-9_-]+' src/style.scss | sed 's/^&\.//' | sort)

comm -3 \
  <(grep -oE "^    '[^']+'" examples/vue3/iconNames.ts | tr -d " '" | sort) \
  <(grep -oE '^\$icon-[A-Za-z0-9_-]+' src/variables.scss | sed 's/^\$icon-//' | grep -v '^font-family$' | sort)
```

Идемпотентность — повторный `--apply` + сборка не меняют `git status`.

И глазами: открыть `examples/index.html`, найти новые иконки, убедиться что рисуются
глифы, а не квадраты (квадрат = шрифт не совпал со стилями). Можно через
claude-in-chrome; если расширение недоступно — попросить пользователя открыть файл.

## 4. Версия

Формат тега — `v<x.y.z>` (безпрефиксный `2.4.1` — legacy, не повторять).
База = максимум из последнего тега и `version` в `package.json`: исторически
`package.json` отставал.

```bash
git tag --list 'v*' --sort=-v:refname | head -1
node -p "require('./package.json').version"
```

| Что в дифе | Бамп | Прецедент |
|---|---|---|
| добавлены иконки | **minor** | `v2.5.0` «add max and basik» |
| только пересборка / правки стилей | **patch** | `v2.5.1`…`v2.5.4` |
| иконки удалены или переименованы | **major** | только после явного «да» |

```bash
npm version <новая-версия> --no-git-tag-version   # package.json + package-lock.json
```

`package.json` и тег обязаны совпадать.

## 5. Коммит и тег

Показать итог — иконки, версию, `git status --short` — и **дождаться подтверждения**.
Без прямого «да» не коммитить.

Стиль сообщений: короткая строка в нижнем регистре (`add max and basik`, `add chat icon`,
`updates and fixes`). До трёх иконок — по именам, дальше `add N icons`.

```bash
git add -A
git commit -m "add jacuzzi and ski_pass"
git tag -a v2.6.0 -m "add jacuzzi and ski_pass"
```

## 6. Пуш — не делать

Отдать пользователю строкой, чтобы выполнил сам:

```
! git push origin main --follow-tags
```
