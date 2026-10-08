/*
 * Air quality card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every room's air in one card: a label row that sums up the house, and a tile
 * per room with its status (Excellent / Elevated / Poor / Ventilate) and its key
 * readings – CO₂, PM2.5 and VOC always, plus whatever else is causing trouble.
 * Readings that are out of range take their level's colour; a room that needs a
 * window opened glows red. Tap a room for its own air-quality dashboard.
 * See cards/air-quality-card/README.md for every option.
 */

const AQC_VERSION = "1.0.0";
const AQC_TAG = "air-quality-card";

const C = {
  green: "var(--green-color, #4caf50)",
  amber: "var(--amber-color, #ffc107)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
  grey: "var(--grey-color, #9e9e9e)",
};
const TIERS = [
  { color: C.green, icon: "mdi:leaf", word: "Excellent" },
  { color: C.amber, icon: "mdi:information-outline", word: "Elevated" },
  { color: C.orange, icon: "mdi:alert-outline", word: "Poor" },
  { color: C.red, icon: "mdi:alert-circle-outline", word: "Poor air" },
];
// Readable text versions of the tier colours (amber text on white is too faint).
const TEXT = [
  "color-mix(in srgb, var(--green-color, #4caf50) 75%, var(--primary-text-color))",
  "color-mix(in srgb, var(--amber-color, #ffc107) 70%, var(--primary-text-color))",
  "color-mix(in srgb, var(--orange-color, #ff9800) 80%, var(--primary-text-color))",
  "color-mix(in srgb, var(--red-color, #f44336) 85%, var(--primary-text-color))",
];

/*
 * Pollutants: sensor suffix (with `prefix`), default thresholds [elevated, poor, ventilate]
 * (null = that level is skipped), label, icon, decimals, unit, and whether it is always shown.
 */
const POLLUTANTS = {
  co2: { suffix: "co2", t: [800, null, 1000], label: "CO₂", icon: "mdi:molecule-co2", digits: 0, unit: "ppm", always: true, gas: true },
  pm2_5: { suffix: "pm2_5", t: [12, null, 36], label: "PM2.5", icon: "mdi:grain", digits: 1, always: true },
  voc: { suffix: "voc_index", t: [150, 250, 400], label: "VOC", icon: "mdi:spray", digits: 0, always: true, gas: true },
  pm1: { suffix: "pm1", t: [12, null, 36], label: "PM1", digits: 1 },
  pm4: { suffix: "pm4", t: [17, null, 51], label: "PM4", digits: 1 },
  pm10: { suffix: "pm10", t: [17, null, 51], label: "PM10", digits: 1 },
  nox: { suffix: "nox_index", t: [20, 150, 300], label: "NOx", digits: 0, gas: true },
};
const ORDER = ["co2", "pm2_5", "voc", "pm1", "pm4", "pm10", "nox"];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

function level(value, t) {
  if (value === null) return 0;
  if (t[2] !== null && t[2] !== undefined && value >= t[2]) return 3;
  if (t[1] !== null && t[1] !== undefined && value >= t[1]) return 2;
  if (t[0] !== null && t[0] !== undefined && value >= t[0]) return 1;
  return 0;
}

/* Everything one tile shows. */
function roomModel(hass, room, thresholds = {}) {
  const readings = [];
  for (const key of ORDER) {
    const p = POLLUTANTS[key];
    const id = room[key] || (room.prefix ? `${room.prefix}${p.suffix}` : null);
    if (!id || !hass.states[id]) continue;
    const value = num(hass.states[id].state);
    readings.push({ key, id, value, level: level(value, thresholds[key] || p.t), ...p });
  }
  const worst = readings.reduce((m, r) => Math.max(m, r.level), 0);
  const tier = { ...TIERS[worst] };
  if (worst === 3 && readings.some((r) => r.level === 3 && r.gas)) {
    tier.word = "Ventilate";
    tier.icon = "mdi:window-open-variant";
  }
  // Always CO₂ / PM2.5 / VOC; any other pollutant only while it is the cause.
  const shown = readings.filter((r) => r.always || (worst > 0 && r.level === worst));
  return { name: room.name || "Room", worst, tier, readings: shown, missing: !readings.length };
}

const CSS = `
  :host { display: block; }
  ha-card { padding: 6px; }
  .label { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 2px 6px 6px; }
  .label ha-icon { --mdc-icon-size: 18px; }
  .title { font-size: 13px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; min-width: 0; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px;
    color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rooms { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 6px; }
  .room { all: unset; box-sizing: border-box; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 9px 10px;
    min-height: 58px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; container-type: inline-size; }
  /* A room that needs a window opened glows red, like a lit room glows on the lights card. */
  .room.alarm { background: ${tint(C.red, 10)}; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  .txt { flex: 1; min-width: 0; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m { display: flex; flex-wrap: wrap; column-gap: 7px; font-size: 12px; line-height: 16px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  .st { font-weight: 500; white-space: nowrap; }
  .v { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .v small { font-size: 10px; }
  .v.hot { font-weight: 600; }
  .room:active { filter: brightness(.94); }
  .room:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  @container (max-width: 175px) { .room { padding: 9px 6px; gap: 6px; } .m { column-gap: 5px; font-size: 11.5px; } }
`;

class AirQualityCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Air quality", rooms: [] };
  }

  static getConfigForm() {
    const sensor = { entity: { domain: "sensor" } };
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "rooms", selector: { object: {
          multiple: true,
          label_field: "name",
          description_field: "prefix",
          fields: {
            name: { label: "Name", required: true, selector: { text: {} } },
            prefix: { label: "Sensor prefix (e.g. sensor.study_air_quality_)", selector: { text: {} } },
            navigation_path: { label: "Tap goes to", selector: { navigation: {} } },
            co2: { label: "CO₂ (if not found by the prefix)", selector: sensor },
            pm2_5: { label: "PM2.5", selector: sensor },
            voc: { label: "VOC index", selector: sensor },
            pm1: { label: "PM1", selector: sensor },
            pm4: { label: "PM4", selector: sensor },
            pm10: { label: "PM10", selector: sensor },
            nox: { label: "NOx index", selector: sensor },
          },
        } } },
      ],
      computeLabel: (s) => ({ title: "Title", rooms: "Rooms" })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          rooms: "With a prefix, the card finds <prefix>co2, pm1, pm2_5, pm4, pm10, voc_index and nox_index by itself.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms)) throw new Error("Add a list of rooms");
    this._config = { ...config, rooms: config.rooms.filter(Boolean) };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 1 + Math.ceil((this._config?.rooms?.length || 0) / 2) * 1.5;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const c = this._config;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><ha-icon icon="mdi:leaf"></ha-icon><span class="title">${esc(c.title ?? "Air quality")}</span><span class="sum"></span></div>
      <div class="rooms" style="--cols:${Math.max(1, Math.min(4, Number(c.columns) || 2))}">
        ${c.rooms
          .map((r, i) => `<button class="room" data-i="${i}"><span class="shape"><ha-icon></ha-icon></span>
            <span class="txt"><div class="nm"></div><div class="m"></div></span></button>`)
          .join("")}
      </div></ha-card>`;
    root.querySelectorAll(".room").forEach((b) =>
      b.addEventListener("click", () => {
        const room = c.rooms[Number(b.dataset.i)];
        if (room.navigation_path) {
          history.pushState(null, "", room.navigation_path);
          this._fire("location-changed", { replace: false });
        } else {
          const id = room.co2 || (room.prefix ? `${room.prefix}co2` : null);
          if (id) this._fire("hass-more-info", { entityId: id });
        }
      }),
    );
    this._built = true;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const models = this._config.rooms.map((r) => roomModel(this._hass, r, this._config.thresholds));

    models.forEach((m, i) => {
      const el = root.querySelectorAll(".room")[i];
      el.classList.toggle("alarm", m.worst === 3);
      const shape = el.querySelector(".shape");
      shape.style.backgroundColor = tint(m.tier.color, 20);
      const icon = shape.querySelector("ha-icon");
      if (icon.getAttribute("icon") !== m.tier.icon) icon.setAttribute("icon", m.tier.icon);
      icon.style.color = m.tier.color;
      const nm = el.querySelector(".nm");
      if (nm.textContent !== m.name) nm.textContent = m.name;
      el.setAttribute("aria-label", `${m.name}: ${m.tier.word}`);
      // Only touch the DOM when something changed, so a tap is never lost mid-update.
      const html =
        `<span class="st" style="color:${TEXT[m.worst]}">${m.missing ? "No sensors" : esc(m.tier.word)}</span>` +
        m.readings
          .map((r) => {
            const v = r.value === null ? "–" : r.value.toFixed(r.digits);
            const hot = r.level > 0;
            const head = r.icon ? `<ha-icon icon="${r.icon}"${hot ? ` style="color:${TIERS[r.level].color}"` : ""}></ha-icon>` : `${r.label} `;
            return `<span class="v${hot ? " hot" : ""}" title="${esc(r.label)}"${hot ? ` style="color:${TEXT[r.level]}"` : ""}>${head}${v}${r.unit ? `<small> ${r.unit}</small>` : ""}</span>`;
          })
          .join("");
      const mEl = el.querySelector(".m");
      if (mEl.dataset.h !== html) {
        mEl.innerHTML = html;
        mEl.dataset.h = html;
      }
    });

    // The house in a few words.
    const worst = models.reduce((a, m) => Math.max(a, m.worst), 0);
    let sum = "All excellent";
    if (worst === 3) {
      const rooms = models.filter((m) => m.worst === 3);
      sum = `${rooms.some((m) => m.tier.word === "Ventilate") ? "Ventilate" : "Poor air in"} ${rooms.map((m) => m.name).join(", ")}`;
    } else if (worst === 2) {
      sum = `Poor in ${models.filter((m) => m.worst === 2).map((m) => m.name).join(", ")}`;
    } else if (worst === 1) {
      const n = models.filter((m) => m.worst === 1).length;
      sum = `${n} ${n === 1 ? "room" : "rooms"} elevated`;
    }
    const sumEl = root.querySelector(".sum");
    if (sumEl.textContent !== sum) sumEl.textContent = sum;
    const lab = root.querySelector(".label ha-icon");
    const lt = { ...TIERS[worst] };
    lab.setAttribute("icon", worst ? lt.icon : "mdi:leaf");
    lab.style.color = lt.color;
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerAirQualityCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(AQC_TAG)) return;
  registry.define(AQC_TAG, AirQualityCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: AQC_TAG,
    name: "Air quality",
    description: "Every room's air quality in one card: status, key readings, and a red glow when a room needs ventilating.",
  });
  console.info(`%c AIR-QUALITY-CARD %c ${AQC_VERSION} `, "background:#4caf50;color:#fff", "");
}

registerAirQualityCard();
