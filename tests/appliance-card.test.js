// Behaviour test for appliance-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "cards", "appliance-card", "appliance-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
const { window } = dom;
window.eval(src);
assert(!window.customElements.get("appliance-card"), "waits for the app");
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); // cross-realm safe
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const T = (iso) => Date.parse(iso);
const st = (state, attributes = {}, last_changed = "2026-10-14T16:13:41Z") => ({ state: String(state), attributes, last_changed });

const calls = [];
const ws = [];
let history = {};
let failNext = false;

// Live values as read from the dashboard on 14 Oct 2026.
function states(over = {}) {
  return {
    "switch.dehumidifier": st("off", { friendly_name: "Dehumidifier" }),
    "sensor.dehumidifier_power": st("0", { unit_of_measurement: "W", device_class: "power" }),
    "sensor.dehumidifier_energy_today": st("0.126", { unit_of_measurement: "kWh", device_class: "energy" }),
    "sensor.bedroom_air_quality_humidity": st("52.3699989318848", { unit_of_measurement: "%", device_class: "humidity" }),
    "sensor.bedroom_air_quality_pm2_5": st("3.40000009536743", { unit_of_measurement: "\u03bcg/m³", device_class: "pm25" }),
    "input_number.dehumidifier_on_above": st("62.0", { unit_of_measurement: "%" }),
    "input_datetime.dehumidifier_on_from": st("21:15:00"),
    "input_datetime.dehumidifier_on_until": st("06:50:00"),
    "input_datetime.dehumidifier_off_at": st("07:00:00"),
    "input_datetime.air_purifier_on_at": st("17:30:00"),
    "input_datetime.air_purifier_off_at": st("09:00:00"),
    "automation.dh_on": st("on"),
    "automation.dh_off": st("on"),
    "automation.air_purifier": st("on"),
    "input_boolean.home_master": st("on"),
    "switch.tasmota_2": st("off", { friendly_name: "Air Purifier" }),
    "sensor.tasmota_energy_power_3": st("0", { unit_of_measurement: "W" }),
    "sensor.tasmota_energy_today_3": st("0.085", { unit_of_measurement: "kWh" }),
    ...over,
  };
}
function hass(over = {}, extra = {}) {
  return {
    config: { currency: "GBP", time_zone: "Europe/London" },
    entities: { "sensor.bedroom_air_quality_humidity": { display_precision: 2 }, "sensor.bedroom_air_quality_pm2_5": { display_precision: 2 } },
    locale: { language: "en-GB", time_zone: "server" },
    states: states(over),
    callService: async (d, s, data) => {
      calls.push([d, s, data]);
      if (failNext) {
        failNext = false;
        throw {};
      }
    },
    callWS: async (msg) => {
      ws.push(msg.type);
      if (msg.type === "energy/get_prefs")
        return { energy_sources: [{ type: "grid", stat_energy_from: "sensor.grid", number_energy_price: 0.2372, entity_energy_price: null }] };
      if (msg.type === "history/history_during_period") return { [msg.entity_ids[0]]: history[msg.entity_ids[0]] || [] };
      throw new Error("unexpected " + msg.type);
    },
    ...extra,
  };
}
const DH = {
  entity: "switch.dehumidifier",
  name: "Bedroom Dehumidifier",
  icon: "mdi:air-humidifier",
  power: "sensor.dehumidifier_power",
  energy: "sensor.dehumidifier_energy_today",
  reading: { entity: "sensor.bedroom_air_quality_humidity", name: "Humidity" },
  navigation_path: "/lovelace/dehumidifier",
  schedule: {
    turn_on: { automation: "automation.dh_on", above: "input_number.dehumidifier_on_above", from: "input_datetime.dehumidifier_on_from", until: "input_datetime.dehumidifier_on_until" },
    turn_off: { automation: "automation.dh_off", at: "input_datetime.dehumidifier_off_at" },
    presence: "input_boolean.home_master",
  },
};
const AP = {
  entity: "switch.tasmota_2",
  name: "Air Purifier",
  icon: "mdi:air-purifier",
  power: "sensor.tasmota_energy_power_3",
  energy: "sensor.tasmota_energy_today_3",
  reading: { entity: "sensor.bedroom_air_quality_pm2_5", name: "PM2.5" },
  navigation_path: "/lovelace/air-purifier",
  schedule: {
    turn_on: { automation: "automation.air_purifier", at: "input_datetime.air_purifier_on_at" },
    turn_off: { automation: "automation.air_purifier", at: "input_datetime.air_purifier_off_at" },
    presence: "input_boolean.home_master",
  },
};
const sec = (iso) => T(iso) / 1000;

