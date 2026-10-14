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
    "sensor.stealthmax_intake_exhaust_voc_delta": s(216),
    "sensor.stealthmax_intake_voc_manual_calibration": s(499.95),
    "sensor.stealthmax_exhaust_voc_manual_calibration": s(110.12),
    ...over,
  };
}
const cfg = {
  title: "StealthMax",
  vent: VENT,
  intake: { temperature: "sensor.stealthmax_intake_temperature", humidity: "sensor.stealthmax_intake_humidity", voc: "sensor.stealthmax_intake_voc", voc_manual: "sensor.stealthmax_intake_voc_manual_calibration" },
  exhaust: { temperature: "sensor.stealthmax_exhaust_temperature", humidity: "sensor.stealthmax_exhaust_humidity", voc: "sensor.stealthmax_exhaust_voc", voc_manual: "sensor.stealthmax_exhaust_voc_manual_calibration" },
  details: [{ entity: "sensor.stealthmax_intake_exhaust_voc_delta", name: "VOC delta" }, "sensor.missing"],
};

(async () => {
  const { mount, hass, calls, events, eq, tick } = await load("enclosure-filter-card");
  const card = mount(cfg, states());
  const r = card.shadowRoot;
  const seg = () => [...r.querySelectorAll(".opt")];
  const on = () => seg().map((b) => b.classList.contains("on"));
  // Status parts are joined with a no-break space before the dot; compare with plain spaces.
  const sum = (root = r) => root.querySelector(".s").textContent.replace(/\u00a0/g, " ");

  // Only numeric options become segments; 0/100 read Closed/Open.
  eq(seg().map((b) => b.textContent), ["Closed", "25", "50", "75", "Open"]);
  eq(seg().map((b) => b.classList.contains("on")), [false, true, false, false, false]);
  assert.strictEqual(r.querySelector(".side.in .vals").textContent, "31.2°29%VOC 312VOC (manual) 500");
  assert.strictEqual(r.querySelector(".side.out .vals").textContent, "30.1°30%VOC 96VOC (manual) 110");
  // VOC 312 is orange tier, 96 green.
  assert(r.querySelectorAll(".side.in .vals .v")[2].getAttribute("style").includes("--orange-color"));
  assert(r.querySelectorAll(".side.out .vals .v")[2].getAttribute("style").includes("--green-color"));
  assert(r.querySelectorAll(".side.in .vals .v")[3].getAttribute("style").includes("--red-color"));
  assert.strictEqual(sum(), "VOC 312 → 96");
  assert.strictEqual(r.querySelector(".extra").textContent, "VOC delta 216");
  eq(seg().map((b) => b.getAttribute("aria-pressed")), ["false", "true", "false", "false", "false"]);

  // Two-line label: the summary under the title; the title icon is decoration (grey, no circle).
  assert(r.querySelector(".label .slot ha-icon") && r.querySelector(".label .lt .t + .s"), "summary under the title");
  assert.strictEqual(r.querySelector(".t").textContent, "StealthMax");
  const css = r.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis/.test(css), "no clipped text");
  assert(!/line-clamp/.test(css));
  assert(!/margin-left:\s*auto/.test(css), "no summary pushed to the right of the title");
  assert(!/teal/.test(css), "the title icon isn't a tap target, so not teal");
  assert(/\.slot ha-icon \{[^}]*color: var\(--grey-color/.test(css), "title icon grey");
  // Segments: the reference style – at least 32px, grow when a label wraps, no fixed line height.
  assert(/\.opt \{[^}]*min-height: 32px;[^}]*line-height: 16px/.test(css), "segments grow, no fixed line height");
  assert(!/\.opt \{[^}]*(?:[^-]height: 32px|line-height: 32px|white-space: nowrap)/.test(css));
  assert(/\.side \{[^}]*padding: 11px 10px/.test(css), "side padding 11px 10px");
  assert(/\.opt:active, \.side:active \{ filter: brightness\(\.92\)/.test(css), "press .92");

  // A tap moves the selection at once, before Home Assistant confirms it…
  seg()[4].click();
  eq(calls.pop(), ["select", "select_option", { entity_id: VENT, option: "100" }]);
  eq(on(), [false, false, false, false, true], "moved at once");
  card.hass = hass(states());
  eq(on(), [false, false, false, false, true], "still shown while HA hasn't caught up");
  // …and falls back if it never does (45 s).
  card._pending.vent.t -= 46000;
  card.hass = hass(states());
  eq(on(), [false, true, false, false, false], "falls back to the real position");
  // HA confirms: the real state takes over.
  seg()[2].click();
  eq(calls.pop(), ["select", "select_option", { entity_id: VENT, option: "50" }]);
  card.hass = hass(states({ [VENT]: { state: "50", attributes: { options: opts } } }));
  eq(on(), [false, false, true, false, false]);
  assert(!card._pending.vent, "confirmed");
  // HA refuses: back at once, with a friendly error.
  card.hass = { ...hass(states()), callService: async () => { throw {}; } };
  seg()[3].click();
  await tick();
  eq(on(), [false, true, false, false, false], "back at once on an error");
  eq(events.splice(0), [["notification", "Couldn't move the vent."]]);
  card.hass = hass(states());
  r.querySelector(".side.in").click();
  r.querySelectorAll(".side.out .v").forEach((b) => b.click());
  r.querySelector(".extra .x").click();
  eq(events.splice(0).map((x) => x[1]), [
    "sensor.stealthmax_intake_voc", "sensor.stealthmax_exhaust_temperature", "sensor.stealthmax_exhaust_humidity", "sensor.stealthmax_exhaust_voc",
    "sensor.stealthmax_exhaust_voc_manual_calibration", "sensor.stealthmax_intake_exhaust_voc_delta",
  ]);

  // Manual vent: no segment lit, summary says so.
  card.hass = hass(states({ [VENT]: { state: "Manual", attributes: { options: opts } } }));
  assert(!seg().some((b) => b.classList.contains("on")));
  assert.strictEqual(sum(), "Vent: Manual · VOC 312 → 96");
  eq([...r.querySelectorAll(".s .p")].map((x) => x.textContent), ["Vent: Manual", "VOC 312 → 96"], "each part stays whole");
  assert(r.querySelector(".s").innerHTML.includes("&nbsp;· "));

  // Extra readings keep their unit: % and ° (no C) close up, others after a space; unknown is –.
  const c3 = mount({ ...cfg, details: ["sensor.d_temp", "sensor.d_hum", "sensor.d_co2", "sensor.d_gone"] }, states({
    "sensor.d_temp": { state: "1.14", attributes: { friendly_name: "Temp delta", unit_of_measurement: "°C" } },
    "sensor.d_hum": { state: "48.2", attributes: { friendly_name: "Humidity", unit_of_measurement: "%" } },
    "sensor.d_co2": { state: "1204", attributes: { friendly_name: "CO2", unit_of_measurement: "ppm" } },
    "sensor.d_gone": { state: "unavailable", attributes: { friendly_name: "Gone", unit_of_measurement: "ppm" } },
  }));
  eq([...c3.shadowRoot.querySelectorAll(".extra .x")].map((x) => x.textContent), ["Temp delta 1.1°", "Humidity 48.2%", "CO2 1,204 ppm", "Gone –"]);

  // No vent, no VOC: just the readings.
  const c2 = mount({ intake: { temperature: "sensor.stealthmax_intake_temperature" }, exhaust: {} }, states());
  assert(!c2.shadowRoot.querySelector(".vent"));
  assert.strictEqual(c2.shadowRoot.querySelector(".t").textContent, "Filter");
  assert.strictEqual(sum(c2.shadowRoot), "");
  assert(c2.shadowRoot.querySelector(".lt").classList.contains("one"), "title alone sits 1px low, like every card");

  console.log("enclosure-filter-card: all tests passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
