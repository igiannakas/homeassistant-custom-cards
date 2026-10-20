// Shared jsdom set-up for the card tests: loads one card, defines <home-assistant>, records service calls and events.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

module.exports = async function load(name) {
  const src = fs.readFileSync(path.join(__dirname, "..", "cards", name, `${name}.js`), "utf8");
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
  const { window } = dom;
  window.eval(src);
  assert(!window.customElements.get(name), "waits for the app");
  window.customElements.define("home-assistant", class extends window.HTMLElement {});
  await new Promise((r) => setTimeout(r, 0));
  const Card = window.customElements.get(name);
  assert(Card, `${name} registered`);
  const calls = [];
  const events = [];
  const mount = (config, states) => {
    const card = window.document.createElement(name);
    window.document.body.appendChild(card);
    card.addEventListener("hass-more-info", (e) => events.push(["more-info", e.detail.entityId]));
    card.addEventListener("hass-notification", (e) => events.push(["notification", e.detail.message]));
    card.setConfig(config);
    card.hass = hass(states);
    return card;
  };
  const hass = (states) => ({
    states,
    callService: async (d, s, data) => {
      calls.push([d, s, data]);
    },
  });
  return {
    window, document: window.document, Card, calls, events, mount, hass,
    tick: (ms = 0) => new Promise((r) => setTimeout(r, ms)),
    eq: (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m),
    st: (state, attributes = {}) => ({ state: String(state), attributes }),
  };
};

// A sheet closes with one round ✕ at the right of its title row – not a Close or Done row at the
// bottom, where it read as one more tile (design tokens → Dialogs). Returns the ✕.
module.exports.assertSheetClose = (root, label) => {
  const css = [...root.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  assert(/\.x \{ all: unset;[^}]*flex: 0 0 42px; width: 42px; height: 42px; margin-left: auto; border-radius: 50%;/.test(css), `${label}: a 42px round ✕ pushed to the right`);
  assert(/\.x \{[^}]*background: rgba\(var\(--rgb-primary-text-color, 33,33,33\), \.1\);/.test(css), `${label}: the ✕ on a light grey`);
  const xs = root.querySelectorAll(".x");
  assert.strictEqual(xs.length, 1, `${label}: one ✕`);
  const x = xs[0];
  assert.strictEqual(x.tagName, "BUTTON", `${label}: the ✕ is a button`);
  assert.strictEqual(x.getAttribute("aria-label"), "Close", `${label}: the ✕ is named Close`);
  assert.strictEqual(x.querySelector("ha-icon").getAttribute("icon"), "mdi:close");
  assert.strictEqual(x.parentElement, root.querySelector(".dialog").firstElementChild, `${label}: the ✕ is in the title row`);
  assert.strictEqual(x, x.parentElement.lastElementChild, `${label}: at the end of the title row`);
  const bottom = [...root.querySelectorAll(".dialog button")].filter((b) => /^(Close|Done)$/.test(b.textContent.trim()));
  assert.deepStrictEqual(bottom, [], `${label}: no Close or Done row as well`);
  return x;
};

// A confirmation keeps its Cancel full size beside the confirm button, in a plain light grey with
// text-coloured text – never black text on a mid grey, never a dark slab (design tokens → Dialogs).
module.exports.assertCancel = (root, label) => {
  const css = [...root.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  assert(/\.dismiss \{ background: (?:rgba\(var\(--rgb-primary-text-color, 33,33,33\), 0?\.1\)); color: var\(--primary-text-color\); \}/.test(css), `${label}: Cancel is the light grey`);
  assert(/\.dismiss \.glyph \{ background: rgba\(var\(--rgb-primary-text-color, 33,33,33\), 0?\.08\); \}/.test(css), `${label}: its glyph circle`);
  assert(/\.dismiss \.glyph ha-icon \{ color: var\(--primary-text-color\); \}/.test(css), `${label}: its glyph in the text colour`);
  const buttons = root.querySelectorAll(".dismiss");
  assert.strictEqual(buttons.length, 1, `${label}: one Cancel`);
  assert.strictEqual(buttons[0].tagName, "BUTTON");
  assert.strictEqual(buttons[0].textContent.trim(), "Cancel", `${label}: the way out says Cancel`);
  assert(!root.querySelector(".x"), `${label}: a confirmation has no ✕`);
  return buttons[0];
};