function mount(cfg, h, now) {
  const card = document.createElement("appliance-card");
  card._now = () => now;
  const ev = [];
  card.addEventListener("hass-more-info", (e) => ev.push(["more-info", e.detail.entityId]));
  card.addEventListener("hass-notification", (e) => ev.push(["notification", e.detail.message]));
  card.addEventListener("location-changed", () => ev.push(["navigate", window.location.pathname]));
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = h;
  card.ev = ev;
  return card;
}
const view = (card) => {
  const r = card.shadowRoot;
  const pill = r.querySelector(".pill");
  return {
    nm: r.querySelector(".nm").textContent,
    sc: r.querySelector(".sc").textContent,
    pill: pill.hidden ? "hidden" : `${pill.classList.contains("on") ? "on" : "off"}:${r.querySelector(".tog").textContent}${r.querySelector(".w").hidden ? "" : "|" + r.querySelector(".w").textContent}`,
    plug: r.querySelector(".tog ha-icon").getAttribute("icon"),
    color: r.querySelector(".shape ha-icon").style.color,
    stats: [...r.querySelectorAll(".stats > div")].map((d) => `${d.querySelector("b").textContent}/${d.querySelector("span").textContent}`),
  };
};

(async () => {
  await tick();
  const Card = window.customElements.get("appliance-card");
  assert(Card, "defined after home-assistant");
  assert.throws(() => new Card().setConfig({}), /entity/);
  const form = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["entity", "name", "icon", "power", "energy", "reading", "navigation_path", "price", "idle_below", "schedule"])
    assert(form.includes(`"name":"${k}"`), `editor field ${k}`);
  assert.strictEqual(Card.getStubConfig({ states: { "light.a": {}, "switch.kettle": {} } }).entity, "switch.kettle");

  // 1. Dehumidifier off at 17:20 (BST): off since 07:00 – a restart at 17:13 made it unavailable
  //    for a moment, which doesn't count as switching.
  //    Flicks – on and straight off again within seconds, as the live history has – don't count.
  history["switch.dehumidifier"] = [
    { s: "on", lu: sec("2026-10-04T16:20:00Z") },
    { s: "off", lu: sec("2026-10-14T06:00:00Z") },
    { s: "on", lu: 1791984294.179657 }, // 14:24:54 for half a second
    { s: "off", lu: 1791984294.7208154 },
    { s: "unavailable", lu: 1791991801.670473 },
    { s: "unknown", lu: 1791991803.0052853 },
    { s: "off", lu: 1791991803.8562815 },
    { s: "on", lu: 1791993877.1689448 }, // 17:04:37 for 3 seconds
    { s: "off", lu: 1791993880.1126177 },
    { s: "unavailable", lu: sec("2026-10-14T16:13:39Z") },
    { s: "off", lu: sec("2026-10-14T16:13:41Z") },
  ];
  const now = T("2026-10-14T16:20:00Z");
  const dh = mount(DH, hass(), now);
  await tick(10);
  let v = view(dh);
  assert.strictEqual(v.nm, "Bedroom Dehumidifier · Off");
  assert.strictEqual(v.sc, "On above 62% · from 21:15");
  assert.strictEqual(v.pill, "off:Off");
  assert.strictEqual(v.plug, "mdi:power-plug-off");
  assert(v.color.includes("grey"), "off: grey circle");
  assert.deepStrictEqual(v.stats, ["52%/Humidity", "07:00/Off since", "0.13 kWh/Today", "£0.03/Today's cost"]);
  assert(ws.includes("energy/get_prefs") && ws.includes("history/history_during_period"));

  // Stability: the same hass again rewrites nothing; nodes and the written strings stay.
  const tog = dh.shadowRoot.querySelector(".tog");
  const sc = dh.shadowRoot.querySelector(".sc");
  const stats = dh.shadowRoot.querySelector(".stats");
  const firstStat = stats.firstElementChild;
  dh.hass = hass();
  await tick(10);
  assert.strictEqual(dh.shadowRoot.querySelector(".tog"), tog, "pill button kept");
  assert.strictEqual(stats.firstElementChild, firstStat, "stats not rewritten");
  assert.strictEqual(dh.shadowRoot.querySelector(".sc"), sc);
  const historyCalls = ws.filter((t) => t === "history/history_during_period").length;
  assert.strictEqual(historyCalls, 1, "history read once per state change");

  // 2. Inside the window, still dry: until 06:50.
  dh._now = () => T("2026-10-14T22:00:00Z"); // 23:00 BST
  dh.hass = hass();
  await tick(10);
  assert.strictEqual(view(dh).sc, "On above 62% · until 06:50");
  dh._now = () => T("2026-10-15T05:49:00Z"); // 06:49 BST, still inside
  dh.hass = hass();
  await tick(10);
  assert.strictEqual(view(dh).sc, "On above 62% · until 06:50");
  dh._now = () => T("2026-10-15T05:50:00Z"); // 06:50: window over
  dh.hass = hass();
  await tick(10);
  assert.strictEqual(view(dh).sc, "On above 62% · from 21:15");
  assert.strictEqual(view(dh).stats[1], "Wed 07:00/Off since", "yesterday's time names the day");

  // The threshold follows the helper.
  dh.hass = hass({ "input_number.dehumidifier_on_above": st("58.0", { unit_of_measurement: "%" }) });
  await tick(10);
  assert.strictEqual(view(dh).sc, "On above 58% · from 21:15");

  // Away: the automation waits for someone home. Automation switched off: Schedule off.
  dh.hass = hass({ "input_boolean.home_master": st("off") });
  await tick(10);
  assert.strictEqual(view(dh).sc, "Paused while away");
  dh.hass = hass({ "automation.dh_on": st("off") });
  await tick(10);
  assert.strictEqual(view(dh).sc, "Schedule off");

  // 3. Running: on since 21:20, now 22:32 – On for 1 h 12 min, Off at 07:00, the watts in the pill.
  history["switch.dehumidifier"] = [
    { s: "off", lu: sec("2026-10-14T06:00:00Z") },
    { s: "on", lu: sec("2026-10-14T20:20:00Z") },
  ];
  dh._now = () => T("2026-10-14T21:32:00Z");
  const running = {
    "switch.dehumidifier": st("on", {}, "2026-10-14T20:20:00Z"),
    "sensor.dehumidifier_power": st("266.36", { unit_of_measurement: "W" }),
    "sensor.bedroom_air_quality_humidity": st("66.2", { unit_of_measurement: "%" }),
    "sensor.dehumidifier_energy_today": st("0.38", { unit_of_measurement: "kWh" }),
  };
  dh.hass = hass(running);
  await tick(10);
  v = view(dh);
  assert.strictEqual(v.nm, "Bedroom Dehumidifier · Running");
  assert.strictEqual(v.sc, "Off at 07:00");
  assert.strictEqual(v.pill, "on:On|266 W");
  assert.strictEqual(v.plug, "mdi:power-plug");
  assert(v.color.includes("orange"), "on: orange circle (power)");
  assert.deepStrictEqual(v.stats, ["66%/Humidity", "1 h 12 min/On for", "0.38 kWh/Today", "£0.09/Today's cost"]);
  assert.strictEqual(dh.shadowRoot.querySelector(".tog").getAttribute("aria-pressed"), "true");

  // Idle: on, drawing next to nothing.
  dh.hass = hass({ ...running, "sensor.dehumidifier_power": st("0.4", { unit_of_measurement: "W" }) });
  await tick(10);
  assert.strictEqual(view(dh).nm, "Bedroom Dehumidifier · Idle");
  assert.strictEqual(view(dh).pill, "on:On|0 W");

  // Taps: the pill switches at once (no dialog), the watts open the sensor, the rest navigates.
  dh.hass = hass(running);
  await tick(10);
  calls.length = 0;
  dh.shadowRoot.querySelector(".tog").click();
  eq(calls, [["switch", "turn_off", { entity_id: "switch.dehumidifier" }]]);
  assert(!document.querySelector("body > *:not(appliance-card)"), "no dialog");
  dh.shadowRoot.querySelector(".w").click();
  dh.shadowRoot.querySelector(".open").click();
  dh.shadowRoot.querySelector(".stats > div:nth-child(3)").click();
  eq(dh.ev, [
    ["more-info", "sensor.dehumidifier_power"],
    ["navigate", "/lovelace/dehumidifier"],
    ["navigate", "/lovelace/dehumidifier"],
  ]);
  dh.hass = hass(); // off again
  await tick(10);
  calls.length = 0;
  dh.shadowRoot.querySelector(".tog").click();
  eq(calls, [["switch", "turn_on", { entity_id: "switch.dehumidifier" }]]);
  failNext = true;
  dh.shadowRoot.querySelector(".tog").click();
  await tick(10);
  eq(dh.ev.at(-1), ["notification", "Couldn't turn Bedroom Dehumidifier on."]);

  // Unavailable plug: no pill, no run time, no schedule line.
  dh.hass = hass({ "switch.dehumidifier": st("unavailable") });
  await tick(10);
  v = view(dh);
  assert.strictEqual(v.nm, "Bedroom Dehumidifier · Unavailable");
  assert.strictEqual(v.pill, "hidden");
  assert.strictEqual(v.sc, "");
  assert.deepStrictEqual(v.stats, ["52%/Humidity", "0.13 kWh/Today", "£0.03/Today's cost"]);

  // 4. Air purifier: off before 17:30 → On at 17:30; on → Off at 09:00. PM2.5 bare (always µg/m³).
  history["switch.tasmota_2"] = [{ s: "on", lu: sec("2026-10-07T16:30:00Z") }, { s: "unavailable", lu: sec("2026-10-14T06:00:00Z") }, { s: "off", lu: sec("2026-10-14T08:00:00Z") }];
  const ap = mount(AP, hass(), T("2026-10-14T16:20:00Z"));
  await tick(10);
  v = view(ap);
  assert.strictEqual(v.nm, "Air Purifier · Off");
  assert.strictEqual(v.sc, "On at 17:30");
  assert.deepStrictEqual(v.stats, ["3/PM2.5", "09:00/Off since", "0.09 kWh/Today", "£0.02/Today's cost"]);
  history["switch.tasmota_2"] = [{ s: "on", lu: sec("2026-10-07T16:30:00Z") }, { s: "off", lu: sec("2026-10-14T08:00:00Z") }, { s: "on", lu: sec("2026-10-14T16:30:00Z") }];
  ap._now = () => T("2026-10-14T17:15:00Z");
  ap.hass = hass({ "switch.tasmota_2": st("on", {}, "2026-10-14T16:30:00Z"), "sensor.tasmota_energy_power_3": st("9", { unit_of_measurement: "W" }) });
  await tick(10);
  v = view(ap);
  assert.strictEqual(v.nm, "Air Purifier · Running");
  assert.strictEqual(v.sc, "Off at 09:00");
  assert.strictEqual(v.pill, "on:On|9 W");
  assert.strictEqual(v.stats[1], "45 min/On for");
  // The on-time follows the helper.
  ap.hass = hass({ "input_datetime.air_purifier_on_at": st("18:00:00") });
  await tick(10);
  assert.strictEqual(view(ap).sc, "On at 18:00");

  // 5. A run that began at the oldest row we have: "Off for 10 d+" (at least). Card price wins over the Energy settings.
  history["switch.clothes_dryer"] = [{ s: "off", lu: sec("2026-10-04T16:20:00Z") }];
  const cd = mount(
    { entity: "switch.clothes_dryer", energy: "sensor.cd_today", price: 0.3, power: "sensor.cd_power" },
    hass({ "switch.clothes_dryer": st("off", { friendly_name: "Clothes Dryer", icon: "mdi:tumble-dryer" }), "sensor.cd_today": st("1.2", { unit_of_measurement: "kWh" }), "sensor.cd_power": st("0", { unit_of_measurement: "W" }) }),
    T("2026-10-14T16:20:00Z"),
  );
  await tick(10);
  v = view(cd);
  assert.strictEqual(v.nm, "Clothes Dryer · Off", "friendly name by default");
  assert.strictEqual(cd.shadowRoot.querySelector(".shape ha-icon").getAttribute("icon"), "mdi:tumble-dryer");
  assert.strictEqual(v.sc, "", "no schedule, no line");
  assert.deepStrictEqual(v.stats, ["10 d+/Off for", "1.20 kWh/Today", "£0.36/Today's cost"]);
  cd.hass = hass({ "switch.clothes_dryer": st("off", { friendly_name: "Clothes Dryer" }), "sensor.cd_today": st("0", { unit_of_measurement: "kWh" }) });
  await tick(10);
  assert.deepStrictEqual(view(cd).stats.slice(1), ["0 kWh/Today", "£0.00/Today's cost"], "nothing today: 0 kWh, not 0.00");
  // No navigation_path: the card opens the plug.
  cd.shadowRoot.querySelector(".open").click();
  eq(cd.ev, [["more-info", "switch.clothes_dryer"]]);

  // 6. No history API (older HA): the time cell says –; no power sensor: "On", no watts.
  const bare = mount({ entity: "switch.x" }, { ...hass({ "switch.x": st("on", { friendly_name: "Kettle" }) }), callWS: undefined }, T("2026-10-14T16:20:00Z"));
  await tick(10);
  v = view(bare);
  assert.strictEqual(v.nm, "Kettle · On");
  assert.strictEqual(v.pill, "on:On");
  assert.deepStrictEqual(v.stats, ["–/On for"]);

  console.log("ALL APPLIANCE TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
