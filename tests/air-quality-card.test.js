// Behaviour test for air-quality-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "cards", "air-quality-card", "air-quality-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
const { window } = dom;
window.eval(src);
assert(!window.customElements.get("air-quality-card"), "waits for the app");
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

const room = (p, v) => {
  const keys = ["co2", "pm1", "pm2_5", "pm4", "pm10", "voc_index", "nox_index"];
  return Object.fromEntries(keys.map((k, i) => [`sensor.${p}_air_quality_${k}`, { state: String(v[i]), attributes: {} }]));
};
function hass(over = {}) {
  return {
    states: {
      // Live values from the dashboard when this card was made.
      ...room("living_room", [956, 2.3, 5.0, 7.1, 8.1, 166, 1]),
      ...room("study", [612, 0.5, 1.1, 1.6, 1.9, 96, 1]),
      ...room("bedroom", [841, 0.2, 0.4, 0.6, 0.7, 124, 1]),
      ...room("second_bedroom", [702, 0.5, 1.0, 1.5, 1.7, 268, 1]),
      ...over,
    },
  };
}
const cfg = {
  rooms: [
    { name: "Living Room", prefix: "sensor.living_room_air_quality_", navigation_path: "/lovelace/living-room-air-quality" },
    { name: "Study", prefix: "sensor.study_air_quality_", navigation_path: "/lovelace/study-air-quality" },
    { name: "Bedroom", prefix: "sensor.bedroom_air_quality_" },
    { name: "Second Bedroom", prefix: "sensor.second_bedroom_air_quality_" },
  ],
};

(async () => {
  await tick();
  const Card = window.customElements.get("air-quality-card");
  assert(Card);
  assert.throws(() => new Card().setConfig({}));
  const fields = Card.getConfigForm().schema.find((s) => s.name === "rooms").selector.object.fields;
  for (const k of ["name", "prefix", "navigation_path", "co2", "pm2_5", "voc", "pm1", "pm4", "pm10", "nox"]) assert(fields[k], k);

  const card = document.createElement("air-quality-card");
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = hass();
  const r = card.shadowRoot;
  const tiles = () => [...r.querySelectorAll(".room")];
  const st = (i) => tiles()[i].querySelector(".st").textContent;
  const vals = (i) => [...tiles()[i].querySelectorAll(".v")].map((v) => `${v.classList.contains("hot") ? "*" : ""}${v.textContent}`);

  eq(tiles().map((t) => t.querySelector(".nm").textContent), ["Living Room", "Study", "Bedroom", "Second Bedroom"]);
  // Living room: CO₂ 956 and VOC 166 elevated (amber), PM2.5 fine.
  assert.strictEqual(st(0), "Elevated");
  eq(vals(0), ["*956 ppm", "5.0", "*166"]);
  assert.strictEqual(tiles()[0].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:information-outline");
  // Study all good: leaf, Excellent, nothing highlighted.
  assert.strictEqual(st(1), "Excellent");
  eq(vals(1), ["612 ppm", "1.1", "96"]);
  assert.strictEqual(tiles()[1].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:leaf");
  // Second bedroom: VOC 268 → Poor (orange, alert).
  assert.strictEqual(st(3), "Poor");
  eq(vals(3), ["702 ppm", "1.0", "*268"]);
  assert.strictEqual(tiles()[3].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:alert-outline");
  assert.strictEqual(r.querySelector(".sum").textContent, "Poor in Second Bedroom");
  assert(!tiles().some((t) => t.classList.contains("alarm")), "no glow below ventilate");

  // CO₂ over 1000 → Ventilate, open-window icon, red glow, summary names the room.
  card.hass = hass({ "sensor.living_room_air_quality_co2": { state: "1240", attributes: {} } });
  assert.strictEqual(st(0), "Ventilate");
  assert.strictEqual(tiles()[0].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:window-open-variant");
  assert(tiles()[0].classList.contains("alarm"));
  assert.strictEqual(r.querySelector(".sum").textContent, "Ventilate Living Room");

  // Particles alone at the top level → "Poor air" (not ventilate) and the cause (PM10) is added.
  card.hass = hass({ "sensor.bedroom_air_quality_pm10": { state: "60", attributes: {} } });
  assert.strictEqual(st(2), "Poor air");
  eq(vals(2), ["*841 ppm", "0.4", "124", "*PM10 60.0"]);
  assert.strictEqual(tiles()[2].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:alert-circle-outline");

  // Only elevated rooms → count.
  card.hass = hass({ "sensor.second_bedroom_air_quality_voc_index": { state: "90", attributes: {} } });
  assert.strictEqual(r.querySelector(".sum").textContent, "2 rooms elevated");
  // All good.
  card.hass = hass({
    "sensor.living_room_air_quality_co2": { state: "600", attributes: {} },
    "sensor.living_room_air_quality_voc_index": { state: "100", attributes: {} },
    "sensor.bedroom_air_quality_co2": { state: "650", attributes: {} },
    "sensor.second_bedroom_air_quality_voc_index": { state: "90", attributes: {} },
  });
  assert.strictEqual(r.querySelector(".sum").textContent, "All excellent");

  // Unavailable sensor shows "–" and does not raise the level; unchanged values are not rewritten.
  card.hass = hass({ "sensor.study_air_quality_co2": { state: "unavailable", attributes: {} } });
  eq(vals(1), ["– ppm", "1.1", "96"]);
  const node = tiles()[1].querySelector(".m").firstChild;
  card.hass = hass({ "sensor.study_air_quality_co2": { state: "unavailable", attributes: {} } });
  assert.strictEqual(tiles()[1].querySelector(".m").firstChild, node);

  // Tap → room dashboard; without a path → CO₂ dialog.
  const navs = [];
  const more = [];
  window.addEventListener("location-changed", () => navs.push(window.location.pathname));
  card.addEventListener("hass-more-info", (e) => more.push(e.detail.entityId));
  tiles()[1].click();
  tiles()[2].click();
  await tick();
  eq(navs, ["/lovelace/study-air-quality"]);
  eq(more, ["sensor.bedroom_air_quality_co2"]);

  // Own thresholds override the defaults.
  card.setConfig({ ...cfg, thresholds: { co2: [1000, null, 1500] } });
  card.hass = hass();
  assert.strictEqual(st(0), "Elevated", "VOC 166 still elevated");
  eq(vals(0), ["956 ppm", "5.0", "*166"], "CO₂ 956 fine with a 1000 threshold");

  console.log("ALL AIR-QUALITY TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
