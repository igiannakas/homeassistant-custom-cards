// Behaviour test for vacuum-maintenance-card (runs the real card in jsdom). Run: npm test
const assert = require("assert");
const load = require("./_harness");

const DEV = "dev_vac";
const DOCK = "dev_dock";
const REG = {
  "vacuum.vacuum_cleaner": [DEV, "roborock"],
  "sensor.vacuum_cleaner_main_brush_time_left": [DEV, "main_brush_time_left"],
  "sensor.vacuum_cleaner_side_brush_time_left": [DEV, "side_brush_time_left"],
  "sensor.vacuum_cleaner_filter_time_left": [DEV, "filter_time_left"],
  "sensor.vacuum_cleaner_sensor_time_left": [DEV, "sensor_time_left"],
  "sensor.vacuum_cleaner_total_cleaning_time": [DEV, "total_cleaning_time"],
  "sensor.vacuum_cleaner_total_cleaning_count": [DEV, "total_cleaning_count"],
  "button.vacuum_cleaner_reset_main_brush_consumable": [DEV, "reset_main_brush_consumable"],
  "button.vacuum_cleaner_reset_side_brush_consumable": [DEV, "reset_side_brush_consumable"],
  "button.vacuum_cleaner_reset_air_filter_consumable": [DEV, "reset_air_filter_consumable"],
  "button.vacuum_cleaner_reset_sensor_consumable": [DEV, "reset_sensor_consumable"],
  "sensor.vacuum_cleaner_dock_maintenance_brush_time_left": [DOCK, null],
  "sensor.vacuum_cleaner_dock_strainer_time_left": [DOCK, null],
  "button.vacuum_cleaner_dock_reset_cleaning_brush_consumable": [DOCK, null],
  "binary_sensor.vacuum_cleaner_dock_dirty_water_box": [DOCK, null],
  "binary_sensor.vacuum_cleaner_dock_clean_water_box": [DOCK, null],
  "select.vacuum_cleaner_dock_empty_mode": [DOCK, null],
  "switch.vacuum_cleaner_dock_dust_emptying": [DOCK, null],
  "switch.vacuum_cleaner_dock_mop_washing": [DOCK, null],
  "switch.vacuum_cleaner_dock_mop_drying": [DOCK, null],
  "switch.vacuum_cleaner_child_lock": [DOCK, "child_lock"],
};
const st = (state, attributes = {}) => ({ state: String(state), attributes });
const s = (v) => st(v, { unit_of_measurement: "s", device_class: "duration" });
const h = (v) => st(v, { unit_of_measurement: "h", device_class: "duration" });
function states(over = {}) {
  return {
    "vacuum.vacuum_cleaner": st("docked", { friendly_name: "Vacuum cleaner" }),
    "sensor.vacuum_cleaner_main_brush_time_left": s(1048533),
    "sensor.vacuum_cleaner_side_brush_time_left": s(688533),
    "sensor.vacuum_cleaner_filter_time_left": s(508533),
    "sensor.vacuum_cleaner_sensor_time_left": s(76533),
    "sensor.vacuum_cleaner_total_cleaning_time": s(2056403),
    "sensor.vacuum_cleaner_total_cleaning_count": st(957),
    "button.vacuum_cleaner_reset_main_brush_consumable": st("unknown"),
    "button.vacuum_cleaner_reset_side_brush_consumable": st("unknown"),
    "button.vacuum_cleaner_reset_air_filter_consumable": st("unknown"),
    "button.vacuum_cleaner_reset_sensor_consumable": st("unknown"),
    "sensor.vacuum_cleaner_dock_maintenance_brush_time_left": h(13),
    "sensor.vacuum_cleaner_dock_strainer_time_left": h(27),
    "button.vacuum_cleaner_dock_reset_cleaning_brush_consumable": st("unknown"),
    "binary_sensor.vacuum_cleaner_dock_dirty_water_box": st("off", { device_class: "problem" }),
    "binary_sensor.vacuum_cleaner_dock_clean_water_box": st("off", { device_class: "problem" }),
    "select.vacuum_cleaner_dock_empty_mode": st("max", { options: ["smart", "light", "balanced", "max"] }),
    "switch.vacuum_cleaner_dock_dust_emptying": st("off"),
    "switch.vacuum_cleaner_dock_mop_washing": st("off"),
    "switch.vacuum_cleaner_dock_mop_drying": st("off"),
    "switch.vacuum_cleaner_child_lock": st("on"),
    ...over,
  };
}
const entities = Object.fromEntries(Object.entries(REG).map(([id, [d, tk]]) => [id, { entity_id: id, device_id: d, translation_key: tk }]));
const devices = {
  [DEV]: { id: DEV, name: "Vacuum cleaner", identifiers: [["roborock", "DUID"]] },
  [DOCK]: { id: DOCK, name: "Vacuum cleaner Dock", identifiers: [["roborock", "DUID_dock"]] },
};

