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
  "switch.vacuum_cleaner_dock_dust_emptying": [DOCK, null],
  "switch.vacuum_cleaner_dock_mop_washing": [DOCK, null],
  "switch.vacuum_cleaner_dock_mop_drying": [DOCK, null],
  "switch.vacuum_cleaner_child_lock": [DOCK, "child_lock"],
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
    "switch.vacuum_cleaner_dock_dust_emptying": st("off"),
    "switch.vacuum_cleaner_dock_mop_washing": st("off"),
    "switch.vacuum_cleaner_dock_mop_drying": st("off"),
    "switch.vacuum_cleaner_child_lock": st("on"),
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
  for (const k of ["entity", "layout", "auto_clean", "hide_map", "hide_rooms", "hide_mode", "hide_dock_actions", "rooms"]) assert(names.includes(`"${k}"`), k);

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
  const acts = () => all(".acts:not(.jobs) .pill").map((b) => b.textContent.trim());
  const text = (s) => q(s).textContent.replace(/\s+/g, " ").trim();
  const dlg = () => document.querySelector("rvc-confirm-dialog");
  const yes = async (title) => {
    await tick();
    assert(dlg(), `${title} asks first`);
    if (title) assert.strictEqual(dlg().shadowRoot.querySelector(".title").textContent, title);
    const msg = dlg().shadowRoot.querySelector(".secondary").textContent;
    dlg().shadowRoot.querySelector(".confirm").click();
    await tick();
    return msg;
  };

  // Docked, live values: state, last clean with its numbers, battery, no messages.
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Docked");
  assert(/^Last clean \w{3} \d\d:\d\d · 22\.6 m² · 28 min$/.test(text(".line")), text(".line"));
  eq(all(".line .p").map((p) => p.textContent).slice(1), ["22.6 m²", "28 min"], "each part is one unbreakable span");
  assert.strictEqual(text(".batt"), "100%");
  assert.strictEqual(q(".batt ha-icon").getAttribute("icon"), "mdi:battery-charging-100");
  assert.strictEqual(all(".msg").length, 0);
  assert(q(".jt").hidden, "no job while docked");
  // One get_maps call over the websocket, with a response.
  assert.strictEqual(ws.length, 1);
  eq([ws[0].type, ws[0].domain, ws[0].service, ws[0].return_response, ws[0].target], ["call_service", "roborock", "get_maps", true, { entity_id: "vacuum.vacuum_cleaner" }]);

  // Floors from the selected map; the loaded one pressed. The map shows that floor's picture,
  // and every floor's picture is loaded ahead.
  eq(all(".floors button").map((b) => [b.textContent, b.getAttribute("aria-pressed")]), [["First floor", "true"], ["Ground floor", "false"]]);
  assert(!q(".floors").hidden);
  assert(!q(".map").hidden);
  assert(card._mapKey.startsWith("image.study_vacuum_cleaner_first_floor|"), card._mapKey);
  eq(Object.keys(card._imgs).map((k) => k.split("|")[0]).sort(), ["image.study_vacuum_cleaner_first_floor", "image.study_vacuum_cleaner_ground_floor"]);
  assert(q(".map .loading").hidden);

  // Rooms of the loaded map in an even grid, with area icons (exact, contained, guessed) or your own.
  const roomNames = () => all(".rooms .chip").map((b) => b.textContent.trim());
  eq(roomNames(), ["Second Bedroom", "Master Bedroom", "En-suite Bathroom", "Bathroom", "Upstairs Corridor", "Study"]);
  const icon = (n) => all(".rooms .chip").find((b) => b.textContent.trim() === n).querySelector("ha-icon").getAttribute("icon");
  eq(["Second Bedroom", "Master Bedroom", "En-suite Bathroom", "Bathroom", "Upstairs Corridor", "Study"].map(icon),
    ["mdi:baby-carriage", "mdi:bed-king", "mdi:shower", "mdi:bathtub", "mdi:stairs", "mdi:chair-rolling"]);

  // Docked: one row of buttons, Clean entire floor and Auto clean (glowing: the automation is on).
  // No settings chips and no dock jobs on this card any more.
  eq(acts(), ["Clean entire floor", "Auto clean"]);
  assert(q('[data-k="auto"]').classList.contains("on"));
  assert.strictEqual(q(".acts").style.getPropertyValue("--n"), "2");
  assert(!q(".sets"), "no settings rows on the card itself");
  // The dock's jobs, under the buttons, while docked: each asks before it starts and stops.
  const jobs = () => all(".jobs .pill").map((b) => b.textContent.trim() + (b.classList.contains("run") ? "*" : ""));
  eq(jobs(), ["Empty", "Wash mop", "Dry mop"]);
  assert.strictEqual(q(".jobs").style.getPropertyValue("--n"), "3");
  {
    const n1 = calls.length;
    all(".jobs .pill")[1].click();
    await tick();
    assert.strictEqual(dlg().shadowRoot.querySelector(".title").textContent, "Wash the mop");
    dlg().shadowRoot.querySelector(".cancel").click();
    await tick();
    assert(!dlg() && calls.length === n1, "Cancel: nothing happens");
    for (const [i, title, id] of [[0, "Empty the bin", "dust_emptying"], [1, "Wash the mop", "mop_washing"], [2, "Dry the mop", "mop_drying"]]) {
      all(".jobs .pill")[i].click();
      await yes(title);
      eq(calls.pop(), ["switch", "turn_on", { entity_id: `switch.vacuum_cleaner_dock_${id}` }]);
    }
    card.hass = full(states({ "switch.vacuum_cleaner_dock_mop_drying": st("on") }));
    eq(jobs(), ["Empty", "Wash mop", "Drying*"]);
    all(".jobs .pill")[2].click();
    await yes("Stop drying");
    eq(calls.pop(), ["switch", "turn_off", { entity_id: "switch.vacuum_cleaner_dock_mop_drying" }]);
    card.hass = full(states());
  }
  // The Cleaning mode tile: two lines, a blue circle and a chevron – not one more room pill.
  assert(!q(".modetile").hidden);
  assert.strictEqual(q(".modetile .nm").textContent, "Cleaning mode");
  assert.strictEqual(text(".modetile .mode-line"), "Vac & mop · Turbo · Standard mop");
  assert.strictEqual(q(".modetile .chev").getAttribute("icon"), "mdi:chevron-right");
  assert.strictEqual(q(".modetile").nextElementSibling, q(".acts"), "between the rooms and the buttons");

  // Pick two rooms → "Clean 2 rooms" → asks (naming rooms and settings) → one segment clean.
  const cleanBtn = q('[data-k="clean"]');
  const room = (n) => all(".rooms .chip").find((b) => b.textContent.trim() === n);
  room("Study").click();
  room("Upstairs Corridor").click();
  assert(room("Study").classList.contains("sel"));
  assert.strictEqual(room("Study").querySelector("ha-icon").getAttribute("icon"), "mdi:check");
  eq(acts(), ["Clean 2 rooms", "Auto clean"]);
  assert.strictEqual(q('[data-k="clean"]'), cleanBtn, "the button under the finger is updated, not replaced");
  const nc = calls.length;
  q('[data-k="clean"]').click();
  await tick();
  dlg().shadowRoot.querySelector(".cancel").click();
  await tick();
  assert.strictEqual(calls.length, nc, "Cancel: no clean");
  eq(acts(), ["Clean 2 rooms", "Auto clean"], "Cancel keeps the rooms picked");
  q('[data-k="clean"]').click();
  assert.strictEqual(await yes("Clean 2 rooms"), "Study and Upstairs Corridor, Vac & mop · Turbo · Standard mop.");
  eq(calls.pop(), ["vacuum", "send_command", { entity_id: "vacuum.vacuum_cleaner", command: "app_segment_clean", params: [{ segments: [21, 20], repeat: 1 }] }]);
  eq(acts(), ["Clean entire floor", "Auto clean"]);
  q('[data-k="clean"]').click();
  assert.strictEqual(await yes("Clean entire floor"), "Every room on the First floor, Vac & mop · Turbo · Standard mop.");
  eq(calls.pop(), ["vacuum", "start", { entity_id: "vacuum.vacuum_cleaner" }]);

  // Auto clean asks, then toggles the automation.
  q('[data-k="auto"]').click();
  await yes("Turn off Auto clean");
  eq(calls.pop(), ["automation", "turn_off", { entity_id: "automation.vacuum_when_away" }]);

  // Floor switch asks, then shows the new floor AT ONCE (map, rooms, pressed segment) with
  // "Loading map…" until the robot confirms.
  room("Study").click();
  all(".floors button")[1].click();
  assert.strictEqual(await yes("Switch to Ground floor"), "Place the robot on the Ground floor, then confirm.");
  eq(calls.pop(), ["select", "select_option", { entity_id: "select.vacuum_cleaner_selected_map", option: "Ground floor" }]);
  eq(roomNames(), ["Kitchen", "Downstairs Corridor", "Downstairs Bathroom", "Living room"], "rooms switch before the robot answers");
  eq(all(".floors button").map((b) => b.getAttribute("aria-pressed")), ["false", "true"]);
  assert(card._mapKey.startsWith("image.study_vacuum_cleaner_ground_floor|"));
  assert(!q(".map .loading").hidden, "Loading map… while the robot loads it");
  eq(acts(), ["Clean entire floor", "Auto clean"], "selection cleared");
  card.hass = full(states()); // robot not there yet: still showing the new floor
  eq(roomNames(), ["Kitchen", "Downstairs Corridor", "Downstairs Bathroom", "Living room"]);
  card.hass = full(states({ "select.vacuum_cleaner_selected_map": st("Ground floor", { options: ["First floor", "Ground floor"] }) }));
  assert(q(".map .loading").hidden, "the robot confirmed");
  eq(["Kitchen", "Downstairs Bathroom", "Living room"].map(icon), ["mdi:countertop", "mdi:toilet", "mdi:sofa"]);
  card.hass = full(states());
  eq(roomNames()[0], "Second Bedroom");

  // Values open their own more-info.
  q(".batt").click();
  eq(events.pop(), ["more-info", "sensor.vacuum_cleaner_battery"]);
  all(".line [data-e]")[1].click();
  eq(events.pop(), ["more-info", "sensor.vacuum_cleaner_cleaning_area"]);
  q(".shape").click();
  eq(events.pop(), ["more-info", "vacuum.vacuum_cleaner"]);
  q(".map").click();
  eq(events.pop(), ["more-info", "image.study_vacuum_cleaner_first_floor"]);

  /* ---- Cleaning mode sheet, opened from the tile, like the Roborock app ---- */
  q(".modetile").click();
  const sheet = () => document.querySelector("rvc-mode-sheet");
  assert(sheet(), "the tile opens the sheet");
  const sr = sheet().shadowRoot;
  assert.strictEqual(sr.querySelector(".title").textContent, "Cleaning mode");
  eq([...sr.querySelectorAll(".tabs button")].map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")), ["Vac & mop*", "Mop", "Vacuum"]);
  eq([...sr.querySelectorAll(".set")].map((s) => s.dataset.k), ["fan", "water", "count", "route"]);
  sr.querySelector('.set[data-k="water"] [data-v="intense"]').click();
  await tick();
  eq(calls.pop(), ["select", "select_option", { entity_id: "select.vacuum_cleaner_mop_intensity", option: "intense" }]);
  assert.strictEqual(sr.querySelector('.set[data-k="water"] .k b').textContent, "Intense", "shows at once");
  assert.strictEqual(text(".modetile .mode-line"), "Vac & mop · Turbo · Intense mop", "the tile follows");
  sr.querySelectorAll(".tabs button")[1].click();
  await tick();
  eq(calls.pop(), ["select", "select_option", { entity_id: "select.study_vacuum_cleaner_cleaning_mode", option: "mop" }]);
  eq([...sr.querySelectorAll(".set")].map((s) => s.dataset.k), ["water", "count", "route"], "no suction in Mop");
  card.hass = full(states({
    "select.study_vacuum_cleaner_cleaning_mode": st("mop", { options: ["vacuum", "vac_and_mop", "mop", "custom"] }),
    "select.vacuum_cleaner_mop_intensity": st("intense", { options: ["off", "mild", "standard", "intense", "custom"] }),
  }));
  assert.strictEqual(text(".modetile .mode-line"), "Mop · Intense mop");
  sr.querySelector(".done").click();
  assert(!sheet(), "Done closes");
  card.hass = full(states());
  assert.strictEqual(text(".modetile .mode-line"), "Vac & mop · Turbo · Standard mop");
  q(".modetile").click();
  sheet().shadowRoot.querySelector(".backdrop").click();
  assert(!sheet(), "backdrop closes");
  q(".modetile").click();
  document.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape" }));
  assert(!sheet(), "Escape closes");
  assert.strictEqual(events.length, 0 + events.length, "tile tap is not a more-info");

  /* ---- The same panel as a card of its own (layout: mode) ---- */
  const mc = document.createElement("robot-vacuum-card");
  document.body.appendChild(mc);
  mc.setConfig({ entity: "vacuum.vacuum_cleaner", layout: "mode" });
  mc.hass = full(states());
  const mr = mc.shadowRoot;
  const tabs = () => [...mr.querySelectorAll(".tabs button")].map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : ""));
  const rowKeys = () => [...mr.querySelectorAll(".set")].map((s) => s.dataset.k);
  const rowOf = (k) => mr.querySelector(`.set[data-k="${k}"]`);
  const opts = (k) => [...rowOf(k).querySelectorAll("button")].map((b) => b.dataset.v + (b.getAttribute("aria-pressed") === "true" ? "*" : ""));
  const value = (k) => rowOf(k).querySelector(".k b").textContent;
  assert.strictEqual(mr.querySelector(".t").textContent, "Cleaning mode");
  eq(tabs(), ["Vac & mop*", "Mop", "Vacuum"], "the app's tabs, no Customize");
  eq(rowKeys(), ["fan", "water", "count", "route"]);
  eq(opts("fan"), ["quiet", "balanced", "turbo*", "max"], "no Max+ in Vac & mop");
  eq([...rowOf("fan").querySelectorAll("ha-icon")].map((i) => i.getAttribute("icon")), ["mdi:weather-night", "mdi:fan-speed-1", "mdi:fan-speed-2", "mdi:fan-speed-3"]);
  assert.strictEqual(value("fan"), "Turbo");
  eq(opts("water"), ["mild", "standard*", "intense"]);
  assert.strictEqual(value("water"), "Standard");
  eq(opts("count"), ["1*", "2"]);
  assert.strictEqual(value("count"), "1 time");
  eq(opts("route"), ["fast", "standard*"], "Deep routes only in Mop");
  assert.strictEqual(rowOf("route").querySelectorAll("svg").length, 2, "route glyphs");
  assert.strictEqual(rowOf("route").querySelector('[data-v="standard"]').getAttribute("aria-label"), "Standard");

  // A tap applies at once and shows at once (before the robot confirms).
  rowOf("fan").querySelector('[data-v="max"]').click();
  await tick();
  eq(calls.pop(), ["vacuum", "set_fan_speed", { entity_id: "vacuum.vacuum_cleaner", fan_speed: "max" }]);
  eq(opts("fan"), ["quiet", "balanced", "turbo", "max*"]);
  assert.strictEqual(value("fan"), "Max");
  rowOf("water").querySelector('[data-v="intense"]').click();
  await tick();
  eq(calls.pop(), ["select", "select_option", { entity_id: "select.vacuum_cleaner_mop_intensity", option: "intense" }]);
  // Mop tab: suction goes, Deep and Deep+ appear.
  mr.querySelectorAll(".tabs button")[1].click();
  await tick();
  eq(calls.pop(), ["select", "select_option", { entity_id: "select.study_vacuum_cleaner_cleaning_mode", option: "mop" }]);
  eq(tabs(), ["Vac & mop", "Mop*", "Vacuum"]);
  eq(rowKeys(), ["water", "count", "route"]);
  eq(opts("route"), ["fast", "standard*", "deep", "deep_plus"]);
  assert.strictEqual(rowOf("route").querySelectorAll("svg").length, 4);
  // The robot confirms; pending choices clear when the state matches.
  mc.hass = full(states({
    "select.study_vacuum_cleaner_cleaning_mode": st("mop", { options: ["vacuum", "vac_and_mop", "mop", "custom"] }),
    "select.vacuum_cleaner_mop_intensity": st("intense", { options: ["off", "mild", "standard", "intense", "custom"] }),
    "vacuum.vacuum_cleaner": st("docked", { friendly_name: "Vacuum cleaner", fan_speed: "off", fan_speed_list: ["quiet", "balanced", "turbo", "max", "max_plus", "off", "custom"] }),
  }));
  assert.deepStrictEqual(Object.keys(mc._pending).sort(), ["fan"], "mode and water confirmed");
  // Vacuum: suction with Max+, no scrub row, Fast and Standard routes.
  mc.hass = full(states({ "select.study_vacuum_cleaner_cleaning_mode": st("vacuum", { options: ["vacuum", "vac_and_mop", "mop", "custom"] }),
    "vacuum.vacuum_cleaner": st("docked", { friendly_name: "Vacuum cleaner", fan_speed: "max", fan_speed_list: ["quiet", "balanced", "turbo", "max", "max_plus", "off", "custom"] }) }));
  eq(tabs(), ["Vac & mop", "Mop", "Vacuum*"]);
  eq(rowKeys(), ["fan", "count", "route"]);
  eq(opts("fan"), ["quiet", "balanced", "turbo", "max*", "max_plus"]);
  assert.strictEqual(rowOf("fan").querySelector('[data-v="max_plus"] ha-icon').getAttribute("icon"), "mdi:weather-tornado");
  eq(opts("route"), ["fast", "standard*"]);
  // A custom mode presses no tab.
  mc.hass = full(states({ "select.study_vacuum_cleaner_cleaning_mode": st("custom", { options: ["vacuum", "vac_and_mop", "mop", "custom"] }) }));
  eq(tabs(), ["Vac & mop", "Mop", "Vacuum"]);
  mc.hass = full(states());
  eq(tabs(), ["Vac & mop*", "Mop", "Vacuum"]);

  // Cleaning count ×2: shared with the vacuum card's Clean, remembered in this browser, and sent
  // with the clean – every room on the floor when none are picked.
  rowOf("count").querySelector('[data-v="2"]').click();
  await tick();
  eq(opts("count"), ["1", "2*"]);
  assert.strictEqual(text(".modetile .mode-line"), "Vac & mop · Turbo · Standard mop · ×2", "the count shows on the tile");
  assert.strictEqual(value("count"), "2 times");
  assert.strictEqual(t.window.localStorage.getItem("robot-vacuum-card:count:vacuum.vacuum_cleaner"), "2");
  q('[data-k="clean"]').click();
  assert.strictEqual(await yes("Clean entire floor"), "Every room on the First floor, twice, Vac & mop · Turbo · Standard mop.");
  eq(calls.pop(), ["vacuum", "send_command", { entity_id: "vacuum.vacuum_cleaner", command: "app_segment_clean", params: [{ segments: [16, 17, 18, 19, 20, 21], repeat: 2 }] }]);
  room("Study").click();
  q('[data-k="clean"]').click();
  assert.strictEqual(await yes("Clean 1 room"), "Study, twice, Vac & mop · Turbo · Standard mop.");
  eq(calls.pop(), ["vacuum", "send_command", { entity_id: "vacuum.vacuum_cleaner", command: "app_segment_clean", params: [{ segments: [21], repeat: 2 }] }]);
  rowOf("count").querySelector('[data-v="1"]').click();
  await tick();
  // Offline: everything greyed out except the count (it's the card's own).
  mc.hass = full(states({ "vacuum.vacuum_cleaner": st("unavailable", { friendly_name: "Vacuum cleaner" }) }));
  assert([...mr.querySelectorAll(".tabs button")].every((b) => b.disabled));
  assert(![...rowOf("count").querySelectorAll("button")].some((b) => b.disabled));
  mc.hass = full(states());

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
  assert.strictEqual(q(".acts").style.getPropertyValue("--n"), "3");
  assert(q(".floors").hidden);
  eq(jobs(), [], "dock jobs only while docked");
  assert(room("Study").classList.contains("now"));
  room("Master Bedroom").click();
  assert(!room("Master Bedroom").classList.contains("sel"), "no picking rooms mid-clean");
  assert.strictEqual(q(".batt ha-icon").getAttribute("icon"), "mdi:battery-70");
  q('[data-k="pause"]').click();
  await tick();
  assert(!dlg(), "Pause is the one immediate button");
  eq(calls.pop(), ["vacuum", "pause", { entity_id: "vacuum.vacuum_cleaner" }]);
  q('[data-k="dock"]').click();
  assert.strictEqual(await yes("Return to the dock"), "This ends the current clean. The robot goes back to the dock.");
  eq(calls.pop(), ["vacuum", "return_to_base", { entity_id: "vacuum.vacuum_cleaner" }]);
  card.hass = full(states({ ...cleaning, "sensor.vacuum_cleaner_status": st("washing_the_mop") }));
  assert.strictEqual(text(".line"), "Washing the mop");

  // Paused: Resume + Dock.
  card.hass = full(states({ ...cleaning, "vacuum.vacuum_cleaner": st("paused", { friendly_name: "Vacuum cleaner" }) }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Paused");
  eq(acts(), ["Resume", "Dock", "Auto clean"]);
  q('[data-k="resume"]').click();
  await yes("Resume");
  eq(calls.pop(), ["vacuum", "start", { entity_id: "vacuum.vacuum_cleaner" }]);

  // Needs you: a full dirty tank says so, but never blocks a clean.
  card.hass = full(states({ "binary_sensor.vacuum_cleaner_dock_dirty_water_box": st("on", { device_class: "problem" }) }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Needs you");
  eq(all(".msg").map((m) => m.textContent.trim()), ["Dock: empty the dirty water tank"]);
  eq(acts(), ["Clean entire floor", "Auto clean"]);
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
  eq(acts(), ["Clean entire floor", "Dock", "Auto clean"]);

  // Idle away from the dock: Dock appears.
  card.hass = full(states({ "vacuum.vacuum_cleaner": st("idle", { friendly_name: "Vacuum cleaner" }) }));
  eq(acts(), ["Clean entire floor", "Dock", "Auto clean"]);
  q('[data-k="dock"]').click();
  assert.strictEqual(await yes("Return to the dock"), "The robot goes back to the dock.");
  eq(calls.pop(), ["vacuum", "return_to_base", { entity_id: "vacuum.vacuum_cleaner" }]);

  // Drying the mop after a clean.
  card.hass = full(states({ "sensor.vacuum_cleaner_mop_drying_remaining_time": st(7800, { unit_of_measurement: "s" }) }));
  assert.strictEqual(text(".line"), "Drying the mop · 2 h 10 min left");

  // Offline is the only thing that blocks: everything greyed out.
  card.hass = full(states({ "vacuum.vacuum_cleaner": st("unavailable", { friendly_name: "Vacuum cleaner" }) }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Offline");
  assert.strictEqual(text(".line"), "Can't reach the vacuum");
  assert(all(".acts:not(.jobs) .pill").filter((b) => b.dataset.k !== "auto").every((b) => b.disabled));
  eq(jobs(), [], "no dock jobs while offline");
  assert(q(".modetile").disabled, "the mode tile is greyed out too");
  const n0 = calls.length;
  q('[data-k="clean"]').click();
  await tick();
  assert.strictEqual(calls.length, n0, "no call while offline");
  assert(!dlg());

  // Options: hide the map and rooms; low battery glows red.
  const card2 = document.createElement("robot-vacuum-card");
  document.body.appendChild(card2);
  card2.setConfig({ entity: "vacuum.vacuum_cleaner", hide_map: true, hide_rooms: true, hide_mode: true, hide_dock_actions: true });
  card2.hass = full(states({
    "vacuum.vacuum_cleaner": st("idle", { friendly_name: "Vacuum cleaner", fan_speed: "turbo", fan_speed_list: ["turbo"] }),
    "sensor.vacuum_cleaner_battery": st(12, { device_class: "battery" }),
    "binary_sensor.vacuum_cleaner_charging": st("off", { device_class: "battery_charging" }),
    "sensor.vacuum_cleaner_status": st("idle"),
  }));
  await tick();
  const r2 = card2.shadowRoot;
  assert(r2.querySelector(".map").hidden && r2.querySelector(".rooms").hidden && r2.querySelector(".modetile").hidden);
  assert(r2.querySelector(".batt").classList.contains("low"));
  eq([...r2.querySelectorAll(".acts:not(.jobs) .pill")].map((b) => b.textContent.trim()), ["Clean entire floor", "Dock"]);
  assert.strictEqual(r2.querySelectorAll(".jobs .pill").length, 0);

  // Without the entity registry (old frontend): found by object id.
  const card3 = document.createElement("robot-vacuum-card");
  document.body.appendChild(card3);
  card3.setConfig({ entity: "vacuum.vacuum_cleaner" });
  card3.hass = { states: states(), callService: async () => {} };
  assert.strictEqual(card3.shadowRoot.querySelector(".batt span").textContent, "100%");
  assert(/22\.6 m²/.test(card3.shadowRoot.querySelector(".line").textContent));

  // Text is never clipped: no ellipsis anywhere; button rows keep each label's width and wrap.
  const css = [...card3.shadowRoot.querySelectorAll("style")].map((x) => x.textContent).join("");
  assert(!/text-overflow:\s*ellipsis/.test(css), "no clipped text");
  assert(/\.acts \{ display: flex; flex-wrap: wrap;/.test(css) && /\.acts \.pill \{ flex: 1 1 0; min-width: max-content;/.test(css), "pill rows never squeeze a label");

  console.log("ALL ROBOT-VACUUM-CARD TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
