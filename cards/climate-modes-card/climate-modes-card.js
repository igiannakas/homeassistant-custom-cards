/*
 * Climate modes card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Whole-house shortcuts in one card: a label row (icon, title, what the rooms are
 * on under the title, or a switch) and a row of mode tiles. A tile glows in its colour
 * while it is the active mode, and the label icon takes that colour (grey when nothing is
 * on). Made for heating presets across several thermostats, and just as happy with any
 * entity + state (e.g. an aircon speed helper). Any tap action can ask first: add
 * `confirmation` and the card shows its own confirm dialog (Bubble Card look, texts may be
 * templates), so no pop-up card is needed. With `status: activity` the label row shows what
 * the heating is doing instead of the mode: which rooms are calling for heat, Idle, or a
 * lock (e.g. summer mode) – and the icon follows. Tile names are never cut: when they don't
 * fit side by side, the tiles wrap into balanced rows.
 * See cards/climate-modes-card/README.md for every option.
 */

const CMC_VERSION = "1.4.6";
const CMC_TAG = "climate-modes-card";

const NAMED = ["red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan", "teal", "green", "light-green",
  "lime", "yellow", "amber", "orange", "deep-orange", "brown", "grey", "blue-grey"];
const FALLBACK = { cyan: "#00bcd4", blue: "#2196f3", purple: "#9c27b0", amber: "#ffc107", red: "#f44336", orange: "#ff9800",
  teal: "#009688", green: "#4caf50", grey: "#9e9e9e", "light-blue": "#03a9f4", indigo: "#3f51b5", "deep-purple": "#673ab7" };
const color = (c) => (!c ? `var(--grey-color, #9e9e9e)` : NAMED.includes(c) ? `var(--${c}-color, ${FALLBACK[c] || "#9e9e9e"})` : c);
const GREY = color("grey");
// Teal = you can tap / pick this (design tokens → Colours): the switch is teal when on unless it
// has a colour of its own, and a tile or switch without a state colour of its own – none, or
// grey (Off, Away) – asks in teal: a filled grey button would read as disabled. (Such a tile
// glows teal when it is the mode – see pickColor.)
const TEAL = color("teal");
// The active tile glows in its mode's colour; a mode without a state colour of its own (none, or
// grey – Off, Away) glows teal instead, as "what you picked", or nothing would show it's active.
const pickColor = (c) => (!c || c === "grey" || c === "gray" ? TEAL : color(c));
const askColor = (m) => {
  const c = m?.color ? color(m.color) : TEAL;
  return c === GREY ? TEAL : c;
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

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
  /* The text sits under the title, starting on its line (8 + 42px glyph + 6px gap). One glyph,
     no subject line: the dialog opens from the card's own tile or switch. */
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
  /* Cancel – it only dismisses the confirmation – is full size like the confirm button, in a plain
     light grey: quiet beside the coloured choice, never black text on a mid grey (design tokens → Dialogs). */
  button.dismiss { background: rgba(var(--rgb-primary-text-color, 33,33,33), .1); color: var(--primary-text-color); }
  button.dismiss .glyph { background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); }
  button.dismiss .glyph ha-icon { color: var(--primary-text-color); }
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

/* Confirm dialog in the Bubble Card look, the same layout as every card's: a title row with one
   glyph, the text under the title, then Confirm / Cancel below a rule. In the colour of the
   control that opened it. Resolves true (confirm) or false (cancel). */
