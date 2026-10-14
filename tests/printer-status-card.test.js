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
  for (const k of ["prefix", "power_switch", "power_sensor", "power_sensor_switch", "energy_today", "power_off_script", "camera_card"]) assert(names.includes(`"${k}"`), k);

  const card = mount(cfg, states());
  const r = card.shadowRoot;
  const q = (s) => r.querySelector(s);
  const acts = () => [...r.querySelectorAll(".act")].map((b) => b.textContent);
  // "Name · State" is joined with a no-break space before the dot; compare with plain spaces.
  const nm = (root) => root.querySelector(".nm").textContent.replace(/\u00a0/g, " ");
  const txt = (n) => n.textContent.replace(/\u00a0/g, " ");

  // Idle: Ready, message, plug with watts, totals, Power off only. No printer operations
  // (home, pause, resume, cancel, E-stop) anywhere – those are done on the printer.
  assert.strictEqual(nm(r), "Voron · Ready");
  assert.strictEqual(q(".msg").textContent, "Printer is ready");
  assert.strictEqual(q(".pill .tog span").textContent, "On");
  assert.strictEqual(q(".pill .w").textContent, "142 W");
  assert(q(".pill").classList.contains("on"));
  assert.strictEqual(q(".job").style.display, "none");
  eq([...r.querySelectorAll(".stats b")].map((b) => b.textContent), ["0.84 kWh", "1,342", "4,826 h", "412.3 km"]);
  eq([...r.querySelectorAll(".stats span")].map((b) => b.textContent), ["Today", "Prints", "Printed", "Filament"], "labels capitalised");
  eq(acts(), ["Power off"]);
  // The state word never splits and stays with its dot; the name may wrap before it.
  assert.strictEqual(q(".nm .st .w").textContent, "Ready");
  assert(q(".nm").innerHTML.includes("&nbsp;·"), q(".nm").innerHTML);

  // Text is never clipped: no ellipsis or line clamp anywhere; the button row is the flex pattern.
  const css = [...r.querySelectorAll("style")].map((x) => x.textContent).join("");
  assert(!/text-overflow:\s*ellipsis/.test(css), "no clipped text");
  assert(!/line-clamp/.test(css), "no line clamp");
  assert(/\.acts \{ display: flex; flex-wrap: wrap; gap: 8px; \}/.test(css), "button row wraps");
  assert(/\.act \{[^}]*flex: 1 1 0; min-width: max-content;[^}]*letter-spacing: \.2px/.test(css), "equal pills that keep their label");
  // Power on and Power off are orange, like the power pill.
  assert(/\.act\.poweroff ha-icon, \.act\.poweron ha-icon \{ color: var\(--orange-color/.test(css), "power buttons orange");
  assert(/\.cbar \{ height: 8px;/.test(css), "compact job bar 8px");

  // The state circle is a tap target: the printer's more-info, by click or keyboard.
  const circle = q(".head .shape");
  assert.strictEqual(circle.getAttribute("role"), "button");
  assert.strictEqual(circle.getAttribute("tabindex"), "0");
  circle.click();
  circle.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));
  eq(t.events.splice(0), [["more-info", "sensor.voron_current_print_state"], ["more-info", "sensor.voron_current_print_state"]]);
  assert(!/e-?stop|emergency|home_all|pause_print|resume_print|cancel_print/i.test(r.innerHTML), "no printer operations");
  const pwr = r.querySelector(".act.poweroff");
  card.hass = hass(states());
  assert.strictEqual(r.querySelector(".act.poweroff"), pwr, "buttons are not rebuilt on every update");
  let dlg;

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
  // Reference dialog: one glyph (the title's), the text under the title, a rule above the buttons;
  // no printer name and no second glyph. Orange, like the button that opened it.
  {
    const d = dlg.shadowRoot;
    assert.strictEqual(d.querySelector(".title").textContent, "Power off");
    assert.strictEqual(d.querySelector(".text").textContent, "The printer shuts down safely, then its plug turns off.");
    assert.strictEqual(d.querySelectorAll(".dialog > .row").length, 1, "title row only");
    assert.strictEqual([...d.querySelectorAll(".glyph")].filter((g) => !g.closest("button")).length, 1, "no second glyph");
    assert(!d.querySelector(".primary, .secondary, .body"), "no device-name line");
    assert(!/Voron/.test(d.textContent), "the printer isn't named again");
    assert(d.querySelector(".confirm").getAttribute("style").includes("--orange-color"));
    assert.strictEqual(d.querySelector(".confirm").textContent, "Power off", "title and button use the same verb");
    assert(/\.buttons \{[^}]*border-top: 1px solid/.test(d.querySelector("style").textContent), "1px rule above the buttons");
  }
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  assert(!document.querySelector("psc-confirm-dialog"));
  assert.strictEqual(calls.length, 0);
  r.querySelector(".act.poweroff").click();
  await tick();
  document.querySelector("psc-confirm-dialog").shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["script", "turn_on", { entity_id: "script.power_off_3d_printer" }]);

  // Printing: job block with progress, time left, layers, filament, speed; no buttons.
  card.hass = hass(states(printing()));
  assert.strictEqual(nm(r), "Voron · Printing");
  assert.strictEqual(q(".msg").textContent, "bracket_v3.gcode");
  assert.strictEqual(q(".job").style.display, "");
  assert(/^62%1 h 23 min left · ends \d\d:\d\d$/.test(txt(q(".pct"))), txt(q(".pct")));
  // Each part of the job line stays whole; the line breaks only between parts.
  eq([...r.querySelectorAll(".pct .when .p")].map((x) => x.textContent).map((x) => x.replace(/\d\d:\d\d/, "hh:mm")), ["1 h 23 min left", "ends hh:mm"]);
  assert(q(".pct .when").innerHTML.includes("&nbsp;· "));
  // Durations: "45 min", "3 h", "1 h 5 min".
  for (const [hours, text] of [[0.75, "45 min"], [3, "3 h"], [1.0833, "1 h 5 min"]]) {
    card.hass = hass(states({ ...printing(), ...Object.fromEntries([p("print_time_left", hours)]) }));
    assert.strictEqual(q(".pct .when .p").textContent, `${text} left`);
  }
  card.hass = hass(states(printing()));
  assert.strictEqual(q(".pbar i").style.width, "62%");
  assert.strictEqual(txt(q(".l1")), "Layer 141 / 230 · 12.3 m filament");
  eq([...r.querySelectorAll(".l1 .p")].map((x) => x.textContent), ["Layer 141 / 230", "12.3 m filament"]);
  assert.strictEqual(q(".l2").textContent, "250 mm/s");
  assert.strictEqual(q(".thumb img").getAttribute("src"), "/api/camera_proxy/camera.voron_thumbnail?token=a");
  assert.strictEqual(q(".stats").style.display, "none");
  eq(acts(), []);
  assert.strictEqual(q(".acts").childNodes.length, 0, "empty, so .acts:empty hides the row");
  for (const sel of [".pct [data-e]", ".l1 [data-e]", ".l2 [data-e]", ".thumb"]) r.querySelectorAll(sel).forEach((n) => n.click());
  eq(t.events.splice(0).map((x) => x[1]), [
    "sensor.voron_progress", "sensor.voron_print_time_left", "sensor.voron_print_eta", "sensor.voron_current_layer",
    "sensor.voron_filament_used", "sensor.voron_print_speed", "camera.voron_thumbnail",
  ]);

  // Plug while printing: asks, in red (it would end the print), and says so.
  q(".pill .tog").click();
  await tick();
  dlg = document.querySelector("psc-confirm-dialog");
  assert(dlg.shadowRoot.querySelector(".text").textContent.includes("ends the current print"));
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--red-color"));
  assert.strictEqual(dlg.shadowRoot.querySelector(".title").textContent, "Turn the plug off");
  assert.strictEqual(dlg.shadowRoot.querySelector(".confirm").textContent, "Turn off");
  dlg.shadowRoot.querySelector(".confirm").click();
  await tick();
  eq(calls.pop(), ["switch", "turn_off", { entity_id: "switch.voron" }]);

  // Paused: no buttons either.
  card.hass = hass(states({ ...printing(), ...Object.fromEntries([p("current_print_state", "paused")]) }));
  assert.strictEqual(nm(r), "Voron · Paused");
  eq(acts(), []);

  // Complete: job stays visible as "Complete" (the state word, not "Done"), idle buttons back.
  card.hass = hass(states({ ...printing(), ...Object.fromEntries([p("current_print_state", "complete"), p("progress", 100)]) }));
  assert.strictEqual(nm(r), "Voron · Complete");
  assert.strictEqual(q(".pct").textContent, "100%Complete");
  assert.strictEqual(q(".l2").textContent, "");
  eq(acts(), ["Power off"]);

  // Plug on but Moonraker not answering: "Please wait", with the reason, and no buttons.
  const down = { ...Object.fromEntries([p("printer_state", "unavailable"), p("totals_jobs", "unavailable"), p("totals_print_time", "unavailable"), p("totals_filament_used", "unavailable")]) };
  card.hass = hass(states(down));
  assert.strictEqual(nm(r), "Voron · Please wait");
  assert.strictEqual(q(".msg").textContent, "Waiting for the printer");
  eq(acts(), []);
  eq([...r.querySelectorAll(".stats b")].map((b) => b.textContent), ["0.84 kWh", "–", "–", "–"], "no fake 0 h while totals are unavailable");
  card.hass = hass(states({ ...down, "script.power_off_3d_printer": { state: "on", attributes: {} } }));
  assert.strictEqual(q(".msg").textContent, "Shutting down", "the safe power-off script is running");
  card.hass = hass(states(Object.fromEntries([p("printer_state", "startup")])));
  assert.strictEqual(nm(r), "Voron · Please wait");
  assert.strictEqual(q(".msg").textContent, "Klipper is starting");

  // Error state.
  card.hass = hass(states(Object.fromEntries([p("printer_state", "shutdown"), p("printer_message", "MCU 'mcu' shutdown")])));
  assert.strictEqual(nm(r), "Voron · Error");
  assert.strictEqual(q(".msg").textContent, "MCU 'mcu' shutdown");

  // Plug off: the pill hides and the only button is Power on, which asks first.
  card.hass = hass(states({ "switch.voron": { state: "off", attributes: {} }, "sensor.tasmota_energy_power_2": { state: "0", attributes: {} } }));
  assert.strictEqual(nm(r), "Voron · Off");
  assert.strictEqual(q(".msg").textContent, "", "no line repeating Off");
  assert(q(".pill").hidden, "no pill while the plug is off");
  eq(acts(), ["Power on"]);
  r.querySelector(".act.poweron").click();
  await tick();
  dlg = document.querySelector("psc-confirm-dialog");
  assert(dlg && dlg.shadowRoot.querySelector(".text").textContent.includes("starts up"), "power on asks first");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--orange-color"), "orange, like Power off and the pill");
  assert(dlg.shadowRoot.querySelector(".row .glyph").getAttribute("style").includes("--orange-color"));
  assert.strictEqual(dlg.shadowRoot.querySelector(".title").textContent, "Power on");
  assert.strictEqual(dlg.shadowRoot.querySelector(".confirm").textContent, "Power on");
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
  assert(dlg && dlg.shadowRoot.querySelector(".title").textContent === "Turn the plug off", "plug off asks first");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--orange-color"), "orange while idle (the pill's colour)");
  assert(dlg.shadowRoot.querySelector(".text").textContent.includes("without a shutdown"));
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  assert.strictEqual(calls.length, 0, "cancel leaves the plug on");

  // A failed call without a message from HA: "Couldn't …" with the name, never an entity id.
  {
    const bad = { ...hass(states()), callService: async () => { throw {}; } };
    card.hass = bad;
    r.querySelector(".act.poweroff").click();
    await tick();
    document.querySelector("psc-confirm-dialog").shadowRoot.querySelector(".confirm").click();
    await tick();
    eq(t.events.splice(0), [["notification", "Couldn't power off Voron."]]);
    card.hass = { ...hass(states()), callService: async () => { throw new Error("Service not found"); } };
    q(".pill .tog").click();
    await tick();
    document.querySelector("psc-confirm-dialog").shadowRoot.querySelector(".confirm").click();
    await tick();
    eq(t.events.splice(0), [["notification", "Service not found"]], "HA's own message when there is one");
    card.hass = hass(states());
  }

  // Upstream plug (power_sensor_switch): the power sensor measures a strip that feeds the printer's
  // own plug and other things. Printer on: the usual On | watts pill.
  {
    const up = "switch.voron_master_plug";
    const ups = (printerOn, stripOn, w) =>
      states({ "switch.voron": { state: printerOn ? "on" : "off", attributes: {} }, [up]: { state: stripOn ? "on" : "off", attributes: {} },
        "sensor.tasmota_energy_power_2": { state: String(w), attributes: {} } });
    const uc = mount({ ...cfg, power_sensor_switch: up }, ups(true, true, 153));
    const ur = uc.shadowRoot;
    const u = (sel) => ur.querySelector(sel);
    assert(!u(".pill").hidden && u(".pill").classList.contains("on"));
    assert(!u(".pill .tog").hidden && !u(".pill .w").hidden);
    assert.strictEqual(u(".pill .w").textContent, "153 W");
    assert(u(".pill .w ha-icon").hidden, "no second plug glyph beside the toggle");
    // Printer off, strip on: just the watts – no toggle (Power on below does that), no glow.
    uc.hass = hass(ups(false, true, 12));
    assert.strictEqual(nm(ur), "Voron · Off");
    assert(!u(".pill").hidden, "watts stay while the strip is on");
    assert(!u(".pill").classList.contains("on"), "no glow while the printer is off");
    assert(u(".pill .tog").hidden, "no toggle while the printer is off");
    assert(!u(".pill .w").hidden && !u(".pill .w ha-icon").hidden, "the watts lead with the plug glyph");
    assert.strictEqual(u(".pill .w").textContent, "12 W");
    eq([...ur.querySelectorAll(".act")].map((b) => b.textContent), ["Power on"]);
    u(".pill .w").click();
    eq(t.events.splice(0), [["more-info", "sensor.tasmota_energy_power_2"]]);
    assert.strictEqual(calls.length, 0, "the watts never switch anything");
    // Strip off too: nothing to show.
    uc.hass = hass(ups(false, false, 0));
    assert(u(".pill").hidden, "no pill while the strip is off");
    // Back on: the toggle and the glow return, the extra glyph goes.
    uc.hass = hass(ups(true, true, 140));
    assert(!u(".pill .tog").hidden && u(".pill").classList.contains("on") && u(".pill .w ha-icon").hidden);
    assert.strictEqual(u(".pill .w").textContent, "140 W");
    // Without power_sensor_switch nothing changes: no pill at all while the printer's plug is off.
    card.hass = hass(states({ "switch.voron": { state: "off", attributes: {} }, "sensor.tasmota_energy_power_2": { state: "12", attributes: {} } }));
    assert(q(".pill").hidden);
    card.hass = hass(states());
    // An unknown power reading: the toggle alone.
    uc.hass = hass(ups(true, true, "unavailable"));
    assert(!u(".pill .tog").hidden && u(".pill .w").hidden);
    uc.remove();
  }

  // Without a power-off script there are no buttons; without energy_today three stats.
  const bare = mount({ prefix: "voron" }, states());
  eq([...bare.shadowRoot.querySelectorAll(".act")].map((b) => b.textContent), []);
  assert.strictEqual(bare.shadowRoot.querySelectorAll(".stats b").length, 3);
  assert(!bare.shadowRoot.querySelector(".pill"));
  assert.strictEqual(nm(bare.shadowRoot), "Printer · Ready");

  // Chamber light (a Klipper output pin, 0–100): a third button, glows while on, toggles at once.
  const LED = "number.voron_output_pin_chamber_leds";
  const led = (v) => ({ [LED]: { state: String(v), attributes: { min: 0, max: 100, step: 1 } } });
  calls.length = 0;
  const lc = mount({ ...cfg, light: LED }, states(led(25)));
  const lr = lc.shadowRoot;
  const lacts = () => [...lr.querySelectorAll(".act")].map((x) => x.textContent);
  eq(lacts(), ["Power off", "Light 25%"]);
  const lb = lr.querySelector(".act.light");
  assert(lb.classList.contains("on"));
  assert.strictEqual(lb.querySelector("ha-icon").getAttribute("icon"), "mdi:led-strip-variant");
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
  eq(lacts(), ["Light"], "full brightness shows no %; the light is the only button while printing");
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

    // Compact layout: one row, wrapping text, progress bar while printing, the whole card navigates.
  {
    const cc = mount({ ...cfg, layout: "compact", navigation_path: "/lovelace/voron" }, states(printing()));
    const cr = cc.shadowRoot;
    assert(cr.querySelector("ha-card.compact"));
    assert(!cr.querySelector(".act") && !cr.querySelector(".camera"), "no buttons or camera in compact");
    assert.strictEqual(nm(cr), "Voron · Printing 62%");
    assert.strictEqual(cr.querySelector(".sc").textContent, "bracket_v3", "file on its own line, without .gcode");
    assert(/^1 h 23 min left · ends \d\d:\d\d$/.test(txt(cr.querySelector(".sc2"))), cr.querySelector(".sc2").textContent);
    assert.strictEqual(cr.querySelectorAll(".sc2 .p").length, 2, "each time stays whole");
    assert(!cr.querySelector(".cbar").hidden);
    assert.strictEqual(cr.querySelector(".cbar i").style.width, "62%");
    assert.strictEqual(cr.querySelector(".watts span").textContent, "142 W");
    const before = calls.length;
    cr.querySelector(".watts").click();
    await tick();
    assert.strictEqual(t.window.location.pathname, "/lovelace/voron", "a tap anywhere opens the Voron view");
    assert.strictEqual(calls.length, before, "and calls nothing");
    t.window.history.replaceState(null, "", "/lovelace/0");
    cr.querySelector(".sc").click();
    assert.strictEqual(t.window.location.pathname, "/lovelace/voron");
    const shape = cr.querySelector(".shape");
    cc.hass = hass(states());
    assert.strictEqual(cr.querySelector(".shape"), shape, "updated in place");
    assert.strictEqual(nm(cr), "Voron · Ready");
    assert(cr.querySelector(".cbar").hidden);
    assert.strictEqual(cr.querySelector(".sc2").textContent, "", "second line only while printing");
    cc.hass = hass(states({ "switch.voron": { state: "off", attributes: {} }, "sensor.tasmota_energy_power_2": { state: "0", attributes: {} } }));
    assert.strictEqual(nm(cr), "Voron · Off");
    assert.strictEqual(cr.querySelector(".sc").textContent, "Today 0.84 kWh");
    assert(cr.querySelector(".watts").hidden, "no watts while the plug is off");
    // Upstream plug: watts while the strip is on, neutral while the printer is off.
    const up = "switch.voron_master_plug";
    const uc = mount({ ...cfg, layout: "compact", power_sensor_switch: up }, states({ [up]: { state: "on", attributes: {} } }));
    const ur = uc.shadowRoot;
    assert(!ur.querySelector(".watts").hidden && !ur.querySelector(".watts").classList.contains("off"));
    assert.strictEqual(ur.querySelector(".watts span").textContent, "142 W");
    uc.hass = hass(states({ "switch.voron": { state: "off", attributes: {} }, [up]: { state: "on", attributes: {} }, "sensor.tasmota_energy_power_2": { state: "12", attributes: {} } }));
    assert.strictEqual(nm(ur), "Voron · Off");
    assert.strictEqual(ur.querySelector(".sc").textContent, "Today 0.84 kWh");
    assert(!ur.querySelector(".watts").hidden, "watts while the strip is on");
    assert(ur.querySelector(".watts").classList.contains("off"), "without the glow");
    assert.strictEqual(ur.querySelector(".watts span").textContent, "12 W");
    uc.hass = hass(states({ "switch.voron": { state: "off", attributes: {} }, [up]: { state: "off", attributes: {} }, "sensor.tasmota_energy_power_2": { state: "0", attributes: {} } }));
    assert(ur.querySelector(".watts").hidden, "none once the strip is off");
  }
console.log("printer-status-card: all tests passed");
  process.exit(0); // feed checks leave timers running
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
