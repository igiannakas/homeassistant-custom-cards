// Behaviour test for weather-presence-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "cards", "weather-presence-card", "weather-presence-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
const { window } = dom;
window.eval(src);
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

const now = Date.now();
const restart = new Date(now - 2 * 60e3).toISOString();
let historyCalls = 0;
function hass(home = "on", cond = "cloudy") {
  return {
    states: {
      "weather.mo": { entity_id: "weather.mo", state: cond, attributes: { temperature: 14.6 }, last_changed: restart },
      "sensor.out": { entity_id: "sensor.out", state: "14.23", attributes: {}, last_changed: restart },
      "input_boolean.home_master": { entity_id: "input_boolean.home_master", state: home, attributes: {}, last_changed: restart },
    },
    formatEntityState: (s) => ({ cloudy: "Cloudy", sunny: "Sunny" })[s.state] || s.state,
    callWS: async (m) => {
      historyCalls++;
      assert.strictEqual(m.type, "history/history_during_period");
      // Home until 3 hours ago (the restart since then must not reset it).
      return { "input_boolean.home_master": [{ s: "on", lu: (now - 9 * 3600e3) / 1000 }, { s: "off", lu: (now - 3 * 3600e3) / 1000 }, { s: "off", lu: (now - 2 * 60e3) / 1000 }] };
    },
  };
}
const cfg = {
  weather: "weather.mo",
  temperature: "sensor.out",
  temperature_name: "Real",
  weather_name: "Met Office",
  presence: { entity: "input_boolean.home_master", navigation_path: "/lovelace/security" },
  link: { name: "Climate", icon: "mdi:home-thermometer", navigation_path: "/lovelace/climate" },
};

(async () => {
  await tick();
  const Card = window.customElements.get("weather-presence-card");
  assert(Card);
  assert.throws(() => new Card().setConfig({}));
  const form = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["weather", "temperature", "presence", "link", "navigation_path"]) assert(form.includes(`"name":"${k}"`), k);

  const card = document.createElement("weather-presence-card");
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = hass();
  const r = card.shadowRoot;
  const txt = (s) => r.querySelector(s).textContent.replace(/\s+/g, " ").trim();
  assert.strictEqual(txt(".nm"), "Cloudy");
  eq([...r.querySelectorAll(".sc .v")].map((v) => v.textContent), ["Real 14.2°C", "Met Office 14.6°C"]);
  assert.strictEqual(r.querySelector(".shape ha-icon").getAttribute("icon"), "mdi:weather-cloudy");
  assert.strictEqual(txt(".pres span"), "Home");
  assert(r.querySelector(".pres").classList.contains("home"));
  assert.strictEqual(txt(".link span"), "Climate");
  assert.strictEqual(historyCalls, 0, "no history needed while home");

  // Sunny → amber sun.
  card.hass = hass("on", "sunny");
  assert.strictEqual(r.querySelector(".shape ha-icon").getAttribute("icon"), "mdi:weather-sunny");
  assert(r.querySelector(".shape ha-icon").style.color.includes("--amber-color"));

  // Pills navigate; weather tap → forecast dialog.
  const navs = [];
  const more = [];
  window.addEventListener("location-changed", () => navs.push(window.location.pathname));
  card.addEventListener("hass-more-info", (e) => more.push(e.detail.entityId));
  r.querySelector(".pres").click();
  r.querySelector(".link").click();
  r.querySelector(".wx").click();
  await tick();
  eq(navs, ["/lovelace/security", "/lovelace/climate"]);
  eq(more, ["weather.mo"]);
  // Long-press on the weather → your own sensor.
  const P = (t) => new window.MouseEvent(t, { bubbles: true, composed: true });
  r.querySelector(".wx").dispatchEvent(P("pointerdown"));
  await tick(600);
  r.querySelector(".wx").click();
  eq(more, ["weather.mo", "sensor.out"], "hold opens the sensor, the click after it is ignored");

  // Nobody home: grey Away pill with time from history (restart-proof).
  const c2 = document.createElement("weather-presence-card");
  document.body.appendChild(c2);
  c2.setConfig(cfg);
  c2.hass = hass("off");
  await tick(10);
  const r2 = c2.shadowRoot;
  assert(!r2.querySelector(".pres").classList.contains("home"));
  assert.strictEqual(r2.querySelector(".pres span").textContent, "Away · 3h");
  assert.strictEqual(r2.querySelector(".pres ha-icon").getAttribute("icon"), "mdi:home-export-outline");
  // Someone arrives, then leaves now → 0m.
  c2.hass = hass("on");
  const left = hass("off");
  left.states["input_boolean.home_master"].last_changed = new Date().toISOString();
  c2.hass = left;
  assert.strictEqual(r2.querySelector(".pres span").textContent, "Away · 0m");

  // Without presence / link config the pills are simply not there.
  const c3 = document.createElement("weather-presence-card");
  c3.setConfig({ weather: "weather.mo" });
  c3.hass = hass();
  assert(!c3.shadowRoot.querySelector(".pill"));
  eq([...c3.shadowRoot.querySelectorAll(".sc .v")].map((v) => v.textContent), ["Forecast 14.6°C"]);

  console.log("ALL WEATHER-PRESENCE TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
