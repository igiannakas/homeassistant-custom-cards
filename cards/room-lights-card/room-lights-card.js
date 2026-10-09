/*
 * Room lights card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every room's lights in one card: an "All lights" switch in the header and a
 * tile per room underneath with its temperature, humidity and light level.
 * Tap a tile to switch the room, tap its icon to open the room's dashboard,
 * long-press for the room's individual lamps. Nothing asks first – lights are
 * cheap to switch back.
 * See cards/room-lights-card/README.md for every option.
 */

const RLC_VERSION = "1.3.3";
const RLC_TAG = "room-lights-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
  blue: "var(--blue-color, #2196f3)",
  amber: "var(--amber-color, #ffc107)",
  teal: "var(--teal-color, #009688)",
};
const HOLD_MS = 500;
const HISTORY_DAYS = 3;
const MOVE_PX = 10;

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v.filter(Boolean) : [v]);
const isOn = (s) => !!s && s.state === "on";

/* "21.1/21.8°", "49/49%", "30 lx" – the unit once, each sensor's value in order. */
function reading(hass, ids, digits, unit, space) {
  const vals = list(ids).map((id) => {
    const s = hass.states[id];
    const n = s ? Number(s.state) : NaN;
    return s && s.state !== "" && isFinite(n) ? n.toFixed(digits) : "–";
  });
  if (!vals.length) return null;
  return `${vals.join("/")}${space ? " " : ""}${unit}`;
}

