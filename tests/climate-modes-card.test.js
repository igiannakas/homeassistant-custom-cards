// Behaviour test for climate-modes-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "cards", "climate-modes-card", "climate-modes-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
const { window } = dom;
window.eval(src);
assert(!window.customElements.get("climate-modes-card"), "waits for the app");
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

const calls = [];
const TH = ["climate.a", "climate.b", "climate.c", "climate.d"];
function hass(presets, extra = {}) {
  const states = {};
  TH.forEach((id, i) => (states[id] = { entity_id: id, state: "heat", attributes: { preset_mode: presets[i] } }));
  for (const [k, v] of Object.entries(extra)) states[k] = { entity_id: k, state: v, attributes: {} };
  return { states, callService: async (...a) => calls.push(a) };
}
const run = (s) => ({ action: "perform-action", perform_action: s, target: {} });
const cfg = {
  title: "Heating",
  icon: "mdi:radiator",
  icon_color: "orange",
  thermostats: TH,
  modes: [
    { name: "Off", icon: "mdi:radiator-off", color: "cyan", preset: "frost_protection", tap_action: run("script.heating_mode_frost_protection") },
    { name: "Away", icon: "mdi:home-export-outline", color: "blue", preset: "away", tap_action: { action: "navigate", navigation_path: "#away-all" } },
    { name: "Night", icon: "mdi:weather-night", color: "purple", preset: "eco", tap_action: run("script.heating_mode_eco") },
    { name: "Day", icon: "mdi:weather-sunny", color: "amber", preset: "comfort", tap_action: run("script.heating_mode_comfort") },
    { name: "Boost", icon: "mdi:fire", color: "red", preset: "boost", tap_action: { action: "navigate", navigation_path: "#boost-all" } },
  ],
};

