// Behaviour test for printer-temps-card (runs the real card in jsdom). Run: npm test
const assert = require("assert");
const load = require("./_harness");

const s = (id, v) => [id, { state: String(v), attributes: {} }];
function states(over = {}) {
  return Object.fromEntries([
    s("sensor.voron_extruder_temperature", 20.04), s("number.voron_extruder_target", 0), s("sensor.voron_extruder_power", 0),
    s("sensor.voron_bed_temperature", 21.3), s("number.voron_bed_target", 0), s("sensor.voron_bed_power", 0),
    s("sensor.voron_heater_chamber_temperature", 22.1), s("number.voron_heater_chamber_target", 0), s("sensor.voron_heater_chamber_power", 0),
    s("sensor.voron_buildplate_temp", 21.0), s("sensor.voron_stepper_body_temp", 23.4), s("sensor.voron_toolhead_board_temp", 25.6),
    s("number.voron_fan_speed", 0), s("sensor.voron_hotend_fan", 0), s("sensor.voron_exhaust_fan", 0),
    ...Object.entries(over),
  ]);
}

(async () => {
  const { Card, mount, hass, events, eq } = await load("printer-temps-card");
  assert.throws(() => new Card().setConfig({}));
  const card = mount({ prefix: "voron" }, states());
  const r = card.shadowRoot;
  const tiles = () => [...r.querySelectorAll(".tile")];
  const val = (i) => tiles()[i].querySelector(".val").textContent;

  eq(tiles().map((t) => t.querySelector(".nm").textContent), ["Nozzle", "Bed", "Chamber", "Build plate", "Stepper body", "Toolhead board"]);
  eq([0, 1, 2, 3].map(val), ["20.0°Off", "21.3°Off", "22.1°Off", "21.0°"]);
  assert(!tiles().some((t) => t.classList.contains("on")));
  assert.strictEqual(r.querySelector(".s").textContent, "All heaters off");
  eq([...r.querySelectorAll(".fan span")].map((f) => f.textContent), ["Part 0%", "Hotend 0%", "Exhaust 0%"]);
  // Two-line label: the summary sits under the title (not squeezed onto its right), ink-aligned.
  assert(r.querySelector(".label .lt .t + .s"), "summary under the title");
  assert.strictEqual(r.querySelector(".label .t").textContent, "Temperatures");
  assert(!r.querySelector(".lt").classList.contains("one"));
  // The label icon is decoration (grey) while nothing heats.
  assert(!r.querySelector(".label").classList.contains("on"));
  const css = r.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis/.test(css), "no clipped text");
  assert(!/line-clamp/.test(css));
  assert(!/margin-left:\s*auto/.test(css), "no summary pushed to the right of the title");
  assert(/\.slot ha-icon \{[^}]*color: var\(--grey-color/.test(css), "label icon grey");
  assert(/\.label\.on \.slot ha-icon \{ color: var\(--orange-color/.test(css), "orange while heating");
  assert(/\.fan\.on ha-icon \{ color: var\(--teal-color, #009688\); \}/.test(css), "a running fan is teal");
  assert.strictEqual((css.match(/--teal-color/g) || []).length, 1, "teal only for a running fan");
  assert(!/blue-color/.test(css), "no blue left");
  assert(/\.tile \{[^}]*padding: 11px 10px/.test(css), "tile padding 11px 10px");
  assert(/\.pw \{[^}]*font-size: 12px/.test(css), "heater power 12px");
  assert(/\.tile:active, \.fan:active \{ filter: brightness\(\.92\)/.test(css), "press .92");
  assert(!/font-size: (10|11\.5|17)px/.test(css), "only the type scale's sizes");

  // Heating: nozzle and bed on → glow, target and power, bar; summary Heating.
  card.hass = hass(states({
    "number.voron_extruder_target": { state: "250", attributes: {} }, "sensor.voron_extruder_power": { state: "38.4", attributes: {} },
    "sensor.voron_extruder_temperature": { state: "180.2", attributes: {} },
    "number.voron_bed_target": { state: "110", attributes: {} }, "sensor.voron_bed_power": { state: "100", attributes: {} },
    "sensor.voron_hotend_fan": { state: "100", attributes: {} },
  }));
  assert.strictEqual(val(0), "180.2°→ 250°");
  assert.strictEqual(tiles()[0].querySelector(".pw").textContent, "38%");
  assert.strictEqual(tiles()[2].querySelector(".pw").textContent, "", "no power while off");
  assert(tiles()[0].classList.contains("on") && tiles()[1].classList.contains("on") && !tiles()[2].classList.contains("on"));
  assert.strictEqual(tiles()[0].querySelector(".bar i").style.width, "38.4%");
  assert.strictEqual(tiles()[2].querySelector(".bar i").style.width, "0%");
  assert.strictEqual(r.querySelector(".s").textContent, "Heating");
  assert(r.querySelector(".label").classList.contains("on"), "label icon shows heating");
  assert(r.querySelectorAll(".fan")[1].classList.contains("on"));
  assert.strictEqual(r.querySelectorAll(".fan span")[1].textContent, "Hotend 100%");

  // Within 2° of every target → At temperature.
  card.hass = hass(states({
    "number.voron_extruder_target": { state: "250", attributes: {} }, "sensor.voron_extruder_temperature": { state: "249.3", attributes: {} },
    "sensor.voron_extruder_power": { state: "22", attributes: {} },
  }));
  assert.strictEqual(r.querySelector(".s").textContent, "At temperature");

  // A tap opens more-info for the temperature / fan entity.
  tiles()[1].click();
  r.querySelectorAll(".fan")[2].click();
  eq(events.splice(0), [["more-info", "sensor.voron_bed_temperature"], ["more-info", "sensor.voron_exhaust_fan"]]);
  // Heater values: temperature, target and power each open their own entity.
  card.hass = hass(states({ "number.voron_bed_target": { state: "110", attributes: {} }, "sensor.voron_bed_power": { state: "64", attributes: {} } }));
  tiles()[1].querySelectorAll(".val [data-e], .pw").forEach((b) => b.click());
  tiles()[4].querySelector(".val [data-e]").click();
  eq(events.splice(0).map((x) => x[1]), ["sensor.voron_bed_temperature", "number.voron_bed_target", "sensor.voron_bed_power", "sensor.voron_stepper_body_temp"]);

  // Missing sensors are left out; custom lists work.
  const st2 = states();
  delete st2["sensor.voron_heater_chamber_temperature"];
  delete st2["sensor.voron_stepper_body_temp"];
  const c2 = mount({ prefix: "voron" }, st2);
  eq([...c2.shadowRoot.querySelectorAll(".tile .nm")].map((n) => n.textContent), ["Nozzle", "Bed", "Build plate", "Toolhead board"]);
  const c3 = mount({ prefix: "voron", title: "Temps", heaters: [{ name: "Hotend", heater: "extruder" }], readings: [{ name: "Room", entity: "sensor.voron_buildplate_temp" }], fans: [] }, states());
  eq([...c3.shadowRoot.querySelectorAll(".tile .nm")].map((n) => n.textContent), ["Hotend", "Room"]);
  assert.strictEqual(c3.shadowRoot.querySelector(".t").textContent, "Temps");
  assert.strictEqual(c3.shadowRoot.querySelector(".fans").style.display, "none");

  console.log("printer-temps-card: all tests passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