/* Lamp label without the room's name: "Front living room lamp" in Living Room → "Front lamp". */
function lampName(friendly, room) {
  let n = String(friendly || "");
  if (room) {
    const re = new RegExp(room.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    const stripped = n.replace(re, " ").replace(/\s+/g, " ").trim();
    if (stripped) n = stripped;
  }
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/* "12m", "3h", "2d" */
function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/*
 * Who is in the room: occupied → teal motion sensor; empty → how long since someone was there.
 * Lights on in a room that has been empty for a while → amber, so lights left on stand out.
 */
function presenceModel(hass, room, lastSeen, warnMin, lightsOn) {
  const id = room.occupancy;
  if (!id) return null;
  const s = hass.states[id];
  if (!s || s.state === "unavailable" || s.state === "unknown") return { kind: "unknown", text: "" };
  if (s.state === "on") return { kind: "here", text: "" };
  const since = lastSeen ?? null;
  if (since === null) return { kind: "empty", text: "" };
  const ms = Date.now() - since;
  const warn = lightsOn && ms >= warnMin * 60000;
  return { kind: warn ? "warn" : "empty", text: ms > HISTORY_DAYS * 86400000 ? `${HISTORY_DAYS}d+` : ago(ms) };
}

function roomModel(hass, room) {
  const s = hass.states[room.entity];
  const on = isOn(s);
  const name = room.name || s?.attributes?.friendly_name || room.entity;
  return {
    name,
    on,
    missing: !s,
    icon: room.icon || s?.attributes?.icon || "mdi:lightbulb-group",
    window: list(room.window).some((id) => isOn(hass.states[id])),
    temp: reading(hass, room.temperature, 1, "°", false),
    hum: reading(hass, room.humidity, 0, "%", false),
    lux: reading(hass, room.illuminance, 0, "lx", true),
  };
}

/* The lamps behind a room switch (light groups and old-style groups both list them). */
function lamps(hass, room, viewIcons = {}) {
  const s = hass.states[room.entity];
  // Configured lamps, else the group's members, else the room's single light itself.
  const ids = list(room.lamps).length ? list(room.lamps) : list(s?.attributes?.entity_id).length ? list(s.attributes.entity_id) : [room.entity];
  return ids.map((id) => {
    const ls = hass.states[id];
    const on = isOn(ls);
    return {
      id,
      on,
      missing: !ls,
      name: lampName(ls?.attributes?.friendly_name || id, room.name),
      // Same icon as on the room's own dashboard view, else the entity's own icon.
      icon: viewIcons[id] || ls?.attributes?.icon || hass.entities?.[id]?.icon || (on ? "mdi:lightbulb" : "mdi:lightbulb-outline"),
    };
  });
}

/* Icons the room's own view uses for each entity ({ "light.tv": "mdi:television", … }). */
function iconsInView(view) {
  const map = {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (typeof node.entity === "string" && typeof node.icon === "string" && !node.icon.includes("{") && !map[node.entity])
      map[node.entity] = node.icon;
    Object.values(node).forEach(walk);
  };
  walk(view);
  return map;
}

/* "/lovelace/living-room" → that view's config (null when it cannot be read). */
async function loadView(hass, path) {
  const [dash, view] = String(path || "").split("?")[0].split("/").filter(Boolean);
  if (!dash) return null;
  try {
    const cfg = await hass.callWS({ type: "lovelace/config", url_path: dash === "lovelace" ? null : dash });
    const views = cfg?.views || [];
    return views.find((v) => v.path === view) || (/^\d+$/.test(view || "0") ? views[Number(view || 0)] : null) || null;
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Lamps sheet – same look as the other cards' dialogs                       */
/* ------------------------------------------------------------------------ */

// Same look as the other pop-ups on the dashboard (Boost heating, alarm): 20px title, 56px
// pill rows with a 36px icon on the left and 16px semibold text, 20px between blocks.
const SHEET_CSS = `
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
    overflow: auto; padding: 25px 18px 18px; border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .head { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list, .buttons { margin-top: 20px; display: grid; gap: 8px; }
  /* The actions are set apart from the lamp list by a divider and extra space. */
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  button { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; height: 56px;
    padding: 0 12px 0 10px; border-radius: 28px; cursor: pointer; font-size: 16px; line-height: 24px; font-weight: 600;
    letter-spacing: .1px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  /* Call to action, filled like "Boost heating": the lights colour with white text and icon. */
  button.open { background: ${C.orange}; color: #fff; }
  button.open .glyph { background: rgba(255,255,255,.2); }
  button.open .glyph ha-icon { color: #fff; }
  button.open .nm, .lamp .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sw { flex: 0 0 auto; width: 44px; height: 26px; border-radius: 13px; position: relative; background: var(--disabled-color, #bdbdbd);
    transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .lamp.on .sw { background: ${C.orange}; }
  .lamp.on .sw::after { transform: translateX(18px); }
  .lamp.missing { opacity: .5; }
  button:active { filter: brightness(.92); }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .empty { padding: 0 8px; font-size: 15px; line-height: 21px; color: var(--primary-text-color); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

// A plain controller around an undefined custom tag (attachShadow works on it), so nothing has to
// be registered in Home Assistant's scoped element registry.
class RoomLampsSheet {
  open(card, room) {
    this._card = card;
    this._room = room;
    this.host = document.createElement("rlc-lamps-sheet");
    const root = this.host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${SHEET_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="head"><div class="glyph"><ha-icon></ha-icon></div><div class="title"></div></div>
        <div class="list"></div>
        <div class="buttons">
          ${room.navigation_path ? `<button class="open"><span class="glyph"><ha-icon></ha-icon></span><span class="nm"></span></button>` : ""}
          <button class="close"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Close</button>
        </div>
      </div>`;
    // The sheet opens under the finger that is still holding the tile. When that finger lifts,
    // the browser sends a click to whatever is now under it – the backdrop – which would close
    // the sheet at once (or flip a lamp). Ignore taps until shortly after that finger is up.
    this._guard = true;
    this._release = () => {
      ["pointerup", "pointercancel", "touchend"].forEach((t) => document.removeEventListener(t, this._release, true));
      setTimeout(() => (this._guard = false), 350);
    };
    ["pointerup", "pointercancel", "touchend"].forEach((t) => document.addEventListener(t, this._release, true));
    root.addEventListener(
      "click",
      (e) => {
        if (!this._guard) return;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    this._onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => this.close());
    root.querySelector(".close").addEventListener("click", () => this.close());
    root.querySelector(".open")?.addEventListener("click", () => {
      this.close();
      card._navigate(room.navigation_path);
    });
    document.addEventListener("keydown", this._onKey, true);
    document.body.appendChild(this.host);
    this.update(card._hass);
    root.querySelector(".close").focus();
  }

  update(hass) {
    const root = this.host?.shadowRoot;
    if (!root || !hass) return;
    const m = roomModel(hass, this._room);
    const color = m.on ? C.orange : C.grey;
    const g = root.querySelector(".head .glyph");
    g.style.background = tint(color, 20);
    g.querySelector("ha-icon").setAttribute("icon", m.icon);
    g.querySelector("ha-icon").style.color = color;
    const title = root.querySelector(".title");
    if (title.textContent !== m.name) title.textContent = m.name;
    const open = root.querySelector(".open");
    if (open) {
      open.querySelector("ha-icon").setAttribute("icon", m.icon);
      const label = `Open ${m.name}`;
      if (open.querySelector(".nm").textContent !== label) open.querySelector(".nm").textContent = label;
    }
    root.querySelector(".dialog").setAttribute("aria-label", m.name);

    const items = lamps(hass, this._room, this._card._viewIcons?.[this._room.navigation_path]?.map || {});
    const box = root.querySelector(".list");
    const keys = items.map((l) => l.id).join();
    if (box.dataset.keys !== keys) {
      box.dataset.keys = keys;
      box.innerHTML = items.length
        ? items
            .map((l) => `<button class="lamp" role="switch" data-id="${esc(l.id)}"><span class="glyph"><ha-icon></ha-icon></span>
              <span class="nm"></span><span class="sw"></span></button>`)
            .join("")
        : `<div class="empty">No separate lamps in this room.</div>`;
      box.querySelectorAll(".lamp").forEach((b) => b.addEventListener("click", () => this._card._toggle(b.dataset.id)));
    }
    items.forEach((l, i) => {
      const b = box.children[i];
      const c = l.on ? C.orange : C.grey;
      b.classList.toggle("on", l.on);
      b.classList.toggle("missing", l.missing);
      b.setAttribute("aria-checked", String(l.on));
      const gl = b.querySelector(".glyph");
      gl.style.background = tint(c, 20);
      gl.querySelector("ha-icon").setAttribute("icon", l.icon);
      gl.querySelector("ha-icon").style.color = c;
      const nm = b.querySelector(".nm");
      if (nm.textContent !== l.name) nm.textContent = l.name;
    });
  }

  close() {
    document.removeEventListener("keydown", this._onKey, true);
    this._release?.();
    this.host?.remove();
    if (this._card?._sheet === this) this._card._sheet = null;
  }
}

/* ------------------------------------------------------------------------ */

const CSS = `
  :host { display: block; }
  ha-card { padding: 6px; }
  /* The All lights switch is the card's label row – same height, title and switch as the label row
     of every other card (40px row, 14px / 500 title, 40×24 switch), and the whole row toggles.
     Its icon is tappable, so it sits in a filled 36px circle like every other tappable icon. */
  .all { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 2px 6px 8px;
    cursor: pointer; -webkit-tap-highlight-color: transparent; border-radius: 10px; }
  .all .hi { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    --mdc-icon-size: 24px; color: ${C.grey}; background: ${tint(C.grey, 20)}; transition: color 180ms, background-color 180ms; }
  .all.on .hi { color: ${C.orange}; background: ${tint(C.orange, 20)}; }
  .shape { position: relative; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; transition: background-color 180ms; }
  /* Same size as Mushroom / tile card icons: 36 px circle, 24 px icon. */
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  /* Text matches Mushroom / tile cards: names 14px medium, readings 12px regular, same colour. */
  .all .nm { position: relative; top: 1px; flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .all .sw { flex: 0 0 auto; width: 40px; height: 24px; border-radius: 12px; position: relative; background: var(--disabled-color, #bdbdbd);
    transition: background-color 160ms; }
  .all .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .all.on .sw { background: ${C.orange}; }
  .all.on .sw::after { transform: translateX(16px); }
  .rooms { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 6px; }
  .room { position: relative; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    container-type: inline-size; cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none;
    -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
  .tile { display: flex; align-items: center; gap: 10px; height: 100%; box-sizing: border-box; padding: 9px 10px; min-height: 58px; }
  .room .shape { cursor: pointer; }
  .badge { position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; border-radius: 50%; display: none;
    align-items: center; justify-content: center; background: ${C.red}; }
  .badge ha-icon { --mdc-icon-size: 11px; color: #fff; }
  .badge.on { display: flex; }
  .txt { flex: 1; min-width: 0; }
  .room .nm { flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Presence sits on the name's own line, so it always lines up with the room title. */
  .top { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .pres { flex: 0 0 auto; display: none; align-items: center; gap: 2px; height: 20px; font-size: 12px; line-height: 20px;
    font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color); }
  .pres.show { display: inline-flex; }
  .pres ha-icon { --mdc-icon-size: 16px; }
  .pres.here { color: ${C.teal}; }
  .pres.warn { color: var(--warning-color, #ffa600); }
  .m { display: flex; column-gap: 9px; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; }
  .g { display: flex; column-gap: 9px; min-width: 0; }
  .g:empty { display: none; }
  .v { display: inline-flex; align-items: center; gap: 2px; }
  .v ha-icon { --mdc-icon-size: 14px; }
  /* The lights are the point of the card: readings are secondary. Their numbers use the quiet
     secondary grey and their icons keep their colours, faded towards grey. Rooms with lights on
     get a faint warm tint, so a lit room stands out on its own. */
  .v.t ha-icon { color: color-mix(in srgb, ${C.orange} 55%, ${C.grey}); }
  .v.h ha-icon { color: color-mix(in srgb, ${C.blue} 55%, ${C.grey}); }
  .v.l ha-icon { color: color-mix(in srgb, ${C.amber} 60%, ${C.grey}); }
  .room.lit { background: color-mix(in srgb, ${C.orange} 10%, transparent); }
  .room.missing .nm { color: var(--secondary-text-color); }
  /* Press feedback without moving anything: a scale-down shrinks the target under the
     finger and taps near the edge would be lost. */
  .all:active, .room:active { filter: brightness(.94); }
  .all:focus-visible, .room:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* When any room's readings do not fit on one line (the card measures this), every tile
     switches together: temperature on one line, humidity + light level on the next. All tiles
     keep the same height (grid-auto-rows: 1fr) even if one room has more sensors. */
  .stack .m { flex-direction: column; }
  .stack .g { flex-wrap: wrap; column-gap: 7px; }
  .stack .tile { padding: 9px 8px; gap: 8px; }
  @container (max-width: 175px) {
    .tile { padding: 9px 6px; gap: 6px; }
    .stack .g { column-gap: 5px; }
    .v { gap: 1px; }
    .m { font-size: 11.5px; }
    .v ha-icon { --mdc-icon-size: 13px; }
  }
`;

class RoomLightsCard extends HTMLElement {
  static getStubConfig(hass) {
    const lights = Object.keys(hass?.states || {}).filter((id) => id.startsWith("light.")).slice(0, 2);
    return { entity: "", rooms: lights.map((id) => ({ entity: id })) };
  }

  // Visual editor: a custom element, because Home Assistant's built-in list editor drops
  // fields that take several entities (the temperature / humidity / light sensors).
  static getConfigElement() {
    return document.createElement(RLC_EDITOR_TAG);
  }

  setConfig(config) {
    if (!config) throw new Error("Missing configuration");
    if (config.rooms !== undefined && !Array.isArray(config.rooms)) throw new Error("rooms must be a list");
    this._config = { ...config, rooms: (config.rooms || []).filter((r) => r && r.entity) };
    this._presenceSig = undefined;
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._config) this._trackPresence();
    this._render();
    this._sheet?.update(hass);
  }

  getCardSize() {
    return 1 + Math.ceil((this._config?.rooms?.length || 0) / 2) * 1.5;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  disconnectedCallback() {
    this._sheet?.close();
    this._ro?.disconnect();
    clearInterval(this._tick);
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const rooms = this._config.rooms;
    const header = this._config.entity
      ? `<button class="all" role="switch"><ha-icon class="hi" icon="mdi:home-lightbulb"></ha-icon>
          <span class="nm"></span><span class="sw"></span></button>`
      : "";
    root.innerHTML = `<style>${CSS}</style><ha-card>${header}
      <div class="rooms" style="--cols:${Math.max(1, Math.min(4, Number(this._config.columns) || 2))}">
        ${rooms
          .map(
            (r, i) => `<div class="room" role="button" tabindex="0" data-i="${i}"><div class="tile">
              <div class="shape"><ha-icon></ha-icon><span class="badge"><ha-icon icon="mdi:window-open-variant"></ha-icon></span></div>
              <div class="txt"><div class="top"><div class="nm"></div><span class="pres"></span></div>
                <div class="m"><span class="g"></span><span class="g"></span></div></div>
            </div></div>`,
          )
          .join("")}
      </div></ha-card>`;
    if (!rooms.length) root.querySelector(".rooms").style.display = "none";
    root.querySelector(".all")?.addEventListener("click", () => this._toggleAll());
    root.querySelectorAll(".room").forEach((el) => this._bindRoom(el, rooms[Number(el.dataset.i)]));
    this._el = {
      all: root.querySelector(".all"),
      rooms: [...root.querySelectorAll(".room")],
    };
    this._built = true;
    if (this.isConnected) this.connectedCallback();
  }

  /* Tap = switch the room; tap on the icon = open the room; hold = lamps sheet. */
  _bindRoom(el, room) {
    let timer = null;
    let start = null;
    let held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      start = [e.clientX, e.clientY];
      cancel();
      timer = setTimeout(() => {
        timer = null;
        held = true;
        this._haptic("medium");
        this._openSheet(room);
      }, HOLD_MS);
    });
    el.addEventListener("pointermove", (e) => {
      if (timer && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > MOVE_PX) cancel();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => el.addEventListener(t, cancel));
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("click", (e) => {
      if (held) {
        held = false;
        return;
      }
      if (e.composedPath().some((n) => n.classList?.contains("shape")) && room.navigation_path) {
        this._navigate(room.navigation_path);
        return;
      }
      this._toggle(room.entity);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._toggle(room.entity);
      }
    });
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    // Only touch the DOM when something changed: Home Assistant pushes state several times a
    // second, and replacing text under a finger can swallow the tap.
    const set = (node, text) => {
      if (node.textContent !== text) node.textContent = text;
    };

    if (this._el.all) {
      const s = hass.states[this._config.entity];
      const on = isOn(s);
      this._el.all.classList.toggle("on", on);
      this._el.all.setAttribute("aria-checked", String(on));
      set(this._el.all.querySelector(".nm"), this._config.name || "All lights");
    }

    this._config.rooms.forEach((room, i) => {
      const el = this._el.rooms[i];
      const m = roomModel(hass, room);
      const color = m.on ? C.orange : C.grey;
      el.classList.toggle("missing", m.missing);
      el.classList.toggle("lit", m.on);
      const shape = el.querySelector(".shape");
      shape.style.backgroundColor = tint(color, 20);
      const icon = shape.querySelector(":scope > ha-icon");
      if (icon.getAttribute("icon") !== m.icon) icon.setAttribute("icon", m.icon);
      icon.style.color = color;
      el.querySelector(".badge").classList.toggle("on", m.window);
      set(el.querySelector(".nm"), m.name);
      const pr = presenceModel(hass, room, this._lastSeen?.[room.occupancy], this._warnMin(), m.on);
      const pel = el.querySelector(".pres");
      const phtml = !pr || pr.kind === "unknown" ? ""
        : pr.kind === "here" ? `<ha-icon icon="mdi:motion-sensor"></ha-icon>`
        : `${pr.kind === "warn" ? `<ha-icon icon="mdi:motion-sensor-off"></ha-icon>` : ""}${esc(pr.text)}`;
      if (pel.dataset.h !== phtml) {
        pel.innerHTML = phtml;
        pel.dataset.h = phtml;
      }
      pel.className = `pres${phtml ? " show" : ""}${pr ? ` ${pr.kind}` : ""}`;
      pel.title = !pr ? "" : pr.kind === "here" ? "Someone is here"
        : pr.kind === "warn" ? `Lights on, nobody here for ${pr.text}` : pr.text ? `Last seen ${pr.text} ago` : "";
      el.setAttribute("aria-label", `${m.name}: ${m.missing ? "not found" : m.on ? "on" : "off"}`);
      const [g1, g2] = el.querySelectorAll(".g");
      const html1 = m.temp ? this._v("t", "mdi:thermometer", m.temp) : "";
      const html2 = (m.hum ? this._v("h", "mdi:water-percent", m.hum) : "") + (m.lux ? this._v("l", "mdi:white-balance-sunny", m.lux) : "");
      let changed = false;
      if (g1.dataset.h !== html1) {
        g1.innerHTML = html1;
        g1.dataset.h = html1;
        changed = true;
      }
      if (g2.dataset.h !== html2) {
        g2.innerHTML = html2;
        g2.dataset.h = html2;
        changed = true;
      }
      if (changed) this._fit();
    });
  }

  /* One line per tile if every room's readings fit, otherwise two lines for all of them. */
  _fit() {
    if (this._fitQueued) return;
    this._fitQueued = true;
    requestAnimationFrame(() => {
      this._fitQueued = false;
      const card = this.shadowRoot?.querySelector("ha-card");
      if (!card || !card.isConnected) return;
      card.classList.remove("stack");
      const overflow = [...card.querySelectorAll(".m, .g")].some((m) => m.scrollWidth > m.clientWidth + 1);
      card.classList.toggle("stack", overflow);
    });
  }

  connectedCallback() {
    // Keeps the "12m" counters moving.
    clearInterval(this._tick);
    if (this._config?.rooms?.some((r) => r.occupancy)) this._tick = setInterval(() => this._hass && this._render(), 60000);
    if (typeof ResizeObserver === "undefined") return;
    // Only width matters; the height changes this causes must not trigger another pass.
    this._ro =
      this._ro ||
      new ResizeObserver((entries) => {
        const w = Math.round(entries[entries.length - 1].contentRect.width);
        if (w === this._fitWidth) return;
        this._fitWidth = w;
        this._fit();
      });
    const card = this.shadowRoot?.querySelector("ha-card");
    if (card) this._ro.observe(card);
  }

  _warnMin() {
    const n = Number(this._config.empty_warning);
    // Short by default: automations often switch empty rooms off within minutes, and a few
    // minutes is still long enough to ride out a presence sensor's brief drop-outs.
    return isFinite(n) && n >= 0 && this._config.empty_warning !== "" && this._config.empty_warning != null ? n : 2;
  }

  /*
   * When did each room last have someone in it? A live switch to "off" gives it directly; after a
   * restart the sensor's last change is the restart, so the answer comes from the history instead
   * (the end of the last "on" period in the past few days).
   */
  _trackPresence() {
    const ids = [...new Set(this._config.rooms.map((r) => r.occupancy).filter(Boolean))];
    if (!ids.length || !this._hass) return;
    this._lastSeen = this._lastSeen || {};
    const sig = ids.map((id) => `${id}:${this._hass.states[id]?.state}`).join();
    if (sig === this._presenceSig) return;
    const first = this._presenceSig === undefined;
    const prev = this._presenceStates || {};
    this._presenceSig = sig;
    this._presenceStates = Object.fromEntries(ids.map((id) => [id, this._hass.states[id]?.state]));
    if (!first) {
      // Someone just left a room: that moment is the "last seen".
      for (const id of ids) {
        if (prev[id] === "on" && this._presenceStates[id] === "off") this._lastSeen[id] = Date.parse(this._hass.states[id].last_changed);
      }
      return;
    }
    this._loadHistory(ids);
  }

  async _loadHistory(ids) {
    const hass = this._hass;
    if (!hass?.callWS) return;
    const start = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
    try {
      const h = await hass.callWS({
        type: "history/history_during_period",
        start_time: start,
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      for (const id of ids) {
        const rows = h?.[id] || [];
        const t = (r) => (r.lu ?? r.lc ?? 0) * 1000 || Date.parse(r.last_changed || r.last_updated || 0);
        let last = -1;
        rows.forEach((r, i) => {
          if ((r.s ?? r.state) === "on") last = i;
        });
        if (last >= 0 && last < rows.length - 1) this._lastSeen[id] = t(rows[last + 1]);
        else if (last < 0) this._lastSeen[id] = Date.now() - HISTORY_DAYS * 86400000 - 1;
      }
    } catch (e) {
      // History not available: fall back to the sensor's own last change.
      for (const id of ids) {
        const s = hass.states[id];
        if (s && s.state === "off") this._lastSeen[id] = Date.parse(s.last_changed);
      }
    }
    this._render();
  }

  _v(cls, icon, text) {
    return `<span class="v ${cls}"><ha-icon icon="${icon}"></ha-icon>${esc(text)}</span>`;
  }

  _openSheet(room) {
    this._sheet?.close();
    this._sheet = new RoomLampsSheet();
    this._sheet.open(this, room);
    this._mirrorIcons(room);
  }

  /* Read the lamp icons from the room's own view (cached for 5 minutes), then redraw. */
  async _mirrorIcons(room) {
    const path = room.navigation_path;
    if (!path || !this._hass) return;
    this._viewIcons = this._viewIcons || {};
    const cached = this._viewIcons[path];
    if (cached && Date.now() - cached.at < 300000) return;
    const view = await loadView(this._hass, path);
    this._viewIcons[path] = { at: Date.now(), map: view ? iconsInView(view) : {} };
    this._sheet?.update(this._hass);
  }

  /* Header: anything on → everything off; all off → everything on. No confirmation. */
  _toggleAll() {
    const s = this._hass.states[this._config.entity];
    this._haptic("light");
    this._call(isOn(s) ? "turn_off" : "turn_on", this._config.entity);
  }

  _toggle(entity) {
    const s = this._hass.states[entity];
    this._haptic("light");
    this._call(isOn(s) ? "turn_off" : "turn_on", entity);
  }

  async _call(service, entity) {
    const [domain] = entity.split(".");
    const d = domain === "light" || domain === "switch" ? domain : "homeassistant";
    try {
      await this._hass.callService(d, service, { entity_id: entity });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Could not switch ${entity}` });
    }
  }

  _navigate(path) {
    history.pushState(null, "", path);
    this._fire("location-changed", { replace: false });
  }

  _haptic(kind) {
    this._fire("haptic", kind);
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

/* ------------------------------------------------------------------------ */
/* Visual editor                                                             */
/* ------------------------------------------------------------------------ */

const RLC_EDITOR_TAG = "room-lights-card-editor";
const MULTI = ["temperature", "humidity", "illuminance", "lamps"];

const HEADER_SCHEMA = [
  { type: "grid", name: "", schema: [
    { name: "entity", selector: { entity: { domain: ["group", "light", "switch"] } } },
    { name: "name", selector: { text: {} } },
  ] },
  { name: "empty_warning", selector: { number: { min: 0, max: 240, step: 1, mode: "box", unit_of_measurement: "min" } } },
];
const ROOM_SCHEMA = [
  { type: "grid", name: "", schema: [
    { name: "name", selector: { text: {} } },
    { name: "icon", selector: { icon: {} } },
  ] },
  { name: "entity", required: true, selector: { entity: { domain: ["light", "switch", "group"] } } },
  { name: "navigation_path", selector: { navigation: {} } },
  { name: "temperature", selector: { entity: { domain: "sensor", multiple: true } } },
  { name: "humidity", selector: { entity: { domain: "sensor", multiple: true } } },
  { name: "illuminance", selector: { entity: { domain: "sensor", multiple: true } } },
  { name: "occupancy", selector: { entity: { domain: "binary_sensor" } } },
  { name: "window", selector: { entity: { domain: "binary_sensor" } } },
  { name: "lamps", selector: { entity: { domain: ["light", "switch"], multiple: true } } },
];
const EDITOR_LABELS = {
  entity: "Lights (light, switch or group)",
  name: "Name",
  icon: "Icon",
  navigation_path: "Icon tap goes to",
  temperature: "Temperature sensors",
  humidity: "Humidity sensors",
  illuminance: "Light level sensors",
  window: "Window sensor (red badge when open)",
  occupancy: "Occupancy sensor",
  empty_warning: "Flag lights left on in an empty room after (minutes)",
  lamps: "Lamps for the long-press list (optional)",
};
const EDITOR_HELPERS = {
  temperature: "Add more than one to show them all, in order (e.g. 21.1/21.8°).",
  lamps: "Leave empty to use the members of the room's group.",
  occupancy: "Teal icon while someone is here, otherwise how long since they were.",
  empty_warning: "Default 2. Lights on in a room empty this long turn its time amber.",
};

const EDITOR_CSS = `
  :host { display: block; }
  .rooms-title { margin: 20px 0 8px; font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
  details { border: 1px solid var(--divider-color, rgba(0,0,0,.12)); border-radius: 12px; margin-bottom: 8px;
    background: var(--card-background-color, #fff); }
  summary { list-style: none; display: flex; align-items: center; gap: 12px; padding: 10px 12px; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  summary .ic { flex: 0 0 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); color: var(--grey-color, #9e9e9e); }
  summary .ic ha-icon { --mdc-icon-size: 24px; }
  summary .t { flex: 1; min-width: 0; }
  summary .t1 { font-size: 14px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  summary .t2 { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  summary .chev { --mdc-icon-size: 24px; color: var(--secondary-text-color); transition: transform 150ms; }
  details[open] summary .chev { transform: rotate(180deg); }
  .body { padding: 4px 12px 12px; }
  .tools { display: flex; justify-content: flex-end; gap: 4px; margin-top: 8px; }
  button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    height: 36px; padding: 0 12px; border-radius: 18px; font-size: 14px; font-weight: 500; color: var(--primary-text-color); }
  button ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
  button:hover { background: rgba(var(--rgb-primary-text-color, 33,33,33), .06); }
  button:disabled { opacity: .35; cursor: default; background: none; }
  button.icon { padding: 0; width: 36px; justify-content: center; }
  button.delete ha-icon { color: var(--error-color, #db4437); }
  button.add { color: var(--primary-color); border: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  button.add ha-icon { color: var(--primary-color); }
  button:focus-visible { outline: 2px solid var(--primary-color); }
`;

class RoomLightsCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config || {}));
    if (!Array.isArray(this._config.rooms)) this._config.rooms = [];
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot?.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
  }

  /* Several-sensor fields always go to the form as lists (YAML may hold a single string). */
  _roomData(room) {
    const d = { ...room };
    for (const k of MULTI) if (d[k] !== undefined) d[k] = list(d[k]);
    return d;
  }

  _render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const rooms = this._config.rooms;
    // Typing in a field sends the config round-trip through Home Assistant; rebuilding the
    // forms then would drop the cursor. Rebuild only when rooms are added, removed or moved.
    if (this._shown === rooms.length && !this._dirty) {
      this._header.data = this._config;
      rooms.forEach((r, i) => {
        this._forms[i].data = this._roomData(r);
        this._summary(i);
      });
      return;
    }
    this._dirty = false;
    const open = new Set(this._open || []);
    root.innerHTML = `<style>${EDITOR_CSS}</style><div class="header"></div>
      <div class="rooms-title">Rooms</div><div class="list"></div>
      <button class="add"><ha-icon icon="mdi:plus"></ha-icon>Add room</button>`;
    this._header = this._form(HEADER_SCHEMA, this._config, (v) => {
      const next = { ...this._config, ...v };
      for (const k of ["entity", "name", "empty_warning"]) if (next[k] === "" || next[k] === undefined || next[k] === null) delete next[k];
      this._commit(next);
    }, { entity: "All lights switch (group)", name: "Header label (default: All lights)" });
    root.querySelector(".header").appendChild(this._header);
    const box = root.querySelector(".list");
    this._forms = [];
    rooms.forEach((room, i) => {
      const det = document.createElement("details");
      if (open.has(i)) det.open = true;
      det.innerHTML = `<summary><span class="ic"><ha-icon></ha-icon></span><span class="t"><div class="t1"></div><div class="t2"></div></span>
        <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></summary>
        <div class="body"><div class="form"></div><div class="tools">
          <button class="icon up" title="Move up"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="icon down" title="Move down"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <button class="delete" title="Remove room"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove</button>
        </div></div>`;
      det.addEventListener("toggle", () => {
        this._open = [...box.children].map((d, j) => (d.open ? j : -1)).filter((j) => j >= 0);
      });
      const form = this._form(ROOM_SCHEMA, this._roomData(room), (v) => {
        const next = { ...v };
        for (const k of Object.keys(next)) {
          if (next[k] === "" || next[k] === undefined || next[k] === null || (Array.isArray(next[k]) && !next[k].length)) delete next[k];
        }
        // One sensor stays a plain entity id, as you would write it in YAML.
        for (const k of MULTI) if (Array.isArray(next[k]) && next[k].length === 1) next[k] = next[k][0];
        const roomsNext = this._config.rooms.slice();
        roomsNext[i] = next;
        this._commit({ ...this._config, rooms: roomsNext });
      });
      det.querySelector(".form").appendChild(form);
      det.querySelector(".up").disabled = i === 0;
      det.querySelector(".down").disabled = i === rooms.length - 1;
      det.querySelector(".up").addEventListener("click", () => this._move(i, -1));
      det.querySelector(".down").addEventListener("click", () => this._move(i, 1));
      det.querySelector(".delete").addEventListener("click", () => this._remove(i));
      box.appendChild(det);
      this._forms.push(form);
    });
    root.querySelector(".add").addEventListener("click", () => this._add());
    this._shown = rooms.length;
    rooms.forEach((_, i) => this._summary(i));
  }

  _form(schema, data, onChange, labels = {}) {
    const f = document.createElement("ha-form");
    f.hass = this._hass;
    f.schema = schema;
    f.data = data;
    f.computeLabel = (s) => labels[s.name] ?? EDITOR_LABELS[s.name] ?? s.name;
    f.computeHelper = (s) => EDITOR_HELPERS[s.name];
    f.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      onChange(e.detail.value);
    });
    return f;
  }

  _summary(i) {
    const det = this.shadowRoot.querySelectorAll(".list > details")[i];
    if (!det) return;
    const r = this._config.rooms[i];
    const s = this._hass?.states?.[r.entity];
    det.querySelector(".ic ha-icon").setAttribute("icon", r.icon || s?.attributes?.icon || "mdi:lightbulb-group");
    det.querySelector(".t1").textContent = r.name || s?.attributes?.friendly_name || "New room";
    det.querySelector(".t2").textContent = r.entity || "Choose the room's lights";
  }

  _move(i, d) {
    const rooms = this._config.rooms.slice();
    const j = i + d;
    if (j < 0 || j >= rooms.length) return;
    [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
    const open = new Set(this._open || []);
    const oi = open.has(i);
    const oj = open.has(j);
    open.delete(i);
    open.delete(j);
    if (oi) open.add(j);
    if (oj) open.add(i);
    this._open = [...open];
    this._dirty = true;
    this._commit({ ...this._config, rooms });
  }

  _remove(i) {
    const rooms = this._config.rooms.filter((_, j) => j !== i);
    this._open = (this._open || []).filter((j) => j !== i).map((j) => (j > i ? j - 1 : j));
    this._dirty = true;
    this._commit({ ...this._config, rooms });
  }

  _add() {
    const rooms = [...this._config.rooms, { entity: "" }];
    this._open = [...(this._open || []), rooms.length - 1];
    this._dirty = true;
    this._commit({ ...this._config, rooms });
  }

  _commit(config) {
    this._config = config;
    this._render();
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

async function registerRoomLightsCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(RLC_TAG)) return;
  if (!registry.get(RLC_EDITOR_TAG)) registry.define(RLC_EDITOR_TAG, RoomLightsCardEditor);
  registry.define(RLC_TAG, RoomLightsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: RLC_TAG,
    name: "Room lights",
    description: "All lights switch plus a tile per room with temperature, humidity and light level.",
  });
  console.info(`%c ROOM-LIGHTS-CARD %c ${RLC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerRoomLightsCard();
