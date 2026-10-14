// Behaviour test for mmu-lanes-card (runs the real card in jsdom). Run: npm test
const assert = require("assert");
const load = require("./_harness");

const s = (id, v) => [id, { state: String(v), attributes: {} }];
function states(over = {}) {
  const loaded = ["on", "on", "off", "on"];
  const hum = [12, 32, 51, 18];
  return Object.fromEntries([
    ...loaded.map((v, n) => s(`binary_sensor.voron_mmu_entry_${n}`, v)),
    ...hum.map((v, n) => s(`sensor.voron_unit0_env${n}_humidity`, v)),
    ...hum.map((_, n) => s(`sensor.voron_unit0_env${n}_temp`, 24 + n / 10)),
    ...hum.map((_, n) => s(`sensor.voron_unit0_fan${n}`, 0)),
    s("binary_sensor.voron_unit0_filament_tension", "off"),
    s("binary_sensor.voron_unit0_filament_compression", "off"),
    ...Object.entries(over),
  ]);
}

(async () => {
  const { Card, mount, hass, events, eq } = await load("mmu-lanes-card");
  assert.throws(() => new Card().setConfig({}));
  const card = mount({ prefix: "voron", title: "EMU lanes" }, states());
  const r = card.shadowRoot;
  const lanes = () => [...r.querySelectorAll(".lane")];

  assert.strictEqual(r.querySelector(".t").textContent, "EMU lanes");
  eq(lanes().map((l) => l.querySelector(".ln").textContent), ["Lane 0", "Lane 1", "Lane 2", "Lane 3"]);
  eq(lanes().map((l) => l.querySelector(".sp").getAttribute("icon")), ["mdi:circle-slice-8", "mdi:circle-slice-8", "mdi:circle-outline", "mdi:circle-slice-8"]);
  assert(lanes()[2].classList.contains("empty"));
  eq(lanes().map((l) => l.querySelector(".lv").textContent), ["12%24.0°", "32%24.1°", "51%24.2°", "18%24.3°"]);
  // Humidity tone: dry (green) < 20, medium (amber) 20–40, wet (orange) above.
  const tone = (i) => lanes()[i].querySelector(".lv .v").getAttribute("style");
  assert(tone(0).includes("--green-color") && tone(1).includes("--amber-color") && tone(2).includes("--orange-color"));
  assert.strictEqual(r.querySelector(".s").textContent, "3 of 4 loaded");
  assert(r.querySelector(".legend").textContent.includes("<20% dry") && r.querySelector(".legend").textContent.includes(">40% wet"));
  assert(r.querySelector(".legend"));
  assert(lanes().every((l) => l.querySelector(".dry").style.display === "none"));
  // Two-line label: "3 of 4 loaded" sits under the title.
  assert(r.querySelector(".label .lt .t + .s"), "summary under the title");
  assert(!r.querySelector(".lt").classList.contains("one"));

  // Colours: loaded = green (good, ready), header icon grey (decorative), unknown grey; wet and
  // drying stay orange. Nothing is teal (nothing here is a pick).
  const css = r.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis/.test(css), "no clipped names");
  assert(!/line-clamp/.test(css));
  assert(!/margin-left:\s*auto/.test(css), "no summary pushed to the right of the title");
  assert(!/teal/.test(css));
  assert(/\.slot ha-icon \{[^}]*color: var\(--grey-color/.test(css), "header icon grey");
  assert(/\.lh ha-icon\.sp \{ color: var\(--green-color/.test(css), "loaded lane icon green");
  assert(/\.lane\.unknown \.lh ha-icon\.sp \{ color: var\(--grey-color/.test(css), "unknown grey");
  assert(/\.lh ha-icon\.dry \{[^}]*color: var\(--orange-color/.test(css), "drying fan orange");
  assert(/\.legend ha-icon \{[^}]*color: var\(--green-color/.test(css), "legend loaded green");
  assert(/\.lane \{[^}]*padding: 11px 10px/.test(css), "lane padding 11px 10px");
  assert(/\.v \{[^}]*border-radius: 4px/.test(css), "value radius 4px");
  assert(/\.lane:active \{ filter: brightness\(\.92\)/.test(css), "press .92");
  const noEntry = states();
  delete noEntry["binary_sensor.voron_mmu_entry_3"]; // a lane without an entry sensor: loaded unknown
  card.hass = hass(noEntry);
  assert(lanes()[3].classList.contains("unknown") && !lanes()[3].classList.contains("empty"));
  assert.strictEqual(lanes()[3].querySelector(".sp").getAttribute("icon"), "mdi:help-circle-outline");
  card.hass = hass(states());
  assert(!lanes()[3].classList.contains("unknown"));

  // Lane names are never cut: the grid is fitted to the measured names. jsdom has no layout, so
  // nothing is measured and the CSS default (4 columns, 2 on a narrow card) stands.
  const grid = r.querySelector(".lanes");
  card._fitLanes();
  assert.strictEqual(grid.style.gridTemplateColumns, "", "no measurement, no change");
  // With layout (stubbed): a lane needs name + 62px (icons, gaps, padding).
  const lay = (W, names) => {
    Object.defineProperty(grid, "clientWidth", { value: W, configurable: true });
    lanes().forEach((l, i) => Object.defineProperty(l.querySelector(".ln"), "scrollWidth", { value: names[i], configurable: true }));
    card._fitLanes();
    return grid.style.gridTemplateColumns;
  };
  assert.strictEqual(lay(476, [44, 44, 44, 44]), "repeat(4, minmax(0, 1fr))", "desktop: four across");
  assert.strictEqual(lay(400, [44, 44, 44, 44]), "repeat(2, minmax(0, 1fr))", "three would fit but leave a lone lane: two");
  assert.strictEqual(lay(324, [44, 44, 44, 44]), "repeat(2, minmax(0, 1fr))", "phone: two");
  assert.strictEqual(lay(330, [44, 150, 44, 60]), "repeat(2, minmax(max-content, 1fr))", "two columns each as wide as its own longest");
  assert(!grid.classList.contains("wrap"));
  assert.strictEqual(lay(200, [44, 160, 44, 44]), "minmax(0, 1fr)", "one column");
  assert(grid.classList.contains("wrap"), "only a name wider than the card wraps");
  assert.strictEqual(lay(476, [44, 44, 44, 44]), "repeat(4, minmax(0, 1fr))", "back to four on a wide card");
  assert(!grid.classList.contains("wrap"));

  // Drying lane shows the fan; buffer state follows the sensors.
  card.hass = hass(states({ "sensor.voron_unit0_fan1": { state: "60", attributes: {} }, "binary_sensor.voron_unit0_filament_tension": { state: "on", attributes: {} } }));
  assert.strictEqual(lanes()[1].querySelector(".dry").style.display, "");
  assert(lanes()[1].title.includes("drying (fan 60%)"));
  assert.strictEqual(r.querySelector(".s").textContent, "3 of 4 loaded", "no buffer state");

  lanes()[2].click();
  lanes()[3].querySelectorAll(".v")[1].click();
  lanes()[1].querySelectorAll(".v")[0].click();
  eq(events.splice(0), [["more-info", "sensor.voron_unit0_env2_humidity"], ["more-info", "sensor.voron_unit0_env3_temp"], ["more-info", "sensor.voron_unit0_env1_humidity"]]);

  // Names, thresholds, lane count, no legend.
  const c2 = mount({ prefix: "voron", lanes: 2, names: ["PLA black"], humidity_thresholds: [5, 10], legend: false }, states());
  eq([...c2.shadowRoot.querySelectorAll(".ln")].map((n) => n.textContent), ["PLA black", "Lane 1"]);
  assert(c2.shadowRoot.querySelectorAll(".lv .v")[2].getAttribute("style").includes("--orange-color"));
  assert(!c2.shadowRoot.querySelector(".legend"));
  assert.strictEqual(c2.shadowRoot.querySelector(".s").textContent, "2 of 2 loaded");

  console.log("mmu-lanes-card: all tests passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
