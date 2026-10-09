# Testing cards in jsdom

Every card gets `tests/<card>.test.js`, which runs the real card source in jsdom with a
fake `hass`. This catches most regressions before anything touches the live
dashboard. Run all the tests with `npm test`; the bundle test runs in the same pass.

## Shared harness (`tests/_harness.js`)

```js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

module.exports = async function load(name) {
  const src = fs.readFileSync(path.join(__dirname, "..", "cards", name, `${name}.js`), "utf8");
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
  const { window } = dom;
  window.eval(src);
  assert(!window.customElements.get(name), "waits for the app");          // registration is deferred
  window.customElements.define("home-assistant", class extends window.HTMLElement {});
  await new Promise((r) => setTimeout(r, 0));
  const Card = window.customElements.get(name);
  const calls = [], events = [];
  const hass = (states) => ({ states, callService: async (d, s, data) => { calls.push([d, s, data]); } });
  const mount = (config, states) => {
    const card = window.document.createElement(name);
    window.document.body.appendChild(card);
    card.addEventListener("hass-more-info", (e) => events.push(["more-info", e.detail.entityId]));
    card.addEventListener("hass-notification", (e) => events.push(["notification", e.detail.message]));
    card.setConfig(config);
    card.hass = hass(states);
    return card;
  };
  return {
    window, document: window.document, Card, calls, events, mount, hass,
    tick: (ms = 0) => new Promise((r) => setTimeout(r, ms)),
    eq: (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m), // cross-realm safe
  };
};
```

## What every card test covers

1. `setConfig({})` throws a helpful error when a required option is missing, and the
   config form lists every option.
2. **Rendering with realistic live values.** Copy real states from the dashboard so
   formatting is tested on real numbers, e.g. `"42.8180455923228"` humidity,
   `"4825h 49m 38s"` totals or `"28871.11"` metres.
3. **Each state transition** (idle → printing → paused → complete → error → off, or
   fine → elevated → ventilate), asserting the text, the icon and the glow class.
4. **Every tap target:**
   - Click each `[data-e]` value and assert the exact more-info entity ids in order.
   - Click the tile body and assert the fallback entity.
5. **Every service call:**
   - Assert domain, service and data.
   - Confirmed actions: click → dialog exists → cancel → *no* call; click → confirm →
     call.
   - Immediate actions: assert no dialog was created.
6. **Stability:** hold a reference to a button, push the same `hass` again and assert
   it's the *same* node. This is the "taps get lost" regression.
7. Options: custom names, thresholds, lists, hiding sections, and missing sensors left
   out.

## Gotchas

- **Cross-realm objects:** `assert.deepStrictEqual` fails on arrays created inside the
  jsdom window. Compare `JSON.stringify` instead (the `eq` helper).
- **Synthetic pointer events** must be `composed: true` to cross shadow roots. Use
  `new window.PointerEvent("pointerdown", { bubbles: true, composed: true })`.
- **Overlapping selectors** count elements twice. `.pct [data-e]` already contains
  `.when [data-e]`, so pick one.
- **`console.info` badges** clutter output; filter them with `grep -v "%c"`.
- jsdom has no layout. Overflow, wrapping and measured "stack" modes must be checked
  in a real browser at 375 px (see `ship-and-verify.md`).
- **Bundle test:**
  - Run the build in `--check` mode, eval the bundle and assert every
    `cards/*/<dir>.js` tag registers.
  - Eval it a second time to prove a double load is harmless.
