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
