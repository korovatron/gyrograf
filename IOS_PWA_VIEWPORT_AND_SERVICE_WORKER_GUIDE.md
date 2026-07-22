# iOS PWA Viewport and Service Worker Guide

This note describes how to avoid the intermittent bottom-bar bug seen in installed iOS PWAs, especially after rotating from landscape back to portrait or immediately after a service worker update.

The guidance is app-agnostic. Use it for any full-screen browser app with a canvas, drawing surface, fixed control panel, or app shell that must cover the whole installed PWA viewport.

## The Symptoms

In installed PWA mode on iPhone or iPad, the app sometimes opens or rotates back to portrait with a blank bar across the bottom of the screen.

The app may initially appear full screen, then suddenly show the bar after a service worker update reloads the page. Rotation can also trigger it intermittently: the app is fine most of the time, but about 1 in 10 or 1 in 20 landscape-to-portrait rotations leave the app height too short.

## The Causes

iOS has several related PWA viewport timing problems:

1. Safe-area values are not always ready when the app first launches.

   `env(safe-area-inset-top)` can briefly report `0`, so any calculation that depends on it can run too early.

2. In standalone PWA mode, iOS can report a portrait `window.innerHeight` that is too short.

   On some devices this looks like iOS has subtracted the top safe area from the height. The app then renders as if the screen is shorter than it really is.

3. After landscape-to-portrait rotation, iOS can report multiple transient heights.

   It may first report the old landscape height, then a portrait height that behaves like Safari browser mode with browser chrome reserved at the bottom, before finally settling.

4. `visualViewport.height` is too volatile for the root app height.

   On iOS it can report temporary heights during share sheets, screenshots, app switching, browser chrome transitions, and keyboard-like viewport changes. Do not write `visualViewport.height` into the root full-screen CSS variable.

5. A forced service worker reload can trigger the race.

   If a new service worker takes control and the page immediately calls `window.location.reload()`, the app can reload during a fragile iOS PWA viewport transition. The first paint may be correct, then the forced reload creates the bottom bar.

## Required HTML Meta Tags

Use `viewport-fit=cover`; without it, iOS safe-area environment variables are not reliable.

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

`black-translucent` lets the app draw behind the status bar and notch, which is the mode where the safe-area behaviour matters.

## Required CSS Variables

Define safe-area variables once at the root.

```css
:root {
  --safe-area-top: env(safe-area-inset-top);
  --safe-area-bottom: env(safe-area-inset-bottom);
  --safe-area-left: env(safe-area-inset-left);
  --safe-area-right: env(safe-area-inset-right);
}
```

## Root Document CSS

Do not make `html` and `body` depend directly on a possibly short `--actual-vh` as their main `height`.

Use `height: 100%`, then use `--actual-vh` only as a minimum, guarded so it cannot shrink the document below `100vh`.

```css
html,
body {
  width: 100%;
  height: 100%;
  min-height: 100vh;
  min-height: var(--actual-vh, 100vh);
  min-height: max(100vh, var(--actual-vh, 100vh));
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  margin: 0;
}
```

The important part is that a transient short `--actual-vh` must not become the root document height.

## App Shell CSS

Pin the root app shell to the installed PWA viewport.

```css
#app-shell {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  height: var(--actual-vh, 100vh);
  min-height: 100vh;
  min-height: var(--actual-vh, 100vh);
  min-height: max(100vh, var(--actual-vh, 100vh));
  overflow: hidden;
}
```

If the app has a separate canvas wrapper, drawing surface, stage, or main viewport element, give that element the same full-height pattern.

```css
#canvas-wrapper {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  height: var(--actual-vh, 100vh);
  min-height: 100vh;
  min-height: var(--actual-vh, 100vh);
  min-height: max(100vh, var(--actual-vh, 100vh));
  overflow: hidden;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
```

If the app has a fixed or sliding control panel that fills the viewport, give it the same height stack.

```css
#control-panel {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  height: var(--actual-vh, 100vh);
  min-height: 100vh;
  min-height: var(--actual-vh, 100vh);
  min-height: max(100vh, var(--actual-vh, 100vh));
  padding-top: max(20px, calc(var(--safe-area-top, 0px) + 10px));
  padding-bottom: max(20px, calc(var(--safe-area-bottom, 0px) + 10px));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
```

## JavaScript Viewport Fix

Use `window.innerHeight` as the source of truth for the root app height. Do not use `visualViewport.height` for `--actual-vh`.

Run the calculation immediately, then run staggered retries because iOS may not have safe-area values ready yet.