(async () => {
  const t = await load("vacuum-maintenance-card");
  const { Card, calls, events, document, tick, eq } = t;
  const full = (x) => ({ states: x, entities, devices, callService: async (d, sv, data) => calls.push([d, sv, data]) });
  assert.throws(() => new Card().setConfig({}));
  const names = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["entity", "title", "due_soon", "hide_dock", "hide_dock_actions", "lives"]) assert(names.includes(`"${k}"`), k);

  const card = document.createElement("vacuum-maintenance-card");
  document.body.appendChild(card);
  card.addEventListener("hass-more-info", (e) => events.push(["more-info", e.detail.entityId]));
  card.setConfig({ entity: "vacuum.vacuum_cleaner" });
  card.hass = full(states());
  const r = card.shadowRoot;
  const q = (x) => r.querySelector(x);
  const all = (x) => [...r.querySelectorAll(x)];
  const cells = () => all(".stats button").map((b) => `${b.querySelector("b").textContent} ${b.querySelector("span").textContent}`);

  // Live values: % of life where it's known, hours for the dock's parts; what's next.
  assert.strictEqual(q(".t").textContent, "Maintenance");
  eq(cells(), ["97% Main brush", "96% Side brush", "94% Filter", "71% Sensors", "13 h Dock brush", "27 h Dock strainer"]);
  assert.strictEqual(q(".s").textContent, "Next: dock brush in 13 h");
  assert(!all(".stats b").some((b) => b.classList.contains("soon") || b.classList.contains("due")));
  // The dock: one quiet line, each part opens its entity.
  assert.strictEqual(q(".dock").textContent, "Dock · Clean water OK · Dirty water OK · Auto-empty Max");
  all(".dock [data-e]")[2].click();
  eq(events.pop(), ["more-info", "select.vacuum_cleaner_dock_empty_mode"]);

  // Details sheet: hours, cleans at your average, life; Reset asks first, then presses.
  const sheet = () => document.querySelector("vmc-sheet");
  const btns = () => [...sheet().shadowRoot.querySelectorAll("button")];
  const stext = () => sheet().shadowRoot.querySelector(".text").textContent;
  all(".stats button")[0].click();
  assert.strictEqual(sheet().shadowRoot.querySelector(".title").textContent, "Main brush");
  assert.strictEqual(stext(), "291 h left (97%), about 488 cleans at your average of 36 min. Replace every 300 h of cleaning.");
  eq(btns().map((b) => b.textContent.trim()), ["Reset after replacing", "History", "Close"]);
  btns()[0].click();
  assert.strictEqual(sheet().shadowRoot.querySelector(".title").textContent, "Reset main brush?");
  assert.strictEqual(stext(), "Only after fitting a new one: the main brush countdown starts again from 300 h.");
  eq(btns().map((b) => b.textContent.trim()), ["Reset", "Cancel"]);
  assert.strictEqual(calls.length, 0, "nothing pressed before the confirmation");
  btns()[1].click();
  assert(!sheet(), "Cancel closes");
  assert.strictEqual(calls.length, 0);
  all(".stats button")[0].click();
  btns()[0].click();
  btns()[0].click();
  await tick();
  eq(calls.pop(), ["button", "press", { entity_id: "button.vacuum_cleaner_reset_main_brush_consumable" }]);
  assert(!sheet());

  // The dock brush: hours, its own reset; the strainer has no reset button here.
  all(".stats button")[4].click();
  assert.strictEqual(stext(), "13 h left, about 22 cleans at your average of 36 min.");
  eq(btns().map((b) => b.textContent.trim()), ["Reset after replacing", "History", "Close"]);
  btns()[1].click();
  eq(events.pop(), ["more-info", "sensor.vacuum_cleaner_dock_maintenance_brush_time_left"]);
  all(".stats button")[5].click();
  eq(btns().map((b) => b.textContent.trim()), ["History", "Close"]);
  document.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape" }));
  assert(!sheet(), "Escape closes");

  // Sensors at zero: "Now" in red, and the summary says so; amber under due_soon.
  card.hass = full(states({ "sensor.vacuum_cleaner_sensor_time_left": s(0), "sensor.vacuum_cleaner_filter_time_left": s(8 * 3600) }));
  eq(cells().slice(2, 4), ["5% Filter", "Now Sensors"]);
  assert(all(".stats b")[3].classList.contains("due"));
  assert(all(".stats b")[2].classList.contains("soon"));
  assert.strictEqual(q(".s").textContent, "Sensors: due now");
  q(".s").click();
  assert.strictEqual(sheet().shadowRoot.querySelector(".title").textContent, "Sensors");
  assert.strictEqual(stext(), "Due now. Replace every 30 h of cleaning.");
  sheet().shadowRoot.querySelector(".backdrop").click();
  assert(!sheet(), "backdrop closes");

  // Dock tanks that need you glow red.
  card.hass = full(states({ "binary_sensor.vacuum_cleaner_dock_dirty_water_box": st("on"), "binary_sensor.vacuum_cleaner_dock_clean_water_box": st("on") }));
  eq(all(".dock .p").map((c) => [c.textContent.trim(), c.classList.contains("bad")]), [["Clean water empty", true], ["Dirty water full", true], ["Auto-empty Max", false]]);
  card.hass = full(states());

  // The dock's jobs while the robot is docked: Empty, Wash mop, Dry – each asks before it
  // starts and before it stops.
  const jobs = () => all(".jobs .pill").map((b) => b.textContent.trim() + (b.classList.contains("run") ? "*" : ""));
  const dlg = () => document.querySelector("vmc-confirm-dialog");
  eq(jobs(), ["Empty", "Wash mop", "Dry"]);
  const n1 = calls.length;
  all(".jobs .pill")[1].click();
  await tick();
  assert.strictEqual(dlg().shadowRoot.querySelector(".title").textContent, "Wash the mop");
  dlg().shadowRoot.querySelector(".cancel").click();
  await tick();
  assert(!dlg() && calls.length === n1, "Cancel: nothing happens");
  for (const [i, title, id] of [[0, "Empty the bin", "dust_emptying"], [1, "Wash the mop", "mop_washing"], [2, "Dry the mop", "mop_drying"]]) {
    all(".jobs .pill")[i].click();
    await tick();
    assert.strictEqual(dlg().shadowRoot.querySelector(".title").textContent, title);
    dlg().shadowRoot.querySelector(".confirm").click();
    await tick();
    eq(calls.pop(), ["switch", "turn_on", { entity_id: `switch.vacuum_cleaner_dock_${id}` }]);
  }
  document.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape" }));
  card.hass = full(states({ "switch.vacuum_cleaner_dock_mop_drying": st("on") }));
  eq(jobs(), ["Empty", "Wash mop", "Drying*"]);
  all(".jobs .pill")[2].click();
  await tick();
  assert.strictEqual(dlg().shadowRoot.querySelector(".title").textContent, "Stop drying");
  dlg().shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["switch", "turn_off", { entity_id: "switch.vacuum_cleaner_dock_mop_drying" }]);
  // Only while the robot is on the dock.
  card.hass = full(states({ "vacuum.vacuum_cleaner": st("cleaning", { friendly_name: "Vacuum cleaner" }) }));
  eq(jobs(), []);
  card.hass = full(states({ "vacuum.vacuum_cleaner": st("unavailable", { friendly_name: "Vacuum cleaner" }) }));
  assert(all(".jobs .pill").every((b) => b.disabled), "greyed out while offline");
  card.hass = full(states());

  // Options: lives for the dock parts, a title, no dock line or jobs, a threshold.
  const card2 = document.createElement("vacuum-maintenance-card");
  document.body.appendChild(card2);
  card2.setConfig({ entity: "vacuum.vacuum_cleaner", title: "Care", hide_dock: true, due_soon: 30, lives: { dock_brush: 300 } });
  card2.hass = full(states());
  const r2 = card2.shadowRoot;
  assert.strictEqual(r2.querySelector(".t").textContent, "Care");
  assert.strictEqual(r2.querySelector(".dock").textContent, "");
  assert.strictEqual(r2.querySelectorAll(".jobs .pill").length, 0);
  const card3 = document.createElement("vacuum-maintenance-card");
  document.body.appendChild(card3);
  card3.setConfig({ entity: "vacuum.vacuum_cleaner", hide_dock_actions: true });
  card3.hass = full(states());
  assert(card3.shadowRoot.querySelector(".dock").textContent.startsWith("Dock ·"));
  assert.strictEqual(card3.shadowRoot.querySelectorAll(".jobs .pill").length, 0);
  eq([...r2.querySelectorAll(".stats b")].map((b) => b.textContent), ["97%", "96%", "94%", "71%", "4%", "27 h"]);
  eq([...r2.querySelectorAll(".stats b")].map((b) => b.classList.contains("soon")), [false, false, false, true, true, true]);

  console.log("ALL VACUUM-MAINTENANCE-CARD TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
