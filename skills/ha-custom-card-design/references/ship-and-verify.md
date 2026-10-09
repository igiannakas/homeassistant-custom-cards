# Shipping, installing and verifying

## Repo layout (HACS "Dashboard" / plugin repository)

```
cards/<name>/<name>.js      one card per folder, plus README.md (screenshot, options table)
tests/<name>.test.js        jsdom tests, tests/_harness.js, tests/bundle.test.js
scripts/build.js            concatenates every card into dist/ (IIFE per card, version header)
dist/<repo>.js              the single file HACS installs
docs/screenshots/*.png      README images
hacs.json                   {"name": "...", "filename": "<repo>.js", "render_readme": true}
package.json                "build", "check" (node --check every file), "test"
```

HACS plugin repos ship **one** file, so `build.js` writes it. Each card goes inside
`(() => { ... })();`, so the duplicate `const C` and helpers in each card don't clash.
A `/* ===== name version ===== */` header goes before each one, which lets you confirm
from the browser what is actually served. `--check` fails if the bundle is out of date.

## Commit and push

- Bump the card's `VERSION`, rebuild, run every test, then commit with a message that
  says what changed and why.
- If the only shell that can reach the repo has no GitHub credentials (a linked
  computer, say), commit there and ask the user to push. Check `git status -sb`:
  `[ahead N]` means it isn't pushed yet.
- Moving files from a cloud workspace to the user's machine: tar them, write the tarball
  into the repo folder, extract it, then delete the tarball. Give each tarball a unique
  name per version.
- Deleting files or git lock files on a linked machine may need a delete permission.

## Install through HACS (websocket, from the HA page)

```js
const h = document.querySelector("home-assistant").hass;
await h.callWS({ type: "hacs/repository/refresh", repository: "<id>" });   // pick up the new commit
await h.callWS({ type: "hacs/repository/download", repository: "<id>" });  // install it
const r = (await h.callWS({ type: "hacs/repositories/list" })).find((x) => String(x.id) === "<id>");
r.installed_version;                                                         // the short commit sha
const src = await (await fetch("/hacsfiles/<repo>/<repo>.js?x=" + Date.now(), { cache: "no-store" })).text();
src.match(/\/\* ===== .* ===== \*\//g);                                     // versions actually served
```

- **Check the served version header, not just `installed_version`.** Right after a push, HACS can
  download a stale file (GitHub's raw cache) yet record the new sha. If the header is old, wait a
  couple of minutes and download again. Browsers that already loaded the stale copy keep it under
  the same `?hacstag=`, so add a cache-buster to the resource (`…?hacstag=…&v=131`) to force a reload.
- First-time add: `hacs/repositories/add {repository: "owner/repo", category: "plugin"}`.
  HACS then creates the `/hacsfiles/...?hacstag=` resource itself.
- When moving from hand-copied `/local/*.js` files to HACS, remove the old Lovelace
  resources (`lovelace/resources/delete`) and the files. Registration guards make an
  overlap harmless, but don't leave both.

## Change a view safely

1. Read the config: `lovelace/config` (`url_path: null` is the default dashboard).
2. Find the view by `path`, not by index. Check the view count and index before saving.
3. **Back up** the old view JSON to a file (e.g. `tmp_backups/<view>-backup-<date>.json`)
   and check its length matches what was read.
4. Keep the view's `visible`, `subview`, `path`, `title` and `max_columns`, and copy
   over any embedded card config you are replacing (e.g. a Frigate card's options).
5. `lovelace/config/save`, then re-read and confirm the number of views and the new
   card types.

Never edit `.storage/lovelace*` while HA runs, because HA overwrites it. Ask before any
restart.

If a websocket call fails with error code 3, the connection dropped. Reload the page
and retry. Each fresh page load in the built-in browser may need site access again.

## Verify live

- Desktop width, then a 375×812 phone viewport (`resize_window` preset mobile).
  Reset the viewport afterwards.
- Click real tap targets and check the URL gains
  `?more-info-entity-id=<expected>`. Open each confirm dialog and **cancel** it.
  Don't fire real actions (homing, power) just to test.
- Read console errors, then separate yours from other cards' noise (e.g. a camera
  card's duplicate `side-drawer` define, websocket reconnects).
- Say exactly what you checked and what was only covered by unit tests.

## README screenshots (crisp, private, repeatable)

Render each card on its own in an overlay on the live HA page, with real `hass`
(optionally with overridden states), at phone width. Then crop the screenshot.

```js
window.__shot = async (cfg, mod) => {
  let ov = document.getElementById("__shot");
  if (!ov) { ov = document.createElement("div"); ov.id = "__shot";
    ov.style.cssText = "position:fixed;inset:0;z-index:100000;overflow:auto;background:var(--primary-background-color);padding:16px";
    document.body.appendChild(ov); }
  ov.replaceChildren();
  const wrap = document.createElement("div"); wrap.id = "__wrap"; wrap.style.cssText = "width:368px;padding:8px";
  ov.appendChild(wrap);
  const el = document.createElement(cfg.type.replace("custom:", ""));
  el.setConfig(cfg);
  const base = document.querySelector("home-assistant").hass;
  el.hass = mod ? { ...base, states: { ...base.states, ...mod } } : base;
  wrap.appendChild(el);
  await new Promise((r) => setTimeout(r, 2500));
  const b = wrap.getBoundingClientRect();
  return [b.x * 2, b.y * 2, (b.x + b.width) * 2, (b.y + b.height) * 2].map(Math.round); // zoom region
};
```

- **Viewport:** 400×1000. Screenshots are capped at about 800 px wide, so 400 css px
  gives a full 2× image. Use the `zoom` action with the returned region (PNG).
- **Stale frames:** if a zoom returns an earlier frame, take a normal screenshot
  first, then zoom again.
- **Privacy:** rename private names (e.g. a property name), think twice about alarm or
  occupancy states, and tell the user what is visible before publishing.
- **Example values:** label any made-up states (a print in progress, an alert) as
  "example values" in the caption.
- **Clean up:** remove the overlay and any preview files you served from `/local`.
- **Measure in place, not in an overlay.** An overlay appended to `<body>` sits outside the view, so
  theme variables such as the card border don't apply and every inset reads 1px off. Swap the
  preview in for the real card (hide the original) and measure there.
- **Unreleased versions:** to preview a version not yet released, serve a copy with a
  renamed tag from `www/` and eval it. A screenshot is also a test: overflow found
  this way (the heater line at 375 px) gets fixed before publishing.
- Save the images to `docs/screenshots/`, optimise them, and embed with
  `<img width="384">` (2× source).
