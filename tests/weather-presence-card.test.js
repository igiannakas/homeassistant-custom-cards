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
  eq([...r.querySelectorAll(".sc .v")].map((v) => v.textContent), ["Real 14.2°", "Met Office 14.6°"], "readings in °, no hard-coded C");
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
  assert.strictEqual(r2.querySelector(".pres span").textContent, "Away · 3 h");
  assert.strictEqual(r2.querySelector(".pres ha-icon").getAttribute("icon"), "mdi:home-export-outline");
  // Someone arrives, then leaves now → 0 min.
  c2.hass = hass("on");
  const left = hass("off");
  left.states["input_boolean.home_master"].last_changed = new Date().toISOString();
  c2.hass = left;
  assert.strictEqual(r2.querySelector(".pres span").textContent, "Away · 0 min");

  // Without presence / link config the pills are simply not there.
  const c3 = document.createElement("weather-presence-card");
  c3.setConfig({ weather: "weather.mo" });
  c3.hass = hass();
  assert(!c3.shadowRoot.querySelector(".pill"));
  eq([...c3.shadowRoot.querySelectorAll(".sc .v")].map((v) => v.textContent), ["Forecast 14.6°"]);

  // link.hide drops the link pill but keeps presence; the presence pill gets the whole row.
  assert(form.includes(`"name":"hide"`), "hide toggle in the editor");
  const c4 = document.createElement("weather-presence-card");
  document.body.appendChild(c4);
  c4.setConfig({ ...cfg, link: { ...cfg.link, hide: true } });
  c4.hass = hass();
  const r4 = c4.shadowRoot;
  assert(!r4.querySelector(".link"), "hidden link pill is not rendered");
  assert.strictEqual(r4.querySelector(".pres span").textContent, "Home");
  assert(!(r4.querySelector(".pills").getAttribute("style") || "").includes("display:none"));
  eq([...r4.querySelectorAll(".pill")].map((p) => p.className), ["pill pres home"], "one pill");
  // Turning it back on (editor toggle off) brings the pill back with its kept settings.
  c4.setConfig({ ...cfg, link: { ...cfg.link, hide: false } });
  assert.strictEqual(r4.querySelector(".link span").textContent, "Climate");
  assert.strictEqual(r4.querySelectorAll(".pill").length, 2);

  // A link with nowhere to go (editor-cleared {} or a name without a path) is not a dead "Open" pill.
  for (const link of [{}, { name: "Climate" }, { hide: false }]) {
    const c5 = document.createElement("weather-presence-card");
    c5.setConfig({ ...cfg, link });
    c5.hass = hass();
    assert(!c5.shadowRoot.querySelector(".link"), JSON.stringify(link));
  }
  // Pills stay beside the weather when they fit (readings may wrap), else they get their own row.
  // Widths as measured live: icon+gap 46, "Met Office 17.6°C" 120, Home 84, Climate 109, gaps 10/8.
  const pair = 84 + 8 + 109;
  assert(!Card.stacks(404, 46 + 120, 10, pair), "440px iPhone Pro Max: both pills fit on the right");
  assert(Card.stacks(339, 46 + 120, 10, pair), "375px phone: two pills need their own row");
  assert(!Card.stacks(339, 46 + 120, 10, 84), "375px phone: one pill still fits beside the weather");
  assert(!Card.stacks(404, 46 + 120, 10, 404 - 176), "exactly fitting is fitting");
  // Without layout (jsdom, or a hidden card) nothing is measured or changed.
  c4._fit();
  assert(!r4.querySelector(".wrap").classList.contains("stacked"));

  // Only the link hidden, no presence → no pill row at all.
  const c6 = document.createElement("weather-presence-card");
  c6.setConfig({ weather: "weather.mo", link: { ...cfg.link, hide: true } });
  c6.hass = hass();
  assert(c6.shadowRoot.querySelector(".pills").getAttribute("style").includes("display:none"));

  // Design rules (design-tokens): text is never cut, colours by meaning, press .92.
  const css = r.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis/.test(css), "no ellipsis anywhere");
  assert(!/line-clamp/.test(css));
  assert(!/\.nm \{[^}]*(nowrap|overflow: hidden)/.test(css), "the condition wraps instead of being cut");
  assert(/\.pill\.home \{ background: color-mix\(in srgb, var\(--green-color[^)]*\) 18%, transparent\); color: color-mix\(in srgb, var\(--green-color[^)]*\) 70%, var\(--primary-text-color\)\)/.test(css),
    "Home pill: green on-pill token (tint 18%, text 70%)");
  assert(/\.pill\.home ha-icon \{ color: var\(--green-color/.test(css));
  assert(!/--orange-color/.test(css), "reading icons are no longer orange");
  assert(/\.v ha-icon \{[^}]*color: color-mix\(in srgb, var\(--secondary-text-color\) 55%, transparent\)/.test(css), "reading icons: secondary 55%");
  assert(/\.pill \{[^}]*color: var\(--primary-text-color\)/.test(css), "pill text in the primary colour");
  assert(/\.pill\.link ha-icon \{ color: var\(--teal-color/.test(css), "link icon stays teal (tap target)");
  assert(/\.wrap\.stacked \.pill \{ flex: 1 1 0; min-width: max-content; \}/.test(css), "stacked pills: flex button row");
  assert(!/grid-template-columns/.test(css) && !/--np/.test(css), "no fixed pill grid any more");
  assert(/\.pill:active, \.wx:active, \.v:active \{ filter: brightness\(\.92\); \}/.test(css));

  // Your own temperature is its own tap target; the forecast reading opens the weather.
  more.length = 0;
  r.querySelector(".v.real span").click();
  r.querySelector(".v.fc").click();
  eq(more, ["sensor.out", "weather.mo"], "tap a reading → its own more-info");
  assert.strictEqual(r.querySelector(".v.real").localName, "button", "keyboard reaches your own sensor too");
  // Readings are updated in place (a focused reading keeps its focus).
  const realEl = r.querySelector(".v.real");
  const s2 = hass();
  s2.states["sensor.out"] = { ...s2.states["sensor.out"], state: "-2" };
  card.hass = s2;
  assert.strictEqual(r.querySelector(".v.real"), realEl);
  assert.strictEqual(realEl.textContent, "Real -2.0°");
  // Enter / Space on the weather block → forecast; keys on the reading button are its own.
  more.length = 0;
  const K = (t, key) => new window.KeyboardEvent(t, { key, bubbles: true, cancelable: true });
  r.querySelector(".wx").dispatchEvent(K("keydown", "Enter"));
  r.querySelector(".wx").dispatchEvent(K("keydown", " "));
  realEl.dispatchEvent(K("keydown", "Enter"));
  eq(more, ["weather.mo", "weather.mo"]);

  // Presence unknown → "–"; left 45 minutes ago → "45 min"; empty all week → "7 d+".
  const unk = hass();
  unk.states["input_boolean.home_master"].state = "unavailable";
  const c7 = document.createElement("weather-presence-card");
  c7.setConfig(cfg);
  c7.hass = unk;
  assert.strictEqual(c7.shadowRoot.querySelector(".pres span").textContent, "Presence –");
  c7.hass = hass("on");
  const left45 = hass("off");
  left45.states["input_boolean.home_master"].last_changed = new Date(Date.now() - 45 * 60e3).toISOString();
  c7.hass = left45;
  assert.strictEqual(c7.shadowRoot.querySelector(".pres span").textContent, "Away · 45 min");
  const week = hass("off");
  week.callWS = async () => ({ "input_boolean.home_master": [{ s: "off", lu: (now - 6 * 86400e3) / 1000 }] });
  const c8 = document.createElement("weather-presence-card");
  c8.setConfig(cfg);
  c8.hass = week;
  await tick(10);
  assert.strictEqual(c8.shadowRoot.querySelector(".pres span").textContent, "Away · 7 d+");

  console.log("ALL WEATHER-PRESENCE TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
