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
  };
  const states = {};
  for (const [k, [st, attributes]] of Object.entries({ ...base, ...over })) states[k] = { entity_id: k, state: st, attributes };
  return { states, entities: {}, callService: async (...a) => calls.push(a) };
}
const cfg = {
  entity: "group.home_lights",
  rooms: [
    { name: "Living Room", icon: "mdi:sofa", entity: "light.living", navigation_path: "/lovelace/living-room",
      temperature: "sensor.lr_t", humidity: "sensor.lr_h", illuminance: "sensor.lr_l", window: "binary_sensor.lr_window" },
    { name: "Kitchen", icon: "mdi:silverware", entity: "light.kitchen", navigation_path: "/lovelace/kitchen" },
    { name: "Corridor", icon: "mdi:door-open", entity: "group.corridor",
      temperature: ["sensor.c_t1", "sensor.c_t2"], humidity: ["sensor.c_h1", "sensor.c_h2"], illuminance: "sensor.c_l" },
  ],
};

(async () => {
  await tick();
  const Card = window.customElements.get("room-lights-card");
  assert(Card, "defined after home-assistant");

  // Visual editor: header fields and an editable list of rooms with every room option.
  const form = Card.getConfigForm();
  const s = JSON.stringify(form.schema);
  for (const k of ["name", "entity", "rooms"]) assert(s.includes(`"name":"${k}"`), `editor field ${k}`);
  const fields = form.schema.find((x) => x.name === "rooms").selector.object.fields;
  for (const k of ["name", "entity", "icon", "navigation_path", "temperature", "humidity", "illuminance", "window"])
    assert(fields[k], `room field ${k}`);
  assert.strictEqual(fields.temperature.selector.entity.multiple, true, "several sensors per room");
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
  eq(metrics(0), ["20.4°", "43% 115 lx"]);
  eq(metrics(1), ["", ""], "no sensors configured → no readings");
  eq(metrics(2), ["21.1/21.8°", "49/49% – lx"], "two sensors shown in order; unknown = –");
  assert(rooms()[0].querySelector(".v.t ha-icon[icon='mdi:thermometer']"));
  assert(rooms()[0].querySelector(".v.h ha-icon[icon='mdi:water-percent']"));
  assert(rooms()[0].querySelector(".v.l ha-icon[icon='mdi:white-balance-sunny']"));

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
  const P = (type) => new window.MouseEvent(type, { bubbles: true, clientX: 5, clientY: 5, button: 0 });
  rooms()[0].dispatchEvent(P("pointerdown"));
  await tick(600);
  rooms()[0].dispatchEvent(P("pointerup"));
  rooms()[0].click();
  await tick();
  assert.strictEqual(calls.length, 0, "no toggle after a hold");
  const sheet = document.querySelector("rlc-lamps-sheet");
  assert(sheet, "lamps sheet opened");
  const sr = sheet.shadowRoot;
  assert.strictEqual(sr.querySelector(".title").textContent, "Living Room");
  const lampNames = [...sr.querySelectorAll(".lamp .nm")].map((n) => n.textContent);
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
  // "Room" link navigates and closes.
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
  rooms()[2].dispatchEvent(P("pointerdown"));
  rooms()[2].dispatchEvent(P("pointerup"));
  await tick(600);
  assert(!document.querySelector("rlc-lamps-sheet"), "short tap = no sheet");

  // Single light (no members) → Home Assistant's own more-info instead of a sheet.
  let more = null;
  card.addEventListener("hass-more-info", (e) => (more = e.detail.entityId));
  rooms()[1].dispatchEvent(P("pointerdown"));
  await tick(600);
  assert.strictEqual(more, "light.kitchen");
  assert(!document.querySelector("rlc-lamps-sheet"));

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
