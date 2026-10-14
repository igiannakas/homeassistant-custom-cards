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
  eq(vals(0), ["*CO₂956 ppm", "*VOC166", "PM12.3 µg/m³", "PM2.55.0 µg/m³", "PM47.1 µg/m³", "PM108.1 µg/m³"]);
  assert.strictEqual(tiles()[0].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:information-outline");
  // Study all good: leaf, Excellent, nothing highlighted.
  assert.strictEqual(st(1), "Excellent");
  eq(vals(1), ["CO₂612 ppm", "VOC96", "PM10.5 µg/m³", "PM2.51.1 µg/m³", "PM41.6 µg/m³", "PM101.9 µg/m³"]);
  assert.strictEqual(tiles()[1].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:leaf");
  // Second bedroom: VOC 268 → Poor (orange, alert).
  assert.strictEqual(st(3), "Poor");
  eq(vals(3), ["CO₂702 ppm", "*VOC268", "PM10.5 µg/m³", "PM2.51.0 µg/m³", "PM41.5 µg/m³", "PM101.7 µg/m³"]);
  assert.strictEqual(tiles()[3].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:alert-outline");
  assert.strictEqual(r.querySelector(".s").textContent, "Poor in Second Bedroom");
  assert(!tiles().some((t) => t.classList.contains("alarm")), "no glow below ventilate");

  // CO₂ over 1000 → Ventilate, open-window icon, red glow, summary names the room.
  card.hass = hass({ "sensor.living_room_air_quality_co2": { state: "1240", attributes: {} } });
  assert.strictEqual(st(0), "Ventilate");
  assert.strictEqual(tiles()[0].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:window-open-variant");
  assert(tiles()[0].classList.contains("alarm"));
  assert.strictEqual(r.querySelector(".s").textContent, "Ventilate Living Room");

  // Particles at the top level → also "Ventilate" (the words differ by level, not by cause), and the cause (PM10) is added.
  card.hass = hass({ "sensor.bedroom_air_quality_pm10": { state: "60", attributes: {} } });
  assert.strictEqual(st(2), "Ventilate");
  eq(vals(2), ["*CO₂841 ppm", "VOC124", "PM10.2 µg/m³", "PM2.50.4 µg/m³", "PM40.6 µg/m³", "*PM1060.0 µg/m³"]);
  assert.strictEqual(tiles()[2].querySelector(".shape ha-icon").getAttribute("icon"), "mdi:window-open-variant");
  assert(tiles()[2].classList.contains("alarm"));

  // Both kinds at once: every room at the top level is named, each name an unbreakable part.
  card.hass = hass({ "sensor.living_room_air_quality_co2": { state: "1240", attributes: {} }, "sensor.study_air_quality_pm2_5": { state: "53", attributes: {} } });
  assert.strictEqual(r.querySelector(".s").textContent, "Ventilate Living Room, Study");
  eq([...r.querySelectorAll(".s .p")].map((p) => p.textContent), ["Ventilate Living Room", "Study"]);
  eq(vals(0).slice(0, 1), ["*CO₂1,240 ppm"], "numbers with toLocaleString");

  // Only elevated rooms → count.
  card.hass = hass({ "sensor.second_bedroom_air_quality_voc_index": { state: "90", attributes: {} } });
  assert.strictEqual(r.querySelector(".s").textContent, "2 rooms elevated");
  // All good.
  card.hass = hass({
    "sensor.living_room_air_quality_co2": { state: "600", attributes: {} },
    "sensor.living_room_air_quality_voc_index": { state: "100", attributes: {} },
    "sensor.bedroom_air_quality_co2": { state: "650", attributes: {} },
    "sensor.second_bedroom_air_quality_voc_index": { state: "90", attributes: {} },
  });
  assert.strictEqual(r.querySelector(".s").textContent, "All excellent");

  // Particles sit on their own line, each labelled with its size class.
  const pmRow = tiles()[1].querySelector(".row.pm");
  assert(pmRow);
  [...pmRow.querySelectorAll(".k")].forEach((k, i) => assert.strictEqual(k.textContent, ["PM1", "PM2.5", "PM4", "PM10"][i]));

  // Unavailable sensor shows "–" and does not raise the level; unchanged values are not rewritten.
  card.hass = hass({ "sensor.study_air_quality_co2": { state: "unavailable", attributes: {} } });
  eq(vals(1), ["CO₂– ppm", "VOC96", "PM10.5 µg/m³", "PM2.51.1 µg/m³", "PM41.6 µg/m³", "PM101.9 µg/m³"]);
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
  eq(vals(0), ["CO₂956 ppm", "*VOC166", "PM12.3 µg/m³", "PM2.55.0 µg/m³", "PM47.1 µg/m³", "PM108.1 µg/m³"], "CO₂ 956 fine with a 1000 threshold");

  // Editor: columns and thresholds can be set there too.
  const form = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["title", "columns", "thresholds"]) assert(form.includes(`"name":"${k}"`), `editor field ${k}`);

  // Two-line label: the summary sits under the title, not squeezed onto its right.
  card.setConfig(cfg);
  card.hass = hass();
  assert(!r.querySelector(".sum"));
  assert.strictEqual(r.querySelector(".label .lt .t").textContent, "Air quality");
  assert.strictEqual(r.querySelector(".label .lt .s").textContent, "Poor in Second Bedroom");
  eq([...r.querySelectorAll(".s .p")].map((p) => p.textContent), ["Poor in Second Bedroom"]);
  assert.strictEqual(r.querySelector(".slot ha-icon").getAttribute("icon"), "mdi:alert-outline");
  assert(r.querySelector(".slot ha-icon").style.color.includes("--orange-color"), "label icon shows the house's level");
  // The orange and the red level never share a word.
  card.hass = hass({ "sensor.study_air_quality_co2": { state: "1100", attributes: {} } });
  eq([st(1), st(3)], ["Ventilate", "Poor"]);
  assert.strictEqual(r.querySelector(".s").textContent, "Ventilate Study");
  assert(r.querySelector(".slot ha-icon").style.color.includes("--red-color"));

  // Every reading is its own tap target and does not navigate; the rest of the tile still does.
  navs.length = 0;
  more.length = 0;
  card.hass = hass();
  tiles()[1].querySelector(".v").click(); // Study CO₂
  tiles()[1].querySelector(".row.pm .v small").click(); // Study PM1 (its unit)
  tiles()[0].querySelector(".v.hot .k").click(); // Living Room CO₂ (its label)
  await tick();
  eq(more, ["sensor.study_air_quality_co2", "sensor.study_air_quality_pm1", "sensor.living_room_air_quality_co2"]);
  eq(navs, [], "a reading never navigates");
  tiles()[1].querySelector(".nm").click();
  tiles()[1].querySelector(".st").click();
  await tick();
  eq(navs, ["/lovelace/study-air-quality", "/lovelace/study-air-quality"]);

  // Design rules: nothing cut, no off-scale text, units never hidden, press .92, tile gap stays 10px.
  const css = r.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis/.test(css) && !/overflow:\s*hidden/.test(css) && !/line-clamp/.test(css), "no clipping");
  assert(!/11\.5px/.test(css), "no 11.5px text");
  assert(!/small \{ display: none/.test(css), "ppm is never hidden");
  assert(/@container rooms \(max-width: 400px\) \{ \.room \{ padding: 11px 8px; \} \}/.test(css), "narrow tiles keep the 10px gap");
  assert(/\.room:active, \.v:active \{ filter: brightness\(\.92\); \}/.test(css));
  assert(/\.s \.p \{ white-space: nowrap; \}/.test(css));
  assert(!/18px icon/.test(src), "comment fixed");

  // Fitting the tiles (simulated layout: jsdom measures nothing, so the widths are stubbed).
  const proto = window.HTMLElement.prototype;
  const saved = {
    rect: window.Element.prototype.getBoundingClientRect,
    cw: Object.getOwnPropertyDescriptor(window.Element.prototype, "clientWidth"),
    ow: Object.getOwnPropertyDescriptor(proto, "offsetWidth"),
    gcs: window.getComputedStyle,
  };
  let gridW = 339;
  let pmW = 277;
  const NAMES = { "Living Room": 85, Study: 40, Bedroom: 58, "Second Bedroom": 110 };
  window.Element.prototype.getBoundingClientRect = function () {
    const width = this.classList.contains("nm") ? NAMES[this.textContent] : this.closest(".row.pm") ? 70 : 60;
    return { width, height: 16, left: 0, top: 0, right: width, bottom: 16 };
  };
  Object.defineProperty(window.Element.prototype, "clientWidth", {
    configurable: true,
    get() { return this.classList.contains("rooms") ? gridW : this.classList.contains("pm") ? pmW : 0; },
  });
  Object.defineProperty(proto, "offsetWidth", { configurable: true, get() { return this.classList.contains("shape") ? 36 : 0; } });
  window.getComputedStyle = (el) => ({
    paddingLeft: "10px", paddingRight: "10px", columnGap: el.classList.contains("rooms") ? "8px" : "10px", display: "block",
  });
  const grid = r.querySelector(".rooms");
  const pmCols = () => [...grid.querySelectorAll(".row.pm")].map((p) => p.style.gridTemplateColumns);
  // A tile needs 10 + 36 + 10 + 10 + the widest of its name, its widest reading (60/70) and its
  // particles two across (70 + 10 + 70 = 150) → 216 for every room here.
  card._fit();
  assert.strictEqual(grid.style.gridTemplateColumns, "repeat(1, minmax(0, 1fr))", "375px phone: one column (2 × 216 + 8 > 339)");
  eq(pmCols(), ["repeat(2, max-content)", "repeat(2, max-content)", "repeat(2, max-content)", "repeat(2, max-content)"], "PM 2×2 (4 × 70 + 30 > 277)");
  gridW = 440; // two even columns of 216 + 8 fit exactly
  pmW = 460;
  card._fit();
  assert.strictEqual(grid.style.gridTemplateColumns, "repeat(2, minmax(0, 1fr))");
  eq(pmCols()[0], "repeat(4, max-content)", "four across when they fit");
  pmW = 140; // a tile too narrow even for 2×2 → one per line
  card._fit();
  eq(pmCols()[0], "", "one per line (the CSS default)");
  // Desktop: never more than the columns option, fewer when they don't fit.
  card.setConfig({ ...cfg, columns: 4 });
  card.hass = hass();
  gridW = 900; // 4 × 216 + 24 = 888
  card._fit();
  assert.strictEqual(r.querySelector(".rooms").style.gridTemplateColumns, "repeat(4, minmax(0, 1fr))");
  gridW = 800;
  card._fit();
  assert.strictEqual(r.querySelector(".rooms").style.gridTemplateColumns, "repeat(3, minmax(0, 1fr))");
  card.setConfig({ ...cfg, columns: 3 });
  card.hass = hass();
  gridW = 900;
  card._fit();
  assert.strictEqual(r.querySelector(".rooms").style.gridTemplateColumns, "repeat(3, minmax(0, 1fr))");
  // A long name drives its tile: two uneven columns when two even ones don't fit but each column's
  // own widest does (tiles 216, 216, 216, 316 → 2 × 316 + 8 > 545; 216 + 316 + 8 = 540).
  NAMES["Second Bedroom"] = 250;
  card.setConfig(cfg);
  card.hass = hass();
  gridW = 545;
  card._fit();
  assert.strictEqual(r.querySelector(".rooms").style.gridTemplateColumns, "minmax(216px, 1fr) minmax(316px, 1fr)");
  gridW = 530;
  card._fit();
  assert.strictEqual(r.querySelector(".rooms").style.gridTemplateColumns, "repeat(1, minmax(0, 1fr))");
  // Restore the real (empty) layout: nothing is measured or changed.
  window.Element.prototype.getBoundingClientRect = saved.rect;
  if (saved.cw) Object.defineProperty(window.Element.prototype, "clientWidth", saved.cw);
  if (saved.ow) Object.defineProperty(proto, "offsetWidth", saved.ow);
  else delete proto.offsetWidth;
  window.getComputedStyle = saved.gcs;
  card.setConfig(cfg);
  card.hass = hass();
  card._fit();
  assert.strictEqual(r.querySelector(".rooms").style.gridTemplateColumns, "", "no layout → CSS default (--cols)");
  assert.strictEqual(r.querySelector(".rooms").getAttribute("style"), "--cols:2");

  console.log("ALL AIR-QUALITY TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
