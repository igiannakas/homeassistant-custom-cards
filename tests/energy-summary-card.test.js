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
// The latest 5-minute statistics block: when it ended and what the meter read then.
// A function, so a test can make a new block land between two reads.
let tailRows = () => [{ start: 1000, end: 2000, state: 7.98 }];
function hass(power = "616.44", daily = "7.98", dailyUnit = "kWh") {
  return {
    config: { currency: "GBP" },
    locale: { language: "en-GB" },
    states: {
      "sensor.power": { state: power, attributes: {} },
      "sensor.daily": { state: daily, attributes: { unit_of_measurement: dailyUnit } },
      "sensor.price": { state: "0.30", attributes: {} },
    },
    callWS: async (msg) => {
      ws.push(msg);
      if (msg.type === "energy/get_prefs") return JSON.parse(JSON.stringify(prefs));
      if (msg.type === "recorder/statistic_during_period") {
        const key = `${msg.calendar.period}${msg.calendar.offset || 0}`;
        return { change: changes[key === "day0" ? "day0" : key] };
      }
      if (msg.type === "recorder/statistics_during_period") return { [msg.statistic_ids[0]]: tailRows() };
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
  assert(stats.every((m) => m.statistic_id === "sensor.daily" && m.types[0] === "change" && m.units.energy === "kWh"));
  // The latest 5-minute block is read before and after, to know where the statistics stop.
  const tails = ws.filter((m) => m.type === "recorder/statistics_during_period");
  assert.strictEqual(tails.length, 2);
  assert(tails.every((m) => m.period === "5minute" && m.statistic_ids[0] === "sensor.daily" && m.types[0] === "state"));

  // Values and costs at the Energy settings' £0.2372/kWh.
  assert.deepStrictEqual(stat("now"), ["Now", "616W", "15p/h"]);
  assert.deepStrictEqual(stat("today"), ["Today", "7.99kWh", "£1.89"]);
  assert.deepStrictEqual(stat("yesterday"), ["Yesterday", "9.07kWh", "£2.15"]);
  assert.deepStrictEqual(stat("month"), [month, "86.6kWh", "£20.54"]);

  // Live power follows state without refetching statistics.
  const n = ws.length;
  card.hass = hass("1234.6");
  assert.deepStrictEqual(stat("now"), ["Now", "1,235W", "29p/h"], "numbers with toLocaleString");
  card.hass = hass("12345");
  assert.deepStrictEqual(stat("now"), ["Now", "12.3kW", "£2.93/h"]);
  card.hass = hass("unavailable");
  assert.deepStrictEqual(stat("now"), ["Now", "–W", ""]);
  assert.strictEqual(ws.length, n, "no extra websocket calls on state updates");

  // Today and the month tick live: statistics up to the latest block (meter 7.98 there)
  // plus whatever the meter has counted since. Yesterday is a closed day and stays put.
  card.hass = hass("616.44", "8.10");
  assert.deepStrictEqual(stat("today"), ["Today", "8.11kWh", "£1.92"]);
  assert.deepStrictEqual(stat("month"), [month, "86.7kWh", "£20.57"]);
  assert.deepStrictEqual(stat("yesterday"), ["Yesterday", "9.07kWh", "£2.15"]);
  // A daily meter reset at midnight: everything it shows is new.
  card.hass = hass("616.44", "0.05");
  assert.deepStrictEqual(stat("today"), ["Today", "8.04kWh", "£1.91"]);
  // A small dip is noise, not a reset: nothing added, nothing taken away.
  card.hass = hass("616.44", "7.95");
  assert.deepStrictEqual(stat("today"), ["Today", "7.99kWh", "£1.89"]);
  // A meter in Wh is converted before it is added.
  card.hass = hass("616.44", "8100", "Wh");
  assert.deepStrictEqual(stat("today"), ["Today", "8.11kWh", "£1.92"]);
  card.hass = hass("616.44", "unavailable");
  assert.deepStrictEqual(stat("today"), ["Today", "7.99kWh", "£1.89"]);
  assert.strictEqual(ws.length, n, "live updates never call the websocket");
  card.hass = hass();

  // Tap → Energy dashboard.
  const navs = [];
  const more = [];
  window.addEventListener("location-changed", () => navs.push(window.location.pathname));
  card.addEventListener("hass-more-info", (e) => more.push(e.detail.entityId));
  r.querySelector("ha-card").click();
  await tick();
  assert.deepStrictEqual(navs, ["/lovelace/energy"]);
  // One tap target: the circle, a number, a label or a cost all open the Energy dashboard.
  r.querySelector(".shape").click();
  r.querySelector(".stat.today .k").click();
  r.querySelector(".stat.today .c").click();
  r.querySelector(".stat.now .v").click();
  r.querySelector(".stat.month .v").click();
  await tick();
  assert.strictEqual(navs.length, 6);
  assert.deepStrictEqual(more, [], "no number opens its own dialog");
  assert(!r.querySelector("[data-e], .stats button"), "numbers aren't buttons");
  // Keyboard: Enter / Space on the card navigates.
  const K = (key) => new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  r.querySelector("ha-card").dispatchEvent(K("Enter"));
  r.querySelector("ha-card").dispatchEvent(K(" "));
  assert.strictEqual(navs.length, 8);
  assert.strictEqual(r.querySelector("ha-card").getAttribute("tabindex"), "0");

  // Design rules: nothing cut, the circle stays on phones, no colour on values, captions/units ≥ 11px.
  const css = r.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis/.test(css) && !/overflow:\s*hidden/.test(css), "no ellipsis or clipping");
  assert(!/\.shape \{[^}]*display:\s*none/.test(css), "the circle is never dropped");
  assert(!/font-size:\s*10px/.test(css), "no 10px text");
  assert(/\.stat \{[^}]*flex: 1 1 0; min-width: max-content/.test(css), "stats wrap rather than truncate");
  assert(!/\.now \.v \{[^}]*teal/.test(css), "Now is not teal");
  assert(/\.v \{[^}]*color: var\(--primary-text-color\)/.test(css));
  assert(/\.c \{[^}]*color: var\(--secondary-text-color\)/.test(css), "costs in the secondary colour");
  assert(/\.row \{[^}]*gap: 10px; padding: 12px 10px/.test(css), "first text at edge + 46");
  assert(/ha-card:active \{ filter: brightness\(\.92\); \}/.test(css));
  assert(r.querySelector(".shape").getAttribute("style").includes("--teal-color"), "the circle keeps its teal");

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

  // A block lands between the two reads of the latest block: today and the month are
  // read again, so the statistics and the meter reading end at the same moment.
  prefs = { energy_sources: [] };
  let reads = 0;
  tailRows = () => (++reads === 1 ? [{ start: 1000, end: 2000, state: 7.9 }] : [{ start: 2000, end: 3000, state: 7.98 }]);
  const before = ws.length;
  const c5 = document.createElement("energy-summary-card");
  document.body.appendChild(c5);
  c5.setConfig(cfg);
  c5.hass = hass();
  await tick(10);
  const again = ws.slice(before).filter((m) => m.type === "recorder/statistic_during_period");
  assert.deepStrictEqual(again.map((m) => JSON.stringify(m.calendar)).sort(),
    ['{"period":"day","offset":-1}', '{"period":"day"}', '{"period":"day"}', '{"period":"month"}', '{"period":"month"}'].sort());
  assert.strictEqual(c5.shadowRoot.querySelector(".stat.today .v").textContent, "7.99kWh", "anchored to the newer block (7.98)");

  // No recent statistics (Home Assistant was down): the statistics alone, as before.
  tailRows = () => [];
  const c6 = document.createElement("energy-summary-card");
  document.body.appendChild(c6);
  c6.setConfig(cfg);
  c6.hass = hass("616.44", "9.50");
  await tick(10);
  assert.strictEqual(c6.shadowRoot.querySelector(".stat.today .v").textContent, "7.99kWh");

  // Big totals are grouped: 1,204kWh.
  changes.month0 = 1204.4;
  const c7 = document.createElement("energy-summary-card");
  document.body.appendChild(c7);
  c7.setConfig(cfg);
  c7.hass = hass();
  await tick(10);
  assert.strictEqual(c7.shadowRoot.querySelector(".stat.month .v").textContent, "1,204kWh");
  // Without a navigation path, the card opens the power sensor, wherever it's tapped.
  const c8 = document.createElement("energy-summary-card");
  document.body.appendChild(c8);
  c8.setConfig({ power: "sensor.power", energy: "sensor.daily" });
  c8.hass = hass();
  const more8 = [];
  c8.addEventListener("hass-more-info", (e) => more8.push(e.detail.entityId));
  c8.shadowRoot.querySelector("ha-card").click();
  c8.shadowRoot.querySelector(".stat.today .v").click();
  assert.deepStrictEqual(more8, ["sensor.power", "sensor.power"]);

  // Costs under a pound in pence ("59p"), a running cost under a penny an hour with a decimal.
  changes.day0 = 2.5;
  const c9 = document.createElement("energy-summary-card");
  document.body.appendChild(c9);
  c9.setConfig({ ...cfg, price: 0.2372 });
  c9.hass = hass("5", "2.5");
  await tick(10);
  assert.strictEqual(c9.shadowRoot.querySelector(".stat.today .c").textContent, "59p");
  assert.strictEqual(c9.shadowRoot.querySelector(".stat.now .c").textContent, "0.1p/h");

  // 99.6p rounds to a pound: "£1.00", never "100p" nor "£0.99"; the same for the running cost.
  changes.day0 = 4.2;
  const c10 = document.createElement("energy-summary-card");
  document.body.appendChild(c10);
  c10.setConfig({ ...cfg, price: 0.2372 });
  c10.hass = hass("4200", "4.2");
  await tick(10);
  assert.strictEqual(c10.shadowRoot.querySelector(".stat.today .c").textContent, "£1.00");
  assert.strictEqual(c10.shadowRoot.querySelector(".stat.now .c").textContent, "£1.00/h");

  assert.throws(() => new Card().setConfig({}));
  console.log("ALL ENERGY-SUMMARY TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