(async () => {
  await tick();
  const Card = window.customElements.get("climate-modes-card");
  assert(Card);
  assert.throws(() => new Card().setConfig({}));
  const form = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["title", "icon", "thermostats", "switch", "modes"]) assert(form.includes(`"name":"${k}"`), k);

  const card = document.createElement("climate-modes-card");
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = hass(Array(4).fill("frost_protection"));
  const r = card.shadowRoot;
  const modes = () => [...r.querySelectorAll(".mode")];
  eq(modes().map((m) => m.querySelector(".name").textContent), ["Off", "Away", "Night", "Day", "Boost"]);
  eq(modes().map((m) => m.classList.contains("on")), [true, false, false, false, false]);
  assert.strictEqual(r.querySelector(".title").textContent, "Heating");
  assert.strictEqual(r.querySelector(".status").textContent, "All rooms · Off");
  assert(modes()[0].getAttribute("style").includes("--cyan-color"));

  // Rooms on different presets → nothing highlighted, "Mixed".
  card.hass = hass(["eco", "eco", "comfort", "eco"]);
  eq(modes().map((m) => m.classList.contains("on")), [false, false, false, false, false]);
  assert.strictEqual(r.querySelector(".status").textContent, "Mixed");
  card.hass = hass(Array(4).fill("eco"));
  assert(modes()[2].classList.contains("on"));
  assert.strictEqual(r.querySelector(".status").textContent, "All rooms · Night");

  // Taps: scripts run straight away; Away / Boost open their confirmation pop-ups (hash).
  const navs = [];
  window.addEventListener("location-changed", () => navs.push(window.location.hash));
  modes()[0].click();
  modes()[3].click();
  modes()[1].click();
  modes()[4].click();
  await tick();
  eq(calls.splice(0), [["script", "heating_mode_frost_protection", {}, {}], ["script", "heating_mode_comfort", {}, {}]]);
  eq(navs, ["#away-all", "#boost-all"]);

  // Entity + state modes and a label-row switch (the later cooling card).
  const cool = document.createElement("climate-modes-card");
  document.body.appendChild(cool);
  cool.setConfig({
    title: "Cooling", icon: "mdi:snowflake", icon_color: "blue", switch: "automation.ac",
    modes: [
      { name: "Off", icon: "mdi:snowflake-off", color: "grey", active: { entity: "input_number.ac", state: ["0", "0.0"] }, tap_action: run("script.ac_off") },
      { name: "Low", icon: "mdi:fan-speed-1", color: "blue", active: { entity: "input_number.ac", state: "1.0" }, tap_action: run("script.ac_low") },
    ],
  });
  cool.hass = hass(Array(4).fill("eco"), { "input_number.ac": "1.0", "automation.ac": "on" });
  const cr = cool.shadowRoot;
  eq([...cr.querySelectorAll(".mode")].map((m) => m.classList.contains("on")), [false, true]);
  assert(cr.querySelector(".switch").classList.contains("on"));
  assert.strictEqual(cr.querySelector(".switch .swl").textContent, "Automatic");
  cr.querySelector(".switch").click();
  await tick();
  eq(calls.pop(), ["homeassistant", "turn_off", { entity_id: "automation.ac" }]);

  // Heating with a summer-mode switch: status and switch side by side; tap opens the pop-up.
  const h2 = document.createElement("climate-modes-card");
  document.body.appendChild(h2);
  h2.setConfig({ ...cfg, switch: "input_boolean.summer", switch_name: "Summer", switch_color: "amber",
    switch_tap_action: { action: "navigate", navigation_path: "#summer-mode" } });
  h2.hass = hass(Array(4).fill("frost_protection"), { "input_boolean.summer": "on" });
  const hr = h2.shadowRoot;
  assert.strictEqual(hr.querySelector(".status").textContent, "All rooms · Off");
  assert.strictEqual(hr.querySelector(".switch .swl").textContent, "Summer");
  assert(hr.querySelector(".switch").classList.contains("on"));
  hr.querySelector(".switch").click();
  await tick();
  assert.strictEqual(navs.pop(), "#summer-mode");
  assert.strictEqual(calls.length, 0, "no direct toggle when a tap action is set");

  // A failing service shows a toast instead of throwing.
  let toast = null;
  card.addEventListener("hass-notification", (e) => (toast = e.detail.message));
  card.hass = { ...hass(Array(4).fill("eco")), callService: async () => { throw new Error("Summer mode is on"); } };
  modes()[2].click();
  await tick();
  assert.strictEqual(toast, "Summer mode is on");

  // Built-in confirmation: a dialog in the card's own look, texts rendered as templates,
  // cancel does nothing, confirm runs the action. No pop-up card needed.
  calls.length = 0;
  const rendered = [];
  const conn = { subscribeMessage: (cb, msg) => { rendered.push(msg.template); setTimeout(() => cb({ result: msg.template.replace(/\{\{\s*'([^']*)'\s*\}\}/g, "$1").replace(/\{\{.*?\}\}/g, "21") }), 0); return Promise.resolve(() => {}); } };
  const cc = document.createElement("climate-modes-card");
  document.body.appendChild(cc);
  cc.setConfig({ ...cfg, modes: [
    { name: "Boost", icon: "mdi:fire", color: "red", preset: "boost",
      tap_action: { ...run("script.heating_mode_boost"), confirmation: { title: "Boost heating", subject: "All rooms", text: "Every room heats to {{ x }} °C for 30 minutes." } } },
    { name: "Day", icon: "mdi:weather-sunny", color: "amber", preset: "comfort", tap_action: { ...run("script.heating_mode_comfort"), confirmation: true } },
  ], switch: "input_boolean.summer", switch_name: "Summer", switch_color: "amber",
    switch_tap_action: { action: "toggle", confirmation: { title: "{{ 'Turn off' }} summer mode", text: "Locks every thermostat." } } });
  cc.hass = { ...hass(Array(4).fill("eco"), { "input_boolean.summer": "off" }), connection: conn };
  const cm = () => [...cc.shadowRoot.querySelectorAll(".mode")];
  cm()[0].click();
  await tick(); await tick();
  let dlg = document.querySelector("cmc-confirm-dialog");
  assert(dlg, "asks first");
  const dt = dlg.shadowRoot.textContent;
  assert(dt.includes("Boost heating") && dt.includes("All rooms") && dt.includes("Every room heats to 21 °C"), dt);
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--red-color"));
  assert.strictEqual(rendered.length, 1, "only template strings go to the server");
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  assert(!document.querySelector("cmc-confirm-dialog"));
  assert.strictEqual(calls.length, 0, "cancel runs nothing");
  cm()[0].click();
  await tick(); await tick();
  cm()[0].click(); // a second tap while asking opens no second dialog
  await tick(); await tick();
  assert.strictEqual(document.querySelectorAll("cmc-confirm-dialog").length, 1);
  document.querySelector("cmc-confirm-dialog").shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["script", "heating_mode_boost", {}, {}]);
  // confirmation: true uses the tile's name.
  cm()[1].click();
  await tick(); await tick();
  dlg = document.querySelector("cmc-confirm-dialog");
  assert.strictEqual(dlg.shadowRoot.querySelector(".title").textContent, "Day");
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick();
  assert(!document.querySelector("cmc-confirm-dialog"), "Escape cancels");
  assert.strictEqual(calls.length, 0);
  // The switch asks too, then toggles its own entity.
  cc.shadowRoot.querySelector(".switch").click();
  await tick(); await tick();
  dlg = document.querySelector("cmc-confirm-dialog");
  assert.strictEqual(dlg.shadowRoot.querySelector(".title").textContent, "Turn off summer mode");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--amber-color"));
  dlg.shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["homeassistant", "toggle", { entity_id: "input_boolean.summer" }]);

  console.log("ALL CLIMATE-MODES TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
