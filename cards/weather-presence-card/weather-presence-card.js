/*
 * Weather & presence card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A slim block for the top of a climate section: the weather (condition, your own
 * outdoor sensor and the forecast service's temperature) with two pills on the
 * right – who is home (tap for e.g. the security dashboard) and a link pill (tap
 * for e.g. the climate dashboard). Either pill can be left out, e.g. the link pill
 * on the very dashboard it would link to. Tap the weather for the forecast, your own
 * temperature for its sensor (or long-press anywhere on the weather).
 *
 * With `presence.ignored` (Home ETA's "someone home" sensor) a second row shows while Home ETA
 * ignores someone's phone ("Ignoring Vasiliki"), with a Stop ignoring pill that asks first and
 * then calls home_eta.stop_ignoring. While nobody is ignored the row is not there at all.
 * See cards/weather-presence-card/README.md for every option.
 */

const WPC_VERSION = "1.5.0";
const WPC_TAG = "weather-presence-card";
const HISTORY_DAYS = 7;
const HOLD_MS = 500;

// One meaning per colour (design-tokens → Colours): green = someone home, teal = you can tap
// this (the link pill's icon, Stop ignoring and its dialog), amber = early warning (a phone
// presence is ignoring), grey = off / neutral. Weather icons keep their literal colours.
const C = {
  grey: "var(--grey-color, #9e9e9e)",
  teal: "var(--teal-color, #009688)",
  green: "var(--green-color, #4caf50)",
  blue: "var(--blue-color, #2196f3)",
  amber: "var(--amber-color, #ffc107)",
};
const IGNORE_ICON = "mdi:account-off";
const COUNT_ICON = "mdi:account-check";
const WEATHER = {
  sunny: ["mdi:weather-sunny", "var(--amber-color, #ffc107)"],
  "clear-night": ["mdi:weather-night", "var(--indigo-color, #3f51b5)"],
  partlycloudy: ["mdi:weather-partly-cloudy", "var(--amber-color, #ffc107)"],
  cloudy: ["mdi:weather-cloudy", C.grey],
  fog: ["mdi:weather-fog", C.grey],
  rainy: ["mdi:weather-rainy", C.blue],
  pouring: ["mdi:weather-pouring", C.blue],
  snowy: ["mdi:weather-snowy", "var(--light-blue-color, #03a9f4)"],
  "snowy-rainy": ["mdi:weather-snowy-rainy", "var(--light-blue-color, #03a9f4)"],
  hail: ["mdi:weather-hail", "var(--light-blue-color, #03a9f4)"],
  lightning: ["mdi:weather-lightning", "var(--deep-purple-color, #673ab7)"],
  "lightning-rainy": ["mdi:weather-lightning-rainy", "var(--deep-purple-color, #673ab7)"],
  windy: ["mdi:weather-windy", C.teal],
  "windy-variant": ["mdi:weather-windy-variant", C.teal],
  exceptional: ["mdi:alert-circle-outline", "var(--red-color, #f44336)"],
};

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
// Readable coloured text: mixed toward the text colour, never the raw colour on white.
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
// 14.23 → "14.2°": the entity's own value, whatever its unit (no hard-coded C).
const temp = (v) => (num(v) === null ? "–" : `${fmt(num(v), 1)}°`);

// "45 min", "3 h", "2 d" – a space and short units, like every card.
function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
}

/* "Vasiliki", "Nancy and Vasiliki", "Ioannis, Nancy and Vasiliki". */
const andList = (names) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/* Who Home ETA ignores, from its "someone home" sensor: the names it shows (`ignored_names`) and
   the person ids to stop ignoring (`ignored`). null while nobody is ignored (or the sensor is
   missing or unavailable), so the row is not there at all. */
