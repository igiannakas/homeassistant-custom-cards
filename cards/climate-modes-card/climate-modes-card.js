/*
 * Climate modes card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Whole-house shortcuts in one card: a label row (icon, title, what the rooms are
 * on, or a switch) and a row of mode tiles. A tile glows in its colour while it is
 * the active mode. Made for heating presets across several thermostats, and just
 * as happy with any entity + state (e.g. an aircon speed helper). Any tap action can ask
 * first: add `confirmation` and the card shows its own confirm dialog (Bubble Card look,
 * texts may be templates), so no pop-up card is needed. With `status: activity` the label
 * row shows what the heating is doing instead of the mode: which rooms are calling for
 * heat, Idle, or a lock (e.g. summer mode) – and the icon follows.
 * See cards/climate-modes-card/README.md for every option.
 */

const CMC_VERSION = "1.3.2";
const CMC_TAG = "climate-modes-card";

const NAMED = ["red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan", "teal", "green", "light-green",
  "lime", "yellow", "amber", "orange", "deep-orange", "brown", "grey", "blue-grey"];
const FALLBACK = { cyan: "#00bcd4", blue: "#2196f3", purple: "#9c27b0", amber: "#ffc107", red: "#f44336", orange: "#ff9800",
  teal: "#009688", green: "#4caf50", grey: "#9e9e9e", "light-blue": "#03a9f4", indigo: "#3f51b5", "deep-purple": "#673ab7" };
const color = (c) => (!c ? `var(--grey-color, #9e9e9e)` : NAMED.includes(c) ? `var(--${c}-color, ${FALLBACK[c] || "#9e9e9e"})` : c);
const GREY = color("grey");
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

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

