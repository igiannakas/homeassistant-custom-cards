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
  "sensor.vacuum_cleaner_dock_error": [DOCK, "dock_error"],
  "select.vacuum_cleaner_dock_empty_mode": [DOCK, null],
  "switch.vacuum_cleaner_dock_dust_emptying": [DOCK, null],
  "switch.vacuum_cleaner_dock_mop_washing": [DOCK, null],
  "switch.vacuum_cleaner_dock_mop_drying": [DOCK, null],
  "switch.vacuum_cleaner_child_lock": [DOCK, "child_lock"],
};
const st = (state, attributes = {}) => ({ state: String(state), attributes });
const s = (v) => st(v, { unit_of_measurement: "s", device_class: "duration" });
const h = (v) => st(v, { unit_of_measurement: "h", device_class: "duration" });
const DOCK_ERRORS = ["ok", "no_dustbin_or_filter", "duct_blockage", "water_empty", "waste_water_tank_full", "dirty_tank_latch_open", "cleaning_tank_full_or_blocked"];
const derr = (v) => st(v, { device_class: "enum", options: DOCK_ERRORS });
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
    "sensor.vacuum_cleaner_dock_error": derr("ok"),
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
  for (const k of ["entity", "title", "due_soon", "hide_dock", "lives"]) assert(names.includes(`"${k}"`), k);

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
  assert.strictEqual(q(".t").textContent, "Dock & maintenance");
  // The water tanks first: two tiles with a tank glyph, blue and brown while all is well.
  const tanks = () => all(".tank").map((b) => [b.querySelector(".nm").textContent, b.querySelector(".st").textContent, b.classList.contains("bad")]);
  eq(tanks(), [["Clean water", "OK", false], ["Dirty water", "OK", false], ["Auto-empty", "Max", false]]);
  assert(q('.tank[data-tank="empty"]').classList.contains("wide"), "auto-empty spans the row, laid out like the tanks");
  assert.strictEqual(q('.tank[data-tank="empty"] ha-icon').getAttribute("icon"), "mdi:delete-empty-outline");
  // "Next: …" is the title's second line (it wraps), not a squeezed right-hand summary.
  eq([...q(".lt").children].map((c) => c.className), ["t", "s"]);
  assert(q(".tanks").compareDocumentPosition(q(".stats")) & 4, "tanks come before the numbers");
  assert.strictEqual(all(".tank svg").length, 2);
  assert(q('.tank[data-tank="clean"] .shape').style.color.includes("blue"));
  assert(q('.tank[data-tank="dirty"] .shape').style.color.includes("brown"));
  q('.tank[data-tank="dirty"]').click();
  eq(events.pop(), ["more-info", "binary_sensor.vacuum_cleaner_dock_dirty_water_box"]);
  eq(cells(), ["97% Main brush", "96% Side brush", "94% Filter", "71% Sensors", "13 h Dock brush", "27 h Dock strainer"]);
  assert.strictEqual(q(".s").textContent, "Next: dock brush in 13 h");
  assert(!all(".stats b").some((b) => b.classList.contains("soon") || b.classList.contains("due")));
  // The dock: one quiet line, each part opens its entity.
  q('.tank[data-tank="empty"]').click();
  eq(events.pop(), ["more-info", "select.vacuum_cleaner_dock_empty_mode"]);

  // Details sheet: hours, cleans at your average, life; Reset asks first, then presses.
  const sheet = () => document.querySelector("vmc-sheet");
  const btns = () => [...sheet().shadowRoot.querySelectorAll(".buttons button")];
  const stext = () => sheet().shadowRoot.querySelector(".text").textContent;
  all(".stats button")[0].click();
  assert.strictEqual(sheet().shadowRoot.querySelector(".title").textContent, "Main brush");
  assert.strictEqual(stext(), "291 h left (97%), about 488 cleans at your average of 36 min. Replace every 300 h of cleaning.");
  eq(btns().map((b) => b.textContent.trim()), ["Reset after replacing", "History"]);
  assert.strictEqual(load.assertSheetClose(sheet().shadowRoot, "details sheet"), sheet().shadowRoot.activeElement, "focus on the ✕");
  btns()[0].click();
  assert.strictEqual(sheet().shadowRoot.querySelector(".title").textContent, "Reset main brush?");
  assert.strictEqual(stext(), "Only after fitting a new one: the countdown starts again from 300 h.");
  eq(btns().map((b) => b.textContent.trim()), ["Reset", "Cancel"]);
  assert.strictEqual(load.assertCancel(sheet().shadowRoot, "reset confirmation"), btns()[1], "Cancel beside Reset, full size");
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
  eq(btns().map((b) => b.textContent.trim()), ["Reset after cleaning", "History"], "the dock brush is cleaned, not replaced");
  btns()[0].click();
  assert.strictEqual(stext(), "Only after cleaning it: the countdown starts again.");
  btns()[1].click();
  all(".stats button")[4].click();
  btns()[1].click();
  eq(events.pop(), ["more-info", "sensor.vacuum_cleaner_dock_maintenance_brush_time_left"]);
  all(".stats button")[5].click();
  eq(btns().map((b) => b.textContent.trim()), ["History"]);
  sheet().shadowRoot.querySelector(".x").click();
  assert(!sheet(), "the ✕ closes");
  assert.strictEqual(calls.length, 0, "and presses nothing");
  all(".stats button")[5].click();
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
  assert.strictEqual(stext(), "Due for cleaning now. Clean them every 30 h of use.");
  eq(btns().map((b) => b.textContent.trim()), ["Reset after cleaning", "History"]);
  btns()[0].click();
  assert.strictEqual(stext(), "Only after cleaning them: the countdown starts again from 30 h.");
  sheet().shadowRoot.querySelector(".backdrop").click();
  assert(!sheet(), "backdrop closes");

  // Dock tanks that need you glow red.
  card.hass = full(states({ "binary_sensor.vacuum_cleaner_dock_dirty_water_box": st("on"), "binary_sensor.vacuum_cleaner_dock_clean_water_box": st("on") }));
  eq(tanks(), [["Clean water", "Empty – refill it", true], ["Dirty water", "Full – empty it", true], ["Auto-empty", "Max", false]], "a tank that needs you glows red and says what to do");
  assert(q('.tank[data-tank="dirty"] .shape').style.color.includes("red"));
  q('.tank[data-tank="clean"]').click();
  eq(events.pop(), ["more-info", "binary_sensor.vacuum_cleaner_dock_clean_water_box"], "its own sensor said so, so it opens that");

  // The dock's error counts too. Seen live (23 Oct 2026): back at the dock to wash the mop, the robot
  // raised "water_empty" while the tank's flag stayed clear, so the vacuum card said "refill the clean
  // water tank" and this card said OK. Now the tile agrees, and opens the dock error that said so.
  const OK3 = [["Clean water", "OK", false], ["Dirty water", "OK", false], ["Auto-empty", "Max", false]];
  card.hass = full(states({ "sensor.vacuum_cleaner_dock_error": derr("water_empty") }));
  eq(tanks(), [["Clean water", "Empty – refill it", true], ["Dirty water", "OK", false], ["Auto-empty", "Max", false]], "dock error alone empties the clean tank");
  assert(q('.tank[data-tank="clean"] .shape').style.color.includes("red"));
  assert(q('.tank[data-tank="dirty"] .shape').style.color.includes("brown"));
  q('.tank[data-tank="clean"]').click();
  eq(events.pop(), ["more-info", "sensor.vacuum_cleaner_dock_error"], "the tile opens the dock error that said so");
  q('.tank[data-tank="dirty"]').click();
  eq(events.pop(), ["more-info", "binary_sensor.vacuum_cleaner_dock_dirty_water_box"], "the other tank still opens its own sensor");
  // Its twin, for the dirty tank.
  card.hass = full(states({ "sensor.vacuum_cleaner_dock_error": derr("waste_water_tank_full") }));
  eq(tanks(), [["Clean water", "OK", false], ["Dirty water", "Full – empty it", true], ["Auto-empty", "Max", false]], "dock error alone fills the dirty tank");
  q('.tank[data-tank="dirty"]').click();
  eq(events.pop(), ["more-info", "sensor.vacuum_cleaner_dock_error"]);
  q('.tank[data-tank="clean"]').click();
  eq(events.pop(), ["more-info", "binary_sensor.vacuum_cleaner_dock_clean_water_box"]);
  // Both saying so: the tank's own sensor is what it opens.
  card.hass = full(states({ "sensor.vacuum_cleaner_dock_error": derr("water_empty"), "binary_sensor.vacuum_cleaner_dock_clean_water_box": st("on") }));
  assert.strictEqual(tanks()[0][1], "Empty – refill it");
  q('.tank[data-tank="clean"]').click();
  eq(events.pop(), ["more-info", "binary_sensor.vacuum_cleaner_dock_clean_water_box"]);
  // Any other dock error is the vacuum card's banner, not a tank; nor is an unreachable dock error.
  for (const e of ["duct_blockage", "cleaning_tank_full_or_blocked", "dirty_tank_latch_open", "unavailable", "unknown"]) {
    card.hass = full(states({ "sensor.vacuum_cleaner_dock_error": derr(e) }));
    eq(tanks(), OK3, `dock error ${e} leaves the tanks alone`);
  }
  // Once it clears, the tile is OK again and opens its own sensor.
  card.hass = full(states({ "sensor.vacuum_cleaner_dock_error": derr("water_empty") }));
  card.hass = full(states());
  eq(tanks(), OK3, "cleared");
  q('.tank[data-tank="clean"]').click();
  eq(events.pop(), ["more-info", "binary_sensor.vacuum_cleaner_dock_clean_water_box"], "back to its own sensor");
  // A dock without an error sensor reads its tank sensors alone.
  const noErr = (over) => {
    const x = states(over);
    delete x["sensor.vacuum_cleaner_dock_error"];
    return x;
  };
  const card4 = document.createElement("vacuum-maintenance-card");
  document.body.appendChild(card4);
  card4.setConfig({ entity: "vacuum.vacuum_cleaner" });
  card4.hass = full(noErr());
  const tanks4 = () => [...card4.shadowRoot.querySelectorAll(".tank")].map((b) => [b.querySelector(".nm").textContent, b.querySelector(".st").textContent, b.classList.contains("bad")]);
  eq(tanks4(), OK3, "no dock error sensor");
  card4.hass = full(noErr({ "binary_sensor.vacuum_cleaner_dock_clean_water_box": st("on") }));
  eq(tanks4()[0], ["Clean water", "Empty – refill it", true]);
  card4.remove();
  // entities.dock_error overrides the one found.
  const card5 = document.createElement("vacuum-maintenance-card");
  document.body.appendChild(card5);
  card5.setConfig({ entity: "vacuum.vacuum_cleaner", entities: { dock_error: "sensor.other_dock_error" } });
  card5.hass = full(states({ "sensor.vacuum_cleaner_dock_error": derr("water_empty"), "sensor.other_dock_error": derr("ok") }));
  eq([...card5.shadowRoot.querySelectorAll(".tank .st")].map((x) => x.textContent), ["OK", "OK", "Max"], "the configured dock error is the one read");
  card5.hass = full(states({ "sensor.other_dock_error": derr("water_empty") }));
  eq([...card5.shadowRoot.querySelectorAll(".tank .st")].map((x) => x.textContent), ["Empty – refill it", "OK", "Max"]);
  card5.remove();

  card.hass = full(states());
  assert.strictEqual(all(".jobs, .pill").length, 0, "the dock's jobs live on the vacuum card");

  // Options: lives for the dock parts, a title, no tanks or auto-empty line, a threshold.
  const card2 = document.createElement("vacuum-maintenance-card");
  document.body.appendChild(card2);
  card2.setConfig({ entity: "vacuum.vacuum_cleaner", title: "Care", hide_dock: true, due_soon: 30, lives: { dock_brush: 300 } });
  card2.hass = full(states());
  const r2 = card2.shadowRoot;
  assert.strictEqual(r2.querySelector(".t").textContent, "Care");
  assert.strictEqual(r2.querySelectorAll(".tank").length, 0);
  const card3 = document.createElement("vacuum-maintenance-card");
  document.body.appendChild(card3);
  card3.setConfig({ entity: "vacuum.vacuum_cleaner", hide_dock: true });
  card3.hass = full(states());
  assert.strictEqual(card3.shadowRoot.querySelector(".t").textContent, "Maintenance");
  eq([...r2.querySelectorAll(".stats b")].map((b) => b.textContent), ["97%", "96%", "94%", "71%", "4%", "27 h"]);
  eq([...r2.querySelectorAll(".stats b")].map((b) => b.classList.contains("soon")), [false, false, false, true, true, true]);

  // Text is never clipped (a long label wraps instead).
  const css = [...card3.shadowRoot.querySelectorAll("style")].map((x) => x.textContent).join("");
  assert(!/text-overflow:\s*ellipsis/.test(css), "no clipped text");

  console.log("ALL VACUUM-MAINTENANCE-CARD TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