function confirmDialog({ title, icon, color: col, text, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("cmc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(col, 20)}"><ha-icon icon="${esc(icon)}" style="color:${col}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        ${text ? `<div class="text">${esc(text)}</div>` : ""}
        <div class="buttons">
          <button class="confirm" style="background:${col}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
          <button class="cancel dismiss"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
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

/* What the heating is doing: locked (e.g. summer mode), rooms calling for heat, or idle. The
   text comes in parts (a list inside a part is joined with commas): the line wraps only
   between them. */
function activity(hass, cfg) {
  const lock = cfg.lock;
  if (lock?.entity && hass.states[lock.entity]?.state === "on") {
    // Grey by default: a lock (summer mode) is an off state, not a warning.
    const text = String(lock.text || "Locked");
    return { kind: "locked", parts: text.split(/\s+·\s+/), icon: lock.icon || cfg.icon, color: color(lock.color || "grey") };
  }
  const calling = list(cfg.thermostats).filter((id) => hass.states[id]?.attributes?.hvac_action === "heating");
  if (calling.length) {
    const names = calling.map((id) => cfg.names?.[id] || String(hass.states[id]?.attributes?.friendly_name || id).replace(/\s+thermostat$/i, ""));
    return {
      kind: "heating", parts: ["Heating", names],
      short: ["Heating", `${calling.length} room${calling.length > 1 ? "s" : ""}`],
      icon: cfg.icon, color: color(cfg.icon_color || "orange"),
    };
  }
  return { kind: "idle", parts: ["Idle"], icon: cfg.icon, color: GREY };
}

/* "All rooms · Night" as HTML: each part unbreakable, joined so the dot stays with the part
   before it (design tokens → Status lines). */
const partsHtml = (parts) =>
  parts
    .map((p) => (Array.isArray(p) ? p.map((n) => `<span class="p">${esc(n)}</span>`).join(", ") : `<span class="p">${esc(p)}</span>`))
    .join("&nbsp;· ");

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
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Label row: 40px high (room for the 24px switch). The icon is Mushroom-sized (24px) and sits where
     the glyph of a 36px Mushroom icon would, so it lines up with the icons of Mushroom, Tado and
     All lights cards and the title starts where theirs do. Only a tappable icon gets the filled circle. */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 8px; } /* 10px gap: titles at edge + 46, like Mushroom */
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px; }
  /* header_tap_action: icon, title and status line all open it; the icon keeps a filled circle in
     its own colour – the tap-target convention. The switch keeps its own action. */
  .label .title.tap, .label .status.tap { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .label > ha-icon.tap { width: 36px; border-radius: 50%; cursor: pointer; background: color-mix(in srgb, currentColor 20%, transparent);
    -webkit-tap-highlight-color: transparent; }
  .label > ha-icon.tap:active { filter: brightness(.92); }
  .label > ha-icon.tap:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Card label row: same on every card – a 24px icon in a 36px slot, a 14px / 500 title (like
     Mushroom names) and, under the title, the summary (12px, free to wrap between its parts).
     The icon and the switch are centred on the two lines. */
  .lt { flex: 1; min-width: 0; }
  .title { display: block; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    overflow-wrap: break-word; }
  /* top: 1px – optical centring: alone, a 20px line box sits ~1px high against an icon of the same height. */
  .lt.one .title { position: relative; top: 1px; }
  .status { display: block; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .status:empty { display: none; }
  .status .p { white-space: nowrap; }
  .status.measure { white-space: nowrap; }
  /* Switch after the label; padded so the whole label + switch is an easy tap target. */
  .switch { all: unset; flex: none; margin: -6px -4px -6px 4px; padding: 6px 4px 6px 10px; display: inline-flex; align-items: center; gap: 8px;
    cursor: pointer; border-radius: 16px; font-size: 12px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; -webkit-tap-highlight-color: transparent; }
  /* Label-row switch: 40×24, the same on every card. */
  .sw { flex: none; width: 40px; height: 24px; border-radius: 12px; position: relative; background: var(--disabled-color, #bdbdbd); transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .switch.on .sw { background: var(--sw-color); }
  .switch.on .sw::after { transform: translateX(16px); }
  /* Mode tiles: one row, equal widths while every name fits; a longer name takes the width it
     needs. When they don't all fit, the card measures the names and lays the tiles out in even,
     balanced rows (.fit: e.g. 3 + 3 rather than 5 + 1). Names are never cut and never shrink. */
  .modes { display: flex; flex-wrap: wrap; gap: 8px; }
  .modes.fit { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); }
  .mode { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: max-content; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 11px 10px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; }
  .modes.fit .mode { min-width: 0; }
  .shape { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: ${tint(GREY, 20)}; transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 24px; color: ${GREY}; transition: color 180ms; }
  /* 12px like every other card's second line; the icon carries the tile. A name wraps only if it
     is wider than the whole card on its own. */
  .name { font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .2px; color: var(--primary-text-color);
    white-space: nowrap; text-align: center; }
  .modes.wrap .name { white-space: normal; overflow-wrap: break-word; }
  /* Active tile glow: its colour at 10%, the icon circle at 20%. */
  .mode.on { background: color-mix(in srgb, var(--c) 10%, transparent); }
  .mode.on .shape { background: color-mix(in srgb, var(--c) 20%, transparent); }
  .mode.on .shape ha-icon { color: var(--c); }
  /* Press feedback without moving anything, so taps near the edge still land. */
  .mode:active, .switch:active { filter: brightness(.92); }
  .mode:focus-visible, .switch:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): the summary under the title starts on the title's vertical line,
   measured on ink rather than boxes (a leading "1" or "A" has its own side bearing). */
const INK = { ctx: undefined };
const inkCtx = () => {
  if (INK.ctx === undefined)
    INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  return INK.ctx;
};
const inkVisible = (el) => !el.hidden && getComputedStyle(el).display !== "none";
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
function inkText(node) {
  const ctx = inkCtx();
  if (!ctx) return null;
  const cs = getComputedStyle(node.parentElement);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
const inkSet = (el, px) => {
  const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
  if (el.style.marginLeft !== v) el.style.marginLeft = v;
};
function inkAlign(blocks) {
  for (const b of blocks) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t || !t.text) continue;
    const ref = inkText(t.text);
    if (ref === null) return;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (lead && lead.text) inkSet(line, ref - inkText(lead.text));
    }
  }
}
function inkSchedule(host, selector) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    if (host.shadowRoot) inkAlign(host.shadowRoot.querySelectorAll(selector));
  });
}

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
        { name: "header_tap_action", selector: { ui_action: {} } },
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
          icon_color: "Icon colour (default: the active mode's colour, grey when none)",
          thermostats: "Thermostats (a mode is active when all share its preset)",
          switch: "Switch in the label row (optional)",
          switch_name: "Switch label (default Automatic)",
          switch_tap_action: "Switch tap (default: toggle)",
          header_tap_action: "Header tap – icon, title and status (optional, e.g. open the climate view)",
          status: "Label row shows",
          modes: "Modes",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          modes: "One entry per tile: name, icon, color, preset (or active: {entity, state} / {attribute, state}) and tap_action.",
          switch: "Shown after the title, e.g. summer mode or an automatic-aircon automation. Teal when on unless switch_color is set.",
          switch_tap_action: "Add confirmation: {title, text} in YAML to ask first.",
          lock: "With activity: {entity, text, icon, color} – e.g. summer mode: Summer · heating locked (grey unless color is set).",
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
    this._statusKey = undefined;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      ${c.title || c.icon ? `<div class="label"><ha-icon icon="${esc(c.icon || "mdi:thermostat")}"${this._headerAction() ? ` class="tap" role="button" tabindex="0" aria-label="${esc(c.title || "Open")}"` : ""}></ha-icon>
        <div class="lt"><span class="title">${esc(c.title || "")}</span><span class="status"></span></div>
        ${c.switch ? `<button class="switch" role="switch" style="--sw-color:${c.switch_color ? color(c.switch_color) : TEAL}"><span class="swl"></span><span class="sw"></span></button>` : ""}</div>` : ""}
      <div class="modes">
        ${c.modes
          .map((m, i) => `<button class="mode" data-i="${i}" style="--c:${pickColor(m.color)}" aria-pressed="false">
            <span class="shape"><ha-icon icon="${esc(m.icon || "mdi:thermostat")}"></ha-icon></span><span class="name">${esc(m.name || "")}</span></button>`)
          .join("")}
      </div></ha-card>`;
    root.querySelectorAll(".mode").forEach((b) =>
      b.addEventListener("click", () => {
        const m = c.modes[Number(b.dataset.i)];
        this._tap(m, `switch to ${m.name || "that mode"}`);
      }),
    );
    root.querySelector(".switch")?.addEventListener("click", () => this._toggleSwitch());
    const tapIcon = root.querySelector(".label > ha-icon.tap");
    if (tapIcon) {
      // The header's dialog takes the header icon's colour as it is now (teal while it is grey:
      // then it is just a tap target with no state colour of its own).
      const go = () =>
        this._tap({ name: c.title, icon: tapIcon.getAttribute("icon"), col: this._headColor && this._headColor !== GREY ? this._headColor : TEAL,
          tap_action: this._headerAction() });
      tapIcon.addEventListener("click", go);
      tapIcon.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
      root.querySelectorAll(".label .title, .label .status").forEach((n) => { n.classList.add("tap"); n.addEventListener("click", go); });
    }
    // Names and the status line are measured: again when the card resizes and once the font has loaded.
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => {
        this._fitModes();
        this._fitStatus();
      });
      root.querySelectorAll(".modes, .label").forEach((n) => this._ro.observe(n));
    }
    document.fonts?.ready?.then(() => {
      this._fitModes();
      this._fitStatus();
    });
    this._built = true;
  }

  /* header_tap_action (icon_tap_action is the older name for the same thing). */
  _headerAction() {
    return this._config.header_tap_action || this._config.icon_tap_action;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    inkSchedule(this, ".lt");
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
    const ic = root.querySelector(".label > ha-icon");
    if (status && c.status === "activity") {
      // The header says what the heating is doing; the tiles below already show the mode.
      const a = activity(hass, c);
      const icon = a.icon || "mdi:thermostat";
      if (ic.getAttribute("icon") !== icon) ic.setAttribute("icon", icon);
      this._headColor = a.color;
      root.querySelector(".label").dataset.activity = a.kind;
      this._status = a;
    } else if (status) {
      // The active mode, under the title. The icon takes the active mode's colour – grey when
      // nothing is on – unless icon_color fixes it.
      const n = list(c.thermostats).length;
      const parts = !n ? (active >= 0 ? [c.modes[active].name] : [])
        : active >= 0 ? [n > 1 ? "All rooms" : "On", c.modes[active].name] : ["Mixed"];
      this._headColor = c.icon_color ? color(c.icon_color) : active >= 0 ? color(c.modes[active].color) : GREY;
      this._status = { parts: parts.filter(Boolean) };
    }
    // A tappable header icon sits in a tinted circle – the tap signal – and a tap target is never
    // grey: with no state colour of its own (idle, locked, Off) it is teal (design tokens → Colours).
    const shown = ic?.classList.contains("tap") && this._headColor === GREY ? TEAL : this._headColor;
    if (ic && ic.style.color !== shown) ic.style.color = shown;
    this._fitStatus();
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

  /* The summary under the title. Room names when they fit on one line, otherwise "Heating · 3
     rooms" (re-checked when the card resizes); either way it wraps only between its parts. */
  _fitStatus() {
    const status = this.shadowRoot?.querySelector(".status");
    const a = this._status;
    if (!status || !a) return;
    const full = partsHtml(a.parts);
    let html = full;
    if (a.short && status.clientWidth) {
      const key = `${full}|${status.clientWidth}`;
      if (key === this._statusKey) html = this._statusHtml;
      else {
        if (status._h !== full) {
          status.innerHTML = full;
          status._h = full;
        }
        status.classList.add("measure");
        if (status.scrollWidth > status.clientWidth) html = partsHtml(a.short);
        status.classList.remove("measure");
        this._statusKey = key;
        this._statusHtml = html;
      }
    }
    if (status._h !== html) {
      status.innerHTML = html;
      status._h = html;
    }
    status.parentElement.classList.toggle("one", !html);
  }

  /* Mode tiles: every name whole, never under 12px. One row while every tile fits (name + 20px
     padding, at least the 36px icon); else even rows as balanced as they can be; and only if a
     single name is wider than the card does it wrap. Without layout (tests), the CSS default
     stays: one flex row that wraps a tile rather than squeezing its name. */
  _fitModes() {
    const box = this.shadowRoot?.querySelector(".modes");
    const W = box?.clientWidth;
    const names = box ? [...box.querySelectorAll(".mode .name")] : [];
    if (!W || !names.length) return;
    box.classList.remove("wrap");
    const need = Math.max(56, ...names.map((n) => Math.ceil(n.scrollWidth) + 20));
    const n = names.length;
    const fit = Math.max(1, Math.floor((W + 8) / (need + 8)));
    const cols = n <= fit ? 0 : Math.ceil(n / Math.ceil(n / fit));
    box.classList.toggle("fit", cols > 0);
    if (cols && box.style.getPropertyValue("--cols") !== String(cols)) box.style.setProperty("--cols", String(cols));
    box.classList.toggle("wrap", need > W);
  }

  /* what: what a failure message says you tried ("Couldn't switch to Night."). */
  async _tap(mode, what = "do that") {
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
      this._fire("hass-notification", { message: err?.message || `Couldn't ${what}.` });
    }
  }

  /* Ask first. confirmation: true, or {title, icon, text, confirm_label}; every text may be a
     template. Defaults come from the tile (name, icon). The colour is the control's own: the
     tile's colour (teal for a tile without one, or a grey one), the switch's, or the header
     icon's. The older subject is no longer a line of its own: it stands in for the text when
     there is none. */
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
        color: mode.col || askColor(mode),
        text: text.trim() || subject.trim(),
        confirmLabel: label.trim() || name,
      });
    } finally {
      this._asking = false;
    }
  }

  async _toggleSwitch() {
    const c = this._config;
    const id = c.switch;
    const on = this._hass.states[id]?.state === "on";
    // For messages: the switch's friendly name, never its entity id.
    const name = this._hass.states[id]?.attributes?.friendly_name || c.switch_name || "the switch";
    const what = `turn ${name} ${on ? "off" : "on"}`;
    if (c.switch_tap_action) {
      return this._tap({
        name: c.switch_name ?? "Automatic", color: c.switch_color, icon: c.icon,
        active: { entity: id }, tap_action: c.switch_tap_action,
      }, what);
    }
    this._fire("haptic", "light");
    try {
      await this._hass.callService("homeassistant", on ? "turn_off" : "turn_on", { entity_id: id });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Couldn't ${what}.` });
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
