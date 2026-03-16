# Usage
```cmd
# install package
npm i sitespring-ru/springpms-font --save-dev
```

```scss
// In your `vars.scss` variables file include
@use "@sitespring/springpms-font/src/variables" as springpmsfont;

// In app component   
@use "@sitespring/springpms-font/src/style" as springpmsfont;
```

### Dev and updates
```bash
# Compile new version of style.scss to style.css
npm run build:dev

# Open demo.html tu ensure correct styling 
```

### Common pitfalls
```bash
// To correct resolve fonts path in webpack, resolve-url-loader required
npm install resolve-url-loader --save-dev
```
```js
// In webpack configuration
use: [
  'style-loader',
  'css-loader',
  'resolve-url-loader', // Здесь
  {
    loader: 'sass-loader',
    options: { sourceMap: true } // Обязательно true
  }
]
```
