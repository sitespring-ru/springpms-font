# springpms-font

Иконочный шрифт экосистемы springpms: шрифты, scss с переменными и стилями, примеры
использования.

```
src/                  публичный контракт пакета
  fonts/              spring-pms.{ttf,woff,svg}
  variables.scss      $icon-<имя> -> кодпоинт
  style.scss          @font-face + классы в namespace .springpms-icon
  style.css           собранная версия style.scss (коммитится)
examples/
  index.html          галерея всех иконок, открывается файлом
  plain/              подключение через файл стилей, без Sass и сборки
  vue3/               компонент FontIcon для Vue 3
```

## Установка

```bash
npm i sitespring-ru/springpms-font --save-dev
```

Пакет ставится из git и **без ref** — то есть проекты тянут HEAD ветки `main`, а не
тег. Обновление прилетает на ближайшем `npm i`. Теги (`v2.5.4`) существуют, но
информативны; чтобы зафиксироваться, укажите ref явно:
`sitespring-ru/springpms-font#v2.5.4`.

## Использование

```scss
// В файле переменных проекта
@use "@sitespring/springpms-font/src/variables" as springpmsfont;

// Один раз в корне приложения — объявляет @font-face и классы иконок
@use "@sitespring/springpms-font/src/style" as springpmsfont;
```

```html
<span class="springpms-icon icon-chat"></span>
```

Классы работают только внутри namespace `.springpms-icon` — так они не конфликтуют с
другими иконочными шрифтами в проекте-хосте.

Без Sass достаточно подключить собранный `src/style.css` одним `<link>` — рабочий
пример с размерами, цветом и псевдоэлементами в [examples/plain/](examples/plain/index.html).

Переменные пригодятся, когда иконка нужна в `content:` своего правила:

```scss
.myButton:before {
    font-family: springpmsfont.$icon-font-family;
    content: springpmsfont.$icon-chat;
}
```

### Vue 3

```ts
import FontIcon from '@sitespring/springpms-font/examples/vue3/FontIcon.vue'
```

Компонент публикуется исходником — сборщику нужен свой `@vitejs/plugin-vue`.
Подробности и случай Shadow DOM — в [examples/vue3/README.md](examples/vue3/README.md).

## Разработка

```bash
npm ci
npm run build:css     # пересобрать src/style.css из src/style.scss
open examples/index.html
```

`src/style.css` — коммитимый артефакт сборки: его подключают потребители, которые не
собирают scss. Менять `src/style.scss` без пересборки нельзя.

Добавление иконок делается импортом из архива-источника — см. скил
`.claude/skills/update-icon-font/`. Он раскладывает файлы, считает диф иконок,
генерирует галерею и типы, поднимает версию и ставит тег.

## Подводные камни

Пути к шрифту в `@font-face` относительные (`./fonts/…`), поэтому webpack-сборкам
нужен `resolve-url-loader`:

```bash
npm install resolve-url-loader --save-dev
```

```js
use: [
    'style-loader',
    'css-loader',
    'resolve-url-loader',              // здесь
    { loader: 'sass-loader', options: { sourceMap: true } },   // sourceMap обязателен
]
```

Внутри Shadow DOM `@font-face` не действует — объявление нужно вставлять в
`document.head`, см. пример по ссылке выше.
