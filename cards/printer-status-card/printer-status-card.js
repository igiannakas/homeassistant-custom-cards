/*
 * Printer status card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A Klipper / Moonraker printer at a glance: state and message, a power pill while
 * the plug is on (On and live watts – or just the watts, while an upstream plug that the
 * power sensor measures is on and the printer is off), the current job (thumbnail, progress, time left, finish time,
 * layer, filament, speed) or, when idle, today's energy and lifetime totals, your
 * camera card (only while the printer is reachable and the camera serves a picture), Power on
 * (plug off) or a safe Power off (idle), and an optional chamber light toggle (glows while
 * on; hold it for the light's more-info). Printer operations – homing, pause, resume,
 * cancel – are left to the printer itself on purpose. Power on, Power off and turning the
 * plug off always ask first (orange like the power pill; red only when cutting the plug would
 * end a print). Tap any value for its own more-info (the watts on the power pill too), or the
 * state circle for the printer's. Sensors are found from the Moonraker prefix (e.g. "voron").
 * Text is never cut off: names, file names and status lines wrap (status lines only between
 * their parts).
 * `layout: compact` is a one-row summary for an overview page (state, what matters now,
 * a progress bar while printing, live watts); a tap anywhere opens `navigation_path`.
 * See cards/printer-status-card/README.md for every option.
 */

