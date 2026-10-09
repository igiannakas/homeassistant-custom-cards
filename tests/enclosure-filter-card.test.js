// Behaviour test for enclosure-filter-card (runs the real card in jsdom). Run: npm test
const assert = require("assert");
const load = require("./_harness");

const VENT = "select.stealthmax_vent_position_0_closed_100_open";
const opts = ["0", "25", "50", "75", "100", "Manual"];
function states(over = {}) {
  const s = (v, a = {}) => ({ state: String(v), attributes: a });
  return {
    [VENT]: s("25", { options: opts }),
    "sensor.stealthmax_intake_temperature": s(31.24),
    "sensor.stealthmax_intake_humidity": s(28.6),
    "sensor.stealthmax_intake_voc": s(312),
    "sensor.stealthmax_exhaust_temperature": s(30.1),
    "sensor.stealthmax_exhaust_humidity": s(30.2),
    "sensor.stealthmax_exhaust_voc": s(96),
    "sensor.stealthmax_voc_delta": s(216),
    ...over,
  };
}
const cfg = {
  title: "StealthMax",
  vent: VENT,
  intake: { temperature: "sensor.stealthmax_intake_temperature", humidity: "sensor.stealthmax_intake_humidity", voc: "sensor.stealthmax_intake_voc" },
  exhaust: { temperature: "sensor.stealthmax_exhaust_temperature", humidity: "sensor.stealthmax_exhaust_humidity", voc: "sensor.stealthmax_exhaust_voc" },
  details: [{ entity: "sensor.stealthmax_voc_delta", name: "VOC delta" }, "sensor.missing"],
};

(async () => {
  const { mount, hass, calls, events, eq } = await load("enclosure-filter-card");
  const card = mount(cfg, states());
  const r = card.shadowRoot;
  const seg = () => [...r.querySelectorAll(".opt")];

  // Only numeric options become segments; 0/100 read Closed/Open.
  eq(seg().map((b) => b.textContent), ["Closed", "25", "50", "75", "Open"]);
  eq(seg().map((b) => b.classList.contains("on")), [false, true, false, false, false]);
  assert.strictEqual(r.querySelector(".side.in .vals").textContent, "31.2°29%VOC 312");
  assert.strictEqual(r.querySelector(".side.out .vals").textContent, "30.1°30%VOC 96");
  // VOC 312 is orange tier, 96 green.
  assert(r.querySelector(".side.in .vals .v:last-child").getAttribute("style").includes("--orange-color"));
  assert(r.querySelector(".side.out .vals .v:last-child").getAttribute("style").includes("--green-color"));
  assert.strictEqual(r.querySelector(".sum").textContent, "VOC 312 → 96");
  assert.strictEqual(r.querySelector(".extra").textContent, "VOC delta 216");

  seg()[4].click();
  eq(calls.pop(), ["select", "select_option", { entity_id: VENT, option: "100" }]);
  r.querySelector(".side.in").click();
  eq(events.splice(0), [["more-info", "sensor.stealthmax_intake_voc"]]);

  // Manual vent: no segment lit, summary says so.
  card.hass = hass(states({ [VENT]: { state: "Manual", attributes: { options: opts } } }));
  assert(!seg().some((b) => b.classList.contains("on")));
  assert.strictEqual(r.querySelector(".sum").textContent, "Vent: Manual · VOC 312 → 96");

  // No vent, no VOC: just the readings.
  const c2 = mount({ intake: { temperature: "sensor.stealthmax_intake_temperature" }, exhaust: {} }, states());
  assert(!c2.shadowRoot.querySelector(".vent"));
  assert.strictEqual(c2.shadowRoot.querySelector(".title").textContent, "Filter");
  assert.strictEqual(c2.shadowRoot.querySelector(".sum").textContent, "");

  console.log("enclosure-filter-card: all tests passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
