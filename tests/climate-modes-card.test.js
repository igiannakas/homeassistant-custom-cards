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
// Status lines join their parts with "&nbsp;· " (the dot stays with the part before it).
const text = (el) => el.textContent.replace(/\u00a0/g, " ");

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
  assert.strictEqual(text(r.querySelector(".status")), "All rooms · Off");
  assert(modes()[0].getAttribute("style").includes("--cyan-color"));
  // The summary sits under the title (two-line label), its parts unbreakable.
  assert(r.querySelector(".label > .lt > .title + .status"), "title and summary in one text block");
  assert.strictEqual(r.querySelector(".status").innerHTML, '<span class="p">All rooms</span>&nbsp;· <span class="p">Off</span>');
  assert(!r.querySelector(".lt").classList.contains("one"));
  // icon_color set: the header icon keeps the user's colour.
  assert(r.querySelector(".label > ha-icon").style.color.includes("--orange-color"));

  // Rooms on different presets → nothing highlighted, "Mixed".
  card.hass = hass(["eco", "eco", "comfort", "eco"]);
  eq(modes().map((m) => m.classList.contains("on")), [false, false, false, false, false]);
  assert.strictEqual(text(r.querySelector(".status")), "Mixed");
  card.hass = hass(Array(4).fill("eco"));
  assert(modes()[2].classList.contains("on"));
  assert.strictEqual(text(r.querySelector(".status")), "All rooms · Night");

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
  assert(cr.querySelector(".switch").getAttribute("style").includes("--teal-color"), "a switch is teal unless switch_color is set");
  // No thermostats: the summary is just the active mode's name.
  assert.strictEqual(text(cr.querySelector(".status")), "Low");
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
  assert.strictEqual(text(hr.querySelector(".status")), "All rooms · Off");
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
  assert(dt.includes("Boost heating") && dt.includes("Every room heats to 21 °C"), dt);
  // Reference layout: one glyph, the text under the title, a rule above the buttons; the old
  // subject line (and its second glyph) is gone – with a text, the subject isn't shown at all.
  const ds = dlg.shadowRoot;
  assert(!dt.includes("All rooms"), "no subject line");
  assert(!ds.querySelector(".body, .primary, .secondary"));
  assert.strictEqual(ds.querySelectorAll(".dialog > .row").length, 1);
  assert.strictEqual(ds.querySelectorAll(".row .glyph ha-icon").length, 1, "no second glyph");
  assert.strictEqual(ds.querySelector(".text").textContent, "Every room heats to 21 °C for 30 minutes.");
  const dcss = ds.querySelector("style").textContent;
  assert(/\.buttons \{[^}]*border-top: 1px solid/.test(dcss) && !/17px/.test(dcss));
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
  assert(!dlg.shadowRoot.querySelector(".text"), "confirmation: true → no text line");
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

  // status: activity – the label row says what the heating is doing, and the icon follows.
  const ac = document.createElement("climate-modes-card");
  document.body.appendChild(ac);
  ac.setConfig({ ...cfg, title: "Heating controls", status: "activity", switch: "input_boolean.summer", switch_name: "Summer",
    lock: { entity: "input_boolean.summer", text: "Summer · heating locked", icon: "mdi:weather-sunny", color: "amber" },
    names: { "climate.d": "Study" } });
  const th = (actions, summer = "off") => {
    const h = hass(Array(4).fill("comfort"), { "input_boolean.summer": summer });
    TH.forEach((id, i) => { h.states[id].attributes.hvac_action = actions[i]; h.states[id].attributes.friendly_name = ["Living Room Thermostat", "Master Bedroom Thermostat", "Second Bedroom Thermostat", "Study Thermostat"][i]; });
    return h;
  };
  ac.hass = th(["heating", "idle", "idle", "heating"]);
  const ar = ac.shadowRoot;
  const icon = () => ar.querySelector(".label > ha-icon");
  assert.strictEqual(ar.querySelector(".title").textContent, "Heating controls");
  assert.strictEqual(text(ar.querySelector(".status")), "Heating · Living Room, Study", "friendly names without 'Thermostat'; names override");
  assert.strictEqual(ar.querySelector(".status").innerHTML, '<span class="p">Heating</span>&nbsp;· <span class="p">Living Room</span>, <span class="p">Study</span>');
  assert.strictEqual(icon().getAttribute("icon"), "mdi:radiator");
  assert(icon().style.color.includes("--orange-color"), icon().style.color);
  assert(ar.querySelector(".modes .mode.on"), "the tiles still show the mode");
  const keep = ar.querySelector(".status");
  ac.hass = th(["idle", "idle", "idle", "idle"]);
  assert.strictEqual(ar.querySelector(".status"), keep, "updated in place");
  assert.strictEqual(keep.textContent, "Idle");
  assert(icon().style.color.includes("--grey-color"));
  ac.hass = th(["heating", "idle", "idle", "idle"], "on");
  assert.strictEqual(text(keep), "Summer · heating locked", "the lock wins");
  assert.strictEqual(icon().getAttribute("icon"), "mdi:weather-sunny");
  assert(icon().style.color.includes("--amber-color"));
  ac.hass = th(["heating", "idle", "idle", "idle"]);
  assert.strictEqual(icon().getAttribute("icon"), "mdi:radiator", "icon comes back");
  assert.strictEqual(text(keep), "Heating · Living Room");

  // A flag tile (active: {attribute, state}) glows on its own, next to the active mode.
  const fc = document.createElement("climate-modes-card");
  document.body.appendChild(fc);
  fc.setConfig({ ...cfg, modes: [...cfg.modes, { name: "Schedule", icon: "mdi:calendar-sync", color: "green",
    active: { attribute: "schedule_override_active", state: [false] }, tap_action: run("script.resume") }] });
  const fh = (override) => { const h = hass(Array(4).fill("comfort")); TH.forEach((id, i) => (h.states[id].attributes.schedule_override_active = override[i])); return h; };
  fc.hass = fh([false, false, false, false]);
  const on = () => [...fc.shadowRoot.querySelectorAll(".mode")].filter((b) => b.classList.contains("on")).map((b) => b.textContent.trim());
  eq(on(), ["Day", "Schedule"], "following the schedule: the mode and the flag both glow");
  fc.hass = fh([false, true, false, false]);
  eq(on(), ["Day"], "one room overridden: the flag goes out");
  assert.strictEqual(text(fc.shadowRoot.querySelector(".status")), "All rooms · Day", "the flag never becomes the mode");
  fc.setConfig({ ...fc._config, lock: { entity: "input_boolean.summer" } });
  const lh = fh([false, false, false, false]); lh.states["input_boolean.summer"] = { state: "on", attributes: {} };
  fc.hass = lh;
  eq(on(), ["Day"], "no schedule flag while summer mode locks the rooms");

  // icon_tap_action: the label icon becomes a tap target (filled circle) and navigates.
  const ic = document.createElement("climate-modes-card");
  document.body.appendChild(ic);
  ic.setConfig({ ...cfg, icon_tap_action: { action: "navigate", navigation_path: "/lovelace/climate" } });
  ic.hass = hass(Array(4).fill("eco"));
  const ti = ic.shadowRoot.querySelector(".label > ha-icon");
  assert(ti.classList.contains("tap") && ti.getAttribute("role") === "button");
  ti.click();
  await tick();
  navs.pop();
  assert.strictEqual(window.location.pathname, "/lovelace/climate");
  assert(!card.shadowRoot.querySelector(".label > ha-icon.tap"), "no tap target without icon_tap_action");
  // header_tap_action: title and status open it too; the switch keeps its own job.
  const hc2 = document.createElement("climate-modes-card");
  document.body.appendChild(hc2);
  hc2.setConfig({ ...cfg, status: "activity", switch: "input_boolean.summer", header_tap_action: { action: "navigate", navigation_path: "/lovelace/heat" } });
  hc2.hass = hass(Array(4).fill("eco"), { "input_boolean.summer": "off" });
  for (const sel of [".title", ".status", ".label > ha-icon"]) {
    window.history.replaceState(null, "", "/lovelace/0");
    hc2.shadowRoot.querySelector(sel).click();
    await tick();
    assert.strictEqual(window.location.pathname, "/lovelace/heat", sel);
  }
  calls.length = 0;
  window.history.replaceState(null, "", "/lovelace/0");
  hc2.shadowRoot.querySelector(".switch").click();
  await tick();
  assert.strictEqual(window.location.pathname, "/lovelace/0", "the switch does not navigate");
  eq(calls.pop(), ["homeassistant", "turn_on", { entity_id: "input_boolean.summer" }]);

  // Colours (design tokens → Colours). Without icon_color the header icon takes the active
  // mode's colour; with no state colour it would be grey, but a tappable header icon (a tinted
  // circle) is never grey – it shows teal.
  const dc = document.createElement("climate-modes-card");
  document.body.appendChild(dc);
  const { icon_color, ...noColour } = cfg;
  dc.setConfig({ ...noColour, modes: [...cfg.modes.slice(0, 4).map((m, i) => (i === 0 ? { ...m, color: "grey" } : m)),
    { name: "Plain", icon: "mdi:help", preset: "plain", tap_action: { ...run("script.plain"), confirmation: { subject: "All rooms" } } }],
    header_tap_action: { action: "navigate", navigation_path: "/lovelace/heat", confirmation: true } });
  dc.hass = hass(Array(4).fill("eco"));
  const dr = dc.shadowRoot;
  const head = () => dr.querySelector(".label > ha-icon").style.color;
  assert(head().includes("--purple-color"), "the active mode's colour: " + head());
  dc.hass = hass(["eco", "away", "eco", "eco"]);
  assert(head().includes("--teal-color"), "mixed → teal (a tap target is never grey)");
  dc.hass = hass(Array(4).fill("frost_protection"));
  assert(head().includes("--teal-color"), "Off (grey) → teal on a tappable header");
  // A tile with no colour of its own glows teal when it is the mode ("what you picked" – grey
  // wouldn't show), the header is teal, and it asks in teal; its old subject stands in for
  // the missing text.
  dc.hass = hass(Array(4).fill("plain"));
  const plain = dr.querySelectorAll(".mode")[4];
  assert(plain.getAttribute("style").includes("--teal-color") && plain.classList.contains("on"));
  assert(head().includes("--teal-color"));
  plain.click();
  await tick(); await tick();
  dlg = document.querySelector("cmc-confirm-dialog");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--teal-color"), "uncoloured tile → teal dialog");
  assert.strictEqual(dlg.shadowRoot.querySelector(".text").textContent, "All rooms", "subject is the text when there is none");
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  // A grey tile (Off) asks in teal too: a filled grey button would look disabled.
  const grey = document.createElement("climate-modes-card");
  document.body.appendChild(grey);
  grey.setConfig({ ...cfg, modes: [{ name: "Away", icon: "mdi:home-export-outline", color: "grey", preset: "away",
    tap_action: { ...run("script.away"), confirmation: { title: "Away mode", text: "Every room drops to its away temperature." } } }] });
  grey.hass = hass(Array(4).fill("away"));
  assert(grey.shadowRoot.querySelector(".mode").getAttribute("style").includes("--teal-color"), "a grey mode glows teal when active");
  grey.shadowRoot.querySelector(".mode").click();
  await tick(); await tick();
  dlg = document.querySelector("cmc-confirm-dialog");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--teal-color"), "grey tile → teal dialog");
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  // The header's dialog takes the header icon's colour; while it is grey, teal.
  dc.hass = hass(Array(4).fill("eco"));
  dr.querySelector(".label > ha-icon").click();
  await tick(); await tick();
  dlg = document.querySelector("cmc-confirm-dialog");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--purple-color"), "header dialog = header icon colour");
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  dc.hass = hass(["eco", "away", "eco", "eco"]);
  dr.querySelector(".label .title").click();
  await tick(); await tick();
  dlg = document.querySelector("cmc-confirm-dialog");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--teal-color"), "grey header → teal dialog");
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  // A lock without its own colour is grey (an off state, not a warning).
  const lc = document.createElement("climate-modes-card");
  document.body.appendChild(lc);
  lc.setConfig({ ...cfg, status: "activity", lock: { entity: "input_boolean.summer", text: "Summer · heating locked" } });
  lc.hass = hass(Array(4).fill("eco"), { "input_boolean.summer": "on" });
  assert(lc.shadowRoot.querySelector(".label > ha-icon").style.color.includes("--grey-color"), "lock default grey");
  assert.strictEqual(lc.shadowRoot.querySelector(".status").innerHTML, '<span class="p">Summer</span>&nbsp;· <span class="p">heating locked</span>');
  // No summary → the title alone, 1px low to centre on the icon.
  const one = document.createElement("climate-modes-card");
  document.body.appendChild(one);
  one.setConfig({ title: "Cooling", icon: "mdi:snowflake", modes: [{ name: "Off", active: { entity: "input_number.ac", state: "0" } }] });
  one.hass = hass([], { "input_number.ac": "2" });
  assert(one.shadowRoot.querySelector(".lt").classList.contains("one"));
  assert.strictEqual(one.shadowRoot.querySelector(".status").textContent, "");

  // Failures: Home Assistant's message (above), else "Couldn't <what you tried>." with names.
  const toasts = [];
  card.addEventListener("hass-notification", (e) => toasts.push(e.detail.message));
  card.hass = { ...hass(Array(4).fill("eco")), callService: async () => { throw {}; } };
  modes()[2].click();
  await tick();
  const sc = document.createElement("climate-modes-card");
  document.body.appendChild(sc);
  sc.setConfig({ ...cfg, switch: "input_boolean.summer", switch_name: "Summer" });
  sc.addEventListener("hass-notification", (e) => toasts.push(e.detail.message));
  const sh = hass(Array(4).fill("eco"), { "input_boolean.summer": "on" });
  sh.states["input_boolean.summer"].attributes.friendly_name = "Summer mode";
  sc.hass = { ...sh, callService: async () => { throw {}; } };
  sc.shadowRoot.querySelector(".switch").click();
  await tick();
  eq(toasts, ["Couldn't switch to Night.", "Couldn't turn Summer mode off."]);

  // Mode tiles: names never cut and never below 12px. One row while every tile fits; else even,
  // balanced rows; a name wraps only when it is wider than the whole card. jsdom has no layout,
  // so the measurements are given here.
  const def = (el, k, v) => Object.defineProperty(el, k, { value: v, configurable: true });
  const fr = fc.shadowRoot;
  const fitAt = (W, nameW = 50) => {
    const box = fr.querySelector(".modes");
    def(box, "clientWidth", W);
    box.querySelectorAll(".name").forEach((n) => def(n, "scrollWidth", nameW));
    fc._fitModes();
    return [box.classList.contains("fit") ? Number(box.style.getPropertyValue("--cols")) : 0, box.classList.contains("wrap")];
  };
  // Six tiles, 50px names → 70px each.
  eq(fitAt(500), [0, false], "all six fit: one flex row");
  eq(fitAt(400), [3, false], "five would fit: 3 + 3, not 5 + 1");
  eq(fitAt(300), [3, false], "three per row");
  eq(fitAt(200), [2, false]);
  eq(fitAt(60), [1, true], "one column; only then does a name wrap");
  eq(fitAt(500, 60), [3, false], "longer names → fewer per row");
  const css = fr.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis|line-clamp/.test(css), "no clipped text");
  assert(!/font-size: (1[01]|11\.5)px|@container/.test(css), "names never shrink below 12px");
  assert(/\.modes \{ display: flex; flex-wrap: wrap; gap: 8px; \}/.test(css) && /\.mode \{[^}]*flex: 1 1 0; min-width: max-content;/.test(css), "CSS default: a flex row that wraps");
  assert(/\.mode \{[^}]*padding: 11px 10px;/.test(css), "tile padding 11px 10px");
  assert(/\.mode\.on \{ background: color-mix\(in srgb, var\(--c\) 10%, transparent\)/.test(css), "active tint 10%");
  assert(/\.status \.p \{ white-space: nowrap; \}/.test(css));

  console.log("ALL CLIMATE-MODES TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