```js
function fixIOSViewportBug() {
  let lastKnownHeight = 0;

  const setActualViewportHeight = () => {
    let viewportHeight = window.innerHeight;

    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const isPortrait = window.innerHeight > window.innerWidth;

    if (isIOS && isPWA && isPortrait) {
      const screenPortraitHeight = Math.max(window.screen.height, window.screen.width);
      const difference = screenPortraitHeight - viewportHeight;

      if (difference > 15) {
        const computedStyle = getComputedStyle(document.documentElement);
        const safeTop = computedStyle.getPropertyValue('--safe-area-top');
        const safeTopPx = parseInt(safeTop, 10) || 0;
        const heightWithSafeTop = viewportHeight + safeTopPx;
        const remainingShortfall = screenPortraitHeight - heightWithSafeTop;

        if (remainingShortfall > 8 && difference <= 180) {
          viewportHeight = screenPortraitHeight;
        } else if (safeTopPx > 0) {
          viewportHeight = heightWithSafeTop;
        } else if (difference <= 180) {
          viewportHeight = screenPortraitHeight;
        }
      }
    }

    document.documentElement.style.setProperty('--actual-vh', `${viewportHeight}px`);

    if (document.body) {
      void document.body.offsetHeight;
    }

    if (lastKnownHeight > 0 && Math.abs(viewportHeight - lastKnownHeight) > 30) {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }

    lastKnownHeight = viewportHeight;
  };

  const scheduleViewportHeightUpdates = (delays) => {
    delays.forEach((delay) => {
      setTimeout(setActualViewportHeight, delay);
    });
  };

  setActualViewportHeight();
  scheduleViewportHeightUpdates([50, 150, 300, 500, 800, 1200]);

  window.addEventListener('resize', setActualViewportHeight);

  window.addEventListener('orientationchange', () => {
    scheduleViewportHeightUpdates([50, 100, 200, 350, 600, 900, 1300, 1800]);
  });

  if (screen.orientation) {
    screen.orientation.addEventListener('change', () => {
      scheduleViewportHeightUpdates([50, 100, 200, 350, 600, 900, 1300, 1800]);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      scheduleViewportHeightUpdates([50, 200, 500, 900]);
    }
  });
}

fixIOSViewportBug();
```

Call this before measuring or initialising the app layout.

If the app resizes a canvas backing store from a wrapper element, make sure canvas/layout syncs also happen after the same delayed orientation retries. The viewport CSS variable can settle later than the first orientation event.

```js
function scheduleCanvasLayoutSyncs(delays) {
  delays.forEach((delay) => {
    setTimeout(() => {
      syncCanvasLayout();
    }, delay + 20);
  });
}

window.addEventListener('orientationchange', () => {
  const delays = [50, 100, 200, 350, 600, 900, 1300, 1800];
  scheduleCanvasLayoutSyncs(delays);
});
```

Replace `syncCanvasLayout()` with the app's own canvas resize or layout function.

## Service Worker Update Rule

Do not force an immediate page reload when a new service worker takes control in an installed iOS PWA.

Avoid this pattern:

```js
navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload();
});
```

That reload can happen during the fragile iOS standalone viewport transition and cause the bottom bar even when the initial launch was correct.

Prefer simple registration:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js', { scope: './' })
    .catch((err) => console.error('Service Worker registration failed:', err));
}
```

The service worker can still call `skipWaiting()` and `clients.claim()` if you want new files to install promptly, but the page should not immediately reload itself on `controllerchange` in iOS PWA mode.

If an app truly needs an immediate update prompt, show a user-controlled reload button instead of automatically calling `window.location.reload()`.

## Service Worker Cache Bumps

When changing the viewport fix, bump the service worker cache name so installed PWAs fetch the new CSS and JavaScript.

```js
const CACHE_NAME = 'my-app-v1.0.1';
```

Make sure the cached asset list includes the files that contain the viewport fix, usually:

```js
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];
```

## Checklist for New Apps

- Add `viewport-fit=cover` and Apple PWA meta tags.
- Define `--safe-area-*` variables at `:root`.
- Set `--actual-vh` from `window.innerHeight`, never from `visualViewport.height`.
- Run viewport height calculation immediately and with staggered retries.
- On orientation changes, use longer staggered retries up to about 1800 ms.
- Keep `html, body` at `height: 100%`; do not let a bad `--actual-vh` become their main height.
- Pin the app shell with `position: fixed; inset: 0`.
- Give the app shell, canvas wrapper, and full-height panels the `100vh` plus `--actual-vh` plus guarded `min-height` pattern.
- If the app resizes a canvas backing store, resync it after delayed orientation retries.
- Do not auto-reload on `serviceWorker.controllerchange` in installed iOS PWA mode.
- Bump the service worker cache whenever changing viewport CSS or JS.

## Diagnostic Clues

If the bar appears immediately after an update, suspect a forced service worker reload.

If the bar appears after landscape-to-portrait rotation, suspect a short transient `--actual-vh` or a canvas wrapper that is still using `height: 100%` without the full viewport pattern.

If the bar appears only intermittently, assume a timing race. More single delays are rarely enough; use staggered retries and CSS guards so a bad early value cannot visibly shrink the app.