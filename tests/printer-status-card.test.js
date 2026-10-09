// Behaviour test for printer-status-card (runs the real card in jsdom). Run: npm test
const assert = require("assert");
const load = require("./_harness");

const p = (k, v, a) => [`sensor.voron_${k}`, { state: String(v), attributes: a || {} }];
function states(over = {}) {
  return {
    "switch.voron": { state: "on", attributes: {} },
    "sensor.tasmota_energy_power_2": { state: "142", attributes: {} },
    "sensor.tasmota_energy_today_2": { state: "0.84", attributes: {} },
    "camera.voron_thumbnail": { state: "idle", attributes: { entity_picture: "/api/camera_proxy/camera.voron_thumbnail?token=a" } },
    ...Object.fromEntries([
      p("printer_state", "ready"),
      p("current_print_state", "standby"),
      p("printer_message", "Printer is ready"),
      p("filename", "unknown"),
      p("totals_jobs", 1342),
      p("totals_print_time", "4825h 49m 38s"),
      p("totals_filament_used", 412345.6),
    ]),
    ...over,
  };
}
const printing = () =>
  Object.fromEntries([
    p("current_print_state", "printing"),
    p("printer_state", "printing"),
    p("filename", "bracket_v3.gcode"),
    p("progress", 62),
    p("print_time_left", 1.383),
    p("print_eta", "2026-10-09T15:42:00+00:00"),
    p("current_layer", 141),
    p("total_layer", 230),
    p("filament_used", 12.34),
    p("print_speed", 250),
  ]);
const cfg = {
  name: "Voron", prefix: "voron", power_switch: "switch.voron", power_sensor: "sensor.tasmota_energy_power_2",
  energy_today: "sensor.tasmota_energy_today_2", power_off_script: "script.power_off_3d_printer",
};

