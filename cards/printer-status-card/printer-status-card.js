/*
 * Printer status card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A Klipper / Moonraker printer at a glance: state and message, a power pill (plug
 * and live watts), the current job (thumbnail, progress, time left, finish time,
 * layer, filament, speed) or, when idle, today's energy and lifetime totals, your
 * camera card, and the buttons that make sense for the state. Cancel and power-off
 * always ask first. Sensors are found from the Moonraker prefix (e.g. "voron").
 * See cards/printer-status-card/README.md for every option.
 */

const PSC_VERSION = "1.0.0";
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

/* 1.383 h → "1h 23m" */
function hm(hours) {
  if (hours === null) return "–";
  const m = Math.max(0, Math.round(hours * 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
/* "4825h 49m 38s" → 4826 */
function hoursFrom(text) {
  const t = String(text || "");
  const h = Number((t.match(/(\d+)\s*h/) || [])[1] || 0);
  const m = Number((t.match(/(\d+)\s*m/) || [])[1] || 0);
  return t ? Math.round(h + m / 60) : null;
}

const STATES = {
  off: { word: "Off", color: C.grey, icon: "mdi:printer-3d-off" },
  ready: { word: "Ready", color: C.grey, icon: "mdi:printer-3d" },
  printing: { word: "Printing", color: C.blue, icon: "mdi:printer-3d-nozzle" },
  paused: { word: "Paused", color: C.amber, icon: "mdi:pause-circle-outline" },
  complete: { word: "Complete", color: C.green, icon: "mdi:check-circle-outline" },
  cancelled: { word: "Cancelled", color: C.grey, icon: "mdi:close-circle-outline" },
  error: { word: "Error", color: C.red, icon: "mdi:alert-circle-outline" },
  starting: { word: "Starting", color: C.grey, icon: "mdi:printer-3d" },
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
  else if (!printer || printer === "unavailable" || printer === "unknown" || printer === "startup") key = "starting";

  const msg = [s("current_display_message"), s("printer_message")].find((x) => x && !["unknown", "unavailable"].includes(x)) || "";
  const watts = num(st(cfg.power_sensor)?.state);
  const eta = st(`sensor.${p}_print_eta`)?.state;
  const etaDate = eta && !["unknown", "unavailable"].includes(eta) ? new Date(eta) : null;
  return {
    key,
    state: STATES[key],
    message: !plugOn ? "Power is off" : msg,
    plug: plug ? { on: plugOn, watts } : null,
    file: s("filename") && !["unknown", "unavailable"].includes(s("filename")) ? s("filename") : "",
    progress: num(s("progress")),
    left: num(s("print_time_left")),
    eta: etaDate && !isNaN(etaDate) ? etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
    layer: num(s("current_layer")),
    layers: num(s("total_layer")),
    filament: num(s("filament_used")),
    speed: num(s("print_speed")),
    today: num(st(cfg.energy_today)?.state),
    jobs: num(s("totals_jobs")),
    hours: hoursFrom(s("totals_print_time")),
    km: num(s("totals_filament_used")) === null ? null : num(s("totals_filament_used")) / 1000,
    thumb: st(cfg.thumbnail || `camera.${p}_thumbnail`)?.attributes?.entity_picture || "",
  };
}

/* Which buttons fit the state: [key, label, icon, confirm?] */
function actions(key) {
  if (key === "printing") return [["pause", "Pause", "mdi:pause"], ["cancel", "Cancel", "mdi:stop", true]];
  if (key === "paused") return [["resume", "Resume", "mdi:play"], ["cancel", "Cancel", "mdi:stop", true]];
  if (key === "off" || key === "starting") return [];
  return [["home", "Home", "mdi:home"], ["poweroff", "Power off", "mdi:power", true]];
}

/* ------------------------------------------------------------------------ */
/* Confirmation dialog – same look as the other cards' dialogs              */
/* ------------------------------------------------------------------------ */

const DIALOG_CSS = `
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
  .body { margin-top: 20px; }
  .primary { font-size: 17px; line-height: 24px; font-weight: 600; }
  .secondary { font-size: 15px; line-height: 21px; margin-top: 2px; }
  .buttons { margin-top: 20px; display: grid; gap: 8px; }
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

function confirmDialog({ title, icon, color, primary, secondary, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("psc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="row body"><div class="glyph"><ha-icon icon="mdi:printer-3d" style="color:${color}"></ha-icon></div>
          <div><div class="primary">${esc(primary)}</div><div class="secondary">${esc(secondary)}</div></div></div>
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
  :host { display: block; }
  ha-card { padding: 8px; container-type: inline-size; }
  .head { display: flex; align-items: center; gap: 10px; padding: 2px 2px 8px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { flex: 1; min-width: 0; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm .st { font-weight: 400; color: var(--secondary-text-color); }
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pill { all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; gap: 6px; height: 36px;
    padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; font-size: 13px; font-weight: 600; letter-spacing: .2px;
    white-space: nowrap; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .pill.on { background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .pill.on ha-icon { color: ${C.orange}; }
  .job { display: flex; gap: 10px; margin: 0 2px 8px; }
  .thumb { flex: 0 0 64px; height: 64px; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05);
    display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: contain; }
  .thumb ha-icon { --mdc-icon-size: 30px; color: ${C.grey}; }
  .jt { flex: 1; min-width: 0; }
  .pct { font-size: 20px; line-height: 26px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; }
  .pct span { font-size: 12px; font-weight: 400; letter-spacing: .4px; color: var(--secondary-text-color); margin-left: 8px; }
  .pbar { height: 8px; border-radius: 4px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); margin: 4px 0 6px; overflow: hidden; }
  .pbar i { display: block; height: 100%; border-radius: 4px; transition: width 400ms; }
  .camera { margin: 0 0 8px; border-radius: 10px; overflow: hidden; }
  .camera:empty { display: none; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 8px; text-align: center; }
  .stats > div { display: grid; min-width: 0; border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  .stats > div:first-child { border-left: none; }
  .stats b { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; }
  .stats span { font-size: 11px; line-height: 14px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .acts { display: grid; grid-template-columns: repeat(var(--n, 2), minmax(0, 1fr)); gap: 6px; }
  .acts:empty { display: none; }
  .act { all: unset; box-sizing: border-box; height: 44px; border-radius: 22px; cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .act ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .act.cancel ha-icon, .act.poweroff ha-icon { color: ${C.orange}; }
  .pill:active, .act:active { filter: brightness(.92); }
  .pill:focus-visible, .act:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

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
        { name: "power_switch", selector: { entity: { domain: ["switch", "input_boolean"] } } },
        { type: "grid", name: "", schema: [
          { name: "power_sensor", selector: { entity: { domain: "sensor", device_class: "power" } } },
          { name: "energy_today", selector: { entity: { domain: "sensor", device_class: "energy" } } },
        ] },
        { name: "power_off_script", selector: { entity: { domain: ["script", "button"] } } },
        { name: "camera_card", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({
          name: "Name",
          prefix: "Moonraker prefix (e.g. voron)",
          power_switch: "Power plug",
          power_sensor: "Power (W)",
          energy_today: "Energy today (kWh)",
          power_off_script: "Safe power-off script",
          camera_card: "Camera card (YAML)",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          prefix: "Finds sensor.<prefix>_current_print_state, _progress, _filename … and button.<prefix>_pause_print etc.",
          camera_card: "Any card, shown inside this one, e.g. type: custom:frigate-card with your printer camera.",
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

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="head"><div class="shape"><ha-icon></ha-icon></div>
        <div class="txt"><div class="nm"></div><div class="sc msg"></div></div>
        ${this._config.power_switch ? `<button class="pill"><ha-icon icon="mdi:power-plug"></ha-icon><span></span></button>` : ""}</div>
      <div class="job"><div class="thumb"><ha-icon icon="mdi:cube-outline"></ha-icon></div>
        <div class="jt"><div class="pct"></div><div class="pbar"><i></i></div><div class="sc l1"></div><div class="sc l2"></div></div></div>
      <div class="camera"></div>
      <div class="stats"></div>
      <div class="acts"></div></ha-card>`;
    root.querySelector(".pill")?.addEventListener("click", () => this._togglePlug());
    this._built = true;
    this._actKeys = null;
    this._mountCamera();
  }

  async _mountCamera() {
    const cfg = this._config.camera_card;
    if (!cfg) return;
    try {
      const helpers = await window.loadCardHelpers?.();
      if (!helpers) return;
      const el = helpers.createCardElement(cfg);
      el.hass = this._hass;
      this._cameraEl = el;
      this.shadowRoot.querySelector(".camera").replaceChildren(el);
    } catch (e) {
      /* camera card not available – the rest of the card works without it */
    }
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const m = model(this._hass, this._config);
    this._m = m;
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (!n) return;
      if (html ? n.innerHTML !== v : n.textContent !== v) html ? (n.innerHTML = v) : (n.textContent = v);
    };

    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    set(".nm", `${esc(this._config.name || "Printer")} <span class="st">· ${esc(m.state.word)}</span>`, true);
    const active = ["printing", "paused", "complete", "cancelled"].includes(m.key) && m.file;
    set(".msg", active ? m.file : m.message);

    const pill = root.querySelector(".pill");
    if (pill && m.plug) {
      pill.classList.toggle("on", m.plug.on);
      set(".pill span", m.plug.on ? `On${m.plug.watts === null ? "" : ` · ${fmt(m.plug.watts)} W`}` : "Off");
      pill.setAttribute("aria-pressed", String(m.plug.on));
    }

    // Current job (printing, paused, or the last one that finished).
    const job = root.querySelector(".job");
    job.style.display = active ? "" : "none";
    if (active) {
      const pct = m.progress === null ? 0 : Math.max(0, Math.min(100, m.progress));
      const when = m.key === "complete" ? "Done" : m.key === "cancelled" ? "Cancelled" : `${hm(m.left)} left${m.eta ? ` · done ${m.eta}` : ""}`;
      set(".pct", `${fmt(pct)}%<span>${esc(when)}</span>`, true);
      const bar = root.querySelector(".pbar i");
      bar.style.width = `${pct}%`;
      bar.style.background = m.state.color;
      set(".l1", [m.layers ? `Layer ${fmt(m.layer)} / ${fmt(m.layers)}` : "", m.filament !== null ? `${fmt(m.filament, 1)} m filament` : ""].filter(Boolean).join(" · "));
      set(".l2", m.key === "printing" && m.speed !== null ? `${fmt(m.speed)} mm/s` : "");
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
      if (this._config.energy_today) cells.push([`${fmt(m.today, 2)} kWh`, "today"]);
      cells.push([fmt(m.jobs), "prints"], [m.hours === null ? "–" : `${fmt(m.hours)} h`, "printed"], [m.km === null ? "–" : `${fmt(m.km, 1)} km`, "filament"]);
      stats.style.gridTemplateColumns = `repeat(${cells.length}, minmax(0, 1fr))`;
      set(".stats", cells.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join(""), true);
    }

    // Buttons for this state (rebuilt only when the set changes, so taps are never lost).
    const acts = actions(m.key).filter(([k]) => k !== "poweroff" || this._config.power_off_script);
    const keys = acts.map((a) => a[0]).join();
    if (keys !== this._actKeys) {
      const box = root.querySelector(".acts");
      box.style.setProperty("--n", String(acts.length || 1));
      box.innerHTML = acts.map(([k, label, icon]) => `<button class="act ${k}" data-k="${k}"><ha-icon icon="${icon}"></ha-icon>${esc(label)}</button>`).join("");
      box.querySelectorAll(".act").forEach((b) => b.addEventListener("click", () => this._action(b.dataset.k)));
      this._actKeys = keys;
    }
  }

  async _action(k) {
    const p = this._config.prefix;
    const name = this._config.name || "Printer";
    const press = (id) => this._call("button", "press", { entity_id: id });
    if (k === "pause") return press(`button.${p}_pause_print`);
    if (k === "resume") return press(`button.${p}_resume_print`);
    if (k === "home") return press(`button.${p}_home_all_axes`);
    if (k === "cancel") {
      const ok = await confirmDialog({
        title: "Cancel print", icon: "mdi:stop", color: C.orange, primary: this._m.file || name,
        secondary: `The print stops and cannot be resumed.`, confirmLabel: "Cancel print",
      });
      if (ok) press(`button.${p}_cancel_print`);
    }
    if (k === "poweroff") {
      const ok = await confirmDialog({
        title: "Power off", icon: "mdi:power", color: C.orange, primary: name,
        secondary: `${name} shuts down safely, then its plug turns off.`, confirmLabel: "Power off",
      });
      if (ok) {
        const [domain] = this._config.power_off_script.split(".");
        domain === "button" ? press(this._config.power_off_script) : this._call("script", "turn_on", { entity_id: this._config.power_off_script });
      }
    }
  }

  /* Plug: on straight away; off asks first (and warns while printing). */
  async _togglePlug() {
    const id = this._config.power_switch;
    const on = this._m?.plug?.on;
    const [domain] = id.split(".");
    if (!on) return this._call(domain === "input_boolean" ? "input_boolean" : "switch", "turn_on", { entity_id: id });
    const name = this._config.name || "Printer";
    const busy = ["printing", "paused"].includes(this._m.key);
    const ok = await confirmDialog({
      title: "Cut power", icon: "mdi:power-plug-off", color: busy ? C.red : C.orange, primary: name,
      secondary: busy
        ? `${name} is printing. Cutting power now ends the print.`
        : `The plug switches off at once, without a shutdown.${this._config.power_off_script ? " Use Power off for a safe shutdown." : ""}`,
      confirmLabel: "Turn plug off",
    });
    if (ok) this._call(domain === "input_boolean" ? "input_boolean" : "switch", "turn_off", { entity_id: id });
  }

  async _call(domain, service, data) {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || "That did not work" }, bubbles: true, composed: true }));
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
