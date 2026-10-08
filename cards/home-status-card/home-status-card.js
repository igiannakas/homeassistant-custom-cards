/*
 * Home status card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * One compact card for a remote home: who is there (or who was seen last, and
 * when), an alarm switch that asks before it changes, three status buttons
 * (door, TV, climate) and an ePaper message line. The status buttons stay grey
 * while things are normal and only take a colour when they need attention.
 * See cards/home-status-card/README.md for every option.
 */

const HSC_VERSION = "1.2.0";
const HSC_TAG = "home-status-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  teal: "var(--teal-color, #009688)",
  orange: "var(--orange-color, #ff9800)",
  amber: "var(--amber-color, #ffc107)",
  red: "var(--red-color, #f44336)",
  blue: "var(--blue-color, #2196f3)",
};
const RECENT_S = 3600;

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const unavailable = (s) => !s || s.state === "unavailable" || s.state === "unknown";

function when(date) {
  // Same wording as the old chip: "today at 16:09", "yesterday at 09:12", "on Oct 03 at 18:40".
  const now = new Date();
  const hm = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(date, now)) return `today at ${hm}`;
  if (sameDay(date, y)) return `yesterday at ${hm}`;
  return `on ${date.toLocaleDateString("en-GB", { month: "short", day: "2-digit" })} at ${hm}`;
}

function parseLocal(value) {
  // input_datetime state "YYYY-MM-DD HH:MM:SS" is local time.
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  return isNaN(d) ? null : d;
}

/* Everything the card shows, from hass + config, in one place. */
function model(hass, cfg) {
  const st = (id) => (id ? hass.states[id] : undefined);
  const p = cfg.presence || {};
  // The occupied / last-room texts are shown exactly as the helpers hold them.
  const occupied = (st(p.occupied)?.state || "").trim();
  const lastSeen = parseLocal(st(p.last_seen)?.state);
  const lastRoom = (st(p.last_room)?.state || "").trim();
  let presence;
  if (occupied && !unavailable(st(p.occupied)))
    presence = { color: C.teal, label: "Occupied", detail: occupied, icon: "mdi:home-account" };
  else {
    // As before: orange if someone was seen within the hour, red otherwise.
    const recent = lastSeen && (Date.now() - lastSeen.getTime()) / 1000 < RECENT_S;
    const seen = lastSeen ? `${lastRoom ? `in the ${lastRoom} ` : ""}${when(lastSeen)}` : "";
    presence = {
      color: recent ? C.orange : C.red,
      label: "Empty",
      detail: seen ? `A person was last seen ${seen}` : "No one seen yet",
      icon: "mdi:home-outline",
    };
  }

  const alarmSt = st(cfg.alarm);
  const alarm = alarmSt ? { on: alarmSt.state === "on", unavailable: unavailable(alarmSt) } : null;

  const tiles = [];
  if (cfg.door) {
    const s = st(cfg.door);
    const open = s && /open|on/.test(s.state) && !/closed/.test(s.state);
    tiles.push({
      key: "door",
      icon: open ? "mdi:door-open" : "mdi:door-closed",
      label: unavailable(s) ? "Door ?" : open ? "Open" : "Closed",
      color: open ? C.red : null,
      action: { action: "more-info", entity: cfg.door },
      title: "Door",
    });
  }
  if (cfg.tv) {
    const tv = typeof cfg.tv === "string" ? { entity: cfg.tv } : cfg.tv;
    const s = st(tv.entity);
    const on = s && s.state === "on";
    tiles.push({
      key: "tv",
      icon: on ? "mdi:television" : "mdi:television-off",
      label: unavailable(s) ? "TV ?" : on ? "TV on" : "TV off",
      color: on ? C.amber : null,
      action: tv.navigation_path ? { action: "navigate", path: tv.navigation_path } : { action: "more-info", entity: tv.entity },
      title: "TV",
    });
  }
  if (cfg.climate) {
    const cl = cfg.climate;
    const t = num(st(cl.temperature)?.state);
    const mode = (st(cl.state)?.state || "").trim();
    let color = null;
    let icon = "mdi:air-conditioner";
    if (/cool/i.test(mode)) {
      color = C.blue;
      icon = "mdi:snowflake";
    } else if (/heat/i.test(mode)) {
      color = C.red;
      icon = "mdi:fire";
    }
    // Short enough to fit a phone-width button: "25.1° · Cool".
    const short = /off/i.test(mode) ? "Off" : /cool/i.test(mode) ? "Cool" : /heat/i.test(mode) ? "Heat"
      : mode.replace(/^AC\s*/i, "") || "–";
    tiles.push({
      key: "climate",
      icon,
      label: `${t === null ? "–" : t.toFixed(1)}° · ${short}`,
      color,
      action: cl.navigation_path ? { action: "navigate", path: cl.navigation_path } : { action: "more-info", entity: cl.temperature },
      title: "Climate",
    });
  }

  const msgSt = st(cfg.message);
  const message = msgSt && !unavailable(msgSt) ? msgSt.state.trim() : "";

  return { presence, alarm, tiles, message };
}

