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
  "binary_sensor.vacuum_cleaner_cleaning": [DEV, "in_cleaning"],
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
    "binary_sensor.vacuum_cleaner_cleaning": st("off", { device_class: "running" }),
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
  const acts = () => all(".acts .pill").map((b) => b.textContent.trim());
  const text = (s) => q(s).textContent.replace(/\s+/g, " ").trim();
  const styles = () => all("style").map((x) => x.textContent).join("\n");
  const dlg = () => document.querySelector("rvc-confirm-dialog");
  // A dialog takes the colour of the button that opened it; `color` checks it when given.
  const yes = async (title, color) => {
    await tick();
    assert(dlg(), `${title} asks first`);
    if (color) assert(dlg().shadowRoot.querySelector(".confirm").getAttribute("style").includes(color), `${title}: ${color}`);
    if (title) assert.strictEqual(dlg().shadowRoot.querySelector(".title").textContent, title);
    const msg = dlg().shadowRoot.querySelector(".text").textContent;
    assert.strictEqual(load.assertCancel(dlg().shadowRoot, `${title || "confirm"} dialog`), dlg().shadowRoot.querySelector(".cancel"), "Cancel is the way out");
    assert(!/Vacuum cleaner/.test(dlg().shadowRoot.textContent.replace(msg, "")), "no device name in the pop-up");
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

  // A live map: every version of a floor's picture has its own address (the token stays the same
  // for 5 minutes, and Safari hands back a picture it already has for an address), and a new
  // version replaces the shown one as soon as it has loaded – not on the next update.
  {
    const id = "image.study_vacuum_cleaner_first_floor";
    const pic = (v) => st(v, { friendly_name: "Vacuum cleaner First floor", entity_picture: `/api/image_proxy/${id}?token=a` });
    t.window.HTMLCanvasElement.prototype.getContext = () => null; // jsdom has no canvas: crop = whole picture
    const k0 = card._mapKey;
    assert(card._imgs[k0].img.src.endsWith(`/api/image_proxy/${id}?token=a&v=2026-10-14T11%3A34%3A44Z`), card._imgs[k0].img.src);
    card._imgs[k0].img.onload();
    card.hass = full(states({ [id]: pic("2026-10-15T02:21:05Z") }));
    const k1 = `${id}|2026-10-15T02:21:05Z`;
    assert(card._imgs[k1].img.src.endsWith(`?token=a&v=2026-10-15T02%3A21%3A05Z`), "same token, new address");
    eq(card._mapKey, k0, "the shown picture stays until the new one has loaded");
    card._imgs[k1].img.onload();
    eq(card._mapKey, k1, "then it replaces it at once");
    assert(!card._imgs[k0], "the old version is let go");
    // A picture that fails to load is tried again on a later update, at most every 10 s.
    card.hass = full(states({ [id]: pic("2026-10-15T02:21:36Z") }));
    const k2 = `${id}|2026-10-15T02:21:36Z`;
    const failed = card._imgs[k2];
    failed.img.onerror();
    card.hass = full(states({ [id]: pic("2026-10-15T02:21:36Z") }));
    assert.strictEqual(card._imgs[k2], failed, "not retried at once");
    const now = t.window.Date.now;
    t.window.Date.now = () => now() + 11000;
    card.hass = full(states({ [id]: pic("2026-10-15T02:21:36Z") }));
    t.window.Date.now = now;
    assert(card._imgs[k2] !== failed && !card._imgs[k2].failed, "retried after 10 s");
    eq(card._mapKey, k1, "the last good picture stays meanwhile");
    card.hass = full(states());
  }

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
  const jobs = () => all(".jobs button").map((b) => b.textContent.trim() + (b.classList.contains("run") ? "*" : ""));
  eq(jobs(), ["Empty", "Wash mop", "Dry mop"]);
  assert.strictEqual(q(".jobs").style.getPropertyValue("--n"), "3");
  assert(q('.acts .pill[data-k="clean"]').classList.contains("go") && !q('.acts .pill[data-k="auto"]').classList.contains("go"), "Clean is the filled main action");
  assert(/\.acts \.pill\.go \{ background: var\(--orange-color, #ff9800\);/.test(styles()), "filled orange, the robot at work");
  assert(!/blue-color/.test(styles()), "no blue left on the robot card");
  assert(all(".jobs button").every((b) => !b.classList.contains("pill")) && !q(".jobs").classList.contains("acts"), "dock jobs are a tile of their own, not more action pills");
  {
    const n1 = calls.length;
    all(".jobs button")[1].click();
    await tick();
    assert.strictEqual(dlg().shadowRoot.querySelector(".title").textContent, "Wash the mop");
    dlg().shadowRoot.querySelector(".cancel").click();
    await tick();
    assert(!dlg() && calls.length === n1, "Cancel: nothing happens");
    for (const [i, title, id] of [[0, "Empty the bin", "dust_emptying"], [1, "Wash the mop", "mop_washing"], [2, "Dry the mop", "mop_drying"]]) {
      all(".jobs button")[i].click();
      await yes(title, "--orange-color");
      eq(calls.pop(), ["switch", "turn_on", { entity_id: `switch.vacuum_cleaner_dock_${id}` }]);
    }
    card.hass = full(states({ "switch.vacuum_cleaner_dock_mop_drying": st("on") }));
    eq(jobs(), ["Empty", "Wash mop", "Drying*"]);
    assert(/\.jobs button\.run \{ background: color-mix\(in srgb, var\(--orange-color, #ff9800\) 18%, transparent\);/.test(styles()), "a running dock job glows orange");
    all(".jobs button")[2].click();
    await yes("Stop drying", "--orange-color");
    eq(calls.pop(), ["switch", "turn_off", { entity_id: "switch.vacuum_cleaner_dock_mop_drying" }]);
    card.hass = full(states());
  }
  // The Cleaning mode tile: two lines, a teal circle and a chevron – not one more room pill.
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

  // Auto clean says its state: "Auto clean" glowing while on, "Auto clean off" while off.
  assert.strictEqual(q('[data-k="auto"] ha-icon').getAttribute("icon"), "mdi:account-arrow-right");
  card.hass = full(states({ "automation.vacuum_when_away": st("off", { friendly_name: "Vacuum when everyone has left" }) }));
  eq(acts(), ["Clean entire floor", "Auto clean off"]);
  assert(!q('[data-k="auto"]').classList.contains("on"));
  assert.strictEqual(q('[data-k="auto"]').getAttribute("aria-pressed"), "false");
  assert.strictEqual(q('[data-k="auto"] ha-icon').getAttribute("icon"), "mdi:account-cancel");
  card.hass = full(states());
  eq(acts(), ["Clean entire floor", "Auto clean"]);
  assert.strictEqual(q('[data-k="auto"] ha-icon').getAttribute("icon"), "mdi:account-arrow-right");
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

  // The robot won't change maps while it is busy with the dock (it answers "Error while calling
  // load_multi_map"), so the floors are hidden then: emptying the bin, washing the mop.
  {
    const notes = [];
    const onNote = (e) => notes.push(e.detail.message);
    card.addEventListener("hass-notification", onNote);
    card.hass = full(states({ "sensor.vacuum_cleaner_status": st("emptying_the_bin"), "switch.vacuum_cleaner_dock_dust_emptying": st("on") }));
    assert(q(".floors").hidden, "no floor switch while the dock empties the bin");
    card.hass = full(states({ "switch.vacuum_cleaner_dock_mop_washing": st("on") }));
    assert(q(".floors").hidden, "nor while it washes the mop");
    card.hass = full(states({ "sensor.vacuum_cleaner_status": st("going_to_wash_the_mop") }));
    assert(q(".floors").hidden);
    card.hass = full(states({ "switch.vacuum_cleaner_dock_mop_drying": st("on") }));
    assert(!q(".floors").hidden, "drying doesn't stop a floor switch");

    // The dock starts while the dialog is open: nothing is sent, and the card says why.
    card.hass = full(states());
    all(".floors button")[1].click();
    await tick();
    card.hass = full(states({ "sensor.vacuum_cleaner_status": st("emptying_the_bin") }));
    const n = calls.length;
    await yes("Switch to Ground floor");
    assert.strictEqual(calls.length, n, "no call");
    eq(notes.pop(), "Couldn't switch to the Ground floor: the robot is busy. Try again once it has finished.");

    // A switch the robot refuses: HA's message, and the card is back on the robot's floor at once
    // (not "Loading map…" with the other floor's rooms until the 45 s run out).
    const notify = [];
    const refusing = { ...full(states()), callService: async (d, sv, data, target, notifyOnError) => {
      calls.push([d, sv, data]);
      notify.push(notifyOnError);
      throw { code: "home_assistant_error", message: "Error while calling load_multi_map", translation_domain: "roborock", translation_key: "command_failed", translation_placeholders: { command: "load_multi_map" } };
    } };
    card.hass = refusing;
    all(".floors button")[1].click();
    await yes("Switch to Ground floor");
    await tick();
    eq(calls.pop(), ["select", "select_option", { entity_id: "select.vacuum_cleaner_selected_map", option: "Ground floor" }]);
    eq(notes.pop(), "Couldn't switch to the Ground floor: the robot didn't accept it.", "plain words, not the internal command");
    eq(notify, [false], "one message: Home Assistant's own toast is off");
    eq(all(".floors button").map((b) => b.getAttribute("aria-pressed")), ["true", "false"], "back on the First floor");
    eq(roomNames()[0], "Second Bedroom");
    assert(q(".map .loading").hidden);
    assert(card._mapKey.startsWith("image.study_vacuum_cleaner_first_floor|"));
    card.removeEventListener("hass-notification", onNote);
    card.hass = full(states());
  }

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
  assert.strictEqual(load.assertSheetClose(sr, "cleaning mode sheet"), sr.activeElement, "focus on the ✕");
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
  sr.querySelector(".x").click();
  assert(!sheet(), "the ✕ closes");
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
  // A setting the robot refuses goes back to the robot's own value at once; any message from Home
  // Assistant other than the generic command failure is shown as it is.
  {
    const notes = [];
    mc.addEventListener("hass-notification", (e) => notes.push(e.detail.message));
    delete mc._pending.fan;
    let fail = { message: "Error while calling set_custom_mode", translation_domain: "roborock", translation_key: "command_failed" };
    mc.hass = { ...full(states()), callService: async (d, sv, data) => { calls.push([d, sv, data]); throw fail; } };
    assert.strictEqual(value("fan"), "Turbo");
    rowOf("fan").querySelector('[data-v="quiet"]').click();
    await tick();
    await tick();
    eq(calls.pop(), ["vacuum", "set_fan_speed", { entity_id: "vacuum.vacuum_cleaner", fan_speed: "quiet" }]);
    eq(notes, ["Couldn't change the suction power: the robot didn't accept it."]);
    assert(!mc._pending.fan, "not left pending");
    eq(opts("fan"), ["quiet", "balanced", "turbo*", "max"], "back on the robot's Turbo");
    fail = { message: "Option quiet is not valid for Suction power", translation_domain: "vacuum", translation_key: "not_valid_fan_speed" };
    rowOf("fan").querySelector('[data-v="quiet"]').click();
    await tick();
    await tick();
    eq(notes.pop(), "Option quiet is not valid for Suction power", "Home Assistant's own words otherwise");
    mc.hass = full(states());
  }

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
  // At work the robot is orange, like every appliance that is on; Pause leads to paused, so red.
  assert.strictEqual(q(".shape ha-icon").style.color, "var(--orange-color, #ff9800)", "cleaning icon orange");
  assert.strictEqual(q('[data-k="pause"] ha-icon').style.color, "var(--red-color, #f44336)", "Pause red");
  assert(/\.chip\.now \{ box-shadow: inset 0 0 0 1\.5px color-mix\(in srgb, var\(--orange-color, #ff9800\) 60%/.test(styles()), "the room being cleaned in orange");
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

  // A clean washing its mop at the dock – before it starts or between rooms – is still the clean:
  // the vacuum entity says Docked, but the robot's own "cleaning" flag is on and the counters have
  // started again. Never "Last clean 14:40 · 0.0 m² · 0 min" (the last clean's start with the new
  // clean's zeros).
  const prewash = {
    "vacuum.vacuum_cleaner": st("docked", { friendly_name: "Vacuum cleaner", fan_speed: "turbo", fan_speed_list: ["quiet", "turbo"] }),
    "sensor.vacuum_cleaner_status": st("washing_the_mop"),
    "binary_sensor.vacuum_cleaner_cleaning": st("on", { device_class: "running" }),
    "switch.vacuum_cleaner_dock_mop_washing": st("on"),
    "sensor.vacuum_cleaner_cleaning_progress": st(0),
    "sensor.vacuum_cleaner_cleaning_area": st("0.0"),
    "sensor.vacuum_cleaner_cleaning_time": st(0, { unit_of_measurement: "s" }),
  };
  card.hass = full(states(prewash));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Cleaning");
  assert.strictEqual(text(".line"), "Washing the mop");
  assert(!/Last clean/.test(text(".line")));
  eq(acts(), ["Pause", "Dock", "Auto clean"]);
  assert(q(".floors").hidden);
  // Going back to wash the mop between rooms: still the clean, saying so.
  card.hass = full(states({ ...cleaning, "vacuum.vacuum_cleaner": st("returning", { friendly_name: "Vacuum cleaner" }),
    "sensor.vacuum_cleaner_status": st("going_to_wash_the_mop"), "binary_sensor.vacuum_cleaner_cleaning": st("on") }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Cleaning");
  assert.strictEqual(text(".line"), "Going to wash the mop");
  // After the clean (flag off): returning for the last wash says so too.
  card.hass = full(states({ ...cleaning, "vacuum.vacuum_cleaner": st("returning", { friendly_name: "Vacuum cleaner" }),
    "sensor.vacuum_cleaner_status": st("going_to_wash_the_mop") }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Returning");
  assert.strictEqual(q(".shape ha-icon").style.color, "var(--orange-color, #ff9800)", "returning icon orange");
  assert.strictEqual(text(".line"), "Going to wash the mop");
  // A dock job on its own (Wash mop, Empty) while docked: Docked, with what the dock is doing.
  card.hass = full(states({ "sensor.vacuum_cleaner_status": st("emptying_the_bin"), "switch.vacuum_cleaner_dock_dust_emptying": st("on") }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Docked");
  assert.strictEqual(text(".line"), "Emptying the bin");

  // Paused: Resume + Dock.
  card.hass = full(states({ ...cleaning, "vacuum.vacuum_cleaner": st("paused", { friendly_name: "Vacuum cleaner" }) }));
  assert.strictEqual(text(".nm"), "Vacuum cleaner · Paused");
  assert.strictEqual(q(".shape ha-icon").style.color, "var(--red-color, #f44336)", "paused icon red, like an error");
  eq(acts(), ["Resume", "Dock", "Auto clean"]);
  assert(q('[data-k="resume"]').classList.contains("go"), "Resume is the filled main action");
  q('[data-k="resume"]').click();
  await yes("Resume", "--orange-color");
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
  assert(all(".acts .pill").filter((b) => b.dataset.k !== "auto").every((b) => b.disabled));
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
  eq([...r2.querySelectorAll(".acts .pill")].map((b) => b.textContent.trim()), ["Clean entire floor", "Dock"]);
  assert.strictEqual(r2.querySelectorAll(".jobs button").length, 0);

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

  {
  // ---- The generic (CLEAN_AREA) backend: a Matter robot vacuum, DJI ROMO P2 ----
  const XDEV = "dev_romo";
  const XOPTS = ["Quick Vac", "Auto Vac", "Deep Clean Vac", "Quiet Vac", "Quick Mop", "Auto Mop", "Deep Clean Mop", "Quick Vac And Mop", "Auto Vac And Mop", "Deep Clean Vac And Mop", "Quiet Vac And Mop"];
  const xreg = {
    "vacuum.romo": ["matter", XDEV, null],
    "select.romo_clean_mode": ["matter", XDEV, "clean_mode"],
    "sensor.romo_operational_state": ["matter", XDEV, "operational_state"],
    "sensor.romo_operational_error": ["matter", XDEV, "operational_error"],
    "button.romo_identify": ["matter", XDEV, null],
    "sensor.other_operational_error": ["matter", "dev_other_matter", "operational_error"],
  };
  const xentities = Object.fromEntries(Object.entries(xreg).map(([id, [pl, d, tk]]) => [id, { entity_id: id, platform: pl, device_id: d, translation_key: tk }]));
  const xareas = {
    kit: { area_id: "kit", name: "Kitchen", icon: "mdi:countertop-outline" },
    liv: { area_id: "liv", name: "Living Room" },
    downstairs_corridor: { area_id: "downstairs_corridor", name: "Downstairs Corridor" },
    downstairs_toilet: { area_id: "downstairs_toilet", name: "Downstairs Toilet", icon: "mdi:toilet" },
  };
  const AREA_MAPPING = { liv: ["6"], kit: ["1"], downstairs_corridor: ["7"], downstairs_toilet: ["4"] };
  const xstates = (over = {}) => ({
    "vacuum.romo": st("docked", { friendly_name: "ROMO", supported_features: 29212 }),
    "select.romo_clean_mode": st("Auto Vac And Mop", { options: XOPTS }),
    "sensor.romo_operational_state": st("docked"),
    "sensor.romo_operational_error": st("no_error"),
    "button.romo_identify": st("unknown"),
    "sensor.other_operational_error": st("stuck"),
    "automation.romo_away": st("on", { friendly_name: "Clean when away" }),
    ...over,
  });
  const xws = [];
  const xhass = (s, extra = {}) => ({
    states: s,
    entities: xentities,
    devices: {},
    areas: xareas,
    callService: async (d, sv, data) => calls.push([d, sv, data]),
    callWS: async (msg) => {
      xws.push(msg);
      return { entity_id: "vacuum.romo", options: { vacuum: { area_mapping: AREA_MAPPING, last_seen_segments: [{ id: "1", name: "Kitchen", group: "0" }] } } };
    },
    ...extra,
  });
  const xcfg = { entity: "vacuum.romo", auto_clean: "automation.romo_away", auto_clean_name: "Auto clean when away" };
  const xmount = async (config, s, extra) => {
    const c = document.createElement("robot-vacuum-card");
    document.body.appendChild(c);
    c.addEventListener("hass-more-info", (e) => events.push(["more-info", e.detail.entityId]));
    c.setConfig(config);
    c.hass = xhass(s, extra);
    await tick();
    c.hass = xhass(s, extra);
    return c;
  };
  const xconfirm = async (title) => {
    await tick();
    const d = document.querySelector("rvc-confirm-dialog");
    assert(d, `${title} asks first`);
    assert.strictEqual(d.shadowRoot.querySelector(".title").textContent, title);
    const msg = d.shadowRoot.querySelector(".text").textContent;
    d.shadowRoot.querySelector(".confirm").click();
    await tick();
    return msg;
  };
  const xcard = await xmount(xcfg, xstates());
  const xr = xcard.shadowRoot;
  const xq = (x) => xr.querySelector(x);
  const xall = (x) => [...xr.querySelectorAll(x)];
  const xtext = (x) => xq(x).textContent.replace(/\s+/g, " ").trim();
  const xact = () => xall(".acts .pill").map((b) => b.textContent.trim());

  // Backend and discovery: by translation key on the vacuum's own device, not another device's.
  assert(xcard._be && xcard._be.load && !xcard._be.needsBattery, "the area backend is chosen");
  eq([xcard._found.clean_mode, xcard._found.op_state, xcard._found.op_error], ["select.romo_clean_mode", "sensor.romo_operational_state", "sensor.romo_operational_error"]);
  assert(!xcard._found.battery && !xcard._found.map_select && !xcard._found.status, "nothing Roborock-only is discovered");
  eq(xws.map((m) => [m.type, m.entity_id]), [["config/entity_registry/get", "vacuum.romo"]], "one registry read, not vacuum/get_segments");
  assert(!calls.some((c) => c[1] === "get_maps"));

  // A Matter vacuum that is unavailable at first (no features yet) is still an area vacuum,
  // and a non-Roborock vacuum whose CLEAN_AREA feature arrives late moves to the area backend.
  {
    const before = xws.length;
    const off = await xmount(xcfg, xstates({ "vacuum.romo": st("unavailable", { friendly_name: "ROMO" }) }));
    assert(!off._be.needsBattery, "an unavailable Matter vacuum uses the area backend");
    assert(!calls.some((c) => c[1] === "get_maps"), "no Roborock call for a Matter vacuum");
    off.remove();
    const gent = { ...xentities, "vacuum.romo": { ...xentities["vacuum.romo"], platform: "other_vendor" } };
    const late = await xmount(xcfg, xstates({ "vacuum.romo": st("docked", { friendly_name: "ROMO" }) }), { entities: gent });
    assert(late._be.needsBattery, "no features and not Matter: the Roborock path, as before");
    late.hass = xhass(xstates(), { entities: gent });
    await tick();
    assert(!late._be.needsBattery, "features arrive: the area backend");
    late.remove();
    xws.splice(before);
  }

  // Header: name and state; docked adds nothing the state doesn't say; nothing Roborock-only shows.
  assert.strictEqual(xtext(".nm"), "ROMO · Docked");
  assert.strictEqual(xtext(".line"), "");
  assert(xq(".batt").hidden && xq(".jt").hidden && xq(".floors").hidden && xq(".map").hidden, "no battery, job, floors or map");
  assert.strictEqual(xall(".jobs button").length, 0, "no dock jobs");
  assert.strictEqual(xall(".msg").length, 0, "other devices' errors never show");

  // Rooms: the mapped areas, by name, with the area's icon then the name guess.
  eq(xall(".chip").map((c) => c.textContent.trim()), ["Downstairs Corridor", "Downstairs Toilet", "Kitchen", "Living Room"]);
  eq(xall(".chip ha-icon").map((i) => i.getAttribute("icon")), ["mdi:stairs", "mdi:toilet", "mdi:countertop-outline", "mdi:sofa"]);
  eq(xact(), ["Clean entire floor", "Auto clean when away"], "docked: no Dock button");

  // Whole clean: asks, then vacuum.start.
  const n0 = calls.length;
  xq('.acts [data-k="clean"]').click();
  assert.strictEqual(await xconfirm("Clean entire floor"), "Every room, Vac & mop · Auto.");
  eq(calls.slice(n0), [["vacuum", "start", { entity_id: "vacuum.romo" }]]);

  // Picked rooms: Clean 2 rooms → vacuum.clean_area with the area ids; the header names them while it runs.
  xall(".chip").find((c) => /Kitchen/.test(c.textContent)).click();
  xall(".chip").find((c) => /Living/.test(c.textContent)).click();
  eq(xact()[0], "Clean 2 rooms");
  assert.strictEqual(xall(".chip.sel").length, 2);
  const n1 = calls.length;
  xq('.acts [data-k="clean"]').click();
  assert.strictEqual(await xconfirm("Clean 2 rooms"), "Kitchen and Living Room, Vac & mop · Auto.");
  eq(calls.slice(n1), [["vacuum", "clean_area", { entity_id: "vacuum.romo", cleaning_area_id: ["kit", "liv"] }]]);
  eq(xall(".chip.sel").length, 0, "the picks clear");
  const running = xstates({ "vacuum.romo": st("cleaning", { friendly_name: "ROMO", supported_features: 29212 }) });
  xcard.hass = xhass(running);
  assert.strictEqual(xtext(".nm"), "ROMO · Cleaning");
  assert.strictEqual(xtext(".line"), "Cleaning Kitchen · Living Room");
  eq(xact(), ["Pause", "Dock", "Auto clean when away"]);
  const n2 = calls.length;
  xq('.acts [data-k="pause"]').click();
  await tick();
  assert(!document.querySelector("rvc-confirm-dialog"), "Pause is immediate");
  eq(calls.slice(n2), [["vacuum", "pause", { entity_id: "vacuum.romo" }]]);
  xcard.hass = xhass(xstates({ "vacuum.romo": st("paused", { friendly_name: "ROMO", supported_features: 29212 }) }));
  eq(xact(), ["Resume", "Dock", "Auto clean when away"]);
  xq('.acts [data-k="resume"]').click();
  await xconfirm("Resume");
  eq(calls[calls.length - 1], ["vacuum", "start", { entity_id: "vacuum.romo" }], "resume is vacuum.start");
  xq('.acts [data-k="dock"]').click();
  await xconfirm("Return to the dock");
  eq(calls[calls.length - 1], ["vacuum", "return_to_base", { entity_id: "vacuum.romo" }]);
  // Back at the dock: the room clean's name is forgotten. A clean the card didn't start never names rooms.
  xcard.hass = xhass(xstates());
  xcard.hass = xhass(running);
  assert.strictEqual(xtext(".line"), "", "no stale room names");
  const other = await xmount(xcfg, running);
  assert.strictEqual(other.shadowRoot.querySelector(".line").textContent.trim(), "", "started elsewhere: just the state");

  // Charging / returning lines from the operational state.
  xcard.hass = xhass(xstates({ "sensor.romo_operational_state": st("charging") }));
  assert.strictEqual(xtext(".line"), "Charging");
  xcard.hass = xhass(xstates({ "vacuum.romo": st("returning", { friendly_name: "ROMO", supported_features: 29212 }), "sensor.romo_operational_state": st("seeking_charger") }));
  assert.strictEqual(xtext(".line"), "Returning to the dock");
  eq(xact(), ["Pause", "Auto clean when away"]);

  // Needs you: a red row for the operational error; it never blocks a clean.
  xcard.hass = xhass(xstates({ "sensor.romo_operational_error": st("dust_bin_full") }));
  assert.strictEqual(xtext(".nm"), "ROMO · Needs you");
  eq(xall(".msg").map((m) => m.textContent.trim()), ["Robot: dust bin full"]);
  assert(xq('.acts [data-k="clean"]') && !xq('.acts [data-k="clean"]').disabled, "an error never blocks a clean");
  xq(".msg").click();
  eq(events[events.length - 1], ["more-info", "sensor.romo_operational_error"]);
  xcard.hass = xhass(xstates({ "vacuum.romo": st("unavailable") }));
  assert.strictEqual(xall(".msg").length, 0);
  assert.strictEqual(xtext(".line"), "Can't reach the vacuum");
  assert(xall(".acts .pill").every((b) => b.disabled || b.dataset.k === "auto"), "offline greys the controls");
  xcard.hass = xhass(xstates());

  // Cleaning mode tile and sheet: tabs from the suffix, one intensity row for the tab.
  assert(!xq(".modetile").hidden);
  assert.strictEqual(xtext(".mode-line"), "Vac & mop · Auto");
  xq(".modetile").click();
  const sh = () => document.querySelector("rvc-mode-sheet").shadowRoot;
  const sq = (x) => [...sh().querySelectorAll(x)];
  eq(sq(".tabs button").map((b) => [b.textContent, b.getAttribute("aria-pressed")]), [["Vac & mop", "true"], ["Mop", "false"], ["Vacuum", "false"]]);
  eq(sq(".sets .set").map((x) => x.dataset.k), ["level"], "one row");
  eq(sq('.sets [data-set="level"]').map((b) => b.textContent), ["Quick", "Auto", "Deep Clean", "Quiet"]);
  assert.strictEqual(sq('.sets [aria-pressed="true"]')[0].textContent, "Auto");
  assert.strictEqual(sq(".sets .k")[0].textContent, "IntensityAuto");
  load.assertSheetClose(sh(), "Cleaning mode sheet (area)");
  // Only the combinations that exist: Mop has no Quiet.
  const n3 = calls.length;
  sq('.tabs [data-v="mop"]')[0].click();
  await tick();
  eq(calls.slice(n3), [["select", "select_option", { entity_id: "select.romo_clean_mode", option: "Auto Mop" }]], "a tab keeps the intensity");
  eq(sq('.sets [data-set="level"]').map((b) => b.textContent), ["Quick", "Auto", "Deep Clean"]);
  assert.strictEqual(xtext(".mode-line"), "Mop · Auto", "shown at once");
  xcard.hass = xhass(xstates({ "select.romo_clean_mode": st("Auto Mop", { options: XOPTS }) }));
  sq('.sets [data-v="Deep Clean"]')[0].click();
  await tick();
  eq(calls[calls.length - 1], ["select", "select_option", { entity_id: "select.romo_clean_mode", option: "Deep Clean Mop" }]);
  xcard.hass = xhass(xstates({ "select.romo_clean_mode": st("Deep Clean Mop", { options: XOPTS }) })); // the robot confirms
  xcard.hass = xhass(xstates({ "select.romo_clean_mode": st("Quiet Vac", { options: XOPTS }) }));
  sq('.tabs [data-v="mop"]')[0].click();
  await tick();
  eq(calls[calls.length - 1], ["select", "select_option", { entity_id: "select.romo_clean_mode", option: "Quick Mop" }], "a tab without the intensity takes its first");
  sh().querySelector(".x").click();
  assert(!document.querySelector("rvc-mode-sheet"));

  // An option that doesn't parse turns the panel into a plain list.
  const odd = ["Quick Vac", "Auto Vac", "Turbo"];
  const ocard = await xmount(xcfg, xstates({ "select.romo_clean_mode": st("Turbo", { options: odd }) }));
  assert.strictEqual(ocard.shadowRoot.querySelector(".mode-line").textContent.trim(), "Turbo");
  ocard.shadowRoot.querySelector(".modetile").click();
  const osh = document.querySelector("rvc-mode-sheet").shadowRoot;
  assert(osh.querySelector(".tabs").hidden, "no tabs");
  eq([...osh.querySelectorAll('.sets [data-set="option"]')].map((b) => b.textContent), odd);
  const n4 = calls.length;
  osh.querySelector('[data-v="Auto Vac"]').click();
  await tick();
  eq(calls.slice(n4), [["select", "select_option", { entity_id: "select.romo_clean_mode", option: "Auto Vac" }]]);
  document.querySelector("rvc-mode-sheet").shadowRoot.querySelector(".x").click();

  // layout: mode shows the same panel on its own.
  const lcard = await xmount({ entity: "vacuum.romo", layout: "mode" }, xstates());
  eq([...lcard.shadowRoot.querySelectorAll(".tabs button")].map((b) => b.textContent), ["Vac & mop", "Mop", "Vacuum"]);
  eq([...lcard.shadowRoot.querySelectorAll(".sets .set")].map((x) => x.dataset.k), ["level"]);

  // Missing mapping: no rooms, no banner, whole clean works. A failing read is retried later.
  for (const bad of [{ options: {} }, { options: { vacuum: { area_mapping: {} } } }, null]) {
    const c = await xmount(xcfg, xstates(), { callWS: async () => bad });
    assert.strictEqual(c.shadowRoot.querySelectorAll(".chip").length, 0);
    assert.strictEqual(c.shadowRoot.querySelectorAll(".msg").length, 0, "no error banner");
    assert.strictEqual(c.shadowRoot.querySelector('.acts [data-k="clean"]').textContent.trim(), "Clean entire floor");
  }
  let fail = true;
  const fc = await xmount(xcfg, xstates(), { callWS: async () => { if (fail) throw new Error("nope"); return { options: { vacuum: { area_mapping: { kit: ["1"] } } } }; } });
  assert.strictEqual(fc.shadowRoot.querySelectorAll(".chip").length, 0);
  assert.strictEqual(fc.shadowRoot.querySelectorAll(".msg").length, 0);
  fail = false;
  fc._areaTried -= 61000;
  fc.hass = xhass(xstates(), { callWS: async () => ({ options: { vacuum: { area_mapping: { kit: ["1"] } } } }) });
  await tick();
  assert.strictEqual(fc.shadowRoot.querySelectorAll(".chip").length, 1, "retried after a minute");
  // The registry entry changing reads the mapping again; an unchanged one doesn't.
  const reads = xws.length;
  xcard.hass = xhass(xstates());
  assert.strictEqual(xws.length, reads, "unchanged registry: no read");
  xcard.hass = xhass(xstates(), { entities: { ...xentities, "vacuum.romo": { ...xentities["vacuum.romo"], area_id: "kit" } } });
  await tick();
  assert.strictEqual(xws.length, reads + 1, "changed registry entry: read again");

  // Roborock is untouched: its registry platform decides, even with CLEAN_AREA, and it never reads the registry entry.
  const rr = await xmount({ entity: "vacuum.vacuum_cleaner" }, states({ "vacuum.vacuum_cleaner": st("docked", { friendly_name: "Vacuum cleaner", supported_features: 29212 }) }), {
    entities: Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, id === "vacuum.vacuum_cleaner" ? { ...e, platform: "roborock" } : e])),
    devices,
    areas,
    callWS: async (msg) => ({ response: MAPS, msg }),
  });
  assert(rr._found.battery && rr.shadowRoot.querySelector(".floors button"), "still the Roborock card");

  }

  console.log("ALL ROBOT-VACUUM-CARD TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
