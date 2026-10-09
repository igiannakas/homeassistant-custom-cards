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

  assert.strictEqual(r.querySelector(".title").textContent, "EMU lanes");
  eq(lanes().map((l) => l.querySelector(".ln").textContent), ["Lane 0", "Lane 1", "Lane 2", "Lane 3"]);
  eq(lanes().map((l) => l.querySelector(".sp").getAttribute("icon")), ["mdi:circle-slice-8", "mdi:circle-slice-8", "mdi:circle-outline", "mdi:circle-slice-8"]);
  assert(lanes()[2].classList.contains("empty"));
  eq(lanes().map((l) => l.querySelector(".lv").textContent), ["12%24.0°", "32%24.1°", "51%24.2°", "18%24.3°"]);
  // Humidity tone: dry (green) < 20, medium (amber) 20–40, wet (orange) above.
  const tone = (i) => lanes()[i].querySelector(".lv .v").getAttribute("style");
  assert(tone(0).includes("--green-color") && tone(1).includes("--amber-color") && tone(2).includes("--orange-color"));
  assert.strictEqual(r.querySelector(".sum").textContent, "3 of 4 loaded");
  assert(r.querySelector(".legend").textContent.includes("<20% dry") && r.querySelector(".legend").textContent.includes(">40% wet"));
  assert(r.querySelector(".legend"));
  assert(lanes().every((l) => l.querySelector(".dry").style.display === "none"));

  // Drying lane shows the fan; buffer state follows the sensors.
  card.hass = hass(states({ "sensor.voron_unit0_fan1": { state: "60", attributes: {} }, "binary_sensor.voron_unit0_filament_tension": { state: "on", attributes: {} } }));
  assert.strictEqual(lanes()[1].querySelector(".dry").style.display, "");
  assert(lanes()[1].title.includes("drying (fan 60%)"));
  assert.strictEqual(r.querySelector(".sum").textContent, "3 of 4 loaded", "no buffer state");

  lanes()[2].click();
  lanes()[3].querySelectorAll(".v")[1].click();
  lanes()[1].querySelectorAll(".v")[0].click();
  eq(events.splice(0), [["more-info", "sensor.voron_unit0_env2_humidity"], ["more-info", "sensor.voron_unit0_env3_temp"], ["more-info", "sensor.voron_unit0_env1_humidity"]]);

  // Names, thresholds, lane count, no legend.
  const c2 = mount({ prefix: "voron", lanes: 2, names: ["PLA black"], humidity_thresholds: [5, 10], legend: false }, states());
  eq([...c2.shadowRoot.querySelectorAll(".ln")].map((n) => n.textContent), ["PLA black", "Lane 1"]);
  assert(c2.shadowRoot.querySelectorAll(".lv .v")[2].getAttribute("style").includes("--orange-color"));
  assert(!c2.shadowRoot.querySelector(".legend"));
  assert.strictEqual(c2.shadowRoot.querySelector(".sum").textContent, "2 of 2 loaded");

  console.log("mmu-lanes-card: all tests passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