function ignoring(hass, id) {
  const s = id ? hass.states[id] : null;
  if (!s || ["unavailable", "unknown"].includes(s.state)) return null;
  const names = (Array.isArray(s.attributes?.ignored_names) ? s.attributes.ignored_names : []).map((n) => String(n).trim()).filter(Boolean);
  const persons = (Array.isArray(s.attributes?.ignored) ? s.attributes.ignored : []).map(String).filter(Boolean);
  if (!names.length && !persons.length) return null;
  // Home ETA lists the names with the ids; without them, the people's own names (never an id).
  const shown = names.length ? names : persons.map((p) => hass.states[p]?.attributes?.friendly_name || "someone");
  return { names: shown, persons, who: andList(shown), several: shown.length > 1 };
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
  /* The text sits under the title, starting on its line (8 + 42px glyph + 6px gap). One glyph,
     no subject line: the dialog opens from the card's own row. */
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

/* Confirm dialog in the Bubble Card look, the same layout as every card's: a title row with one
   glyph, the text under the title, then Confirm / Cancel below a rule. In the colour of the
   control that opened it. Resolves true (confirm) or false (cancel). */
function confirmDialog({ title, icon, color, text, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("wpc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="text">${esc(text)}</div>
        <div class="buttons">
          <button class="confirm" style="background:${color}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
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

/* ------------------------------------------------------------------------ */

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 12px 10px; container-type: inline-size; }
  .wrap { display: flex; align-items: center; gap: 10px; }
  .wx { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; border-radius: 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { min-width: 0; }
  /* Text is never cut: a condition too long for its row wraps instead. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    overflow-wrap: break-word; }
  .sc { display: flex; flex-wrap: wrap; column-gap: 9px; font-size: 12px; line-height: 16px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  /* Each reading is its own tap target (more-info of its own sensor) and stays whole. */
  .v { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;
    cursor: pointer; border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  .v[hidden] { display: none; }
  .v ha-icon, .pill ha-icon { flex: none; width: var(--mdc-icon-size); height: var(--mdc-icon-size); }
  /* Small reading icons are quiet secondary information, the same on every card. */
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .pills { flex: none; display: flex; gap: 8px; align-items: center; }
  /* Primary pills: 36px – the height of the icon circle – on every screen, so circle, text block
     and pills share one centre line and the pills' edges line up with the circle. */
  .pill { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; font-size: 13px; font-weight: 600; letter-spacing: .2px;
    white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  /* The pills stay beside the weather whenever they fit there (the readings may wrap onto two
     lines). Only when they don't – measured in _fit() – do they move to a row of wide buttons
     below it, e.g. two pills on a 375px phone: equal widths while both labels fit, a longer
     label takes what it needs, and they wrap only as a last resort (the button-row pattern). */
  .wrap.stacked { flex-wrap: wrap; row-gap: 8px; }
  .wrap.stacked .wx { flex: 1 1 100%; }
  .wrap.stacked .pills { flex: 1 1 100%; flex-wrap: wrap; }
  .wrap.stacked .pill { flex: 1 1 0; min-width: max-content; }
  /* Someone home: green (Home Assistant's colour for a person at home), as an "on" pill. Away stays grey. */
  .pill.home { background: ${tint(C.green, 18)}; color: ${tx(C.green, 70)}; }
  .pill.home ha-icon { color: ${C.green}; }
  .pill.link { padding-right: 4px; }
  .pill.link ha-icon { color: ${C.teal}; }
  /* The chevron is a trailing glyph, not the pill's icon: 16px, grey. */
  .pill.link ha-icon.ch { --mdc-icon-size: 16px; color: ${C.grey}; margin-left: -3px; }
  /* Home ETA ignoring someone's phone: a row of its own under the weather, on the same lines – the
     glyph in a 36px slot under the weather circle (decorative: the pill is the action, so no
     circle), the text at edge + 46 like the condition, Stop ignoring as a primary pill. Amber: an
     early warning that presence is not counting everyone. Not there at all while nobody is ignored. */
  .ign { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  .ign[hidden] { display: none; }
  .ihead { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.amber}; }
  .ign .txt { flex: 1; }
  .ign .txt > span { display: block; }
  /* Beside the pill on a phone the line wraps; balanced, so no word is left alone on the second line. */
  .isc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); text-wrap: balance; }
  .pill.stop ha-icon { color: ${C.teal}; }
  .pill[aria-disabled="true"] { opacity: .45; cursor: default; }
  /* The pill stays beside the message while the title and the pill fit on one line (the line under
     the title may wrap); otherwise it takes a full-width row under it – measured in _fitIgnored(). */
  .ign.stacked { flex-wrap: wrap; row-gap: 8px; }
  .ign.stacked .ihead { flex: 1 1 100%; }
  .ign.stacked .pill { flex: 1 1 100%; }
  .pill:active, .wx:active, .v:active { filter: brightness(.92); }
  /* Pressing a reading darkens the reading, not the whole weather block. */
  .wx:has(.v:active) { filter: none; }
  .pill:focus-visible, .wx:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .v:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
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

class WeatherPresenceCard extends HTMLElement {
  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    return { weather: ids.find((i) => i.startsWith("weather.")) || "" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "weather", required: true, selector: { entity: { domain: "weather" } } },
        { type: "grid", name: "", schema: [
          { name: "temperature", selector: { entity: { domain: "sensor", device_class: "temperature" } } },
          { name: "temperature_name", selector: { text: {} } },
        ] },
        { name: "weather_name", selector: { text: {} } },
        { type: "expandable", name: "presence", title: "Presence pill", icon: "mdi:home-account", expanded: true, schema: [
          { name: "entity", selector: { entity: { domain: ["input_boolean", "binary_sensor", "zone", "group", "person"] } } },
          { name: "navigation_path", selector: { navigation: {} } },
          { name: "ignored", selector: { entity: { domain: "binary_sensor", integration: "home_eta" } } },
        ] },
        { type: "expandable", name: "link", title: "Link pill", icon: "mdi:link-variant", expanded: true, schema: [
          { name: "hide", selector: { boolean: {} } },
          { type: "grid", name: "", schema: [
            { name: "name", selector: { text: {} } },
            { name: "icon", selector: { icon: {} } },
          ] },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
      ],
      computeLabel: (s) =>
        ({
          weather: "Weather",
          temperature: "Your outdoor temperature sensor",
          temperature_name: "Its label (default Real)",
          weather_name: "Label for the weather service's temperature (default Forecast)",
          entity: "Someone home (on / home / count above 0)",
          navigation_path: "Tap goes to",
          name: "Name",
          icon: "Icon",
          hide: "Hide this pill",
          ignored: "Ignored phones (Home ETA's someone home sensor)",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          weather: "Tap the weather for the forecast; tap your own temperature (or long-press) for its sensor.",
          ignored: "While Home ETA ignores someone's phone, a row says who, with Stop ignoring (it asks first).",
          hide: "E.g. on the dashboard it links to. Its settings below are kept.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.weather) throw new Error("Set a weather entity");
    this._config = { ...config };
    this._built = false;
    this._since = undefined;
    this._pending = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._track();
    this._render();
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => this._hass && this._render(), 60000);
    this._observe();
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._ro?.disconnect();
  }

  /* Re-check the layout whenever the card's width changes (rotation, sidebar, column count). */
  _observe() {
    const wrap = this.shadowRoot?.querySelector(".wrap");
    if (!wrap || typeof ResizeObserver === "undefined") return;
    this._ro = this._ro || new ResizeObserver(() => this._fitAll());
    this._ro.disconnect();
    this._ro.observe(wrap);
  }

  _fitAll() {
    this._fit();
    this._fitIgnored();
  }

  /* Do the pills need their own row? They fit beside the weather when the icon, the wider of the
     condition and the widest single reading (the readings may wrap, the condition may not be cut)
     and the pills at their natural width all fit in the row. */
  static stacks(available, weather, gap, pills) {
    return weather + gap + pills > available + 0.5;
  }

  /* Measures natural widths, so the answer is the same whichever layout is showing (no flip-flop). */
  _fit() {
    const root = this.shadowRoot;
    const wrap = root?.querySelector(".wrap");
    const pills = root ? [...root.querySelectorAll(".pills .pill")] : [];
    if (!wrap || !pills.length || !wrap.clientWidth) return; // nothing to place, or not laid out (hidden)
    const range = this.ownerDocument.createRange();
    const contentW = (node) => (range.selectNodeContents(node), range.getBoundingClientRect().width);
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    const wx = root.querySelector(".wx");
    // The condition's natural width: measured on one line, whether or not it is wrapping now.
    const nm = root.querySelector(".wx .nm");
    nm.style.whiteSpace = "nowrap";
    const cond = contentW(nm);
    nm.style.whiteSpace = "";
    const text = Math.max(cond, ...[...root.querySelectorAll(".sc .v:not([hidden])")].map((v) => v.getBoundingClientRect().width));
    const weather = root.querySelector(".shape").offsetWidth + px(wx, "columnGap") + text;
    const pillsW =
      pills.reduce((s, p) => s + contentW(p) + px(p, "paddingLeft") + px(p, "paddingRight"), 0) +
      px(root.querySelector(".pills"), "columnGap") * (pills.length - 1);
    wrap.classList.toggle("stacked", WeatherPresenceCard.stacks(wrap.clientWidth, weather, px(wrap, "columnGap"), pillsW));
  }

  /* Does Stop ignoring need its own row? Not while the glyph, the title on one line ("Ignoring
     Nancy and Vasiliki") and the pill at its natural width fit; the line under the title may wrap.
     The same test as the weather row's, so both rows decide alike. */
  _fitIgnored() {
    const root = this.shadowRoot;
    const row = root?.querySelector(".ign");
    if (!row || row.hidden || !row.clientWidth) return; // not there, or not laid out
    const range = this.ownerDocument.createRange();
    const contentW = (node) => (range.selectNodeContents(node), range.getBoundingClientRect().width);
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    const nm = row.querySelector(".nm");
    nm.style.whiteSpace = "nowrap";
    const title = contentW(nm);
    nm.style.whiteSpace = "";
    const head = row.querySelector(".slot").offsetWidth + px(row.querySelector(".ihead"), "columnGap") + title;
    const p = row.querySelector(".pill");
    const pill = contentW(p) + px(p, "paddingLeft") + px(p, "paddingRight");
    row.classList.toggle("stacked", WeatherPresenceCard.stacks(row.clientWidth, head, px(row, "columnGap"), pill));
  }

  /* The link pill, or null when it is hidden or has nowhere to go (an editor-cleared link is {}). */
  _link() {
    const l = this._config.link;
    return l && typeof l === "object" && !l.hide && l.navigation_path ? l : null;
  }

  _presenceId() {
    const p = this._config.presence;
    return typeof p === "string" ? p : p?.entity;
  }

  _ignoredId() {
    const p = this._config.presence;
    return p && typeof p === "object" ? p.ignored : undefined;
  }

  _home(s) {
    if (!s) return null;
    if (["unavailable", "unknown"].includes(s.state)) return null;
    if (s.entity_id?.startsWith("zone.")) return Number(s.state) > 0;
    return ["on", "home"].includes(s.state);
  }

  /* When did the house become empty? Live change if we saw it, else from history (restart-proof). */
  _track() {
    const id = this._presenceId();
    if (!id || !this._hass) return;
    const s = this._hass.states[id];
    const home = this._home(s);
    if (this._lastHome === true && home === false) this._since = Date.parse(s.last_changed);
    if (this._lastHome === undefined && home === false) this._loadSince(id);
    this._lastHome = home;
  }

  async _loadSince(id) {
    const hass = this._hass;
    try {
      const h = await hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString(),
        entity_ids: [id],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const rows = h?.[id] || [];
      const t = (r) => (r.lu ?? r.lc ?? 0) * 1000 || Date.parse(r.last_changed || r.last_updated || 0);
      let last = -1;
      rows.forEach((r, i) => {
        if (this._home({ entity_id: id, state: r.s ?? r.state })) last = i;
      });
      this._since = last >= 0 && last < rows.length - 1 ? t(rows[last + 1]) : Date.now() - HISTORY_DAYS * 86400000 - 1;
    } catch (e) {
      this._since = Date.parse(hass.states[id]?.last_changed);
    }
    this._render();
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const link = this._link();
    const c = this._config;
    const np = (this._presenceId() ? 1 : 0) + (link ? 1 : 0);
    // The readings are built once and updated in place, so a focused one keeps its focus.
    // Your own temperature is a button of its own (its sensor); the forecast belongs to the weather.
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="wrap">
      <div class="wx" role="button" tabindex="0"><div class="shape"><ha-icon></ha-icon></div>
        <div class="txt"><div class="nm"></div><div class="sc">${
          c.temperature ? `<button class="v real" data-e="${esc(c.temperature)}"><ha-icon icon="mdi:thermometer"></ha-icon><span></span></button>` : ""
        }<span class="v fc" data-e="${esc(c.weather)}"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><span></span></span></div></div></div>
      <div class="pills"${np ? "" : ` style="display:none"`}>
        ${this._presenceId() ? `<button class="pill pres"><ha-icon></ha-icon><span></span></button>` : ""}
        ${link ? `<button class="pill link"><ha-icon></ha-icon><span></span><ha-icon class="ch" icon="mdi:chevron-right"></ha-icon></button>` : ""}
      </div></div>${
        this._ignoredId()
          ? `<div class="ign" hidden><div class="ihead"><span class="slot"><ha-icon icon="${IGNORE_ICON}"></ha-icon></span>
        <span class="txt"><span class="nm"></span><span class="isc"></span></span></div>
        <button class="pill stop"><ha-icon icon="${COUNT_ICON}"></ha-icon><span>Stop ignoring</span></button></div>`
          : ""
      }</ha-card>`;
    const wx = root.querySelector(".wx");
    let timer = null;
    let held = false;
    wx.addEventListener("pointerdown", () => {
      held = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        held = true;
        this._fire("haptic", "medium");
        this._more(this._config.temperature || this._config.weather);
      }, HOLD_MS);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => wx.addEventListener(t, () => clearTimeout(timer)));
    wx.addEventListener("contextmenu", (e) => e.preventDefault());
    // After a hold, the finger lifting must not "click" the dialog that just opened under it.
    wx.addEventListener("touchend", (e) => held && e.cancelable && e.preventDefault(), { passive: false });
    // A tap on a reading opens its own sensor; anywhere else on the weather, the forecast.
    wx.addEventListener("click", (e) => {
      if (held) return (held = false);
      const v = e.target.closest?.("[data-e]");
      this._more(v ? v.dataset.e : this._config.weather);
    });
    wx.addEventListener("keydown", (e) => {
      if (e.target !== wx || (e.key !== "Enter" && e.key !== " ")) return; // the reading button handles its own keys
      e.preventDefault();
      this._more(this._config.weather);
    });
    root.querySelector(".pres")?.addEventListener("click", () => {
      const p = this._config.presence;
      if (p?.navigation_path) this._navigate(p.navigation_path);
      else this._more(this._presenceId());
    });
    root.querySelector(".link")?.addEventListener("click", () => link?.navigation_path && this._navigate(link.navigation_path));
    root.querySelector(".stop")?.addEventListener("click", () => this._stopIgnoring());
    this._built = true;
    this._observe();
    this.ownerDocument.fonts?.ready?.then(() => this._fitAll());
  }

  _render() {
    inkSchedule(this, ".txt", () => this._fitAll());
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const root = this.shadowRoot;
    let changed = false;
    const set = (node, v, html = false) => {
      if (!node) return;
      // HTML is compared with what was last written (innerHTML never serialises back to the same
      // string), so a reading under the finger isn't rebuilt mid-tap.
      if (html ? node._h !== v : node.textContent !== v) {
        html ? ((node.innerHTML = v), (node._h = v)) : (node.textContent = v);
        changed = true;
      }
    };

    const w = hass.states[this._config.weather];
    // The weather circle is a tap target (it opens the forecast), and a tap target is never grey:
    // grey weather (cloudy, fog, unknown) shows teal (design tokens → Colours).
    const [icon, wc] = WEATHER[w?.state] || ["mdi:weather-cloudy", C.grey];
    const color = wc === C.grey ? C.teal : wc;
    const shape = root.querySelector(".shape");
    shape.style.background = tint(color, 20);
    shape.querySelector("ha-icon").setAttribute("icon", icon);
    shape.querySelector("ha-icon").style.color = color;
    const cond = !w ? "Weather unavailable" : hass.formatEntityState ? hass.formatEntityState(w) : w.state.charAt(0).toUpperCase() + w.state.slice(1);
    set(root.querySelector(".nm"), cond);
    const real = root.querySelector(".v.real");
    if (real) set(real.querySelector("span"), `${this._config.temperature_name || "Real"} ${temp(hass.states[this._config.temperature]?.state)}`);
    const fc = root.querySelector(".v.fc");
    if (fc.hidden !== !w) {
      fc.hidden = !w;
      changed = true;
    }
    if (w) set(fc.querySelector("span"), `${this._config.weather_name || "Forecast"} ${temp(w.attributes?.temperature)}`);

    const pres = root.querySelector(".pres");
    if (pres) {
      const home = this._home(hass.states[this._presenceId()]);
      pres.classList.toggle("home", home === true);
      pres.querySelector("ha-icon").setAttribute("icon", home ? "mdi:home-account" : "mdi:home-export-outline");
      const away = this._since ? (Date.now() - this._since > HISTORY_DAYS * 86400000 ? `${HISTORY_DAYS} d+` : ago(Date.now() - this._since)) : "";
      const label = home === null ? "Presence –" : home ? "Home" : away ? `Away · ${away}` : "Away";
      set(pres.querySelector("span"), label);
    }
    const link = root.querySelector(".link");
    const lc = this._link();
    if (link && lc) {
      link.querySelector("ha-icon").setAttribute("icon", lc.icon || "mdi:arrow-right");
      set(link.querySelector("span"), lc.name || "Open");
    }
    const ign = root.querySelector(".ign");
    if (ign) {
      const m = ignoring(hass, this._ignoredId());
      this._ignoring = m;
      // The pill rests for the people it was pressed for; nobody ignored, or someone else, ends it.
      if (!m || (this._pending && this._pending !== m.persons.concat(m.names).join("|"))) this._pending = false;
      if (ign.hidden !== !m) {
        ign.hidden = !m;
        changed = true;
      }
      if (m) {
        set(ign.querySelector(".nm"), `Ignoring ${m.who}`);
        set(ign.querySelector(".isc"), "Heating follows the next person home");
        const stop = ign.querySelector(".stop");
        const off = String(!!this._pending);
        if (stop.getAttribute("aria-disabled") !== off) stop.setAttribute("aria-disabled", off);
      }
    }
    // New text ("Away · 3 h", a longer condition, another name) can change what fits; check once per frame.
    if (changed && this._ro && !this._fitQueued) {
      this._fitQueued = true;
      requestAnimationFrame(() => {
        this._fitQueued = false;
        this._fitAll();
      });
    }
  }

  /* Stop ignoring asks first (in teal, the pill's colour), then has Home ETA count the phones it
     shows again. The pill rests until the row goes or the call fails; a failure (e.g. a user Home
     Assistant refuses) shows Home Assistant's own message, once. */
  async _stopIgnoring() {
    const m = this._ignoring;
    if (!m || this._pending || this._asking) return;
    this._asking = true;
    let ok;
    try {
      ok = await confirmDialog({
        title: `Stop ignoring ${m.who}`,
        icon: COUNT_ICON,
        color: C.teal,
        text: `Home presence will count ${m.several ? "their phones" : "their phone"} again.`,
        confirmLabel: "Stop ignoring",
      });
    } finally {
      this._asking = false;
    }
    if (!ok) return;
    this._pending = m.persons.concat(m.names).join("|");
    this._render();
    try {
      await this._hass.callService("home_eta", "stop_ignoring", m.persons.length ? { members: m.persons } : {}, undefined, false);
    } catch (err) {
      this._pending = false;
      this._render();
      this._fire("hass-notification", { message: err?.message || `Couldn't stop ignoring ${m.who}.` });
    }
  }

  _more(entityId) {
    if (entityId) this._fire("hass-more-info", { entityId });
  }

  _navigate(path) {
    history.pushState(null, "", path);
    this._fire("location-changed", { replace: false });
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerWeatherPresenceCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(WPC_TAG)) return;
  registry.define(WPC_TAG, WeatherPresenceCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: WPC_TAG,
    name: "Weather & presence",
    description: "Weather with your own outdoor temperature, plus a presence pill and a link pill.",
  });
  console.info(`%c WEATHER-PRESENCE-CARD %c ${WPC_VERSION} `, "background:#009688;color:#fff", "");
}

registerWeatherPresenceCard();
