// Behaviour test for room-lights-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "cards", "room-lights-card", "room-lights-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
const { window } = dom;
window.eval(src);
assert(!window.customElements.get("room-lights-card"), "waits for the app before defining itself");
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
// Objects from the jsdom realm are compared as JSON (deepStrictEqual checks prototypes).
const eq = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);

const calls = [];
const now = Date.now();
const wsCalls = [];
// History for the presence sensors and the room view (for the lamp icons).
async function ws(m) {
  wsCalls.push(m.type);
  if (m.type === "history/history_during_period") {
    return {
      // On until 12 minutes ago, then off (an HA restart since then must not reset this).
      "binary_sensor.k_occ": [{ s: "off", lu: (now - 5 * 3600e3) / 1000 }, { s: "on", lu: (now - 40 * 60e3) / 1000 }, { s: "off", lu: (now - 12 * 60e3) / 1000 }, { s: "off", lu: (now - 2 * 60e3) / 1000 }],
      "binary_sensor.c_occ": [{ s: "off", lu: (now - 3 * 86400e3) / 1000 }],
      "binary_sensor.lr_occ": [{ s: "on", lu: (now - 9 * 60e3) / 1000 }],
    };
  }
  if (m.type === "lovelace/config") {
    return { views: [{ path: "living-room", sections: [{ cards: [
      { type: "custom:mushroom-light-card", entity: "light.lr_ceiling", icon: "mdi:wall-sconce-flat" },
      { type: "vertical-stack", cards: [{ type: "custom:mushroom-light-card", entity: "light.front_lr_lamp", icon: "mdi:floor-lamp" }] },
      { type: "custom:mushroom-template-card", entity: "light.lr_ceiling", icon: "{{ 'mdi:x' }}" },
    ] }] }] };
  }
  throw new Error("unexpected " + m.type);
}
function hass(over = {}) {
  const base = {
    "group.home_lights": ["on", {}],
    "light.living": ["on", { friendly_name: "Living Room Lights", entity_id: ["light.lr_ceiling", "light.front_lr_lamp"] }],
    "light.lr_ceiling": ["on", { friendly_name: "Living room ceiling light" }],
    "light.front_lr_lamp": ["off", { friendly_name: "Front living room lamp" }],
    "light.kitchen": ["off", { friendly_name: "Kitchen" }],
    "group.corridor": ["off", { entity_id: ["light.corridor", "switch.corridor_lamp"] }],
    "light.corridor": ["off", { friendly_name: "Corridor Lights" }],
    "switch.corridor_lamp": ["off", { friendly_name: "Downstairs corridor lamp" }],
    "sensor.lr_t": ["20.3799991607666", {}],
    "sensor.lr_h": ["43.0299987792969", {}],
    "sensor.lr_l": ["115.12", {}],
    "binary_sensor.lr_window": ["off", {}],
    "sensor.c_t1": ["21.13", {}],
    "sensor.c_t2": ["21.77", {}],
    "sensor.c_h1": ["48.52", {}],
    "sensor.c_h2": ["48.81", {}],
    "sensor.c_l": ["unknown", {}],
    "binary_sensor.lr_occ": ["on", {}],
    "binary_sensor.k_occ": ["off", {}],
    "binary_sensor.c_occ": ["off", {}],
  };
  const states = {};
  const restart = new Date(now - 2 * 60e3).toISOString();
  for (const [k, [st, attributes, lc]] of Object.entries({ ...base, ...over }))
    states[k] = { entity_id: k, state: st, attributes, last_changed: lc || restart };
  return { states, entities: {}, callService: async (...a) => calls.push(a), callWS: async (m) => ws(m) };
}
const cfg = {
  entity: "group.home_lights",
  rooms: [
    { name: "Living Room", icon: "mdi:sofa", entity: "light.living", navigation_path: "/lovelace/living-room",
      temperature: "sensor.lr_t", humidity: "sensor.lr_h", illuminance: "sensor.lr_l", window: "binary_sensor.lr_window",
      occupancy: "binary_sensor.lr_occ" },
    { name: "Kitchen", icon: "mdi:silverware", entity: "light.kitchen", navigation_path: "/lovelace/kitchen", occupancy: "binary_sensor.k_occ" },
    { name: "Corridor", icon: "mdi:door-open", entity: "group.corridor", occupancy: "binary_sensor.c_occ",
      temperature: ["sensor.c_t1", "sensor.c_t2"], humidity: ["sensor.c_h1", "sensor.c_h2"], illuminance: "sensor.c_l" },
  ],
};