const PSC_VERSION = "1.7.4";
const PSC_TAG = "printer-status-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  blue: "var(--blue-color, #2196f3)",
  amber: "var(--amber-color, #ffc107)",
  green: "var(--green-color, #4caf50)",
  red: "var(--red-color, #f44336)",
  orange: "var(--orange-color, #ff9800)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));

/* 1.383 h → "1 h 23 min", 0.75 h → "45 min", 3 h → "3 h" */
function dur(hours) {
  if (hours === null) return "–";
  const m = Math.max(0, Math.round(hours * 60));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
/* A clock time, en-GB: "15:42". */
const clock = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
/* A status line: each part stays whole (nowrap) and the line wraps only between parts, the dot
   staying with the part before it. A part is text, or {t, e} (opens entity e), or {t, free}
   (a file name, which may break anywhere). */
function line(list) {
  return list
    .map((p) => (typeof p === "string" ? { t: p } : p))
    .filter((p) => p && p.t)
    .map((p) => `<span class="${p.free ? "f" : "p"}"${p.e ? ` data-e="${esc(p.e)}"` : ""}>${esc(p.t)}</span>`)
    .join("&nbsp;· ");
}
/* "4825h 49m 38s" → 4826 */
function hoursFrom(text) {
  const t = String(text || "");
  const hh = t.match(/(\d+)\s*h/);
  const mm = t.match(/(\d+)\s*m/);
  if (!hh && !mm) return null; // "unavailable" while the printer boots or shuts down
  return Math.round(Number(hh?.[1] || 0) + Number(mm?.[1] || 0) / 60);
}

const STATES = {
  off: { word: "Off", color: C.grey, icon: "mdi:printer-3d-off" },
  ready: { word: "Ready", color: C.grey, icon: "mdi:printer-3d" },
  printing: { word: "Printing", color: C.blue, icon: "mdi:printer-3d-nozzle" },
  paused: { word: "Paused", color: C.amber, icon: "mdi:pause-circle-outline" },
  complete: { word: "Complete", color: C.green, icon: "mdi:check-circle-outline" },
  cancelled: { word: "Cancelled", color: C.grey, icon: "mdi:close-circle-outline" },
  error: { word: "Error", color: C.red, icon: "mdi:alert-circle-outline" },
  // Plug on but Klipper/Moonraker not answering: booting, or shutting down before the plug cuts.
  busy: { word: "Please wait", color: C.grey, icon: "mdi:timer-sand" },
};

/* Everything the card shows. */
function model(hass, cfg) {
  const p = cfg.prefix || "printer";
  const st = (id) => (id ? hass.states[id] : undefined);
  const s = (key) => st(`sensor.${p}_${key}`)?.state;
  const plug = st(cfg.power_switch);
  const plugOn = !plug || plug.state === "on";
  const job = String(s("current_print_state") || "").toLowerCase();
  const printer = String(s("printer_state") || "").toLowerCase();

  let key = "ready";
  if (!plugOn) key = "off";
  else if (["error", "shutdown"].includes(printer) || job === "error") key = "error";
  else if (["printing", "paused", "complete", "cancelled"].includes(job)) key = job;
  else if (!printer || printer === "unavailable" || printer === "unknown" || printer === "startup") key = "busy";
  // Why we are waiting: the safe power-off script is running, Klipper is starting, or no answer yet.
  const off = cfg.power_off_script && cfg.power_off_script.startsWith("script.") ? st(cfg.power_off_script) : undefined;
  const busyMsg = off?.state === "on" ? "Shutting down" : printer === "startup" ? "Klipper is starting" : "Waiting for the printer";

  const msg = [s("current_display_message"), s("printer_message")].find((x) => x && !["unknown", "unavailable"].includes(x)) || "";
  const watts = num(st(cfg.power_sensor)?.state);
  // The watts are live while the circuit the power sensor measures is on: normally the printer's
  // own plug, or an upstream plug (power_sensor_switch, e.g. a strip that also feeds a dryer and a
  // screen), whose reading is worth showing even while the printer itself is off.
  const meterOn = cfg.power_sensor_switch ? st(cfg.power_sensor_switch)?.state === "on" : plugOn;
  const eta = st(`sensor.${p}_print_eta`)?.state;
  const etaDate = eta && !["unknown", "unavailable"].includes(eta) ? new Date(eta) : null;
  return {
    key,
    state: STATES[key],
    // Off: the state word already says so ("Voron · Off"), so no line under it.
    message: !plugOn ? "" : key === "busy" ? busyMsg : msg,
    plug: plug ? { on: plugOn, watts, live: meterOn && watts !== null } : null,
    file: s("filename") && !["unknown", "unavailable"].includes(s("filename")) ? s("filename") : "",
    progress: num(s("progress")),
    left: num(s("print_time_left")),
    eta: etaDate && !isNaN(etaDate) ? clock(etaDate) : "",
    layer: num(s("current_layer")),
    layers: num(s("total_layer")),
    filament: num(s("filament_used")),
    speed: num(s("print_speed")),
    today: num(st(cfg.energy_today)?.state),
    jobs: num(s("totals_jobs")),
    hours: hoursFrom(s("totals_print_time")),
    km: num(s("totals_filament_used")) === null ? null : num(s("totals_filament_used")) / 1000,
    // The job's file in the address: the camera's token only rotates every 5 minutes and Safari
    // reuses a picture it has loaded for the same address, so a new job showed the last one's.
    thumb: (() => {
      const pic = st(cfg.thumbnail || `camera.${p}_thumbnail`)?.attributes?.entity_picture;
      const f = s("filename");
      if (!pic) return "";
      return f && !["unknown", "unavailable"].includes(f) ? `${pic}${pic.includes("?") ? "&" : "?"}v=${encodeURIComponent(f)}` : pic;
    })(),
    light: lightModel(st(cfg.light), cfg.light),
    // For the compact layout: when the last job ended, chamber temperature, MMU lanes loaded.
    ended: (() => {
      const t = st(`sensor.${p}_current_print_state`)?.last_changed;
      const d = t ? new Date(t) : null;
      return d && !isNaN(d) ? clock(d) : "";
    })(),
    chamber: num(st(cfg.chamber_sensor || `sensor.${p}_heater_chamber_temperature`)?.state),
    lanes: (() => {
      const entries = [];
      for (let n = 0; n < 32 && hass.states[`binary_sensor.${p}_mmu_entry_${n}`]; n++) entries.push(hass.states[`binary_sensor.${p}_mmu_entry_${n}`]);
      const known = entries.filter((e) => ["on", "off"].includes(e.state));
      return known.length ? { loaded: known.filter((e) => e.state === "on").length, total: entries.length } : null;
    })(),
  };
}

/* Compact layout: the state word, the line under it (status-line parts, see line()), and
   whether to show a progress bar. */
function compactText(m, cfg) {
  const file = { t: m.file.replace(/\.gcode$/i, ""), free: true };
  const pct = m.progress === null ? "" : ` ${Math.round(m.progress)}%`;
  const msg = { t: m.message, free: true };
  if (m.key === "printing" || m.key === "paused") {
    // The file gets its own line (it may wrap); the times stay together on the next one.
    return {
      word: `${m.state.word}${pct}`,
      line: [file],
      line2: [m.left === null ? "" : `${dur(m.left)} left`, m.eta ? `ends ${m.eta}` : ""],
      bar: true,
    };
  }
  if (m.key === "complete") return { word: m.state.word, line: [file, m.ended ? `finished ${m.ended}` : ""] };
  if (m.key === "cancelled") return { word: m.state.word, line: [file] };
  if (m.key === "off") return { word: m.state.word, line: [cfg.energy_today && m.today !== null ? `Today ${fmt(m.today, 2)} kWh` : ""] };
  if (m.key === "ready") {
    const bits = [m.chamber === null ? "" : `Chamber ${fmt(m.chamber)}°`, m.lanes ? `${m.lanes.loaded} of ${m.lanes.total} loaded` : ""].filter(Boolean);
    return { word: m.state.word, line: bits.length ? bits : [msg] };
  }
  return { word: m.state.word, line: [msg] };
}

/* Chamber light: a light / switch / input_boolean, or a 0–100 number (a Klipper output pin). */
function lightModel(s, id) {
  if (!s || ["unavailable", "unknown"].includes(s.state)) return null;
  const domain = String(id).split(".")[0];
  if (domain === "number" || domain === "input_number") {
    const v = num(s.state);
    const max = num(s.attributes?.max) || 100;
    return { on: (v || 0) > 0, level: v === null ? null : Math.round((v / max) * 100), value: v, max, numeric: true };
  }
  const b = num(s.attributes?.brightness);
  return { on: s.state === "on", level: s.state === "on" && b !== null ? Math.round((b / 255) * 100) : null, numeric: false };
}

/* Which power buttons fit the state: [key, label, icon]. Printer operations (home, pause,
   resume, cancel) are deliberately not here – they are done on the printer. Both power
   buttons are orange, like the power pill (orange means power). */
function actions(key) {
  if (key === "off") return [["poweron", "Power on", "mdi:power"]];
  if (["printing", "paused", "busy"].includes(key)) return [];
  return [["poweroff", "Power off", "mdi:power"]];
}

/* ------------------------------------------------------------------------ */
/* Confirmation dialog – same look as the other cards' dialogs              */
/* ------------------------------------------------------------------------ */

const DIALOG_CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px;
    border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  /* The text sits under the title, starting on its line (8 + 42px glyph + 6px gap). No printer
     name: the dialog opens from the printer's own card. */
  .text { margin: 12px 0 0 56px; font-size: 15px; line-height: 21px; color: var(--secondary-text-color); }
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); display: grid; gap: 8px; }
  button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  button.confirm { color: #fff; }
  button.confirm .glyph { background: rgba(255,255,255,.2); }
  button.confirm .glyph ha-icon { color: #fff; }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button:active { filter: brightness(.92); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

function confirmDialog({ title, icon, color, text, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("psc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="text">${esc(text)}</div>
        <div class="buttons">
          <button class="confirm" style="background:${color}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
          <button class="cancel"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
        </div></div>`;
    const done = (ok) => {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => done(false));
    root.querySelector(".cancel").addEventListener("click", () => done(false));
    root.querySelector(".confirm").addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    root.querySelector(".confirm").focus();
  });
}

/* ------------------------------------------------------------------------ */

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Compact layout (overview page): one row, icon and watts centred on the whole text block
     (which may wrap to two lines and carry a progress bar). The whole card is one tap target. */
  ha-card.compact { padding: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  ha-card.compact:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
  .crow { display: flex; align-items: center; gap: 10px; }
  /* A job progress bar is 8px, here as on the full card. */
  .cbar { height: 8px; border-radius: 4px; margin-top: 6px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); overflow: hidden; }
  .cbar[hidden], .sc:empty { display: none; }
  .cbar i { display: block; height: 100%; border-radius: 4px; background: var(--c, ${C.blue}); transition: width 300ms; }
  .watts { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px 0 10px; border-radius: 18px;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
    background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .watts[hidden] { display: none; }
  .watts ha-icon { --mdc-icon-size: 18px; color: ${C.orange}; }
  /* Printer off, upstream plug on: the reading stays, without the glow (glow means active). */
  .watts.off { background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color); }
  .watts.off ha-icon { color: ${C.grey}; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 10px; container-type: inline-size; }
  .head { display: flex; align-items: center; gap: 10px; padding: 0 0 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  /* The state circle opens the printer's more-info, like the vacuum's (a tinted circle = tap target). */
  .head .shape { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .txt { flex: 1; min-width: 0; }
  /* Text is never cut off: a line too long for its box wraps instead. "Name · State" breaks only
     before the state word, the dot staying with the name. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .nm .st { font-weight: 400; color: var(--secondary-text-color); }
  .nm .w { white-space: nowrap; }
  /* Status lines wrap only between their parts ("1 h 23 min left" stays whole); a file name or a
     message may break anywhere. */
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .p { white-space: nowrap; }
  .f { overflow-wrap: anywhere; }
  .pill { flex: none; display: inline-flex; align-items: stretch; height: 36px; border-radius: 18px;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color); }
  .pill button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    -webkit-tap-highlight-color: transparent; }
  .pill .tog { padding: 0 12px 0 10px; }
  .pill .w { padding: 0 14px 0 10px; border-left: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
  .pill[hidden], .pill button[hidden], .pill ha-icon[hidden] { display: none; }
  .pill .tog:has(+ .w[hidden]) { padding-right: 14px; }
  /* Watts only (printer off, upstream plug on): no toggle, so no divider; the plug glyph leads. */
  .pill .tog[hidden] + .w { border-left: none; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .pill.on { background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .pill.on ha-icon { color: ${C.orange}; }
  [data-e] { cursor: pointer; }
  .jt [data-e], .txt [data-e] { border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  /* The stats are split by straight 1px dividers (like the maintenance numbers): no radius on the
     cells, or their left borders curve. */
  .stats [data-e] { -webkit-tap-highlight-color: transparent; }
  [data-e]:active { filter: brightness(.85); }
  .job { display: flex; gap: 10px; margin: 0 0 10px; }
  .thumb { flex: 0 0 64px; height: 64px; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05);
    display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: contain; }
  .thumb ha-icon { --mdc-icon-size: 30px; color: ${C.grey}; }
  .jt { flex: 1; min-width: 0; }
  /* "62%" and the times beside it; on a narrow card the times move under it rather than being cut. */
  .pct { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; font-size: 20px; line-height: 26px; font-weight: 600;
    color: var(--primary-text-color); }
  .pct .when { min-width: 0; font-size: 12px; line-height: 16px; font-weight: 400; letter-spacing: .4px; color: var(--secondary-text-color); }
  .pbar { height: 8px; border-radius: 4px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); margin: 4px 0 6px; overflow: hidden; }
  .pbar i { display: block; height: 100%; border-radius: 4px; transition: width 400ms; }
  .camera { margin: 0 0 10px; border-radius: 10px; overflow: hidden; }
  .camera:empty { display: none; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 10px; text-align: center; }
  .stats > button { all: unset; box-sizing: border-box; display: grid; min-width: 0; cursor: pointer; text-align: center;
    border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); -webkit-tap-highlight-color: transparent; }
  .stats > button:first-child { border-left: none; }
  .stats b { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; }
  .stats span { font-size: 11px; line-height: 14px; letter-spacing: .4px; color: var(--secondary-text-color); overflow-wrap: break-word; padding: 0 4px; }
  /* Button row: equal widths while every label fits, a longer label takes what it needs, and only
     if the row can't hold them all does one wrap. */
  .acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .acts:empty { display: none; }
  /* Primary pills: 36px, the height of the icon circle (one size for every main action). */
  .act { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: max-content; height: 36px; border-radius: 18px; padding: 0 14px 0 10px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .act ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  /* Power on and Power off: orange, like the power pill (orange means power). */
  .act.poweroff ha-icon, .act.poweron ha-icon { color: ${C.orange}; }
  /* Chamber light: glows while on, like a lit room on the lights card. */
  .act.light.on { background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .act.light.on ha-icon { color: ${C.orange}; }
  .act .lvl { font-weight: 400; opacity: .8; }
  .pill button:active, .act:active, .head .shape:active, .stats > button:active { filter: brightness(.92); }
  .pill button:focus-visible, .act:focus-visible, [data-e]:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes. A reading icon's glyph has its own side bearing inside its
   box (the thermometer 4px, the water drop 3.5px) and so does a leading "1"; each gets the
   margin that puts its ink under the title's first letter. The margin depends only on the glyph,
   not on where it sits, so it holds when a line wraps. */
const INK = { ctx: undefined, units: new Map() };
const inkCtx = () => {
  if (INK.ctx === undefined)
    INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  return INK.ctx;
};
const inkVisible = (el) => !el.hidden && getComputedStyle(el).display !== "none";
// The first thing drawn in el: a text node or an ha-icon.
function inkLead(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      if (n.textContent.trim()) return { text: n };
    } else if (n.nodeType === 1 && inkVisible(n)) {
      if (n.localName === "ha-icon") return { icon: n };
      const r = inkLead(n);
      if (r) return r;
    }
  }
  return null;
}
// Left side bearing (px) of a text node's first character, in its own font.
function inkText(node) {
  const ctx = inkCtx();
  if (!ctx) return null;
  const cs = getComputedStyle(node.parentElement);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
// Left side bearing (px) of an icon's glyph; null until the icon has loaded.
function inkIcon(hi) {
  const svg = hi.shadowRoot?.querySelector("ha-svg-icon")?.shadowRoot?.querySelector("svg");
  if (!svg) return null;
  const name = hi.getAttribute("icon") || "";
  let u = INK.units.get(name);
  if (u === undefined) {
    let b;
    try {
      b = (svg.querySelector("g") || svg).getBBox();
    } catch (e) {
      return null;
    }
    if (!b.width) return null;
    u = b.x / (svg.viewBox?.baseVal?.width || 24);
    if (name) INK.units.set(name, u);
  }
  return u * (parseFloat(getComputedStyle(svg).width) || 0);
}
const inkSet = (el, px) => {
  const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
  if (el.style.marginLeft !== v) el.style.marginLeft = v;
};
// Align every block (title line first, then its lines); false while an icon is still loading.
function inkAlign(blocks) {
  let done = true;
  for (const b of blocks) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t || !t.text) continue;
    const ref = inkText(t.text);
    if (ref === null) return true; // no canvas (tests): leave the layout alone
    for (const line of lines.slice(1)) {
      for (const hi of line.querySelectorAll(".v > ha-icon")) {
        const l = inkIcon(hi);
        if (l === null) done = false;
        else inkSet(hi, ref - l);
      }
      const lead = inkLead(line);
      if (lead && lead.text) inkSet(line, ref - inkText(lead.text));
    }
  }
  return done;
}
// Re-align after a render, once per frame; retries while icons load, then calls after().
function inkSchedule(host, selector, after) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    const root = host.shadowRoot;
    if (!root) return;
    const done = inkAlign(root.querySelectorAll(selector));
    if (after) after();
    host._inkTries = done ? 0 : (host._inkTries || 0) + 1;
    if (!done && host._inkTries < 20) setTimeout(() => inkSchedule(host, selector, after), 150);
  });
}

class PrinterStatusCard extends HTMLElement {
  static getStubConfig() {
    return { name: "Printer", prefix: "printer" };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "prefix", required: true, selector: { text: {} } },
        ] },
        { type: "grid", name: "", schema: [
          { name: "layout", selector: { select: { mode: "dropdown", options: [
            { value: "full", label: "Full (job, camera, buttons)" }, { value: "compact", label: "Compact (one row for an overview)" }] } } },
          { name: "navigation_path", selector: { text: {} } },
        ] },
        { name: "power_switch", selector: { entity: { domain: ["switch", "input_boolean"] } } },
        { type: "grid", name: "", schema: [
          { name: "power_sensor", selector: { entity: { domain: "sensor", device_class: "power" } } },
          { name: "energy_today", selector: { entity: { domain: "sensor", device_class: "energy" } } },
        ] },
        { name: "power_sensor_switch", selector: { entity: { domain: ["switch", "input_boolean"] } } },
        { name: "power_off_script", selector: { entity: { domain: ["script", "button"] } } },
        { type: "grid", name: "", schema: [
          { name: "light", selector: { entity: { domain: ["light", "switch", "input_boolean", "number", "input_number"] } } },
          { name: "light_name", selector: { text: {} } },
          { name: "light_off_name", selector: { text: {} } },
        ] },
        { name: "camera_card", selector: { object: {} } },
        { name: "camera_entity", selector: { entity: { domain: "camera" } } },
      ],
      computeLabel: (s) =>
        ({
          name: "Name",
          prefix: "Moonraker prefix (e.g. voron)",
          layout: "Layout",
          navigation_path: "Compact: tap opens (e.g. /lovelace/voron)",
          power_switch: "Power plug",
          power_sensor: "Power (W)",
          power_sensor_switch: "Plug the power sensor measures (if upstream)",
          energy_today: "Energy today (kWh)",
          power_off_script: "Safe power-off script",
          camera_card: "Camera card (YAML)",
          camera_entity: "Camera to check (default: from the camera card)",
          light: "Chamber light",
          light_name: "Light button label",
          light_off_name: "Light button label while off",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          prefix: "Finds sensor.<prefix>_current_print_state, _printer_state, _progress, _filename …",
          camera_card: "Any card, shown inside this one, e.g. type: custom:frigate-card with your printer camera.",
          power_sensor_switch: "When the watts come from an upstream plug that also feeds other things (e.g. a strip), the watts show whenever it is on – even with the printer off. Default: the power plug.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.prefix) throw new Error("Set the Moonraker prefix (e.g. voron)");
    this._config = { ...config };
    this._built = false;
    this._cameraEl = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    if (this._cameraEl) this._cameraEl.hass = hass;
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  _buildCompact() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card class="compact" role="button" tabindex="0">
      <div class="crow"><div class="shape"><ha-icon></ha-icon></div>
        <div class="txt"><div class="nm"></div><div class="sc"></div><div class="sc sc2"></div><div class="cbar" hidden><i></i></div></div>
        <span class="watts" hidden><ha-icon icon="mdi:power-plug"></ha-icon><span></span></span></div></ha-card>`;
    const card = root.querySelector("ha-card");
    const go = () => {
      const path = this._config.navigation_path;
      if (path) {
        history.pushState(null, "", path);
        this.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false }, bubbles: true, composed: true }));
      } else {
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: `sensor.${this._config.prefix}_current_print_state` }, bubbles: true, composed: true }));
      }
    };
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
    this._built = true;
  }

  _renderCompact(m) {
    const root = this.shadowRoot;
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (n && (html ? n._h !== v : n.textContent !== v)) html ? ((n.innerHTML = v), (n._h = v)) : (n.textContent = v);
    };
    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    const t = compactText(m, this._config);
    set(".nm", `${esc(this._config.name || "Printer")}<span class="st">&nbsp;· <span class="w">${esc(t.word)}</span></span>`, true);
    set(".sc:not(.sc2)", line(t.line), true);
    set(".sc2", line(t.line2 || []), true);
    const bar = root.querySelector(".cbar");
    bar.hidden = !t.bar;
    if (t.bar) {
      const w = `${Math.max(0, Math.min(100, m.progress || 0))}%`;
      if (bar.firstElementChild.style.width !== w) bar.firstElementChild.style.width = w;
      bar.style.setProperty("--c", m.state.color);
    }
    const watts = root.querySelector(".watts");
    const showW = !!m.plug?.live;
    watts.hidden = !showW;
    watts.classList.toggle("off", !m.plug?.on);
    if (showW) set(".watts span", `${fmt(m.plug.watts)} W`);
  }

  _build() {
    if (this._config.layout === "compact") return this._buildCompact();
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const stateId = `sensor.${esc(this._config.prefix)}_current_print_state`;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="head"><div class="shape" data-e="${stateId}" role="button" tabindex="0" aria-label="Printer details"><ha-icon></ha-icon></div>
        <div class="txt" data-e="${stateId}" role="button" tabindex="0"><div class="nm"></div><div class="sc msg"></div></div>
        ${this._config.power_switch ? `<div class="pill"><button class="tog"><ha-icon icon="mdi:power-plug"></ha-icon><span></span></button><button class="w"${this._config.power_sensor ? ` data-e="${esc(this._config.power_sensor)}"` : ""}><ha-icon icon="mdi:power-plug" hidden></ha-icon><span></span></button></div>` : ""}</div>
      <div class="job"><div class="thumb" data-e="${esc(this._config.thumbnail || `camera.${this._config.prefix}_thumbnail`)}"><ha-icon icon="mdi:cube-outline"></ha-icon></div>
        <div class="jt"><div class="pct"></div><div class="pbar"><i></i></div><div class="sc l1"></div><div class="sc l2"></div></div></div>
      <div class="camera"></div>
      <div class="stats"></div>
      <div class="acts"></div></ha-card>`;
    root.querySelector(".pill .tog")?.addEventListener("click", () => this._togglePlug());
    // Any value opens its own entity.
    const card = root.querySelector("ha-card");
    const open = (e) => {
      const v = e.target.closest("[data-e]");
      if (v) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: v.dataset.e }, bubbles: true, composed: true }));
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".txt, .shape")) {
        e.preventDefault();
        open(e);
      }
    });
    this._built = true;
    this._actKeys = null;
    this._cameraEl = null;
  }

  /* The camera card is shown only while there is something to show: the printer is reachable
     (plug on and Moonraker's printer_state not unavailable) and the camera actually serves a
     picture. The camera entity's own state can't tell (it stays "idle" with the printer off),
     so the card asks Home Assistant for a still image: OK → show; error → hide. It re-checks
     every 15 s while hidden and every 60 s while shown. */
  _cameraEntity() {
    const c = this._config.camera_card || {};
    return this._config.camera_entity || c.camera_entity || c.entity || c.cameras?.[0]?.camera_entity || "";
  }

  _syncCamera(up) {
    if (!this._config.camera_card) return;
    if (!up) {
      this._feedOk = false;
      clearTimeout(this._probeTimer);
      this._probeTimer = null;
    } else if (!this._probeTimer && !this._probing) {
      this._probe();
    }
    const show = up && this._feedOk;
    if (show && !this._cameraEl && !this._cameraPending) this._mountCamera();
    if (!show && (this._cameraEl || this._cameraPending)) {
      this._cameraGen = (this._cameraGen || 0) + 1; // drop a mount still in flight
      this._cameraPending = false;
      this._cameraEl = null;
      this.shadowRoot.querySelector(".camera").replaceChildren();
    }
  }

  async _probe() {
    clearTimeout(this._probeTimer);
    this._probeTimer = null;
    this._probing = true;
    let ok = false;
    const id = this._cameraEntity();
    try {
      if (!id || typeof this._hass?.fetchWithAuth !== "function") ok = true; // nothing to test: trust the printer state
      else {
        const r = await this._hass.fetchWithAuth(`/api/camera_proxy/${id}?width=64&_=${Date.now()}`);
        ok = !!r && r.ok && String(r.headers?.get?.("content-type") || "image").startsWith("image");
      }
    } catch (e) {
      ok = false;
    }
    if (!this.isConnected || !this._printerUp) {
      this._probing = false;
      return;
    }
    this._feedOk = ok;
    // Schedule the next check before re-syncing, so the sync never starts a second probe.
    this._probeTimer = setTimeout(() => this._probe(), ok ? 60000 : 15000);
    this._probing = false;
    this._syncCamera(true);
  }

  disconnectedCallback() {
    clearTimeout(this._probeTimer);
    this._probeTimer = null;
  }

  async _mountCamera() {
    const cfg = this._config.camera_card;
    if (!cfg) return;
    const gen = (this._cameraGen = (this._cameraGen || 0) + 1);
    this._cameraPending = true;
    try {
      const helpers = await window.loadCardHelpers?.();
      if (!helpers || gen !== this._cameraGen) return;
      const el = helpers.createCardElement(cfg);
      el.hass = this._hass;
      this._cameraEl = el;
      this.shadowRoot.querySelector(".camera").replaceChildren(el);
    } catch (e) {
      /* camera card not available – the rest of the card works without it */
    } finally {
      if (gen === this._cameraGen) this._cameraPending = false;
    }
  }

  _render() {
    inkSchedule(this, ".txt, .jt");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const m = model(this._hass, this._config);
    this._m = m;
    if (this._config.layout === "compact") return this._renderCompact(m);
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (!n) return;
      if (html ? n._h !== v : n.textContent !== v) html ? ((n.innerHTML = v), (n._h = v)) : (n.textContent = v);
    };

    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    // Name · state; on a narrow card the state word wraps whole, the dot staying with the name.
    set(".nm", `${esc(this._config.name || "Printer")}<span class="st">&nbsp;· <span class="w">${esc(m.state.word)}</span></span>`, true);
    const active = ["printing", "paused", "complete", "cancelled"].includes(m.key) && m.file;
    set(".msg", active ? m.file : m.message);

    const pill = root.querySelector(".pill");
    if (pill && m.plug) {
      // The toggle only while the plug is on (when it is off the Power on button below takes over);
      // the watts whenever they are live – with an upstream power_sensor_switch, also while the
      // printer is off, then on their own and without the glow.
      const tog = pill.querySelector(".tog");
      const w = pill.querySelector(".w");
      pill.hidden = !m.plug.on && !m.plug.live;
      pill.classList.toggle("on", m.plug.on);
      if (tog.hidden !== !m.plug.on) tog.hidden = !m.plug.on;
      if (w.hidden !== !m.plug.live) w.hidden = !m.plug.live;
      const wIcon = w.querySelector("ha-icon");
      if (wIcon.hidden !== m.plug.on) wIcon.hidden = m.plug.on;
      set(".pill .tog span", m.plug.on ? "On" : "Off");
      set(".pill .w span", m.plug.live ? `${fmt(m.plug.watts)} W` : "");
      tog.setAttribute("aria-pressed", String(m.plug.on));
    }

    // Current job (printing, paused, or the last one that finished).
    const job = root.querySelector(".job");
    job.style.display = active ? "" : "none";
    if (active) {
      const pct = m.progress === null ? 0 : Math.max(0, Math.min(100, m.progress));
      const p = this._config.prefix;
      const e = (key, t) => ({ t, e: `sensor.${p}_${key}` });
      // "1 h 23 min left · ends 15:42" while it runs ("ends", so a time is never read as done);
      // the state word once it has finished.
      const when =
        m.key === "complete" || m.key === "cancelled"
          ? [m.state.word]
          : [e("print_time_left", `${dur(m.left)} left`), m.eta ? e("print_eta", `ends ${m.eta}`) : ""];
      set(".pct", `${line([e("progress", `${fmt(pct)}%`)])}<span class="when">${line(when)}</span>`, true);
      const bar = root.querySelector(".pbar i");
      bar.style.width = `${pct}%`;
      bar.style.background = m.state.color;
      set(".l1", line([m.layers ? e("current_layer", `Layer ${fmt(m.layer)} / ${fmt(m.layers)}`) : "", m.filament !== null ? e("filament_used", `${fmt(m.filament, 1)} m filament`) : ""]), true);
      set(".l2", m.key === "printing" && m.speed !== null ? line([e("print_speed", `${fmt(m.speed)} mm/s`)]) : "", true);
      const thumb = root.querySelector(".thumb");
      if (m.thumb && thumb.dataset.src !== m.thumb) {
        thumb.dataset.src = m.thumb;
        thumb.innerHTML = `<img alt="" src="${esc(m.thumb)}">`;
        thumb.querySelector("img").addEventListener("error", () => (thumb.innerHTML = `<ha-icon icon="mdi:cube-outline"></ha-icon>`));
      }
    }

    // Idle: today's energy and lifetime totals.
    const stats = root.querySelector(".stats");
    stats.style.display = active ? "none" : "";
    if (!active) {
      const cells = [];
      const p = this._config.prefix;
      if (this._config.energy_today) cells.push([m.today === null ? "–" : `${fmt(m.today, 2)} kWh`, "Today", this._config.energy_today]);
      cells.push(
        [fmt(m.jobs), "Prints", `sensor.${p}_totals_jobs`],
        [m.hours === null ? "–" : `${fmt(m.hours)} h`, "Printed", `sensor.${p}_totals_print_time`],
        [m.km === null ? "–" : `${fmt(m.km, 1)} km`, "Filament", `sensor.${p}_totals_filament_used`],
      );
      stats.style.gridTemplateColumns = `repeat(${cells.length}, minmax(0, 1fr))`;
      set(".stats", cells.map(([b, s, id]) => `<button data-e="${esc(id)}"><b>${esc(b)}</b><span>${esc(s)}</span></button>`).join(""), true);
    }

    // Buttons for this state (rebuilt only when the set changes, so taps are never lost).
    // Printer reachable: plug on and Moonraker answering (printer_state not unavailable/unknown).
    const ps = String(this._hass.states[`sensor.${this._config.prefix}_printer_state`]?.state || "unavailable");
    this._printerUp = m.key !== "off" && !["unavailable", "unknown"].includes(ps);
    this._syncCamera(this._printerUp);
    const acts = actions(m.key).filter(([k]) => (k !== "poweroff" || this._config.power_off_script) && (k !== "poweron" || this._config.power_switch));
    if (m.light) acts.push(["light", "", ""]);
    const keys = acts.map((a) => a[0]).join();
    if (keys !== this._actKeys) {
      const box = root.querySelector(".acts");
      box.innerHTML = acts
        .map(([k, label, icon]) =>
          k === "light"
            ? `<button class="act light" data-k="light"><ha-icon></ha-icon><span class="lbl"></span></button>`
            : `<button class="act ${k}" data-k="${k}"><ha-icon icon="${icon}"></ha-icon>${esc(label)}</button>`,
        )
        .join("");
      box.querySelectorAll(".act").forEach((b) => (b.dataset.k === "light" ? this._bindLight(b) : b.addEventListener("click", () => this._action(b.dataset.k))));
      this._actKeys = keys;
    }

    // Chamber light: state, icon and label update in place.
    const lb = root.querySelector(".act.light");
    if (lb && m.light) {
      if (m.light.on && m.light.numeric && m.light.value > 0) this._lastLight = m.light.value;
      lb.classList.toggle("on", m.light.on);
      lb.setAttribute("aria-pressed", String(m.light.on));
      const icon = m.light.on ? "mdi:led-strip-variant" : "mdi:led-strip-variant-off";
      const ic = lb.querySelector("ha-icon");
      if (ic.getAttribute("icon") !== icon) ic.setAttribute("icon", icon);
      // The state in words, not only the glow: "Light 40%" while on, "Light off" while off.
      const name = this._config.light_name || "Light";
      const lvl = m.light.on && m.light.level !== null && m.light.level < 100 ? ` <span class="lvl">${m.light.level}%</span>` : "";
      set(".act.light .lbl", m.light.on ? `${esc(name)}${lvl}` : esc(this._config.light_off_name || `${name} off`), true);
    }
  }

  /* Tap toggles the light at once (no confirmation – it is harmless); hold opens its more-info. */
  _bindLight(b) {
    let timer = null;
    let held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        held = true;
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: this._config.light }, bubbles: true, composed: true }));
      }, 500);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => b.addEventListener(t, cancel));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    b.addEventListener("touchend", (e) => held && e.preventDefault());
    b.addEventListener("click", () => {
      if (held) {
        held = false;
        return;
      }
      this._toggleLight();
    });
  }

  _toggleLight() {
    const id = this._config.light;
    const l = this._m?.light;
    if (!id || !l) return;
    const [domain] = id.split(".");
    const what = `turn ${l.on ? "off" : "on"} ${this._hass.states[id]?.attributes?.friendly_name || "the light"}`;
    if (l.numeric) {
      // A Klipper output pin: off is 0; on goes back to the last level seen, or light_on (default: full).
      const on = this._lastLight || num(this._config.light_on) || l.max;
      return this._call(domain, "set_value", { entity_id: id, value: l.on ? 0 : on }, what);
    }
    const svc = domain === "light" || domain === "switch" || domain === "input_boolean" ? domain : "homeassistant";
    return this._call(svc, l.on ? "turn_off" : "turn_on", { entity_id: id }, what);
  }

  /* Power on / Power off: orange both ways, like the power pill and the buttons. The dialog
     opens from the printer's own card, so it doesn't name the printer again. */
  async _action(k) {
    const name = this._config.name || "the printer";
    if (k === "poweron") {
      const ok = await confirmDialog({
        title: "Power on", icon: "mdi:power", color: C.orange,
        text: "The plug turns on and the printer starts up.", confirmLabel: "Power on",
      });
      if (!ok) return;
      const id = this._config.power_switch;
      const [domain] = id.split(".");
      return this._call(domain === "input_boolean" ? "input_boolean" : "switch", "turn_on", { entity_id: id }, `power on ${name}`);
    }
    if (k === "poweroff") {
      const ok = await confirmDialog({
        title: "Power off", icon: "mdi:power", color: C.orange,
        text: "The printer shuts down safely, then its plug turns off.", confirmLabel: "Power off",
      });
      if (ok) {
        const id = this._config.power_off_script;
        const [domain] = id.split(".");
        domain === "button"
          ? this._call("button", "press", { entity_id: id }, `power off ${name}`)
          : this._call("script", "turn_on", { entity_id: id }, `power off ${name}`);
      }
    }
  }

  /* Plug pill (shown only while on): off asks first – orange like the pill, red only while a
     print is running, because cutting the power would end it. */
  async _togglePlug() {
    const id = this._config.power_switch;
    const on = this._m?.plug?.on;
    const [domain] = id.split(".");
    if (!on) return this._action("poweron");
    const busy = ["printing", "paused"].includes(this._m.key);
    const ok = await confirmDialog({
      title: "Turn the plug off", icon: "mdi:power-plug-off", color: busy ? C.red : C.orange,
      text: busy
        ? "This ends the current print. The power goes at once, without a shutdown."
        : `The power goes at once, without a shutdown.${this._config.power_off_script ? " Power off shuts the printer down safely first." : ""}`,
      confirmLabel: "Turn off",
    });
    const plug = this._hass.states[id]?.attributes?.friendly_name || "the plug";
    if (ok) this._call(domain === "input_boolean" ? "input_boolean" : "switch", "turn_off", { entity_id: id }, `turn off ${plug}`);
  }

  /* HA's own message when it has one, else "Couldn't <what you tried>." – never an entity id. */
  async _call(domain, service, data, what = "do that") {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || `Couldn't ${what}.` }, bubbles: true, composed: true }));
    }
  }
}

async function registerPrinterStatusCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(PSC_TAG)) return;
  registry.define(PSC_TAG, PrinterStatusCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: PSC_TAG,
    name: "Printer status",
    description: "Klipper / Moonraker printer: state, power, current job or totals, camera and controls.",
  });
  console.info(`%c PRINTER-STATUS-CARD %c ${PSC_VERSION} `, "background:#2196f3;color:#fff", "");
}

registerPrinterStatusCard();
