/*
 * Weather & presence card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A slim block for the top of a climate section: the weather (condition, your own
 * outdoor sensor and the forecast service's temperature) with two pills on the
 * right – who is home (tap for e.g. the security dashboard) and a link pill (tap
 * for e.g. the climate dashboard). Either pill can be left out, e.g. the link pill
 * on the very dashboard it would link to.
 * See cards/weather-presence-card/README.md for every option.
 */

const WPC_VERSION = "1.3.0";
const WPC_TAG = "weather-presence-card";
const HISTORY_DAYS = 7;
const HOLD_MS = 500;

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  teal: "var(--teal-color, #009688)",
  orange: "var(--orange-color, #ff9800)",
  blue: "var(--blue-color, #2196f3)",
};
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
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const temp = (v) => (num(v) === null ? "–" : `${num(v).toFixed(1)}°C`);

function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

const CSS = `
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 12px 10px; container-type: inline-size; }
  .wrap { display: flex; align-items: center; gap: 10px; }
  .wx { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; border-radius: 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { min-width: 0; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc { display: flex; flex-wrap: wrap; column-gap: 9px; font-size: 12px; line-height: 16px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  .v { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .v ha-icon, .pill ha-icon { flex: none; width: var(--mdc-icon-size); height: var(--mdc-icon-size); }
  .v ha-icon { --mdc-icon-size: 14px; }
  .v.real ha-icon { color: color-mix(in srgb, ${C.orange} 55%, ${C.grey}); }
  .v.fc ha-icon { color: color-mix(in srgb, ${C.blue} 55%, ${C.grey}); }
  .pills { flex: none; display: flex; gap: 8px; align-items: center; }
  /* Pills are finger-sized (36px, 40px on a phone) – they are the card's buttons. */
  .pill { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; font-size: 13px; font-weight: 600; letter-spacing: .2px;
    white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  /* Phone: pills are 40px (44 read as too large, 36 as too small to hit). */
  @container (max-width: 440px) {
    .pill { height: 40px; border-radius: 20px; }
  }
  /* The pills stay beside the weather whenever they fit there (the readings may wrap onto two
     lines). Only when they don't – measured in _fit() – do they move to a row of wide buttons
     below it, e.g. two pills on a 375px phone. */
  .wrap.stacked { flex-wrap: wrap; row-gap: 8px; }
  .wrap.stacked .wx { flex: 1 1 100%; }
  .wrap.stacked .pills { flex: 1 1 100%; display: grid; grid-template-columns: repeat(var(--np, 2), minmax(0, 1fr)); }
  .pill.home { background: ${tint(C.teal, 20)}; color: ${C.teal}; }
  .pill.home ha-icon { color: ${C.teal}; }
  .pill.link { color: var(--primary-text-color); padding-right: 4px; }
  .pill.link ha-icon { color: ${C.teal}; }
  .pill.link ha-icon.ch { --mdc-icon-size: 16px; color: ${C.grey}; margin-left: -3px; }
  .pill:active, .wx:active { filter: brightness(.92); }
  .pill:focus-visible, .wx:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
`;

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
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          weather: "Tap the weather for the forecast; long-press for your own sensor.",
          hide: "E.g. on the dashboard it links to. Its settings below are kept.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.weather) throw new Error("Set a weather entity");
    this._config = { ...config };
    this._built = false;
    this._since = undefined;
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
    this._ro = this._ro || new ResizeObserver(() => this._fit());
    this._ro.disconnect();
    this._ro.observe(wrap);
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
    const pills = root ? [...root.querySelectorAll(".pill")] : [];
    if (!wrap || !pills.length || !wrap.clientWidth) return; // nothing to place, or not laid out (hidden)
    const range = this.ownerDocument.createRange();
    const contentW = (node) => (range.selectNodeContents(node), range.getBoundingClientRect().width);
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    const wx = root.querySelector(".wx");
    const text = Math.max(contentW(root.querySelector(".nm")), ...[...root.querySelectorAll(".sc .v")].map((v) => v.getBoundingClientRect().width));
    const weather = root.querySelector(".shape").offsetWidth + px(wx, "columnGap") + text;
    const pillsW =
      pills.reduce((s, p) => s + contentW(p) + px(p, "paddingLeft") + px(p, "paddingRight"), 0) +
      px(root.querySelector(".pills"), "columnGap") * (pills.length - 1);
    wrap.classList.toggle("stacked", WeatherPresenceCard.stacks(wrap.clientWidth, weather, px(wrap, "columnGap"), pillsW));
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
    const np = (this._presenceId() ? 1 : 0) + (link ? 1 : 0);
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="wrap">
      <div class="wx" role="button" tabindex="0"><div class="shape"><ha-icon></ha-icon></div>
        <div class="txt"><div class="nm"></div><div class="sc"></div></div></div>
      <div class="pills" style="--np:${np || 1}${np ? "" : ";display:none"}">
        ${this._presenceId() ? `<button class="pill pres"><ha-icon></ha-icon><span></span></button>` : ""}
        ${link ? `<button class="pill link"><ha-icon></ha-icon><span></span><ha-icon class="ch" icon="mdi:chevron-right"></ha-icon></button>` : ""}
      </div></div></ha-card>`;
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
    wx.addEventListener("click", () => {
      if (held) return (held = false);
      this._more(this._config.weather);
    });
    root.querySelector(".pres")?.addEventListener("click", () => {
      const p = this._config.presence;
      if (p?.navigation_path) this._navigate(p.navigation_path);
      else this._more(this._presenceId());
    });
    root.querySelector(".link")?.addEventListener("click", () => link?.navigation_path && this._navigate(link.navigation_path));
    this._built = true;
    this._observe();
    this.ownerDocument.fonts?.ready?.then(() => this._fit());
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const root = this.shadowRoot;
    let changed = false;
    const set = (node, v, html = false) => {
      if (!node) return;
      if (html ? node.innerHTML !== v : node.textContent !== v) {
        html ? (node.innerHTML = v) : (node.textContent = v);
        changed = true;
      }
    };

    const w = hass.states[this._config.weather];
    const [icon, color] = WEATHER[w?.state] || ["mdi:weather-cloudy", C.grey];
    const shape = root.querySelector(".shape");
    shape.style.background = tint(color, 20);
    shape.querySelector("ha-icon").setAttribute("icon", icon);
    shape.querySelector("ha-icon").style.color = color;
    const cond = !w ? "Weather unavailable" : hass.formatEntityState ? hass.formatEntityState(w) : w.state.charAt(0).toUpperCase() + w.state.slice(1);
    set(root.querySelector(".nm"), cond);
    const parts = [];
    if (this._config.temperature)
      parts.push(`<span class="v real"><ha-icon icon="mdi:thermometer"></ha-icon>${esc(this._config.temperature_name || "Real")} ${esc(temp(hass.states[this._config.temperature]?.state))}</span>`);
    if (w)
      parts.push(`<span class="v fc"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>${esc(this._config.weather_name || "Forecast")} ${esc(temp(w.attributes?.temperature))}</span>`);
    set(root.querySelector(".sc"), parts.join(""), true);

    const pres = root.querySelector(".pres");
    if (pres) {
      const home = this._home(hass.states[this._presenceId()]);
      pres.classList.toggle("home", home === true);
      pres.querySelector("ha-icon").setAttribute("icon", home ? "mdi:home-account" : "mdi:home-export-outline");
      const label = home === null ? "Presence ?" : home ? "Home" : this._since ? `Away · ${Date.now() - this._since > HISTORY_DAYS * 86400000 ? `${HISTORY_DAYS}d+` : ago(Date.now() - this._since)}` : "Away";
      set(pres.querySelector("span"), label);
    }
    const link = root.querySelector(".link");
    const lc = this._link();
    if (link && lc) {
      link.querySelector("ha-icon").setAttribute("icon", lc.icon || "mdi:arrow-right");
      set(link.querySelector("span"), lc.name || "Open");
    }
    // New text ("Away · 3h", a longer condition) can change what fits; check once per frame.
    if (changed && this._ro && !this._fitQueued) {
      this._fitQueued = true;
      requestAnimationFrame(() => {
        this._fitQueued = false;
        this._fit();
      });
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