(async () => {
  await tick();
  const Card = window.customElements.get("room-lights-card");
  assert(Card, "defined after home-assistant");

  // Visual editor: own element (Home Assistant's list editor drops multi-entity fields).
  const ed = Card.getConfigElement();
  assert.strictEqual(ed.localName, "room-lights-card-editor");
  document.body.appendChild(ed);
  const changes = [];
  ed.addEventListener("config-changed", (e) => changes.push(JSON.parse(JSON.stringify(e.detail.config))));
  ed.hass = hass();
  ed.setConfig(cfg);
  const er = ed.shadowRoot;
  const sections = () => [...er.querySelectorAll(".list > details")];
  eq(sections().map((d) => d.querySelector(".t1").textContent), ["Living Room", "Kitchen", "Corridor"]);
  const roomForm = (i) => sections()[i].querySelector("ha-form");
  const fieldNames = JSON.stringify(roomForm(0).schema);
  for (const k of ["name", "icon", "entity", "navigation_path", "temperature", "humidity", "illuminance", "occupancy", "window", "lamps"])
    assert(fieldNames.includes(`"name":"${k}"`), `room editor field ${k}`);
  assert(fieldNames.includes('"multiple":true'), "several sensors per reading");
  // Single sensors are given to the form as lists; two stay two.
  eq(roomForm(0).data.temperature, ["sensor.lr_t"]);
  eq(roomForm(2).data.temperature, ["sensor.c_t1", "sensor.c_t2"]);
  assert.strictEqual(roomForm(0).computeLabel({ name: "humidity" }), "Humidity sensors");
  // Editing a room: empty values dropped, a single sensor written back as a plain id.
  const formBefore = roomForm(1);
  formBefore.dispatchEvent(new window.CustomEvent("value-changed", { detail: { value: {
    name: "Kitchen", icon: "mdi:silverware", entity: "light.kitchen", navigation_path: "/lovelace/kitchen",
    temperature: ["sensor.k_t"], humidity: [], illuminance: ["sensor.k_l1", "sensor.k_l2"], window: "" } } }));
  eq(changes.pop().rooms[1], { name: "Kitchen", icon: "mdi:silverware", entity: "light.kitchen", navigation_path: "/lovelace/kitchen",
    temperature: "sensor.k_t", illuminance: ["sensor.k_l1", "sensor.k_l2"] });
  // Home Assistant echoes the config back; the same form stays (typing keeps the cursor).
  ed.setConfig({ ...cfg, rooms: [cfg.rooms[0], { ...cfg.rooms[1], temperature: "sensor.k_t" }, cfg.rooms[2]] });
  assert.strictEqual(roomForm(1), formBefore, "form not rebuilt while typing");
  // Header fields.
  er.querySelector(".header ha-form").dispatchEvent(new window.CustomEvent("value-changed", { detail: { value: { ...cfg, name: "Lights" } } }));
  assert.strictEqual(changes.pop().name, "Lights");
  // Move, remove, add.
  sections()[2].querySelector(".up").click();
  eq(changes.pop().rooms.map((r) => r.entity), ["light.living", "group.corridor", "light.kitchen"]);
  assert(sections()[0].querySelector(".up").disabled && sections()[2].querySelector(".down").disabled);
  sections()[0].querySelector(".delete").click();
  eq(changes.pop().rooms.map((r) => r.entity), ["group.corridor", "light.kitchen"]);
  er.querySelector(".add").click();
  const added = changes.pop();
  assert.strictEqual(added.rooms.length, 3);
  assert(sections()[2].open, "new room opens for editing");
  assert.strictEqual(sections()[2].querySelector(".t1").textContent, "New room");
  ed.remove();
  assert.throws(() => new Card().setConfig({ rooms: "x" }));

  const card = document.createElement("room-lights-card");
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = hass();
  const r = card.shadowRoot;
  const rooms = () => [...r.querySelectorAll(".room")];
  const metrics = (i) => [...rooms()[i].querySelectorAll(".g")].map((g) => [...g.querySelectorAll(".v")].map((v) => v.textContent).join(" "));

  // Header switch: label, on state.
  assert.strictEqual(r.querySelector(".all .nm").textContent, "All lights");
  assert(r.querySelector(".all").classList.contains("on"));
  assert.strictEqual(r.querySelector(".all").getAttribute("aria-checked"), "true");

  // Tiles: names, icons, on = orange, off = grey, readings with icons.
  eq(rooms().map((el) => el.querySelector(".nm").textContent), ["Living Room", "Kitchen", "Corridor"]);
  assert(rooms()[0].querySelector(".shape > ha-icon").style.color.includes("--orange-color"));
  assert(rooms()[1].querySelector(".shape > ha-icon").style.color.includes("--grey-color"));
  assert(rooms()[0].classList.contains("lit") && !rooms()[1].classList.contains("lit"), "lit rooms get the warm tint");
  eq(metrics(0), ["20.4°", "43% 115 lx"]);
  eq(metrics(1), ["", ""], "no sensors configured → no readings");
  eq(metrics(2), ["21.1/21.8°", "49/49% – lx"], "two sensors shown in order; unknown = –");
  assert(rooms()[0].querySelector(".v.t ha-icon[icon='mdi:thermometer']"));
  assert(rooms()[0].querySelector(".v.h ha-icon[icon='mdi:water-percent']"));
  assert(rooms()[0].querySelector(".v.l ha-icon[icon='mdi:white-balance-sunny']"));

  // Presence on the name's line: occupied = green motion sensor; empty = time since last seen,
  // from history (not the restart); nothing in the history window = "3 d+".
  await tick(10);
  const pres = (i) => rooms()[i].querySelector(".top .pres");
  assert(pres(0).classList.contains("here") && pres(0).querySelector("ha-icon[icon='mdi:motion-sensor']"));
  eq(pres(1).textContent, "12 min");
  assert(pres(1).classList.contains("empty"), "kitchen lights off → plain");
  eq(pres(2).textContent, "3 d+");
  assert(wsCalls.filter((t) => t === "history/history_during_period").length === 1, "history read once");
  // Lights on in a room empty for longer than the threshold → warning.
  card.hass = hass({ "light.kitchen": ["on", { friendly_name: "Kitchen" }] });
  assert(pres(1).classList.contains("warn") && pres(1).querySelector("ha-icon[icon='mdi:motion-sensor-off']"));
  card.setConfig({ ...cfg, empty_warning: 30 });
  card.hass = hass({ "light.kitchen": ["on", { friendly_name: "Kitchen" }] });
  await tick(10);
  assert(!pres(1).classList.contains("warn"), "12 min < 30 min threshold");
  card.setConfig(cfg);
  // Default threshold is 2 minutes: lit and empty for 3 minutes is already flagged.
  const h3 = { ...hass({ "light.kitchen": ["on", { friendly_name: "Kitchen" }] }) };
  card.setConfig(cfg);
  card._lastSeen["binary_sensor.k_occ"] = Date.now() - 3 * 60e3;
  card.hass = h3;
  assert(pres(1).classList.contains("warn"), "3 min empty with lights on → amber");
  card._lastSeen["binary_sensor.k_occ"] = Date.now() - 60e3;
  card.hass = h3;
  assert(!pres(1).classList.contains("warn"), "1 min → not yet");
  card._lastSeen["binary_sensor.k_occ"] = now - 12 * 60e3;
  // Someone leaves the living room now → "0 min".
  card.hass = hass();
  await tick(10);
  card.hass = hass({ "binary_sensor.lr_occ": ["off", {}, new Date().toISOString()] });
  eq(pres(0).textContent, "0 min");
  assert.strictEqual(pres(0).title, "Last seen 0 min ago");
  card.hass = hass();

  // Window badge.
  assert(!rooms()[0].querySelector(".badge").classList.contains("on"));
  card.hass = hass({ "binary_sensor.lr_window": ["on", {}] });
  assert(rooms()[0].querySelector(".badge").classList.contains("on"));

  // Unchanged readings are not rewritten (keeps taps reliable).
  const before = rooms()[0].querySelectorAll(".g")[0].firstChild;
  card.hass = hass({ "binary_sensor.lr_window": ["on", {}] });
  assert.strictEqual(rooms()[0].querySelectorAll(".g")[0].firstChild, before);

  // Header: something on → turn everything off, at once (no dialog).
  r.querySelector(".all").click();
  await tick();
  assert(!document.querySelector("hsc-confirm-dialog, rlc-lamps-sheet"));
  eq(calls.pop(), ["homeassistant", "turn_off", { entity_id: "group.home_lights" }]);
  card.hass = hass({ "group.home_lights": ["off", {}] });
  assert(!r.querySelector(".all").classList.contains("on"));
  r.querySelector(".all").click();
  await tick();
  eq(calls.pop(), ["homeassistant", "turn_on", { entity_id: "group.home_lights" }]);

  // Tap a room → toggle it; tap its icon → open the room.
  rooms()[0].click();
  rooms()[1].click();
  rooms()[2].click();
  await tick();
  eq(calls.splice(0), [
    ["light", "turn_off", { entity_id: "light.living" }],
    ["light", "turn_on", { entity_id: "light.kitchen" }],
    ["homeassistant", "turn_on", { entity_id: "group.corridor" }],
  ]);
  const navs = [];
  window.addEventListener("location-changed", () => navs.push(window.location.pathname));
  rooms()[1].querySelector(".shape > ha-icon").click();
  await tick();
  eq(navs, ["/lovelace/kitchen"]);
  assert.strictEqual(calls.length, 0, "icon tap does not toggle");
  // Corridor has no room path: its icon just toggles.
  rooms()[2].querySelector(".shape").click();
  await tick();
  eq(calls.pop(), ["homeassistant", "turn_on", { entity_id: "group.corridor" }]);

  // Long-press → lamps sheet; the click that follows the hold does not toggle the room.
  const P = (type) => new window.MouseEvent(type, { bubbles: true, composed: true, clientX: 5, clientY: 5, button: 0 });
  rooms()[0].dispatchEvent(P("pointerdown"));
  await tick(600);
  const sheet = document.querySelector("rlc-lamps-sheet");
  assert(sheet, "lamps sheet opened");
  const sr = sheet.shadowRoot;
  // Mobile: lifting the holding finger sends a click to whatever is now under it (the backdrop
  // or a lamp row). That must neither close the sheet nor switch a lamp.
  sr.querySelector(".backdrop").click();
  sr.querySelector(".lamp").click();
  rooms()[0].dispatchEvent(P("pointerup"));
  sr.querySelector(".backdrop").click();
  rooms()[0].click();
  await tick();
  assert(document.querySelector("rlc-lamps-sheet"), "still open after the finger lifts");
  assert.strictEqual(calls.length, 0, "no toggle after a hold");
  await tick(400);
  assert.strictEqual(sr.querySelector(".title").textContent, "Living Room");
  const lampNames = [...sr.querySelectorAll(".lamp .nm")].map((n) => n.textContent);
  // Icons mirror the room's own view (template icons ignored); others keep their own.
  await tick(10);
  eq([...sr.querySelectorAll(".lamp .glyph ha-icon")].map((i) => i.getAttribute("icon")), ["mdi:wall-sconce-flat", "mdi:floor-lamp"]);
  eq(lampNames, ["Ceiling light", "Front lamp"], "room name stripped from lamp names");
  eq([...sr.querySelectorAll(".lamp")].map((b) => b.getAttribute("aria-checked")), ["true", "false"]);
  // Next tap after a hold works normally (the hold flag must not swallow it).
  rooms()[1].click();
  await tick();
  eq(calls.pop(), ["light", "turn_on", { entity_id: "light.kitchen" }]);
  // Lamp row toggles that lamp; the sheet follows state changes.
  sr.querySelectorAll(".lamp")[1].click();
  await tick();
  eq(calls.pop(), ["light", "turn_on", { entity_id: "light.front_lr_lamp" }]);
  card.hass = hass({ "light.front_lr_lamp": ["on", { friendly_name: "Front living room lamp" }] });
  assert.strictEqual(sr.querySelectorAll(".lamp")[1].getAttribute("aria-checked"), "true");
  // The sheet: title only (no clipping), text and buttons below a 1px rule.
  const sheetCss = sr.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis/.test(sheetCss), "sheet names wrap, never cut");
  assert(/\.buttons \{[^}]*border-top: 1px solid/.test(sheetCss), "rule above the buttons");
  assert(/button \{[^}]*min-height: 56px/.test(sheetCss) && !/button \{[^}]*[^-]height: 56px/.test(sheetCss), "rows grow for a long lamp name");
  assert(/\.empty \{[^}]*margin-left: 56px[^}]*secondary-text-color/.test(sheetCss), "no-lamps text on the title's line, secondary");
  // "Open room" call to action (the title already names the room) navigates and closes.
  assert.strictEqual(sr.querySelector(".open .nm").textContent, "Open room");
  assert.strictEqual(sr.querySelector(".open ha-icon").getAttribute("icon"), "mdi:sofa");
  sr.querySelector(".open").click();
  await tick();
  assert.strictEqual(navs.pop(), "/lovelace/living-room");
  assert(!document.querySelector("rlc-lamps-sheet"), "closed");

  // Escape closes; a short tap does not open it.
  rooms()[2].dispatchEvent(P("pointerdown"));
  await tick(600);
  assert(document.querySelector("rlc-lamps-sheet"));
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert(!document.querySelector("rlc-lamps-sheet"));
  // Once the finger is up, a tap on the backdrop closes it.
  rooms()[2].dispatchEvent(P("pointerdown"));
  await tick(600);
  rooms()[2].dispatchEvent(P("pointerup"));
  await tick(400);
  document.querySelector("rlc-lamps-sheet").shadowRoot.querySelector(".backdrop").click();
  assert(!document.querySelector("rlc-lamps-sheet"), "backdrop tap closes");
  rooms()[2].dispatchEvent(P("pointerdown"));
  rooms()[2].dispatchEvent(P("pointerup"));
  await tick(600);
  assert(!document.querySelector("rlc-lamps-sheet"), "short tap = no sheet");

  // Single light (no members) → the same sheet, listing that light.
  rooms()[1].dispatchEvent(P("pointerdown"));
  await tick(600);
  const one = document.querySelector("rlc-lamps-sheet");
  assert(one, "sheet for a single light too");
  eq([...one.shadowRoot.querySelectorAll(".lamp")].map((b) => b.dataset.id), ["light.kitchen"]);
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));

  // The room icon is its own button when it opens a room: role, tabindex, Enter / Space.
  const shape0 = rooms()[0].querySelector(".shape");
  assert.strictEqual(shape0.getAttribute("role"), "button");
  assert.strictEqual(shape0.getAttribute("tabindex"), "0");
  assert.strictEqual(shape0.getAttribute("aria-label"), "Open Living Room");
  assert(!rooms()[2].querySelector(".shape").hasAttribute("role"), "no room view → the icon is part of the tile");
  calls.length = 0;
  navs.length = 0;
  shape0.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  shape0.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
  await tick();
  eq(navs.splice(0), ["/lovelace/living-room", "/lovelace/living-room"]);
  assert.strictEqual(calls.length, 0, "Enter on the icon opens the room, it doesn't switch it");
  rooms()[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await tick();
  eq(calls.pop(), ["light", "turn_off", { entity_id: "light.living" }], "Enter on the tile switches it");

  // A failed switch: Home Assistant's message, else "Couldn't …" with the room's name (never an id).
  const toasts = [];
  card.addEventListener("hass-notification", (e) => toasts.push(e.detail.message));
  rooms()[1].click(); // the kitchen was last held (sheet test): this is the click that follows a hold
  await tick();
  calls.length = 0;
  card.hass = { ...hass(), callService: async () => { throw new Error("Kitchen is unavailable"); } };
  rooms()[1].click();
  await tick();
  card.hass = { ...hass(), callService: async () => { throw {}; } };
  rooms()[1].click();
  r.querySelector(".all").click();
  await tick();
  eq(toasts, ["Kitchen is unavailable", "Couldn't turn on Kitchen.", "Couldn't turn off all lights."]);
  card.hass = hass();

  // Colours and text rules (design tokens): someone here green, lights left on amber (not the
  // theme's warning colour), the light-level icon a quiet reading grey; nothing is ever cut off
  // and there's no off-scale shrink on narrow tiles.
  const css = r.querySelector("style").textContent;
  assert(/\.pres\.here \{ color: var\(--green-color/.test(css), "someone here = green");
  assert(/\.pres\.warn \{ color: color-mix\(in srgb, var\(--amber-color, #ffc107\) 70%, var\(--primary-text-color\)\)/.test(css), "lights left on = amber text");
  assert(!/warning-color|teal-color/.test(css));
  assert(/\.v\.l ha-icon \{ color: color-mix\(in srgb, var\(--secondary-text-color\) 55%, transparent\)/.test(css), "light level icon = reading grey");
  assert(/\.all:active, \.room:active \{ filter: brightness\(\.92\)/.test(css), "press feedback .92");
  const all = [css, er.querySelector("style").textContent].join("");
  assert(!/text-overflow:\s*ellipsis|line-clamp/.test(all), "no clipped text (card, editor)");
  assert(!/11\.5px|@container/.test(css), "no narrow-tile shrink: fitting replaces it");
  assert(/\.v \{[^}]*white-space: nowrap/.test(css) && /\.m \{[^}]*flex-wrap: wrap/.test(css), "readings wrap between parts");

  // Room names are fitted, never cut: the grid takes as many columns (≤ columns) as the widest
  // name allows (presence isn't counted – it drops under the name in a narrow tile), then two
  // uneven columns, then one. jsdom has no layout, so the measurements are given here.
  const def = (el, k, v) => Object.defineProperty(el, k, { value: v, configurable: true });
  const NM = { "Living Room": 80, Kitchen: 50, Corridor: 60 };
  const fitAt = (W, c = card) => {
    const cr = c.shadowRoot;
    def(cr.querySelector(".rooms"), "clientWidth", W);
    cr.querySelectorAll(".room").forEach((el) => {
      def(el.querySelector(".nm"), "scrollWidth", NM[el.querySelector(".nm").textContent]);
      const p = el.querySelector(".pres");
      def(p, "scrollWidth", p.textContent ? 40 : 16);
      el.querySelectorAll(".v").forEach((v) => def(v, "scrollWidth", 50));
    });
    c._fitRooms();
    return cr.querySelector(".rooms").style.gridTemplateColumns;
  };
  // Tiles need max(name, widest reading 50) + 66: 146, 116 and 126px – presence doesn't count.
  eq(fitAt(400), "repeat(2, minmax(0, 1fr))", "two even columns while the widest fits");
  eq(fitAt(280), "minmax(146px, 1fr) minmax(116px, 1fr)", "else two columns, each as wide as its own widest");
  eq(fitAt(260), "minmax(0, 1fr)", "else one column");
  assert(!r.querySelector("ha-card").classList.contains("measure"), "measuring leaves no trace");
  card.setConfig({ ...cfg, columns: 3 });
  card.hass = hass();
  await tick(10);
  eq(fitAt(540), "repeat(3, minmax(0, 1fr))", "columns: 3 → three when they fit");
  eq(fitAt(400), "repeat(2, minmax(0, 1fr))", "… two when three don't");
  card.setConfig(cfg);
  card.hass = hass();

  // Missing room entity: no crash, shown dimmed.
  card.setConfig({ rooms: [{ name: "Ghost", entity: "light.nope" }] });
  card.hass = hass();
  assert(r.querySelector(".room").classList.contains("missing"));
  assert(!r.querySelector(".all"), "no header without an entity");

  console.log("ALL ROOM-LIGHTS TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
