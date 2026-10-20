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

// A pop-up's way out (Close / Cancel / Done) is its one dark-grey button: the "dismiss" class,
// filled in the theme's --dark-grey-color with white (--text-primary-color) text and glyph – never a
// row's light grey, never black text on a mid grey (design tokens → Dialogs). Returns the button.
module.exports.assertDismiss = (root, label) => {
  const css = [...root.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  assert(/\.dismiss \{ background: var\(--dark-grey-color, #606060\); color: var\(--text-primary-color, #fff\); \}/.test(css), `${label}: the way out is the dark grey with white text`);
  assert(/\.dismiss \.glyph \{ background: rgba\(255,255,255,\.2\); \}/.test(css), `${label}: its glyph circle`);
  assert(/\.dismiss \.glyph ha-icon \{ color: var\(--text-primary-color, #fff\); \}/.test(css), `${label}: its glyph is white`);
  const buttons = root.querySelectorAll(".dismiss");
  assert.strictEqual(buttons.length, 1, `${label}: one way out`);
  assert.strictEqual(buttons[0].tagName, "BUTTON", `${label}: the way out is a button`);
  assert(/^(Close|Cancel|Done)$/.test(buttons[0].textContent.trim()), `${label}: "${buttons[0].textContent.trim()}" only dismisses`);
  return buttons[0];
};
