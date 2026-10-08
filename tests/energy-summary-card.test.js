// Behaviour test for energy-summary-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "cards", "energy-summary-card", "energy-summary-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
const { window } = dom;
window.eval(src);
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const ws = [];
let prefs = {
  energy_sources: [{ type: "grid", stat_energy_from: "sensor.daily", number_energy_price: 0.2372, entity_energy_price: null }],
};
const changes = { day0: 7.98687791824341, "day-1": 9.069001197814941, month0: 86.60705327987682 };
function hass(power = "616.44") {
  return {
    config: { currency: "GBP" },
    locale: { language: "en-GB" },
    states: {
      "sensor.power": { state: power, attributes: {} },
      "sensor.daily": { state: "7.98", attributes: {} },
      "sensor.price": { state: "0.30", attributes: {} },
    },
    callWS: async (msg) => {
      ws.push(msg);
      if (msg.type === "energy/get_prefs") return JSON.parse(JSON.stringify(prefs));
      if (msg.type === "recorder/statistic_during_period") {
        const key = `${msg.calendar.period}${msg.calendar.offset || 0}`;
        return { change: changes[key === "day0" ? "day0" : key] };
      }
      throw new Error("unexpected " + msg.type);
    },
  };
}
const cfg = { power: "sensor.power", energy: "sensor.daily", navigation_path: "/lovelace/energy" };

(async () => {
  await tick();
  const Card = window.customElements.get("energy-summary-card");
  assert(Card, "defined after home-assistant");
  const form = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["power", "energy", "price", "navigation_path"]) assert(form.includes(`"name":"${k}"`), `editor field ${k}`);

  const card = document.createElement("energy-summary-card");
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = hass();
  await tick(10);
  const r = card.shadowRoot;
  const stat = (k) => {
    const el = r.querySelector(`.stat.${k}`);
    return [el.querySelector(".k").textContent, el.querySelector(".v").textContent, el.querySelector(".c").textContent];
  };
  const month = new Date().toLocaleDateString("en-GB", { month: "long" });

  // Statistics are asked for exactly as the Energy dashboard does (calendar periods, change).
  const stats = ws.filter((m) => m.type === "recorder/statistic_during_period");
  assert.deepStrictEqual(stats.map((m) => JSON.stringify(m.calendar)).sort(),
    ['{"period":"day","offset":-1}', '{"period":"day"}', '{"period":"month"}'].sort());
  assert(stats.every((m) => m.statistic_id === "sensor.daily" && m.types[0] === "change"));

  // Values and costs at the Energy settings' £0.2372/kWh.
  assert.deepStrictEqual(stat("now"), ["Now", "616W", "15p/h"]);
  assert.deepStrictEqual(stat("today"), ["Today", "7.99kWh", "£1.89"]);
  assert.deepStrictEqual(stat("yesterday"), ["Yesterday", "9.07kWh", "£2.15"]);
  assert.deepStrictEqual(stat("month"), [month, "86.6kWh", "£20.54"]);

  // Live power follows state without refetching statistics.
  const n = ws.length;
  card.hass = hass("1234.6");
  assert.deepStrictEqual(stat("now"), ["Now", "1235W", "29p/h"]);
  card.hass = hass("12345");
  assert.deepStrictEqual(stat("now"), ["Now", "12.3kW", "£2.93/h"]);
  card.hass = hass("unavailable");
  assert.deepStrictEqual(stat("now"), ["Now", "–W", ""]);
  assert.strictEqual(ws.length, n, "no extra websocket calls on state updates");

  // Tap → Energy dashboard.
  const navs = [];
  window.addEventListener("location-changed", () => navs.push(window.location.pathname));
  r.querySelector("ha-card").click();
  await tick();
  assert.deepStrictEqual(navs, ["/lovelace/energy"]);

  // Own price overrides the Energy settings; a price entity is read live.
  const c2 = document.createElement("energy-summary-card");
  document.body.appendChild(c2);
  c2.setConfig({ ...cfg, price: 0.5 });
  c2.hass = hass();
  await tick(10);
  assert.strictEqual(c2.shadowRoot.querySelector(".stat.today .c").textContent, "£3.99");
  const c3 = document.createElement("energy-summary-card");
  document.body.appendChild(c3);
  c3.setConfig({ ...cfg, price: "sensor.price" });
  c3.hass = hass();
  await tick(10);
  assert.strictEqual(c3.shadowRoot.querySelector(".stat.today .c").textContent, "£2.40");

  // No price anywhere → numbers only, no costs.
  prefs = { energy_sources: [] };
  const c4 = document.createElement("energy-summary-card");
  document.body.appendChild(c4);
  c4.setConfig(cfg);
  c4.hass = hass();
  await tick(10);
  assert.strictEqual(c4.shadowRoot.querySelector(".stat.today .v").textContent, "7.99kWh");
  assert.strictEqual(c4.shadowRoot.querySelector(".stat.today .c").textContent, "");

  assert.throws(() => new Card().setConfig({}));
  console.log("ALL ENERGY-SUMMARY TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
