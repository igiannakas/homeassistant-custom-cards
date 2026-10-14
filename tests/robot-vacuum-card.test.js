// Behaviour test for robot-vacuum-card (runs the real card in jsdom). Run: npm test
const assert = require("assert");
const load = require("./_harness");

const DEV = "dev_vac";
const DOCK = "dev_dock";
// Entity id → [device, translation key]; values follow a real Roborock S8-class vacuum with a dock.
const REG = {
  "vacuum.vacuum_cleaner": [DEV, "roborock"],
  "sensor.vacuum_cleaner_battery": [DEV, null],
  "binary_sensor.vacuum_cleaner_charging": [DEV, null],
  "sensor.vacuum_cleaner_status": [DEV, "status"],
  "sensor.vacuum_cleaner_vacuum_error": [DEV, "vacuum_error"],
  "binary_sensor.vacuum_cleaner_water_shortage": [DEV, "water_shortage"],
  "binary_sensor.vacuum_cleaner_mop_attached": [DEV, "mop_attached"],
  "sensor.vacuum_cleaner_cleaning_area": [DEV, "cleaning_area"],
  "sensor.vacuum_cleaner_total_cleaning_area": [DEV, "total_cleaning_area"],
  "sensor.vacuum_cleaner_cleaning_time": [DEV, "cleaning_time"],
  "sensor.vacuum_cleaner_total_cleaning_time": [DEV, "total_cleaning_time"],
  "sensor.vacuum_cleaner_cleaning_progress": [DEV, "clean_percent"],
  "sensor.vacuum_cleaner_current_room": [DEV, "current_room"],
  "sensor.vacuum_cleaner_last_clean_begin": [DEV, "last_clean_start"],
  "select.vacuum_cleaner_selected_map": [DEV, "selected_map"],
  "select.study_vacuum_cleaner_cleaning_mode": [DEV, "cleaning_mode"],
  "select.vacuum_cleaner_mop_intensity": [DEV, "mop_intensity"],
  "select.vacuum_cleaner_mop_mode": [DEV, "mop_mode"],
  "image.study_vacuum_cleaner_first_floor": [DEV, null],
  "image.study_vacuum_cleaner_ground_floor": [DEV, null],
  "sensor.vacuum_cleaner_dock_error": [DOCK, null],
  "binary_sensor.vacuum_cleaner_dock_dirty_water_box": [DOCK, null],
  "binary_sensor.vacuum_cleaner_dock_clean_water_box": [DOCK, null],
  "sensor.vacuum_cleaner_mop_drying_remaining_time": [DOCK, null],
  "sensor.nancy_status": ["dev_other", "status"],
};
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const st = (state, attributes = {}) => ({ state: String(state), attributes });
function states(over = {}) {
  return {
    "vacuum.vacuum_cleaner": st("docked", { friendly_name: "Vacuum cleaner", fan_speed: "turbo", fan_speed_list: ["quiet", "balanced", "turbo", "max", "max_plus", "off", "custom"] }),
    "sensor.vacuum_cleaner_battery": st(100, { device_class: "battery", unit_of_measurement: "%" }),
    "binary_sensor.vacuum_cleaner_charging": st("on", { device_class: "battery_charging" }),
    "sensor.vacuum_cleaner_status": st("charging"),
    "sensor.vacuum_cleaner_vacuum_error": st("none"),
    "binary_sensor.vacuum_cleaner_water_shortage": st("off", { device_class: "problem" }),
    "binary_sensor.vacuum_cleaner_mop_attached": st("on"),
    "sensor.vacuum_cleaner_cleaning_area": st(22.6, { unit_of_measurement: "m²" }),
    "sensor.vacuum_cleaner_total_cleaning_area": st(24532.8, { unit_of_measurement: "m²" }),
    "sensor.vacuum_cleaner_cleaning_time": st(1650, { unit_of_measurement: "s", device_class: "duration" }),
    "sensor.vacuum_cleaner_total_cleaning_time": st(2056403, { unit_of_measurement: "s" }),
    "sensor.vacuum_cleaner_cleaning_progress": st(0, { unit_of_measurement: "%" }),
    "sensor.vacuum_cleaner_current_room": st("Second Bedroom"),
    "sensor.vacuum_cleaner_last_clean_begin": st(ago(4), { device_class: "timestamp" }),
    "select.vacuum_cleaner_selected_map": st("First floor", { options: ["First floor", "Ground floor"] }),
    "select.study_vacuum_cleaner_cleaning_mode": st("vac_and_mop", { options: ["vacuum", "vac_and_mop", "mop", "custom"] }),
    "select.vacuum_cleaner_mop_intensity": st("standard", { options: ["off", "mild", "standard", "intense", "custom"] }),
    "select.vacuum_cleaner_mop_mode": st("standard", { options: ["standard", "deep", "deep_plus", "fast", "custom"] }),
    "image.study_vacuum_cleaner_first_floor": st("2026-10-14T11:34:44Z", { friendly_name: "Vacuum cleaner First floor", entity_picture: "/api/image_proxy/image.study_vacuum_cleaner_first_floor?token=a" }),
    "image.study_vacuum_cleaner_ground_floor": st("2026-10-14T11:34:44Z", { friendly_name: "Vacuum cleaner Ground floor", entity_picture: "/api/image_proxy/image.study_vacuum_cleaner_ground_floor?token=b" }),
    "sensor.vacuum_cleaner_dock_error": st("ok"),
    "binary_sensor.vacuum_cleaner_dock_dirty_water_box": st("off", { device_class: "problem" }),
    "binary_sensor.vacuum_cleaner_dock_clean_water_box": st("off", { device_class: "problem" }),
    "sensor.vacuum_cleaner_mop_drying_remaining_time": st(0, { unit_of_measurement: "s" }),
    "automation.vacuum_when_away": st("on", { friendly_name: "Vacuum when everyone has left" }),
    "sensor.nancy_status": st("charging"),
    ...over,
  };
}
const MAPS = {
  "vacuum.vacuum_cleaner": {
    maps: [
      { flag: 0, name: "First floor", rooms: { 16: "Second Bedroom", 17: "Master Bedroom", 18: "En-suite Bathroom", 19: "Bathroom", 20: "Upstairs Corridor", 21: "Study" } },
      { flag: 1, name: "Ground floor", rooms: { 17: "Kitchen", 18: "Downstairs Corridor", 19: "Downstairs Bathroom", 20: "Living room" } },
    ],
  },
};
const ws = [];
const entities = Object.fromEntries(Object.entries(REG).map(([id, [d, tk]]) => [id, { entity_id: id, device_id: d, translation_key: tk }]));
const devices = {
  [DEV]: { id: DEV, name: "Vacuum cleaner", identifiers: [["roborock", "DUID"]] },
  [DOCK]: { id: DOCK, name: "Vacuum cleaner Dock", identifiers: [["roborock", "DUID_dock"]] },
  dev_other: { id: "dev_other", name: "Nancy", identifiers: [["roborock", "OTHER"]] },
};
const areas = {
  a1: { area_id: "a1", name: "Second bedroom", icon: "mdi:baby-carriage" },
  a2: { area_id: "a2", name: "Master Bedroom", icon: "mdi:bed-king" },
  a3: { area_id: "a3", name: "Main Bathroom", icon: "mdi:bathtub" },
  a4: { area_id: "a4", name: "Corridor", icon: "mdi:stairs" },
  a5: { area_id: "a5", name: "Study", icon: "mdi:chair-rolling" },
  a6: { area_id: "a6", name: "Kitchen", icon: "mdi:countertop" },
};
const cfg = {
  entity: "vacuum.vacuum_cleaner",
  auto_clean: "automation.vacuum_when_away",
  rooms: { "En-suite Bathroom": { icon: "mdi:shower" }, "Downstairs Bathroom": { icon: "mdi:toilet" } },
};