/* ------------------------------------------------------------------------ */
/* Confirmation dialog – same look as the Tado X room card's Boost dialog    */
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

function confirmDialog({ title, icon, color, bodyIcon, primary, secondary, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("hsc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="row body"><div class="glyph"><ha-icon icon="${esc(bodyIcon)}" style="color:${color}"></ha-icon></div>
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
  ha-card { container-type: inline-size; padding: 10px 12px; display: grid; gap: 8px; }
  /* Icon on the left across both lines; title and alarm switch share the first line, so the
     presence text below gets the full width. */
  .head { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; grid-template-areas: "s n a" "s d d";
    column-gap: 10px; align-items: center; }
  .who { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .shape { grid-area: s; align-self: start; width: 36px; height: 36px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 20px; transition: color 180ms; }
  .name { grid-area: n; min-width: 0; font-size: 14px; line-height: 18px; font-weight: 500; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name .state { font-weight: 400; color: var(--secondary-text-color); }
  .detail { grid-area: d; min-width: 0; font-size: 12px; line-height: 15px; color: var(--secondary-text-color);
    letter-spacing: .2px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .alarm { all: unset; grid-area: a; box-sizing: border-box; display: flex; align-items: center; gap: 5px; height: 28px;
    padding: 0 10px 0 7px; border-radius: 14px; cursor: pointer; font-size: 12px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color);
    transition: background-color 180ms, color 180ms; -webkit-tap-highlight-color: transparent; }
  .alarm ha-icon { --mdc-icon-size: 16px; color: var(--grey-color, #9e9e9e); }
  .alarm.on { background: color-mix(in srgb, var(--red-color, #f44336) 20%, transparent); color: var(--red-color, #f44336); }
  .alarm.on ha-icon { color: var(--red-color, #f44336); }
  /* Press feedback without moving the button: a scale-down shrinks the target under the finger
     and taps near the edge would be lost. */
  .alarm:active, .tile:active, .msg:active, .shape.who:active { filter: brightness(.9); }
  .alarm:focus-visible, .tile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .tiles { display: grid; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); gap: 6px; }
  .tile { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 6px;
    height: 30px; padding: 0 8px; border-radius: 15px; cursor: pointer; min-width: 0;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color);
    font-size: 12px; font-weight: 500; transition: background-color 180ms; -webkit-tap-highlight-color: transparent; }
  .tile ha-icon { --mdc-icon-size: 16px; flex: 0 0 auto; color: var(--grey-color, #9e9e9e); }
  .tile span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .msg { all: unset; box-sizing: border-box; display: flex; align-items: flex-start; gap: 8px; min-height: 30px; padding: 7px 12px;
    border-radius: 15px; cursor: pointer; font-size: 12px; line-height: 16px; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .msg ha-icon { --mdc-icon-size: 16px; color: var(--grey-color, #9e9e9e); flex: 0 0 auto; }
  /* Long ePaper messages wrap in full; nothing is cut off. */
  .msg span { min-width: 0; white-space: pre-line; overflow-wrap: anywhere; }
  .msg span.empty { color: var(--secondary-text-color); }
  .msg:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Wide cards: status buttons and the ePaper line share one row. */
  @container (min-width: 600px) {
    ha-card { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; }
    .head { grid-column: 1 / -1; }
  }
  @container (max-width: 300px) {
    .alarm .txt { display: none; }
    .alarm { padding: 0 8px; }
    .tile { gap: 4px; padding: 0 6px; }
  }
`;

class HomeStatusCard extends HTMLElement {
  static getStubConfig() {
    return { name: "Home" };
  }

  // Visual editor (Home Assistant builds it from this schema). Nested options get their own
  // collapsible section; anything left empty is simply not shown on the card.
  static getConfigForm() {
    const entity = (domain) => ({ entity: domain ? { domain } : {} });
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { type: "expandable", name: "presence", title: "Presence", icon: "mdi:home-account", expanded: true, schema: [
          { name: "occupied", selector: entity() },
          { name: "last_room", selector: entity() },
          { name: "last_seen", selector: entity(["input_datetime", "sensor"]) },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
        { name: "alarm", selector: entity(["input_boolean", "switch"]) },
        { name: "door", selector: entity() },
        { type: "expandable", name: "tv", title: "TV", icon: "mdi:television", schema: [
          { name: "entity", selector: entity() },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
        { type: "expandable", name: "climate", title: "Climate", icon: "mdi:air-conditioner", schema: [
          { name: "temperature", selector: entity("sensor") },
          { name: "state", selector: entity() },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
        { name: "message", selector: entity() },
      ],
      computeLabel: (s) =>
        ({
          name: "Name",
          icon: "Icon (optional)",
          occupied: "Occupied rooms (text)",
          last_room: "Last room (text)",
          last_seen: "Last seen (date and time)",
          navigation_path: "Tap goes to",
          alarm: "Alarm switch",
          door: "Door sensor",
          entity: "TV on/off entity",
          temperature: "Temperature sensor",
          state: "AC state (text)",
          message: "ePaper message",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          occupied: "Shown as it is stored. Empty means nobody is home.",
          state: "Text containing “cool” or “heat” colours the button; “off” shows Off.",
          alarm: "Arming and disarming always asks for confirmation.",
          door: "Any state containing “open” turns the button red.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Missing configuration");
    this._config = { ...config };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    this._timer = setInterval(() => this._hass && this._render(), 60000); // turns the house red an hour after the last sighting
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>
      <ha-card>
        <div class="head">
          <div class="shape who" role="button" tabindex="0"><ha-icon></ha-icon></div>
          <div class="name who"></div>
          <button class="alarm" aria-pressed="false"><ha-icon></ha-icon><span class="txt"></span></button>
          <div class="detail who"></div>
        </div>
        <div class="tiles"></div>
        <button class="msg"><ha-icon icon="mdi:message-text-outline"></ha-icon><span></span></button>
      </ha-card>`;
    const $ = (s) => root.querySelector(s);
    this._el = {
      who: [...root.querySelectorAll(".who")], shape: $(".shape"), icon: $(".shape ha-icon"), name: $(".name"), detail: $(".detail"),
      alarm: $(".alarm"), alarmIcon: $(".alarm ha-icon"), alarmTxt: $(".alarm .txt"), tiles: $(".tiles"),
      msg: $(".msg"), msgTxt: $(".msg span"),
    };
    const p = this._config.presence || {};
    const openPresence = () =>
      this._act(p.navigation_path ? { action: "navigate", path: p.navigation_path } : { action: "more-info", entity: p.occupied });
    this._el.who.forEach((el) => el.addEventListener("click", openPresence));
    this._el.alarm.addEventListener("click", () => this._toggleAlarm());
    this._el.msg.addEventListener("click", () => this._act({ action: "more-info", entity: this._config.message }));
    this._built = true;
    this._tileKeys = "";
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const m = model(this._hass, this._config);
    this._m = m;
    const e = this._el;

    e.icon.setAttribute("icon", this._config.icon || m.presence.icon);
    e.icon.style.color = m.presence.color;
    e.shape.style.backgroundColor = tint(m.presence.color, 20);
    // Only touch the DOM when something changed: replacing an element while a finger is on it
    // swallows the tap, and Home Assistant pushes state updates several times a second.
    const nameHtml = `${esc(this._config.name || "Home")} <span class="state">· ${esc(m.presence.label)}</span>`;
    if (e.name.innerHTML !== nameHtml) e.name.innerHTML = nameHtml;
    if (e.detail.textContent !== m.presence.detail) e.detail.textContent = m.presence.detail;

    e.alarm.style.display = m.alarm ? "" : "none";
    if (m.alarm) {
      e.alarm.classList.toggle("on", m.alarm.on);
      e.alarm.setAttribute("aria-pressed", String(m.alarm.on));
      e.alarmIcon.setAttribute("icon", m.alarm.on ? "mdi:shield-lock" : "mdi:shield-off-outline");
      e.alarmTxt.textContent = m.alarm.unavailable ? "Alarm ?" : m.alarm.on ? "Armed" : "Disarmed";
    }

    const keys = m.tiles.map((t) => t.key).join();
    if (keys !== this._tileKeys) {
      e.tiles.innerHTML = m.tiles
        .map((t) => `<button class="tile" data-key="${t.key}"><ha-icon></ha-icon><span></span></button>`)
        .join("");
      e.tiles.style.setProperty("--n", String(m.tiles.length || 1));
      e.tiles.querySelectorAll(".tile").forEach((b) =>
        b.addEventListener("click", () => this._act(this._m.tiles.find((t) => t.key === b.dataset.key).action)),
      );
      this._tileKeys = keys;
    }
    m.tiles.forEach((t, i) => {
      const b = e.tiles.children[i];
      b.querySelector("ha-icon").setAttribute("icon", t.icon);
      b.querySelector("ha-icon").style.color = t.color || "";
      b.style.backgroundColor = t.color ? tint(t.color, 20) : "";
      const span = b.querySelector("span");
      if (span.textContent !== t.label) span.textContent = t.label;
      b.title = `${t.title}: ${t.label}`;
    });
    e.tiles.style.display = m.tiles.length ? "" : "none";

    // Always shown (it is the way into the ePaper's history); says so when the screen is blank.
    e.msg.style.display = this._config.message ? "" : "none";
    const msgText = m.message ? `“${m.message}”` : "ePaper screen is blank";
    if (e.msgTxt.textContent !== msgText) e.msgTxt.textContent = msgText;
    e.msgTxt.classList.toggle("empty", !m.message);
  }

  async _toggleAlarm() {
    const m = this._m;
    if (!m?.alarm) return;
    const arming = !m.alarm.on;
    const name = this._config.name || "Home";
    const ok = await confirmDialog({
      title: arming ? "Arm alarm" : "Disarm alarm",
      icon: arming ? "mdi:shield-lock" : "mdi:shield-off-outline",
      color: arming ? C.red : C.teal,
      bodyIcon: "mdi:home-outline",
      primary: name,
      secondary: arming
        ? `Your CCTV alarm system will send push notifications when it detects someone in ${name}.`
        : `Your CCTV alarm system stops sending push notifications for ${name} until you arm it again.`,
      confirmLabel: arming ? "Arm alarm" : "Disarm alarm",
    });
    if (!ok) return;
    const [domain] = this._config.alarm.split(".");
    try {
      await this._hass.callService(domain === "switch" ? "switch" : "input_boolean", arming ? "turn_on" : "turn_off", {
        entity_id: this._config.alarm,
      });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || "Could not change the alarm" });
    }
  }

  _act(a) {
    if (!a) return;
    if (a.action === "navigate") {
      history.pushState(null, "", a.path);
      this._fire("location-changed", { replace: false });
    } else if (a.action === "more-info" && a.entity) {
      this._fire("hass-more-info", { entityId: a.entity });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerHomeStatusCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(HSC_TAG)) return;
  registry.define(HSC_TAG, HomeStatusCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: HSC_TAG,
    name: "Home status",
    description: "Presence, alarm, door, TV, climate and a message line for a home, in one compact card.",
  });
  console.info(`%c HOME-STATUS-CARD %c ${HSC_VERSION} `, "background:#009688;color:#fff", "");
}

registerHomeStatusCard();