/* Render a Home Assistant template once (titles and texts may be templates). */
function renderTemplate(hass, tpl) {
  const t = String(tpl ?? "");
  if (!/\{[{%]/.test(t) || !hass?.connection?.subscribeMessage) return Promise.resolve(t);
  return new Promise((resolve) => {
    let finished = false;
    let unsub;
    const finish = (v) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      Promise.resolve(unsub).then((u) => typeof u === "function" && u()).catch(() => {});
      resolve(String(v ?? ""));
    };
    const timer = setTimeout(() => finish(""), 4000);
    unsub = hass.connection.subscribeMessage((msg) => finish(msg?.result), { type: "render_template", template: t, report_errors: false });
    Promise.resolve(unsub).catch(() => finish(""));
  });
}

/* Confirm dialog in the Bubble Card look. Resolves true (confirm) or false (cancel). */
function confirmDialog({ title, icon, col, subjectIcon, subject, text, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("cmc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(col, 20)}"><ha-icon icon="${esc(icon)}" style="color:${col}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        ${subject || text ? `<div class="row body"><div class="glyph"><ha-icon icon="${esc(subjectIcon)}" style="color:${col}"></ha-icon></div>
          <div>${subject ? `<div class="primary">${esc(subject)}</div>` : ""}${text ? `<div class="secondary">${esc(text)}</div>` : ""}</div></div>` : ""}
        <div class="buttons">
          <button class="confirm" style="background:${col}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
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

/* What the heating is doing: locked (e.g. summer mode), rooms calling for heat, or idle. */
function activity(hass, cfg) {
  const lock = cfg.lock;
  if (lock?.entity && hass.states[lock.entity]?.state === "on") {
    return { kind: "locked", text: lock.text || "Locked", icon: lock.icon || cfg.icon, color: color(lock.color || "amber") };
  }
  const calling = list(cfg.thermostats).filter((id) => hass.states[id]?.attributes?.hvac_action === "heating");
  if (calling.length) {
    const names = calling.map((id) => cfg.names?.[id] || String(hass.states[id]?.attributes?.friendly_name || id).replace(/\s+thermostat$/i, ""));
    return {
      kind: "heating", text: `Heating · ${names.join(", ")}`,
      short: `Heating · ${calling.length} room${calling.length > 1 ? "s" : ""}`,
      icon: cfg.icon, color: color(cfg.icon_color || "orange"),
    };
  }
  return { kind: "idle", text: "Idle", icon: cfg.icon, color: GREY };
}

/* Which mode is on? A preset all thermostats share, or a mode's own entity + state. */
/* A flag tile glows on its own, next to the active mode: active: {attribute, state} is on
   when every thermostat's attribute is one of state (e.g. schedule_override_active: false
   → the rooms follow their schedule). */
function flagOn(hass, cfg, m) {
  if (!m.active?.attribute) return false;
  const th = list(cfg.thermostats).map((id) => hass.states[id]).filter(Boolean);
  const want = list(m.active.state).map(String);
  return th.length > 0 && th.every((s) => want.includes(String(s.attributes?.[m.active.attribute])));
}

function activeIndex(hass, cfg) {
  const modes = cfg.modes || [];
  const th = list(cfg.thermostats).map((id) => hass.states[id]).filter(Boolean);
  const presets = th.map((s) => s.attributes?.preset_mode);
  const allSame = presets.length && presets.every((p) => p === presets[0]);
  return modes.findIndex((m) => {
    if (m.active?.attribute) return false; // a flag tile (see flagOn), never "the" mode
    if (m.active?.entity) {
      const s = hass.states[m.active.entity];
      return !!s && list(m.active.state).map(String).includes(String(s.state));
    }
    return m.preset !== undefined && allSame && presets[0] === m.preset;
  });
}

const CSS = `
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Label row: 40px high (room for the 24px switch). The icon is Mushroom-sized (24px) and sits where
     the glyph of a 36px Mushroom icon would, so it lines up with the icons of Mushroom, Tado and
     All lights cards and the title starts where theirs do. Only a tappable icon gets the filled circle. */
  .label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 0 8px; }
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px; }
  /* A tappable icon (icon_tap_action) keeps a filled circle in its own colour – the tap-target convention. */
  .label > ha-icon.tap { width: 36px; border-radius: 50%; cursor: pointer; background: color-mix(in srgb, currentColor 20%, transparent);
    -webkit-tap-highlight-color: transparent; }
  .label > ha-icon.tap:active { filter: brightness(.92); }
  .label > ha-icon.tap:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Card label row: same on every card – 18px icon, 14px / 500 title (like Mushroom names), 12px status. */
  /* top: 1px – optical centring: the line box sits ~1px high against an icon of the same height. */
  .title { position: relative; top: 1px; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .status { margin-left: auto; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Switch next to the status; padded so the whole label + switch is an easy tap target. */
  .switch { all: unset; flex: none; margin: -6px -4px -6px 4px; padding: 6px 4px 6px 10px; display: inline-flex; align-items: center; gap: 8px;
    cursor: pointer; border-radius: 16px; font-size: 12px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .status:empty { display: none; }
  /* status: activity – what the heating is doing goes on its own line under the title (like a
     Mushroom secondary line); icon and switch are centred on both lines. */
  .label.two { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; grid-template-areas: "icon title sw" "icon status sw";
    column-gap: 8px; row-gap: 0; align-items: center; }
  .label.two > ha-icon:first-child { grid-area: icon; }
  .label.two .title { grid-area: title; top: 0; align-self: end; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .label.two .status { grid-area: status; margin-left: 0; align-self: start; font-weight: 400; line-height: 16px; }
  .label.two .switch { grid-area: sw; align-self: center; } /* centred on the two lines, like the icon */
  /* Label-row switch: 40×24, the same on every card. */
  .sw { flex: none; width: 40px; height: 24px; border-radius: 12px; position: relative; background: var(--disabled-color, #bdbdbd); transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .switch.on .sw { background: var(--sw-color); }
  .switch.on .sw::after { transform: translateX(16px); }
  .modes { display: grid; grid-template-columns: repeat(var(--n, 5), minmax(0, 1fr)); gap: 8px; }
  .mode { all: unset; box-sizing: border-box; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 12px 2px 11px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; }
  .shape { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: ${tint(GREY, 20)}; transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 24px; color: ${GREY}; transition: color 180ms; }
  /* 12px like every other card's second line; the icon carries the tile. */
  .name { max-width: 100%; font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .2px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mode.on { background: color-mix(in srgb, var(--c) 12%, transparent); }
  .mode.on .shape { background: color-mix(in srgb, var(--c) 20%, transparent); }
  .mode.on .shape ha-icon { color: var(--c); }
  /* Press feedback without moving anything, so taps near the edge still land. */
  .mode:active, .switch:active { filter: brightness(.92); }
  .mode:focus-visible, .switch:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  ha-card { container-type: inline-size; }
  /* Six or more tiles on a phone: a touch smaller so names like "Schedule" fit. */
  @container (max-width: 420px) { .modes.many .name { font-size: 11px; letter-spacing: 0; } }
`;

class ClimateModesCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Heating", icon: "mdi:radiator", thermostats: [], modes: [] };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { name: "icon_color", selector: { ui_color: {} } },
        { name: "thermostats", selector: { entity: { domain: "climate", multiple: true } } },
        { type: "grid", name: "", schema: [
          { name: "switch", selector: { entity: { domain: ["automation", "input_boolean", "switch"] } } },
          { name: "switch_name", selector: { text: {} } },
        ] },
        { name: "switch_tap_action", selector: { ui_action: {} } },
        { name: "icon_tap_action", selector: { ui_action: {} } },
        { name: "status", selector: { select: { mode: "dropdown", options: [
          { value: "mode", label: "The active mode (All rooms · Day)" },
          { value: "activity", label: "What the heating is doing (Heating · Study / Idle)" },
        ] } } },
        { name: "lock", selector: { object: {} } },
        { name: "modes", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({
          title: "Title",
          icon: "Icon",
          icon_color: "Icon colour",
          thermostats: "Thermostats (a mode is active when all share its preset)",
          switch: "Switch in the label row (optional)",
          switch_name: "Switch label (default Automatic)",
          switch_tap_action: "Switch tap (default: toggle)",
          icon_tap_action: "Icon tap (optional, e.g. open the climate view)",
          status: "Label row shows",
          modes: "Modes",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          modes: "One entry per tile: name, icon, color, preset (or active: {entity, state} / {attribute, state}) and tap_action.",
          switch: "Shown after the status, e.g. summer mode or an automatic-aircon automation.",
          switch_tap_action: "Add confirmation: {title, subject, text} in YAML to ask first.",
          lock: "With activity: {entity, text, icon, color} – e.g. summer mode: Summer · heating locked.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.modes)) throw new Error("Add a list of modes");
    this._config = { ...config };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const c = this._config;
    this._ro?.disconnect();
    this._ro = null;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      ${c.title || c.icon ? `<div class="label${c.status === "activity" ? " two" : ""}"><ha-icon icon="${esc(c.icon || "mdi:thermostat")}" style="color:${color(c.icon_color || "orange")}"${c.icon_tap_action ? ` class="tap" role="button" tabindex="0" aria-label="${esc(c.title || "Open")}"` : ""}></ha-icon>
        <span class="title">${esc(c.title || "")}</span>
        <span class="status"></span>
        ${c.switch ? `<button class="switch" role="switch" style="--sw-color:${color(c.switch_color || "blue")}"><span class="swl"></span><span class="sw"></span></button>` : ""}</div>` : ""}
      <div class="modes${c.modes.length >= 6 ? " many" : ""}" style="--n:${Math.max(1, c.modes.length)}">
        ${c.modes
          .map((m, i) => `<button class="mode" data-i="${i}" style="--c:${color(m.color)}" aria-pressed="false">
            <span class="shape"><ha-icon icon="${esc(m.icon || "mdi:thermostat")}"></ha-icon></span><span class="name">${esc(m.name || "")}</span></button>`)
          .join("")}
      </div></ha-card>`;
    root.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => this._tap(c.modes[Number(b.dataset.i)])));
    root.querySelector(".switch")?.addEventListener("click", () => this._toggleSwitch());
    const tapIcon = root.querySelector(".label > ha-icon.tap");
    if (tapIcon) {
      const go = () => this._tap({ name: c.title, icon: c.icon, color: c.icon_color, tap_action: c.icon_tap_action });
      tapIcon.addEventListener("click", go);
      tapIcon.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
    }
    this._built = true;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const root = this.shadowRoot;
    const c = this._config;
    const active = activeIndex(hass, c);
    root.querySelectorAll(".mode").forEach((b, i) => {
      // A flag (e.g. "on schedule") means nothing while a lock such as summer mode holds the rooms.
      const locked = c.lock?.entity && hass.states[c.lock.entity]?.state === "on";
      const on = i === active || (!locked && flagOn(hass, c, c.modes[i]));
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const status = root.querySelector(".status");
    if (status && c.status === "activity") {
      // The header says what the heating is doing; the tiles below already show the mode.
      const a = activity(hass, c);
      const ic = root.querySelector(".label > ha-icon");
      const icon = a.icon || "mdi:thermostat";
      if (ic.getAttribute("icon") !== icon) ic.setAttribute("icon", icon);
      if (ic.style.color !== a.color) ic.style.color = a.color;
      root.querySelector(".label").dataset.activity = a.kind;
      this._status = a;
      this._fitStatus();
    } else if (status) {
      const n = list(c.thermostats).length;
      const text = !n ? (active >= 0 ? c.modes[active].name : "")
        : active >= 0 ? `${n > 1 ? "All rooms" : "On"} · ${c.modes[active].name}` : "Mixed";
      if (status.textContent !== text) status.textContent = text;
    }
    const sw = root.querySelector(".switch");
    if (sw) {
      const s = hass.states[c.switch];
      const on = s?.state === "on";
      sw.classList.toggle("on", on);
      sw.setAttribute("aria-checked", String(on));
      const label = c.switch_name ?? "Automatic";
      if (sw.querySelector(".swl").textContent !== label) sw.querySelector(".swl").textContent = label;
    }
  }

  /* Room names when they fit, otherwise "Heating · 3 rooms" (re-checked when the card resizes). */
  _fitStatus() {
    const status = this.shadowRoot?.querySelector(".status");
    const a = this._status;
    if (!status || !a) return;
    if (status.textContent !== a.text) status.textContent = a.text;
    if (a.short && status.clientWidth && status.scrollWidth > status.clientWidth) status.textContent = a.short;
    if (!this._ro && window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._fitStatus());
      this._ro.observe(this.shadowRoot.querySelector(".label"));
    }
  }

  async _tap(mode) {
    const a = mode?.tap_action;
    if (!a || a.action === "none") return;
    this._fire("haptic", "light");
    if (a.confirmation && !(await this._confirm(mode, a.confirmation))) return;
    try {
      if (a.action === "navigate") {
        history.pushState(null, "", a.navigation_path);
        this._fire("location-changed", { replace: false });
      } else if (a.action === "more-info") {
        this._fire("hass-more-info", { entityId: a.entity || mode.active?.entity });
      } else if (a.action === "toggle") {
        await this._hass.callService("homeassistant", "toggle", { entity_id: a.entity || mode.active?.entity });
      } else if (a.action === "perform-action" || a.action === "call-service") {
        const [domain, service] = String(a.perform_action || a.service).split(".");
        await this._hass.callService(domain, service, { ...(a.data || a.service_data || {}) }, a.target);
      }
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || "That did not work" });
    }
  }

  /* Ask first. confirmation: true, or {title, icon, subject, subject_icon, text, confirm_label};
     every text may be a template. Defaults come from the tile (name, icon, colour). */
  async _confirm(mode, conf) {
    if (this._asking) return false;
    this._asking = true;
    try {
      const o = conf === true ? {} : conf || {};
      const [title, icon, subject, text, label] = await Promise.all(
        [o.title, o.icon, o.subject, o.text, o.confirm_label].map((v) => (v ? renderTemplate(this._hass, v) : Promise.resolve(""))),
      );
      const name = title.trim() || mode.name || "Are you sure?";
      return await confirmDialog({
        title: name,
        icon: icon.trim() || mode.icon || "mdi:help-circle-outline",
        col: color(mode.color || "blue"),
        subjectIcon: o.subject_icon || this._config.icon || "mdi:information-outline",
        subject: subject.trim(),
        text: text.trim(),
        confirmLabel: label.trim() || name,
      });
    } finally {
      this._asking = false;
    }
  }

  async _toggleSwitch() {
    const c = this._config;
    if (c.switch_tap_action) {
      return this._tap({
        name: c.switch_name ?? "Automatic", color: c.switch_color || "blue", icon: c.icon,
        active: { entity: c.switch }, tap_action: c.switch_tap_action,
      });
    }
    const id = this._config.switch;
    const on = this._hass.states[id]?.state === "on";
    this._fire("haptic", "light");
    try {
      await this._hass.callService("homeassistant", on ? "turn_off" : "turn_on", { entity_id: id });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Could not switch ${id}` });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerClimateModesCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(CMC_TAG)) return;
  registry.define(CMC_TAG, ClimateModesCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CMC_TAG,
    name: "Climate modes",
    description: "Whole-house mode tiles (heating presets, aircon speeds…) with the active one highlighted.",
  });
  console.info(`%c CLIMATE-MODES-CARD %c ${CMC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerClimateModesCard();