(async () => {
  const t = await load("printer-status-card");
  const { Card, calls, mount, hass, document, tick, eq } = t;
  assert.throws(() => new Card().setConfig({}));
  const names = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["prefix", "power_switch", "power_sensor", "energy_today", "power_off_script", "camera_card"]) assert(names.includes(`"${k}"`), k);

  const card = mount(cfg, states());
  const r = card.shadowRoot;
  const q = (s) => r.querySelector(s);
  const acts = () => [...r.querySelectorAll(".act")].map((b) => b.textContent);

  // Idle: Ready, message, plug with watts, totals, Home + Power off. No E-stop anywhere.
  assert.strictEqual(q(".nm").textContent, "Voron · Ready");
  assert.strictEqual(q(".msg").textContent, "Printer is ready");
  assert.strictEqual(q(".pill span").textContent, "On · 142 W");
  assert(q(".pill").classList.contains("on"));
  assert.strictEqual(q(".job").style.display, "none");
  eq([...r.querySelectorAll(".stats b")].map((b) => b.textContent), ["0.84 kWh", "1,342", "4,826 h", "412.3 km"]);
  eq(acts(), ["Home", "Power off"]);
  assert(!/e-?stop|emergency/i.test(r.innerHTML), "no emergency stop");

  r.querySelector(".act.home").click();
  eq(calls.pop(), ["button", "press", { entity_id: "button.voron_home_all_axes" }]);

  // Power off asks first; cancel does nothing, confirm runs the script.
  r.querySelector(".act.poweroff").click();
  await tick();
  let dlg = document.querySelector("psc-confirm-dialog");
  assert(dlg, "asks first");
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  assert(!document.querySelector("psc-confirm-dialog"));
  assert.strictEqual(calls.length, 0);
  r.querySelector(".act.poweroff").click();
  await tick();
  document.querySelector("psc-confirm-dialog").shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["script", "turn_on", { entity_id: "script.power_off_3d_printer" }]);

  // Printing: job block with progress, time left, layers, filament, speed; Pause + Cancel.
  card.hass = hass(states(printing()));
  assert.strictEqual(q(".nm").textContent, "Voron · Printing");
  assert.strictEqual(q(".msg").textContent, "bracket_v3.gcode");
  assert.strictEqual(q(".job").style.display, "");
  assert(q(".pct").textContent.startsWith("62%1h 23m left · done "), q(".pct").textContent);
  assert.strictEqual(q(".pbar i").style.width, "62%");
  assert.strictEqual(q(".l1").textContent, "Layer 141 / 230 · 12.3 m filament");
  assert.strictEqual(q(".l2").textContent, "250 mm/s");
  assert.strictEqual(q(".thumb img").getAttribute("src"), "/api/camera_proxy/camera.voron_thumbnail?token=a");
  assert.strictEqual(q(".stats").style.display, "none");
  eq(acts(), ["Pause", "Cancel"]);
  const pause = r.querySelector(".act.pause");
  card.hass = hass(states(printing()));
  assert.strictEqual(r.querySelector(".act.pause"), pause, "buttons are not rebuilt on every update");
  pause.click();
  eq(calls.pop(), ["button", "press", { entity_id: "button.voron_pause_print" }]);
  r.querySelector(".act.cancel").click();
  await tick();
  dlg = document.querySelector("psc-confirm-dialog");
  assert(dlg.shadowRoot.textContent.includes("bracket_v3.gcode"));
  dlg.shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["button", "press", { entity_id: "button.voron_cancel_print" }]);

  // Plug while printing: asks, in red, and says the print ends.
  q(".pill").click();
  await tick();
  dlg = document.querySelector("psc-confirm-dialog");
  assert(dlg.shadowRoot.textContent.includes("is printing"));
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--red-color"));
  dlg.shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["switch", "turn_off", { entity_id: "switch.voron" }]);

  // Paused: Resume + Cancel.
  card.hass = hass(states({ ...printing(), ...Object.fromEntries([p("current_print_state", "paused")]) }));
  assert.strictEqual(q(".nm").textContent, "Voron · Paused");
  eq(acts(), ["Resume", "Cancel"]);
  r.querySelector(".act.resume").click();
  eq(calls.pop(), ["button", "press", { entity_id: "button.voron_resume_print" }]);

  // Complete: job stays visible as "Done", idle buttons back.
  card.hass = hass(states({ ...printing(), ...Object.fromEntries([p("current_print_state", "complete"), p("progress", 100)]) }));
  assert.strictEqual(q(".nm").textContent, "Voron · Complete");
  assert.strictEqual(q(".pct").textContent, "100%Done");
  assert.strictEqual(q(".l2").textContent, "");
  eq(acts(), ["Home", "Power off"]);

  // Error state.
  card.hass = hass(states(Object.fromEntries([p("printer_state", "shutdown"), p("printer_message", "MCU 'mcu' shutdown")])));
  assert.strictEqual(q(".nm").textContent, "Voron · Error");
  assert.strictEqual(q(".msg").textContent, "MCU 'mcu' shutdown");

  // Plug off: Off, no buttons; turning on is immediate.
  card.hass = hass(states({ "switch.voron": { state: "off", attributes: {} }, "sensor.tasmota_energy_power_2": { state: "0", attributes: {} } }));
  assert.strictEqual(q(".nm").textContent, "Voron · Off");
  assert.strictEqual(q(".msg").textContent, "Power is off");
  assert.strictEqual(q(".pill span").textContent, "Off");
  eq(acts(), []);
  q(".pill").click();
  await tick();
  assert(!document.querySelector("psc-confirm-dialog"), "turning on does not ask");
  eq(calls.pop(), ["switch", "turn_on", { entity_id: "switch.voron" }]);

  // Without a power-off script there is no Power off button; without energy_today three stats.
  const bare = mount({ prefix: "voron" }, states());
  eq([...bare.shadowRoot.querySelectorAll(".act")].map((b) => b.textContent), ["Home"]);
  assert.strictEqual(bare.shadowRoot.querySelectorAll(".stats b").length, 3);
  assert(!bare.shadowRoot.querySelector(".pill"));
  assert.strictEqual(bare.shadowRoot.querySelector(".nm").textContent, "Printer · Ready");

  // Camera card is created through the card helpers and gets hass.
  const made = [];
  t.window.loadCardHelpers = async () => ({ createCardElement: (c) => { const el = document.createElement("div"); el.className = "cam"; made.push(c); return el; } });
  const cam = mount({ ...cfg, camera_card: { type: "custom:frigate-card", cameras: [{ camera_entity: "camera.voron_camera" }] } }, states());
  await tick();
  assert.strictEqual(made[0].type, "custom:frigate-card");
  const camEl = cam.shadowRoot.querySelector(".camera .cam");
  assert(camEl && camEl.hass, "camera card mounted with hass");

  console.log("printer-status-card: all tests passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