(async () => {
  const t = await load("robot-vacuum-card");
  const { Card, calls, events, document, tick, eq } = t;
  const full = (s) => ({
    states: s,
    entities,
    devices,
    areas,
    callService: async (d, sv, data) => calls.push([d, sv, data]),
    callWS: async (msg) => {
      ws.push(msg);
      return { context: {}, response: MAPS };
    },
  });
  assert.throws(() => new Card().setConfig({}));
  assert.throws(() => new Card().setConfig({ entity: "sensor.x" }));
  const names = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["entity", "auto_clean", "hide_map", "hide_rooms", "hide_settings", "rooms"]) assert(names.includes(`"${k}"`), k);

  const card = document.createElement("robot-vacuum-card");
  document.body.appendChild(card);
  card.addEventListener("hass-more-info", (e) => events.push(["more-info", e.detail.entityId]));
  card.setConfig(cfg);
  card.hass = full(states());
  await tick();
  card.hass = full(states());
  const r = card.shadowRoot;
  const q = (s) => r.querySelector(s);
  const all = (s) => [...r.querySelectorAll(s)];
  const acts = () => all(".acts .pill").map((b) => b.textContent.trim());
  const text = (s) => q(s).textContent.replace(/\s+/g, " ").trim();

  // Docked, live values: state, last clean with its numbers, battery, no messages.
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Docked");
  assert(/^Last clean \w{3} \d\d:\d\d · 22\.6 m² · 28 min$/.test(text(".line")), text(".line"));
  assert.strictEqual(text(".batt"), "100%");
  assert.strictEqual(q(".batt ha-icon").getAttribute("icon"), "mdi:battery-charging-100");
  assert.strictEqual(all(".msg").length, 0);
  assert(q(".jt").hidden, "no job while docked");
  // One get_maps call over the websocket, with a response.
  assert.strictEqual(ws.length, 1);
  eq([ws[0].type, ws[0].domain, ws[0].service, ws[0].return_response, ws[0].target], ["call_service", "roborock", "get_maps", true, { entity_id: "vacuum.vacuum_cleaner" }]);

  // Floors from the selected map; the loaded one pressed. The map shows that floor's picture.
  eq(all(".floors button").map((b) => [b.textContent, b.getAttribute("aria-pressed")]), [["First floor", "true"], ["Ground floor", "false"]]);
  assert(!q(".floors").hidden);
  assert(!q(".map").hidden);
  assert(card._mapUrl.startsWith("/api/image_proxy/image.study_vacuum_cleaner_first_floor?token=a&s="), card._mapUrl);

  // Rooms of the loaded map, with area icons (exact, contained, guessed) or your own.
  const roomNames = () => all(".rooms .chip").map((b) => b.textContent.trim());
  eq(roomNames(), ["Second Bedroom", "Master Bedroom", "En-suite Bathroom", "Bathroom", "Upstairs Corridor", "Study"]);
  const icon = (n) => all(".rooms .chip").find((b) => b.textContent.trim() === n).querySelector("ha-icon").getAttribute("icon");
  eq(["Second Bedroom", "Master Bedroom", "En-suite Bathroom", "Bathroom", "Upstairs Corridor", "Study"].map(icon),
    ["mdi:baby-carriage", "mdi:bed-king", "mdi:shower", "mdi:bathtub", "mdi:stairs", "mdi:chair-rolling"]);

  // Docked: Clean all and Auto clean (glowing: the automation is on). No Dock on the dock.
  eq(acts(), ["Clean all", "Auto clean"]);
  assert(q('[data-k="auto"]').classList.contains("on"));
  assert.strictEqual(q('[data-k="auto"]').getAttribute("aria-pressed"), "true");

  // Settings as chips.
  eq(all(".sets .chip").map((b) => b.textContent.trim()), ["Vac & mop", "Turbo", "Standard mop"]);

  // Pick two rooms → "Clean 2 rooms" → one segment clean on the loaded map; selection clears.
  const cleanBtn = q('[data-k="clean"]');
  const room = (n) => all(".rooms .chip").find((b) => b.textContent.trim() === n);
  room("Study").click();
  room("Upstairs Corridor").click();
  assert(room("Study").classList.contains("sel"));
  assert.strictEqual(room("Study").querySelector("ha-icon").getAttribute("icon"), "mdi:check");
  eq(acts(), ["Clean 2 rooms", "Auto clean"]);
  assert.strictEqual(q('[data-k="clean"]'), cleanBtn, "the button under the finger is updated, not replaced");
  room("Upstairs Corridor").click();
  room("Upstairs Corridor").click();
  q('[data-k="clean"]').click();
  await tick();
  eq(calls.pop(), ["vacuum", "send_command", { entity_id: "vacuum.vacuum_cleaner", command: "app_segment_clean", params: [{ segments: [21, 20], repeat: 1 }] }]);
  eq(acts(), ["Clean all", "Auto clean"]);
  q('[data-k="clean"]').click();
  await tick();
  eq(calls.pop(), ["vacuum", "start", { entity_id: "vacuum.vacuum_cleaner" }]);

  // Auto clean toggles the automation at once.
  q('[data-k="auto"]').click();
  await tick();
  eq(calls.pop(), ["automation", "turn_off", { entity_id: "automation.vacuum_when_away" }]);

  // Floor switch loads the other map on the robot (immediately) and clears the selection.
  room("Study").click();
  all(".floors button")[1].click();
  await tick();
  eq(calls.pop(), ["select", "select_option", { entity_id: "select.vacuum_cleaner_selected_map", option: "Ground floor" }]);
  card.hass = full(states({ "select.vacuum_cleaner_selected_map": st("Ground floor", { options: ["First floor", "Ground floor"] }) }));
  eq(roomNames(), ["Kitchen", "Downstairs Corridor", "Downstairs Bathroom", "Living room"]);
  eq(acts(), ["Clean all", "Auto clean"]);
  assert(card._mapUrl.includes("ground_floor"));
  eq(["Kitchen", "Downstairs Bathroom", "Living room"].map(icon), ["mdi:countertop", "mdi:toilet", "mdi:sofa"]);
  card.hass = full(states());

  // Values open their own more-info.
  q(".batt").click();
  eq(events.pop(), ["more-info", "sensor.vacuum_cleaner_battery"]);
  all(".line [data-e]")[1].click();
  eq(events.pop(), ["more-info", "sensor.vacuum_cleaner_cleaning_area"]);
  q(".shape").click();
  eq(events.pop(), ["more-info", "vacuum.vacuum_cleaner"]);
  q(".map").click();
  eq(events.pop(), ["more-info", "image.study_vacuum_cleaner_first_floor"]);

  // Settings sheet: mode, suction (no off/custom), mop water, route; changes apply at once.
  all(".sets .chip")[1].click();
  const sheet = () => document.querySelector("rvc-settings-sheet");
  assert(sheet(), "sheet open");
  const sr = sheet().shadowRoot;
  const seg = (k) => [...sr.querySelectorAll(`[data-k="${k}"] button`)].map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : ""));
  eq(seg("mode"), ["Vacuum", "Vac & mop*", "Mop"]);
  eq(seg("fan"), ["Quiet", "Balanced", "Turbo*", "Max", "Max+"]);
  eq(seg("water"), ["Mild", "Standard*", "Intense"]);
  eq(seg("route"), ["Fast", "Standard*", "Deep", "Deep+"]);
  [...sr.querySelectorAll('[data-k="fan"] button')].find((b) => b.textContent === "Max").click();
  await tick();
  eq(calls.pop(), ["vacuum", "set_fan_speed", { entity_id: "vacuum.vacuum_cleaner", fan_speed: "max" }]);
  [...sr.querySelectorAll('[data-k="water"] button')].find((b) => b.textContent === "Intense").click();
  await tick();
  eq(calls.pop(), ["select", "select_option", { entity_id: "select.vacuum_cleaner_mop_intensity", option: "intense" }]);
  [...sr.querySelectorAll('[data-k="mode"] button')].find((b) => b.textContent === "Vacuum").click();
  await tick();
  eq(calls.pop(), ["select", "select_option", { entity_id: "select.study_vacuum_cleaner_cleaning_mode", option: "vacuum" }]);
  // Vacuum only: the mop rows hide (and the mop chip goes).
  card.hass = full(states({ "select.study_vacuum_cleaner_cleaning_mode": st("vacuum", { options: ["vacuum", "vac_and_mop", "mop", "custom"] }) }));
  assert(sr.querySelector('[data-k="water"]').hidden && sr.querySelector('[data-k="route"]').hidden && !sr.querySelector('[data-k="fan"]').hidden);
  eq(all(".sets .chip").map((b) => b.textContent.trim()), ["Vacuum", "Turbo"]);
  // Mop only: suction hides.
  card.hass = full(states({ "select.study_vacuum_cleaner_cleaning_mode": st("mop", { options: ["vacuum", "vac_and_mop", "mop", "custom"] }) }));
  assert(sr.querySelector('[data-k="fan"]').hidden && !sr.querySelector('[data-k="water"]').hidden);
  document.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape" }));
  assert(!sheet(), "Escape closes the sheet");
  card.hass = full(states());
  all(".sets .chip")[0].click();
  sheet().shadowRoot.querySelector(".backdrop").click();
  assert(!sheet(), "backdrop closes the sheet");
  all(".sets .chip")[0].click();
  sheet().shadowRoot.querySelector(".done").click();
  assert(!sheet(), "Done closes the sheet");

  // Cleaning: job, Pause + Dock, no floor switch, rooms show where it is but can't be picked.
  const cleaning = {
    "vacuum.vacuum_cleaner": st("cleaning", { friendly_name: "Vacuum cleaner", fan_speed: "turbo", fan_speed_list: ["quiet", "turbo"] }),
    "sensor.vacuum_cleaner_status": st("segment_cleaning"),
    "sensor.vacuum_cleaner_cleaning_progress": st(45),
    "sensor.vacuum_cleaner_cleaning_area": st(12.4),
    "sensor.vacuum_cleaner_cleaning_time": st(1080, { unit_of_measurement: "s" }),
    "sensor.vacuum_cleaner_current_room": st("Study"),
    "sensor.vacuum_cleaner_battery": st(72, { device_class: "battery" }),
    "binary_sensor.vacuum_cleaner_charging": st("off", { device_class: "battery_charging" }),
  };
  card.hass = full(states(cleaning));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Cleaning");
  assert.strictEqual(text(".line"), "Cleaning Study");
  assert(!q(".jt").hidden);
  assert.strictEqual(text(".pct"), "45%18 min · 12.4 m²");
  eq(acts(), ["Pause", "Dock", "Auto clean"]);
  assert(q(".floors").hidden);
  assert(room("Study").classList.contains("now"));
  room("Master Bedroom").click();
  assert(!room("Master Bedroom").classList.contains("sel"), "no picking rooms mid-clean");
  assert.strictEqual(q(".batt ha-icon").getAttribute("icon"), "mdi:battery-70");
  q('[data-k="pause"]').click();
  await tick();
  eq(calls.pop(), ["vacuum", "pause", { entity_id: "vacuum.vacuum_cleaner" }]);
  q('[data-k="dock"]').click();
  await tick();
  eq(calls.pop(), ["vacuum", "return_to_base", { entity_id: "vacuum.vacuum_cleaner" }]);
  card.hass = full(states({ ...cleaning, "sensor.vacuum_cleaner_status": st("washing_the_mop") }));
  assert.strictEqual(text(".line"), "Washing the mop");

  // Paused: Resume + Dock.
  card.hass = full(states({ ...cleaning, "vacuum.vacuum_cleaner": st("paused", { friendly_name: "Vacuum cleaner" }) }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Paused");
  eq(acts(), ["Resume", "Dock", "Auto clean"]);
  q('[data-k="resume"]').click();
  await tick();
  eq(calls.pop(), ["vacuum", "start", { entity_id: "vacuum.vacuum_cleaner" }]);

  // Needs you: a full dirty tank says so, but never blocks a clean.
  card.hass = full(states({ "binary_sensor.vacuum_cleaner_dock_dirty_water_box": st("on", { device_class: "problem" }) }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Needs you");
  eq(all(".msg").map((m) => m.textContent.trim()), ["Dock: empty the dirty water tank"]);
  eq(acts(), ["Clean all", "Auto clean"]);
  assert(!q('[data-k="clean"]').disabled, "Needs you doesn't stop a clean");
  q(".msg").click();
  eq(events.pop(), ["more-info", "binary_sensor.vacuum_cleaner_dock_dirty_water_box"]);
  // A dock error names itself once (not twice with the tank sensor).
  card.hass = full(states({ "sensor.vacuum_cleaner_dock_error": st("waste_water_tank_full"), "binary_sensor.vacuum_cleaner_dock_dirty_water_box": st("on") }));
  eq(all(".msg").map((m) => m.textContent.trim()), ["Dock: empty the dirty water tank"]);
  // Robot error while away from the dock: Error, with Dock offered.
  card.hass = full(states({ "vacuum.vacuum_cleaner": st("error", { friendly_name: "Vacuum cleaner" }), "sensor.vacuum_cleaner_vacuum_error": st("main_brush_jammed") }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Error");
  eq(all(".msg").map((m) => m.textContent.trim()), ["Robot: main brush jammed"]);
  eq(acts(), ["Clean all", "Dock", "Auto clean"]);

  // Idle away from the dock: Dock appears.
  card.hass = full(states({ "vacuum.vacuum_cleaner": st("idle", { friendly_name: "Vacuum cleaner" }) }));
  eq(acts(), ["Clean all", "Dock", "Auto clean"]);

  // Drying the mop after a clean.
  card.hass = full(states({ "sensor.vacuum_cleaner_mop_drying_remaining_time": st(7800, { unit_of_measurement: "s" }) }));
  assert.strictEqual(text(".line"), "Drying the mop · 2 h 10 min left");

  // Offline is the only thing that blocks: everything greyed out.
  card.hass = full(states({ "vacuum.vacuum_cleaner": st("unavailable", { friendly_name: "Vacuum cleaner" }) }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Offline");
  assert.strictEqual(text(".line"), "Can't reach the vacuum");
  assert(all(".acts .pill").filter((b) => b.dataset.k !== "auto").every((b) => b.disabled));
  assert(all(".sets .chip").every((b) => b.disabled));
  const n0 = calls.length;
  q('[data-k="clean"]').click();
  await tick();
  assert.strictEqual(calls.length, n0, "no call while offline");

  // Options: hide the map, rooms and settings; low battery glows red.
  const card2 = document.createElement("robot-vacuum-card");
  document.body.appendChild(card2);
  card2.setConfig({ entity: "vacuum.vacuum_cleaner", hide_map: true, hide_rooms: true, hide_settings: true });
  card2.hass = full(states({
    "vacuum.vacuum_cleaner": st("idle", { friendly_name: "Vacuum cleaner", fan_speed: "turbo", fan_speed_list: ["turbo"] }),
    "sensor.vacuum_cleaner_battery": st(12, { device_class: "battery" }),
    "binary_sensor.vacuum_cleaner_charging": st("off", { device_class: "battery_charging" }),
    "sensor.vacuum_cleaner_status": st("idle"),
  }));
  await tick();
  const r2 = card2.shadowRoot;
  assert(r2.querySelector(".map").hidden && r2.querySelector(".rooms").hidden && !r2.querySelector(".sets").children.length);
  assert(r2.querySelector(".batt").classList.contains("low"));
  eq([...r2.querySelectorAll(".acts .pill")].map((b) => b.textContent.trim()), ["Clean all", "Dock"]);

  // Without the entity registry (old frontend): found by object id.
  const card3 = document.createElement("robot-vacuum-card");
  document.body.appendChild(card3);
  card3.setConfig({ entity: "vacuum.vacuum_cleaner" });
  card3.hass = { states: states(), callService: async () => {} };
  assert.strictEqual(card3.shadowRoot.querySelector(".batt span").textContent, "100%");
  assert(/22\.6 m²/.test(card3.shadowRoot.querySelector(".line").textContent));

  console.log("ALL ROBOT-VACUUM-CARD TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
