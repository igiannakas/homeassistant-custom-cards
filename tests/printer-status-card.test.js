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
  assert.strictEqual(q(".pill .tog span").textContent, "On");
  assert.strictEqual(q(".pill .w").textContent, "142 W");
  assert(q(".pill").classList.contains("on"));
  assert.strictEqual(q(".job").style.display, "none");
  eq([...r.querySelectorAll(".stats b")].map((b) => b.textContent), ["0.84 kWh", "1,342", "4,826 h", "412.3 km"]);
  eq(acts(), ["Home", "Power off"]);
  assert(!/e-?stop|emergency/i.test(r.innerHTML), "no emergency stop");

  // Home asks first.
  r.querySelector(".act.home").click();
  await tick();
  let dlg = document.querySelector("psc-confirm-dialog");
  assert(dlg && dlg.shadowRoot.textContent.includes("Home all axes"));
  assert.strictEqual(calls.length, 0);
  dlg.shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["button", "press", { entity_id: "button.voron_home_all_axes" }]);

  // Every value opens its own more-info; the watts too, without touching the plug.
  const ev = t.events;
  q(".pill .w").click();
  r.querySelectorAll(".stats button").forEach((b) => b.click());
  q(".txt").click();
  eq(ev.splice(0), [
    ["more-info", "sensor.tasmota_energy_power_2"], ["more-info", "sensor.tasmota_energy_today_2"], ["more-info", "sensor.voron_totals_jobs"],
    ["more-info", "sensor.voron_totals_print_time"], ["more-info", "sensor.voron_totals_filament_used"], ["more-info", "sensor.voron_current_print_state"],
  ]);
  assert.strictEqual(calls.length, 0);
  assert(!document.querySelector("psc-confirm-dialog"));

  // Power off asks first; cancel does nothing, confirm runs the script.
  r.querySelector(".act.poweroff").click();
  await tick();
  dlg = document.querySelector("psc-confirm-dialog");
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
  for (const sel of [".pct [data-e]", ".l1 [data-e]", ".l2 [data-e]", ".thumb"]) r.querySelectorAll(sel).forEach((n) => n.click());
  eq(t.events.splice(0).map((x) => x[1]), [
    "sensor.voron_progress", "sensor.voron_print_time_left", "sensor.voron_print_eta", "sensor.voron_current_layer",
    "sensor.voron_filament_used", "sensor.voron_print_speed", "camera.voron_thumbnail",
  ]);
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
  q(".pill .tog").click();
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

  // Plug off: the pill hides and the only button is Power on, which asks first.
  card.hass = hass(states({ "switch.voron": { state: "off", attributes: {} }, "sensor.tasmota_energy_power_2": { state: "0", attributes: {} } }));
  assert.strictEqual(q(".nm").textContent, "Voron · Off");
  assert.strictEqual(q(".msg").textContent, "Power is off");
  assert(q(".pill").hidden, "no pill while the plug is off");
  eq(acts(), ["Power on"]);
  r.querySelector(".act.poweron").click();
  await tick();
  dlg = document.querySelector("psc-confirm-dialog");
  assert(dlg && dlg.shadowRoot.textContent.includes("starts up"), "power on asks first");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--green-color"));
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  assert.strictEqual(calls.length, 0, "cancel leaves the plug off");
  r.querySelector(".act.poweron").click();
  await tick();
  document.querySelector("psc-confirm-dialog").shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["switch", "turn_on", { entity_id: "switch.voron" }]);

  // Idle printer: switching the plug off from the pill also asks first; cancel does nothing.
  card.hass = hass(states());
  assert(!q(".pill").hidden, "pill back once the plug is on");
  q(".pill .tog").click();
  await tick();
  dlg = document.querySelector("psc-confirm-dialog");
  assert(dlg && dlg.shadowRoot.textContent.includes("Cut power"), "plug off asks first");
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  assert.strictEqual(calls.length, 0, "cancel leaves the plug on");

  // Without a power-off script there is no Power off button; without energy_today three stats.
  const bare = mount({ prefix: "voron" }, states());
  eq([...bare.shadowRoot.querySelectorAll(".act")].map((b) => b.textContent), ["Home"]);
  assert.strictEqual(bare.shadowRoot.querySelectorAll(".stats b").length, 3);
  assert(!bare.shadowRoot.querySelector(".pill"));
  assert.strictEqual(bare.shadowRoot.querySelector(".nm").textContent, "Printer · Ready");

  // Chamber light (a Klipper output pin, 0–100): a third button, glows while on, toggles at once.
  const LED = "number.voron_output_pin_chamber_leds";
  const led = (v) => ({ [LED]: { state: String(v), attributes: { min: 0, max: 100, step: 1 } } });
  calls.length = 0;
  const lc = mount({ ...cfg, light: LED }, states(led(25)));
  const lr = lc.shadowRoot;
  const lacts = () => [...lr.querySelectorAll(".act")].map((x) => x.textContent);
  eq(lacts(), ["Home", "Power off", "Light 25%"]);
  const lb = lr.querySelector(".act.light");
  assert(lb.classList.contains("on"));
  assert.strictEqual(lb.querySelector("ha-icon").getAttribute("icon"), "mdi:led-strip-variant");
  assert.strictEqual(lr.querySelector(".acts").style.getPropertyValue("--n"), "3");
  lb.click();
  await tick();
  assert(!document.querySelector("psc-confirm-dialog"), "light toggles without asking");
  eq(calls.pop(), ["number", "set_value", { entity_id: LED, value: 0 }]);
  lc.hass = hass(states(led(0)));
  assert.strictEqual(lr.querySelector(".act.light"), lb, "light button updates in place");
  assert(!lb.classList.contains("on"));
  assert.strictEqual(lb.textContent, "Light");
  assert.strictEqual(lb.querySelector("ha-icon").getAttribute("icon"), "mdi:led-strip-variant-off");
  lb.click();
  eq(calls.pop(), ["number", "set_value", { entity_id: LED, value: 25 }], "back to the level it had");
  lc.hass = hass(states({ ...printing(), ...led(100) }));
  eq(lacts(), ["Pause", "Cancel", "Light"], "full brightness shows no %");
  // A fresh card that has never seen it on turns it fully on; light_on overrides.
  const fresh = mount({ ...cfg, light: LED }, states(led(0)));
  fresh.shadowRoot.querySelector(".act.light").click();
  eq(calls.pop(), ["number", "set_value", { entity_id: LED, value: 100 }]);
  const fixed = mount({ ...cfg, light: LED, light_on: 40, light_name: "LEDs" }, states(led(0)));
  assert.strictEqual(fixed.shadowRoot.querySelector(".act.light").textContent, "LEDs");
  fixed.shadowRoot.querySelector(".act.light").click();
  eq(calls.pop(), ["number", "set_value", { entity_id: LED, value: 40 }]);
  // Hold opens the light's more-info instead of toggling.
  t.events.length = 0;
  const hb = fixed.shadowRoot.querySelector(".act.light");
  hb.dispatchEvent(new t.window.MouseEvent("pointerdown", { bubbles: true, composed: true, button: 0 }));
  await tick(600);
  hb.dispatchEvent(new t.window.MouseEvent("pointerup", { bubbles: true, composed: true }));
  hb.click();
  eq(t.events.splice(0), [["more-info", LED]]);
  assert.strictEqual(calls.length, 0, "a hold does not toggle");
  // Printer off: the pin is unavailable, so no light button; a light entity toggles with turn_on/off.
  const off = mount({ ...cfg, light: LED }, states({ "switch.voron": { state: "off", attributes: {} }, [LED]: { state: "unavailable", attributes: {} } }));
  assert(!off.shadowRoot.querySelector(".act.light"));
  const ll = mount({ ...cfg, light: "light.chamber" }, states({ "light.chamber": { state: "on", attributes: { brightness: 255 } } }));
  ll.shadowRoot.querySelector(".act.light").click();
  eq(calls.pop(), ["light", "turn_off", { entity_id: "light.chamber" }]);

  // Camera card is created through the card helpers and gets hass.
  const made = [];
  t.window.loadCardHelpers = async () => ({ createCardElement: (c) => { const el = document.createElement("div"); el.className = "cam"; made.push(c); return el; } });
  const cam = mount({ ...cfg, camera_card: { type: "custom:frigate-card", cameras: [{ camera_entity: "camera.voron_camera" }] } }, states());
  await tick();
  assert.strictEqual(made[0].type, "custom:frigate-card");
  const camEl = cam.shadowRoot.querySelector(".camera .cam");
  assert(camEl && camEl.hass, "camera card mounted with hass");
  // Printer off: the camera card is removed (no stream to show); back on: mounted again.
  const offStates = states({ "switch.voron": { state: "off", attributes: {} } });
  cam.hass = hass(offStates);
  assert(!cam.shadowRoot.querySelector(".camera .cam"), "camera removed while the plug is off");
  assert.strictEqual(cam.shadowRoot.querySelector(".camera").children.length, 0);
  cam.hass = hass(offStates);
  await tick();
  assert.strictEqual(made.length, 1, "not re-created while off");
  cam.hass = hass(states());
  await tick();
  assert(cam.shadowRoot.querySelector(".camera .cam"), "camera back when the plug is on");
  assert.strictEqual(made.length, 2);
  cam.hass = hass(states());
  await tick();
  assert.strictEqual(made.length, 2, "mounted once, not on every update");
  // Printer unreachable (plug on, Moonraker unavailable): no camera.
  cam.hass = hass(states({ "sensor.voron_printer_state": { state: "unavailable", attributes: {} } }));
  await tick();
  assert(!cam.shadowRoot.querySelector(".camera .cam"), "no camera while the printer is unavailable");
  // Feed test: the card asks HA for a still; an error hides the camera, a picture shows it.
  let feed = false;
  const probes = [];
  const withFeed = (st) => ({ ...hass(st), fetchWithAuth: async (url) => { probes.push(url); return feed ? { ok: true, headers: { get: () => "image/jpeg" } } : { ok: false, headers: { get: () => "text/plain" } }; } });
  const fc = mount({ ...cfg, camera_card: { type: "custom:frigate-card", cameras: [{ camera_entity: "camera.voron_camera" }] } }, states());
  fc.hass = withFeed(states());
  await tick(); await tick();
  // The first check (no fetchWithAuth in the test hass) trusted the printer; the next check uses the feed.
  fc._probe();
  await tick(); await tick();
  assert(probes[0].startsWith("/api/camera_proxy/camera.voron_camera"), probes[0]);
  assert(!fc.shadowRoot.querySelector(".camera .cam"), "no camera when the feed fails");
  feed = true;
  fc._probe();
  await tick(); await tick();
  assert(fc.shadowRoot.querySelector(".camera .cam"), "camera shown once the feed answers");
  clearTimeout(fc._probeTimer);
  fc.remove();
  // A card set up with the plug already off never creates the camera until power returns.
  const made0 = made.length;
  const camOff = mount({ ...cfg, camera_card: { type: "custom:frigate-card" } }, offStates);
  await tick();
  assert.strictEqual(made.length, made0);
  eq([...camOff.shadowRoot.querySelectorAll(".act")].map((x) => x.textContent), ["Power on"]);
  // Without a power switch there is no Power on button.
  const noPlug = mount({ prefix: "voron" }, states({ "sensor.voron_printer_state": { state: "unavailable", attributes: {} } }));
  eq([...noPlug.shadowRoot.querySelectorAll(".act")].map((x) => x.textContent), []);

  console.log("printer-status-card: all tests passed");
  process.exit(0); // feed checks leave timers running
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
