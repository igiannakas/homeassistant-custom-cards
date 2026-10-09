/*
 * Climate modes card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Whole-house shortcuts in one card: a label row (icon, title, what the rooms are
 * on, or a switch) and a row of mode tiles. A tile glows in its colour while it is
 * the active mode. Made for heating presets across several thermostats, and just
 * as happy with any entity + state (e.g. an aircon speed helper).
 * See cards/climate-modes-card/README.md for every option.
 */

const CMC_VERSION = "1.1.2";
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

/* Which mode is on? A preset all thermostats share, or a mode's own entity + state. */
function activeIndex(hass, cfg) {
  const modes = cfg.modes || [];
  const th = list(cfg.thermostats).map((id) => hass.states[id]).filter(Boolean);
  const presets = th.map((s) => s.attributes?.preset_mode);
  const allSame = presets.length && presets.every((p) => p === presets[0]);
  return modes.findIndex((m) => {
    if (m.active?.entity) {
      const s = hass.states[m.active.entity];
      return !!s && list(m.active.state).map(String).includes(String(s.state));
    }
    return m.preset !== undefined && allSame && presets[0] === m.preset;
  });
}

const CSS = `
  :host { display: block; }
  ha-card { padding: 6px; }
  /* Card label row, the same on every card: 40px high (room for the 24px switch), the icon centred
     in a 36px slot so titles line up across cards and with the tile icons below. Only an icon
     you can tap gets a filled circle (e.g. All lights). */
  .label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 2px 6px 8px; }
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 18px; }
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
  /* Label-row switch: 40×24, the same on every card. */
  .sw { flex: none; width: 40px; height: 24px; border-radius: 12px; position: relative; background: var(--disabled-color, #bdbdbd); transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .switch.on .sw { background: var(--sw-color); }
  .switch.on .sw::after { transform: translateX(16px); }
  .modes { display: grid; grid-template-columns: repeat(var(--n, 5), minmax(0, 1fr)); gap: 6px; }
  .mode { all: unset; box-sizing: border-box; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 10px 2px 9px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
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
          modes: "Modes",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          modes: "One entry per tile: name, icon, color, preset (or active: {entity, state}) and tap_action.",
          switch: "Shown after the status, e.g. summer mode or an automatic-aircon automation.",
          switch_tap_action: "E.g. navigate to #summer-mode to confirm in a pop-up first.",
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
    root.innerHTML = `<style>${CSS}</style><ha-card>
      ${c.title || c.icon ? `<div class="label"><ha-icon icon="${esc(c.icon || "mdi:thermostat")}" style="color:${color(c.icon_color || "orange")}"></ha-icon>
        <span class="title">${esc(c.title || "")}</span>
        <span class="status"></span>
        ${c.switch ? `<button class="switch" role="switch" style="--sw-color:${color(c.switch_color || "blue")}"><span class="swl"></span><span class="sw"></span></button>` : ""}</div>` : ""}
      <div class="modes" style="--n:${Math.max(1, c.modes.length)}">
        ${c.modes
          .map((m, i) => `<button class="mode" data-i="${i}" style="--c:${color(m.color)}" aria-pressed="false">
            <span class="shape"><ha-icon icon="${esc(m.icon || "mdi:thermostat")}"></ha-icon></span><span class="name">${esc(m.name || "")}</span></button>`)
          .join("")}
      </div></ha-card>`;
    root.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => this._tap(c.modes[Number(b.dataset.i)])));
    root.querySelector(".switch")?.addEventListener("click", () => this._toggleSwitch());
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
      b.classList.toggle("on", i === active);
      b.setAttribute("aria-pressed", String(i === active));
    });
    const status = root.querySelector(".status");
    if (status) {
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

  async _tap(mode) {
    const a = mode?.tap_action;
    if (!a || a.action === "none") return;
    this._fire("haptic", "light");
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

  async _toggleSwitch() {
    if (this._config.switch_tap_action) return this._tap({ tap_action: this._config.switch_tap_action });
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
