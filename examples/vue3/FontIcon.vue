<script setup lang="ts">
import type { IconName } from './iconNames'

const {
    name,
    size = 'medium',
} = defineProps<{
    /** Имя иконки без префикса: `chat`, а не `icon-chat`. Список — в iconNames.ts */
    name: IconName
    size?: 'small' | 'medium' | 'large'
}>()
</script>

<template>
    <span
        class="fontIcon springpms-icon"
        :class="[`icon-${name}`, `fontIcon--${size}`]"
        aria-hidden="true"
    />
</template>

<style scoped>
/*
 * Стили иконок (.springpms-icon.icon-*) здесь намеренно НЕ подключаются.
 *
 * Пакет объявляет @font-face с относительным url на файл шрифта. Каждый
 * дополнительный @use в компоненте — ещё одна копия объявления, а у сборщиков,
 * инлайнящих шрифт в data-URI, ещё и копия самого шрифта в бандле. Поэтому
 * `@use "@sitespring/springpms-font/src/style"` делается один раз в корне
 * приложения, а компонент только проставляет классы.
 *
 * Отдельный случай — Shadow DOM: внутри него @font-face не работает вовсе,
 * объявление нужно вставлять в document.head вручную.
 */

.fontIcon {
    display: inline-block;
    vertical-align: middle;
    line-height: 1;
}

.fontIcon--small {
    font-size: 1em;
}

.fontIcon--medium {
    font-size: 1.3em;
}

.fontIcon--large {
    font-size: 1.8em;
}
</style>
