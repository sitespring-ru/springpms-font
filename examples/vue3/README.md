# FontIcon для Vue 3

Компонент публикуется в пакете и импортируется напрямую:

```ts
import FontIcon from '@sitespring/springpms-font/examples/vue3/FontIcon.vue'
```

Едет исходником, как и scss, — сборщику нужен свой `@vitejs/plugin-vue`.

## Подключение

Стили иконок компонент не подключает: он только проставляет классы. Объявить их
нужно **один раз** в корне приложения, иначе `@font-face` (а у части сборщиков и
сам шрифт в data-URI) продублируется в бандле:

```scss
/* App.vue или корневой стиль */
@use "@sitespring/springpms-font/src/style";
```

Дальше:

```vue
<FontIcon name="chat" />
<FontIcon name="calendar" size="large" />
```

`name` — без префикса `icon-`, типизировано union-типом `IconName` из
`iconNames.ts`. Файл генерируется из шрифта, поэтому имя, которого нет в шрифте,
не пройдёт проверку типов.

## Shadow DOM

Внутри shadow root `@font-face` не действует — объявление обязано лежать в
`document.head`. Рабочий приём: импортировать url шрифта и вставить стиль руками
(так сделано в `iloranta/widget-ce`):

```ts
import woffUrl from '@sitespring/springpms-font/src/fonts/spring-pms.woff?url'

const style = document.createElement('style')
style.textContent =
    `@font-face{font-family:'spring-pms';src:url(${woffUrl}) format('woff');` +
    `font-weight:normal;font-style:normal;font-display:block;}`
document.head.appendChild(style)
```

Только `woff`: его понимают все браузеры с поддержкой custom elements, а каждый
лишний формат — ещё одна копия шрифта в бандле.
