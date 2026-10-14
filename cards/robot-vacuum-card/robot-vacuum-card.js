/*
 * Robot vacuum card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A Roborock (or similar) robot vacuum in one card: state and battery, what needs you
 * (dock tanks, errors), the job while it runs, the floor map (cropped to the rooms, live
 * while cleaning) with a floor switch, room chips to build a clean, the cleaning settings
 * (mode, suction, mop water and route – shown as chips, changed in a sheet) and the
 * buttons for the state: Clean all / Clean N rooms, Pause, Resume, Dock, an optional
 * Auto clean pill for the automation that runs it, and – while docked – the dock's own jobs
 * (Empty, Wash mop, Dry) as chips that glow while they run.
 *
 * Everything is found from the vacuum entity's device (and its dock device), so the
 * config is one entity id. Rooms and their segment ids come from roborock.get_maps; a
 * room clean is vacuum.send_command app_segment_clean on the map that is loaded. Nothing
 * blocks a clean except the vacuum being offline. Tap any value for its own more-info.
 * See cards/robot-vacuum-card/README.md for every option.
 */

const RVC_VERSION = "1.2.1";
const RVC_TAG = "robot-vacuum-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  blue: "var(--blue-color, #2196f3)",
  teal: "var(--teal-color, #009688)",
  amber: "var(--amber-color, #ffc107)",
  green: "var(--green-color, #4caf50)",
  red: "var(--red-color, #f44336)",
  orange: "var(--orange-color, #ff9800)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
const DEAD = ["unavailable", "unknown"];
// "main_brush_jammed" → "Main brush jammed"
const human = (s) => {
  const t = String(s || "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
};
// 1650 s → "28 min", 4300 s → "1 h 12 min"
function mins(sec) {
  if (sec === null) return "–";
  const m = Math.max(0, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}
// A past moment as "today 10:00", "yesterday 10:00", "Sat 10:00" or "10 Oct".
function when(iso, now = new Date()) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return "";
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days <= 0) return `today ${t}`;
  if (days === 1) return `yesterday ${t}`;
  if (days < 7) return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${t}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
// A duration sensor's value in seconds, whatever its unit.
function seconds(s) {
  const v = num(s?.state);
  if (v === null) return null;
  const u = String(s.attributes?.unit_of_measurement || "s");
  return v * ({ s: 1, min: 60, h: 3600, d: 86400 }[u] || 1);
}

/* ------------------------------------------------------------------------ */
/* Finding the entities: the vacuum's device, plus its dock device          */
/* ------------------------------------------------------------------------ */

// Per key: domain, translation keys (stable), device class, entity id suffixes (fallback).
const KEYS = {
  battery: { domain: "sensor", dc: "battery", main: true },
  charging: { domain: "binary_sensor", dc: "battery_charging", main: true },
  status: { domain: "sensor", tk: ["status"], sfx: ["_status"] },
  error: { domain: "sensor", tk: ["vacuum_error"], sfx: ["_vacuum_error"] },
  dock_error: { domain: "sensor", tk: ["dock_error"], sfx: ["_dock_error"] },
  dirty_box: { domain: "binary_sensor", tk: ["dirty_box_full", "dock_dirty_water_box"], sfx: ["_dirty_water_box"] },
  clean_box: { domain: "binary_sensor", tk: ["clean_box_empty", "dock_clean_water_box"], sfx: ["_clean_water_box"] },
  water_shortage: { domain: "binary_sensor", tk: ["water_shortage"], sfx: ["_water_shortage"] },
  mop_attached: { domain: "binary_sensor", tk: ["mop_attached"], sfx: ["_mop_attached"] },
  area: { domain: "sensor", tk: ["cleaning_area"], sfx: ["_cleaning_area"] },
  time: { domain: "sensor", tk: ["cleaning_time"], sfx: ["_cleaning_time"] },
  progress: { domain: "sensor", tk: ["clean_percent", "cleaning_progress"], sfx: ["_cleaning_progress"] },
  room: { domain: "sensor", tk: ["current_room"], sfx: ["_current_room"] },
  last_start: { domain: "sensor", tk: ["last_clean_start"], sfx: ["_last_clean_begin", "_last_clean_start"] },
  map_select: { domain: "select", tk: ["selected_map"], sfx: ["_selected_map"] },
  mode: { domain: "select", tk: ["cleaning_mode"], sfx: ["_cleaning_mode"] },
  mop_water: { domain: "select", tk: ["mop_intensity"], sfx: ["_mop_intensity"] },
  mop_route: { domain: "select", tk: ["mop_mode"], sfx: ["_mop_mode"] },
  drying: { domain: "sensor", tk: ["mop_drying_remaining_time"], sfx: ["_mop_drying_remaining_time"] },
  // The dock's own jobs, as switches that are on while each runs.
  empty_sw: { domain: "switch", tk: ["dust_emptying", "dock_dust_emptying"], sfx: ["_dust_emptying"] },
  wash_sw: { domain: "switch", tk: ["mop_washing", "dock_mop_washing"], sfx: ["_mop_washing"] },
  dry_sw: { domain: "switch", tk: ["mop_drying", "dock_mop_drying"], sfx: ["_mop_drying"] },
};

function deviceEntityIds(hass, vacuumId) {
  const reg = hass.entities || {};
  const devId = reg[vacuumId]?.device_id;
  if (!devId) {
    // No registry (old frontend): everything whose object id contains the vacuum's.
    const base = String(vacuumId).split(".")[1] || "";
    return { devId: null, ids: Object.keys(hass.states).filter((id) => base && id.split(".")[1].includes(base)) };
  }
  const devs = hass.devices || {};
  const dev = devs[devId] || {};
  const own = (dev.identifiers || []).map(([d, i]) => `${d}|${i}_dock`);
  const dockIds = Object.values(devs)
    .filter((d) => d.id !== devId && ((d.identifiers || []).some(([x, i]) => own.includes(`${x}|${i}`)) || (dev.name && d.name === `${dev.name} Dock`)))
    .map((d) => d.id);
  const ids = Object.values(reg)
    .filter((e) => e.device_id === devId || dockIds.includes(e.device_id))
    .map((e) => e.entity_id);
  return { devId, ids };
}

function discover(hass, cfg) {
  const reg = hass.entities || {};
  const { devId, ids } = deviceEntityIds(hass, cfg.entity);
  const found = {};
  for (const [k, spec] of Object.entries(KEYS)) {
    const own = cfg.entities?.[k];
    if (own) {
      found[k] = own;
      continue;
    }
    const cands = ids.filter((id) => id.startsWith(`${spec.domain}.`) && hass.states[id]);
    let hit = spec.tk ? cands.filter((id) => spec.tk.includes(reg[id]?.translation_key)) : [];
    if (!hit.length && spec.dc)
      hit = cands.filter((id) => hass.states[id].attributes?.device_class === spec.dc && (!spec.main || !devId || reg[id]?.device_id === devId));
    if (!hit.length && spec.sfx) hit = cands.filter((id) => spec.sfx.some((s) => id.endsWith(s)));
    // Shortest wins: _cleaning_time over _total_cleaning_time.
    if (hit.length) found[k] = hit.sort((a, b) => a.length - b.length)[0];
  }
  found.images = ids.filter((id) => id.startsWith("image.") && hass.states[id]);
  return found;
}

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
function imageFor(hass, images, mapName) {
  if (!mapName) return images.length === 1 ? images[0] : null;
  const n = String(mapName).toLowerCase();
  return (
    images.find((id) => String(hass.states[id]?.attributes?.friendly_name || "").toLowerCase().endsWith(n)) ||
    images.find((id) => id.endsWith(`_${slug(mapName)}`)) ||
    null
  );
}

/* Room icons: your own (rooms: in the config), else the Home Assistant area with that name
   (or whose name is inside the room's, e.g. "Corridor" in "Upstairs Corridor"), else a guess. */
const ROOM_GUESS = [
  [/en.?suite|shower/i, "mdi:shower"],
  [/toilet|\bwc\b|cloak/i, "mdi:toilet"],
  [/bath/i, "mdi:bathtub"],
  [/kitchen/i, "mdi:countertop"],
  [/living|lounge|sitting/i, "mdi:sofa"],
  [/dining/i, "mdi:silverware-fork-knife"],
  [/study|office/i, "mdi:chair-rolling"],
  [/corridor|hall|landing|stair/i, "mdi:stairs"],
  [/bed/i, "mdi:bed"],
  [/utility|laundry/i, "mdi:washing-machine"],
];
function roomIcon(hass, cfg, name) {
  const own = cfg.rooms?.[name]?.icon;
  if (own) return own;
  const n = String(name).toLowerCase();
  const areas = Object.values(hass.areas || {}).filter((a) => a?.name && a.icon);
  const exact = areas.find((a) => a.name.toLowerCase() === n);
  if (exact) return exact.icon;
  const inside = areas.filter((a) => n.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(n)).sort((a, b) => b.name.length - a.name.length)[0];
  if (inside) return inside.icon;
  return (ROOM_GUESS.find(([re]) => re.test(name)) || [, "mdi:floor-plan"])[1];
}

/* ------------------------------------------------------------------------ */
/* State                                                                    */
/* ------------------------------------------------------------------------ */

const STATES = {
  docked: { word: "Docked", color: C.grey, icon: "mdi:robot-vacuum" },
  cleaning: { word: "Cleaning", color: C.blue, icon: "mdi:robot-vacuum" },
  returning: { word: "Returning", color: C.blue, icon: "mdi:robot-vacuum" },
  paused: { word: "Paused", color: C.amber, icon: "mdi:robot-vacuum" },
  idle: { word: "Idle", color: C.grey, icon: "mdi:robot-vacuum" },
  error: { word: "Error", color: C.red, icon: "mdi:robot-vacuum-alert" },
  needs: { word: "Needs you", color: C.red, icon: "mdi:robot-vacuum-alert" },
  offline: { word: "Offline", color: C.grey, icon: "mdi:robot-vacuum-off" },
};
const BUSY = ["cleaning", "returning", "paused"];
const STATUS_LINE = {
  washing_the_mop: "Washing the mop",
  going_to_wash_the_mop: "Going to wash the mop",
  emptying_the_bin: "Emptying the bin",
  returning_home: "Returning to the dock",
  docking: "Returning to the dock",
  back_to_dock_washing_duster: "Returning to wash the mop",
  mapping: "Mapping",
  attaching_the_mop: "Attaching the mop",
  detaching_the_mop: "Detaching the mop",
  going_to_target: "Going to the spot",
  air_drying_stopping: "Drying the mop",
};
const DOCK_TEXT = {
  water_empty: "Dock: refill the clean water tank",
  waste_water_tank_full: "Dock: empty the dirty water tank",
  cleaning_tank_full_or_blocked: "Dock: the cleaning tray is full or blocked",
  dirty_tank_latch_open: "Dock: close the dirty water tank latch",
  no_dustbin: "Dock: the dust bag is missing",
  no_dustbin_or_filter: "Dock: the dust bag or filter is missing",
  duct_blockage: "Dock: the dust duct is blocked",
  maintenance_brush_jammed: "Dock: the maintenance brush is jammed",
};

function model(hass, cfg, found, maps) {
  const v = hass.states[cfg.entity];
  const st = (k) => (found[k] ? hass.states[found[k]] : undefined);
  const s = (k) => st(k)?.state;
  const raw = v ? v.state : "unavailable";
  let key = DEAD.includes(raw) ? "offline" : STATES[raw] ? raw : "idle";

  // What needs you: errors and the dock's tanks. None of it blocks a clean.
  const msgs = [];
  if (key !== "offline") {
    const err = s("error");
    if (err && !["none", "ok", ...DEAD].includes(err)) msgs.push({ text: `Robot: ${human(err).toLowerCase()}`, e: found.error, c: C.red });
    const dock = s("dock_error");
    if (dock && !["ok", "none", ...DEAD].includes(dock)) msgs.push({ text: DOCK_TEXT[dock] || `Dock: ${human(dock).toLowerCase()}`, e: found.dock_error, c: C.red });
    if (s("dirty_box") === "on" && dock !== "waste_water_tank_full") msgs.push({ text: DOCK_TEXT.waste_water_tank_full, e: found.dirty_box, c: C.red });
    if (s("clean_box") === "on" && dock !== "water_empty") msgs.push({ text: DOCK_TEXT.water_empty, e: found.clean_box, c: C.red });
    if (s("water_shortage") === "on") msgs.push({ text: "Robot: the water tank is low", e: found.water_shortage, c: C.red });
    const mode = s("mode");
    if (s("mop_attached") === "off" && mode && mode !== "vacuum" && !DEAD.includes(mode))
      msgs.push({ text: "The mop isn't attached, so it will only vacuum", e: found.mop_attached, c: C.amber });
  }
  if (msgs.some((m) => m.c === C.red) && ["docked", "idle"].includes(key)) key = "needs";

  const battery = num(s("battery") ?? v?.attributes?.battery_level);
  const charging = s("charging") === "on" || String(s("status")) === "charging";
  const status = String(s("status") || "");
  const room = DEAD.includes(s("room")) ? "" : s("room") || "";

  // The line under the name.
  let line = [];
  if (key === "offline") line = [{ t: "Can't reach the vacuum" }];
  else if (key === "cleaning")
    line = [{ t: STATUS_LINE[status] || (room ? `Cleaning ${room}` : "Cleaning"), e: STATUS_LINE[status] ? found.status : found.room }];
  else if (key === "returning") line = [{ t: "Returning to the dock", e: found.status }];
  else if (key === "paused") line = [{ t: room ? `Paused in ${room}` : "Paused", e: found.room }];
  else if (key === "error") line = msgs.length ? [] : [{ t: human(status) || "Error", e: found.status }];
  else {
    const dry = seconds(st("drying"));
    if (dry) line = [{ t: `Drying the mop · ${mins(dry)} left`, e: found.drying }];
    else {
      const last = when(s("last_start"));
      if (last) {
        line.push({ t: `Last clean ${last}`, e: found.last_start });
        const a = num(s("area"));
        if (a !== null) line.push({ t: `${fmt(a, 1)} m²`, e: found.area });
        const tm = seconds(st("time"));
        if (tm !== null) line.push({ t: mins(tm), e: found.time });
      } else if (key === "idle") line = [{ t: "Away from the dock", e: found.status }];
    }
  }

  const mapNames = st("map_select")?.attributes?.options || (maps || []).map((m) => m.name);
  const mapName = s("map_select") && !DEAD.includes(s("map_select")) ? s("map_select") : maps?.length === 1 ? maps[0].name : "";
  const map = (maps || []).find((m) => m.name === mapName) || (maps?.length === 1 ? maps[0] : null);
  const img = imageFor(hass, found.images || [], mapName);
  const imgState = img ? hass.states[img] : null;

  return {
    key,
    state: STATES[key],
    name: cfg.name || v?.attributes?.friendly_name || "Vacuum",
    msgs,
    line,
    battery,
    charging,
    progress: num(s("progress")),
    area: num(s("area")),
    time: seconds(st("time")),
    room,
    floors: mapNames.length > 1 ? mapNames : [],
    mapName,
    rooms: map ? map.rooms.filter((r) => !cfg.rooms?.[r.name]?.hide) : [],
    image: imgState?.attributes?.entity_picture ? { id: img, url: `${imgState.attributes.entity_picture}${imgState.attributes.entity_picture.includes("?") ? "&" : "?"}s=${encodeURIComponent(imgState.state)}` } : null,
    mode: s("mode"),
    fan: v?.attributes?.fan_speed,
    water: s("mop_water"),
    route: s("mop_route"),
    auto: cfg.auto_clean ? hass.states[cfg.auto_clean] : null,
  };
}

/* Settings: label for an option, which options to offer, and in what order. */
const OPT_LABEL = { vac_and_mop: "Vac & mop", max_plus: "Max+", deep_plus: "Deep+", smart_mode: "Smart" };
const optLabel = (o) => OPT_LABEL[o] || human(o);
const ORDER = {
  mode: ["vacuum", "vac_and_mop", "mop", "custom"],
  fan: ["off", "quiet", "gentle", "balanced", "standard", "turbo", "strong", "max", "max_plus", "custom"],
  water: ["off", "low", "mild", "moderate", "medium", "standard", "high", "intense", "custom"],
  route: ["fast", "standard", "deep", "deep_plus", "custom"],
};
function offer(options, current, order) {
  const hide = ["custom", "off", "smart_mode"];
  const list = (options || []).filter((o) => !hide.includes(o) || o === current);
  return list.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}

/* ------------------------------------------------------------------------ */
/* Sheet (Bubble look) for the cleaning settings                            */
/* ------------------------------------------------------------------------ */

const SHEET_CSS = `
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
    padding: 25px 18px 18px; border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  .sect { margin-top: 18px; display: grid; gap: 8px; }
  .sect[hidden] { display: none; }
  .k { font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color); padding-left: 8px; }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); }
  .seg button { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0; height: 32px; border-radius: 9px; text-align: center; cursor: pointer;
    font-size: 12px; font-weight: 500; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px;
    -webkit-tap-highlight-color: transparent; }
  .seg button[aria-pressed="true"] { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .actions { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); display: grid; gap: 8px; }
  .done { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  .done .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  .done .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button:active { filter: brightness(.92); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

/* Confirmation dialog – same look as the other cards' dialogs. */
function confirmDialog({ title, icon, color, primary, secondary, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("rvc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${SHEET_CSS}
      .body { margin-top: 20px; }
      .primary { font-size: 17px; line-height: 24px; font-weight: 600; }
      .secondary { font-size: 15px; line-height: 21px; margin-top: 2px; color: var(--secondary-text-color); }
      .buttons { margin-top: 20px; display: grid; gap: 8px; }
      .buttons button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
        border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
        background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
      .buttons .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
      .buttons .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
      .buttons .confirm { color: #fff; }
      .buttons .confirm .glyph { background: rgba(255,255,255,.2); }
      .buttons .confirm .glyph ha-icon { color: #fff; }</style>
      <div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="row body"><div class="glyph"><ha-icon icon="mdi:robot-vacuum" style="color:${color}"></ha-icon></div>
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

/* The dock's jobs ask before they start and before they stop (the user's choice). */
const DOCK_CONFIRM = {
  empty_sw: {
    start: { title: "Empty the bin", icon: "mdi:delete-empty-outline", label: "Empty",
      text: "The dock empties the robot's dust bin into its bag now. It's loud for about half a minute." },
    stop: { title: "Stop emptying", label: "Stop emptying", text: "The dock stops emptying the bin now." },
  },
  wash_sw: {
    start: { title: "Wash the mop", icon: "mdi:water-sync", label: "Wash mop",
      text: "The dock washes the mop now, with clean water from its tank. The dirty water goes to the dirty tank." },
    stop: { title: "Stop washing", label: "Stop washing", text: "The dock stops washing the mop now." },
  },
  dry_sw: {
    start: { title: "Dry the mop", icon: "mdi:fan", label: "Dry",
      text: "The dock dries the mop now, for the drying time set in the Roborock app." },
    stop: { title: "Stop drying", label: "Stop drying", text: "The dock stops drying the mop now, so it may stay damp." },
  },
};

/* ------------------------------------------------------------------------ */

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 10px; container-type: inline-size; }
  .body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .body > * { min-width: 0; }
  [hidden] { display: none !important; }
  .head { display: flex; align-items: center; gap: 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { flex: 1; min-width: 0; cursor: pointer; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm .st { font-weight: 400; color: var(--secondary-text-color); }
  /* The line under the name may wrap (numbers are never cut off). */
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .sc:empty { display: none; }
  .sc .p { white-space: nowrap; }
  [data-e] { cursor: pointer; border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  .sc [data-e]:active, .jt [data-e]:active { filter: brightness(.85); }
  /* Primary pills: 36px, the icon circle's height. */
  .pill { all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; border-radius: 18px; padding: 0 14px 0 10px; font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
    cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .pill.batt { color: var(--secondary-text-color); }
  .pill.low { background: ${tint(C.red, 18)}; color: ${tx(C.red, 85)}; }
  .pill.on { background: ${tint(C.teal, 18)}; color: ${tx(C.teal)}; }
  .pill.on ha-icon { color: ${C.teal}; }
  .pill[disabled] { opacity: .45; cursor: default; }
  .msg { display: flex; align-items: center; gap: 8px; min-height: 30px; box-sizing: border-box; padding: 6px 10px; border-radius: 10px;
    font-size: 12px; line-height: 16px; letter-spacing: .3px; cursor: pointer; }
  .msg ha-icon { --mdc-icon-size: 16px; flex: none; }
  .msgs { display: grid; gap: 6px; }
  .msgs:empty { display: none; }
  .jt { min-width: 0; }
  .pct { font-size: 20px; line-height: 26px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; }
  .pct .when { font-size: 12px; font-weight: 400; letter-spacing: .4px; color: var(--secondary-text-color); margin-left: 8px; }
  .pbar { height: 8px; border-radius: 4px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); margin-top: 4px; overflow: hidden; }
  .pbar i { display: block; height: 100%; border-radius: 4px; transition: width 400ms; }
  /* Segmented selector: 32px segments in a 38px track. */
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); }
  .seg button { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0; height: 32px; border-radius: 9px; text-align: center; cursor: pointer;
    font-size: 12px; font-weight: 500; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    -webkit-tap-highlight-color: transparent; }
  .seg button[aria-pressed="true"] { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .seg button[disabled] { opacity: .45; cursor: default; }
  .map { position: relative; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); height: clamp(200px, 64cqw, 340px);
    display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; }
  .map canvas { display: block; }
  /* Secondary pills (chips): 30px. */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chips:empty { display: none; }
  .chip { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 30px; border-radius: 15px; padding: 0 12px 0 8px;
    font-size: 12px; font-weight: 500; letter-spacing: .2px; white-space: nowrap; cursor: pointer; max-width: 100%;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color); -webkit-tap-highlight-color: transparent; }
  .chip span { overflow: hidden; text-overflow: ellipsis; }
  .chip ha-icon { --mdc-icon-size: 16px; color: ${C.grey}; flex: none; }
  .chip.sel { background: ${tint(C.blue, 18)}; color: ${tx(C.blue)}; }
  .chip.sel ha-icon { color: ${C.blue}; }
  .chip.now { box-shadow: inset 0 0 0 1.5px ${tint(C.blue, 60)}; }
  .chip.run { background: ${tint(C.blue, 18)}; color: ${tx(C.blue)}; }
  .chip.run ha-icon { color: ${C.blue}; }
  .chip[aria-disabled="true"] { cursor: default; }
  .chip[disabled] { opacity: .45; cursor: default; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .acts .pill { flex: 1 1 0; min-width: max-content; }
  .pill:active, .chip:active, .seg button:active, .shape:active { filter: brightness(.92); }
  .pill:focus-visible, .chip:focus-visible, .seg button:focus-visible, .shape:focus-visible, [data-e]:focus-visible, .msg:focus-visible, .map:focus-visible {
    outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes (a leading "1" or an icon has its own side bearing). */
const INK = { ctx: undefined, units: new Map() };
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
    if (ref === null) return true;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (lead && lead.text) inkSet(line, ref - inkText(lead.text));
    }
  }
  return true;
}
function inkSchedule(host, selector) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    if (host.shadowRoot) inkAlign(host.shadowRoot.querySelectorAll(selector));
  });
}

/* The floor map: the image entity's picture, cropped to what is drawn (Roborock maps come
   with wide transparent margins) and fitted into the box. Repainted on resize; a new
   picture replaces the old one only once it has loaded, so a live map never flickers. */
function cropBox(img) {
  const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  try {
    const s = Math.min(1, 320 / Math.max(full.w, full.h));
    const w = Math.max(1, Math.round(full.w * s));
    const h = Math.max(1, Math.round(full.h * s));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return full;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (d[(y * w + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return full;
    const m = 3; // a little air around the rooms
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    return { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s };
  } catch (e) {
    return full; // a picture from another origin can't be read: show it whole
  }
}

class RobotVacuumCard extends HTMLElement {
  static getStubConfig(hass) {
    const v = Object.keys(hass?.states || {}).find((id) => id.startsWith("vacuum."));
    return { entity: v || "vacuum.robot" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "vacuum" } } },
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "auto_clean", selector: { entity: { domain: ["automation", "input_boolean", "switch"] } } },
        ] },
        { type: "grid", name: "", schema: [
          { name: "hide_map", selector: { boolean: {} } },
          { name: "hide_rooms", selector: { boolean: {} } },
          { name: "hide_settings", selector: { boolean: {} } },
          { name: "hide_dock_actions", selector: { boolean: {} } },
        ] },
        { name: "rooms", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: "Vacuum",
          name: "Name",
          auto_clean: "Auto clean (automation or switch)",
          hide_map: "Hide the map",
          hide_rooms: "Hide the rooms",
          hide_settings: "Hide the cleaning settings",
          hide_dock_actions: "Hide Empty / Wash mop / Dry",
          rooms: "Rooms (YAML)",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          auto_clean: "Shows an Auto clean pill that turns this on and off, glowing while it is on.",
          rooms: "Per room, by the robot's room name: icon and hide. E.g. En-suite Bathroom: { icon: mdi:shower }",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.entity || !String(config.entity).startsWith("vacuum.")) throw new Error("Set entity to your vacuum (vacuum.…)");
    this._config = { ...config };
    this._built = false;
    this._found = null;
    this._sel = new Set();
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    this._syncSheet();
  }

  getCardSize() {
    return 9;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    if (this._built && this._ro && this._mapEl) this._ro.observe(this._mapEl);
  }

  disconnectedCallback() {
    this._ro?.disconnect();
    this._closeSheet();
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="body">
      <div class="head"><div class="shape" role="button" tabindex="0" aria-label="Vacuum details"><ha-icon></ha-icon></div>
        <div class="txt" data-e="${esc(this._config.entity)}" role="button" tabindex="0"><div class="nm"></div><div class="sc line"></div></div>
        <button class="pill batt"><ha-icon></ha-icon><span></span></button></div>
      <div class="msgs"></div>
      <div class="jt" hidden><div class="pct"></div><div class="pbar"><i></i></div></div>
      <div class="seg floors" hidden></div>
      <div class="map" role="button" tabindex="0" aria-label="Map" hidden><canvas></canvas></div>
      <div class="chips rooms"></div>
      <div class="chips sets"></div>
      <div class="acts"></div>
      <div class="chips dock"></div></div></ha-card>`;
    const card = root.querySelector("ha-card");
    card.addEventListener("click", (e) => this._click(e));
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".txt, .shape, .map, .msg")) {
        e.preventDefault();
        this._click(e);
      }
    });
    this._mapEl = root.querySelector(".map");
    this._mapUrl = null;
    this._mapImg = null;
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._paintMap());
      this._ro.observe(this._mapEl);
    }
    this._bindHold(root.querySelector(".acts"));
    this._built = true;
    this._keys = {};
  }

  _more(id) {
    if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }

  _click(e) {
    const t = e.target;
    if (t.closest(".shape")) return this._more(this._config.entity);
    const room = t.closest("[data-room]");
    if (room) {
      if (room.getAttribute("aria-disabled") === "true" || room.disabled) return;
      const id = Number(room.dataset.room);
      this._sel.has(id) ? this._sel.delete(id) : this._sel.add(id);
      return this._render();
    }
    const floor = t.closest("[data-floor]");
    if (floor) {
      if (floor.disabled || floor.getAttribute("aria-pressed") === "true") return;
      this._sel.clear();
      return this._call("select", "select_option", { entity_id: this._found.map_select, option: floor.dataset.floor });
    }
    if (t.closest(".sets .chip")) return this._openSheet();
    const job = t.closest("[data-dock]");
    if (job) {
      if (!job.disabled) this._dockJob(job.dataset.dock);
      return;
    }
    const act = t.closest(".acts .pill");
    if (act) {
      if (act.disabled || this._held) {
        this._held = false;
        return;
      }
      return this._action(act.dataset.k);
    }
    if (t.closest(".map")) return this._more(this._m?.image?.id);
    if (t.closest(".batt")) return this._more(this._found.battery);
    const v = t.closest("[data-e]");
    if (v) this._more(v.dataset.e);
  }

  /* Hold the Auto clean pill for its more-info (tap toggles it). */
  _bindHold(box) {
    let timer = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    box.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".pill[data-k='auto']");
      if (!b || (e.button !== undefined && e.button !== 0)) return;
      this._held = false;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        this._held = true;
        this._more(this._config.auto_clean);
      }, 500);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => box.addEventListener(t, cancel));
    box.addEventListener("contextmenu", (e) => e.target.closest(".pill[data-k='auto']") && e.preventDefault());
    box.addEventListener("touchend", (e) => this._held && e.preventDefault());
  }

  _render() {
    inkSchedule(this, ".txt");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    if (!this._found || this._regRef !== hass.entities || !this._found.battery) {
      this._found = discover(hass, this._config);
      this._regRef = hass.entities;
    }
    this._loadMaps();
    const m = model(hass, this._config, this._found, this._maps);
    this._m = m;
    const root = this.shadowRoot;
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (n && (html ? n.innerHTML !== v : n.textContent !== v)) html ? (n.innerHTML = v) : (n.textContent = v);
    };
    const offline = m.key === "offline";
    const busy = BUSY.includes(m.key);

    // Head: state circle, name · state, the line, battery.
    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    set(".nm", `${esc(m.name)} <span class="st">· ${esc(m.state.word)}</span>`, true);
    // Each part stays whole ("28 min" never splits); the line breaks only between parts.
    set(".line", m.line.map((p) => `<span class="p"${p.e ? ` data-e="${esc(p.e)}"` : ""}>${esc(p.t)}</span>`).join(" · "), true);
    const batt = root.querySelector(".batt");
    batt.hidden = m.battery === null;
    if (m.battery !== null) {
      const b = m.battery;
      const lvl = Math.max(10, Math.min(100, Math.round(b / 10) * 10));
      const icon = m.charging ? `mdi:battery-charging-${lvl === 100 ? 100 : lvl}` : lvl === 100 ? "mdi:battery" : `mdi:battery-${lvl}`;
      const bi = batt.querySelector("ha-icon");
      if (bi.getAttribute("icon") !== icon) bi.setAttribute("icon", icon);
      const low = b <= 15 && !m.charging;
      bi.style.color = b <= 15 ? C.red : b <= 30 ? C.amber : C.green;
      batt.classList.toggle("low", low);
      set(".batt span", `${fmt(b)}%`);
    }

    // What needs you.
    const msgKey = m.msgs.map((x) => x.text + x.c).join("|");
    if (msgKey !== this._keys.msgs) {
      set(".msgs", m.msgs
        .map((x) => `<div class="msg" role="button" tabindex="0" data-e="${esc(x.e || "")}" style="background:${tint(x.c, 10)};color:${tx(x.c, 85)}">
          <ha-icon icon="mdi:alert-circle-outline" style="color:${x.c}"></ha-icon><span>${esc(x.text)}</span></div>`).join(""), true);
      this._keys.msgs = msgKey;
    }

    // The job: progress, time and area while cleaning, paused or on the way back.
    const jt = root.querySelector(".jt");
    const showJob = (m.key === "cleaning" || m.key === "paused") && m.progress !== null;
    jt.hidden = !showJob;
    if (showJob) {
      const p = Math.max(0, Math.min(100, m.progress));
      const f = this._found;
      const e = (id, t) => (id ? `<span data-e="${esc(id)}">${esc(t)}</span>` : esc(t));
      const bits = [m.time !== null ? e(f.time, mins(m.time)) : "", m.area !== null ? e(f.area, `${fmt(m.area, 1)} m²`) : ""].filter(Boolean).join(" · ");
      set(".pct", `${e(f.progress, `${fmt(p)}%`)}<span class="when">${bits}</span>`, true);
      const bar = root.querySelector(".pbar i");
      bar.style.width = `${p}%`;
      bar.style.background = m.state.color;
    }

    // Floors (the robot's loaded map): only while it isn't on a job.
    const floors = root.querySelector(".floors");
    floors.hidden = !m.floors.length || busy || !this._found.map_select;
    if (!floors.hidden) {
      const fk = m.floors.join("|");
      if (fk !== this._keys.floors) {
        floors.innerHTML = m.floors.map((f) => `<button data-floor="${esc(f)}">${esc(f)}</button>`).join("");
        this._keys.floors = fk;
      }
      floors.querySelectorAll("button").forEach((b) => {
        const on = String(b.dataset.floor === m.mapName);
        if (b.getAttribute("aria-pressed") !== on) b.setAttribute("aria-pressed", on);
        b.disabled = offline;
      });
    }
    if (m.mapName !== this._lastMap) {
      this._sel.clear();
      this._lastMap = m.mapName;
    }

    // Map.
    const map = root.querySelector(".map");
    map.hidden = !!this._config.hide_map || !m.image;
    if (!map.hidden) this._syncMap(m.image.url);

    // Rooms: tap to add to a clean. While a job runs they show where the robot is.
    const rooms = root.querySelector(".rooms");
    rooms.hidden = !!this._config.hide_rooms;
    if (!rooms.hidden) {
      const rk = m.rooms.map((r) => `${r.id}:${r.name}`).join("|");
      if (rk !== this._keys.rooms) {
        rooms.innerHTML = m.rooms
          .map((r) => `<button class="chip" data-room="${r.id}"><ha-icon></ha-icon><span>${esc(this._config.rooms?.[r.name]?.name || r.name)}</span></button>`)
          .join("");
        this._keys.rooms = rk;
      }
      for (const id of [...this._sel]) if (!m.rooms.some((r) => r.id === id)) this._sel.delete(id);
      rooms.querySelectorAll(".chip").forEach((b) => {
        const r = m.rooms.find((x) => String(x.id) === b.dataset.room);
        const on = this._sel.has(r.id) && !busy;
        b.classList.toggle("sel", on);
        b.classList.toggle("now", busy && !!m.room && r.name === m.room);
        b.setAttribute("aria-pressed", String(on));
        b.setAttribute("aria-disabled", String(busy));
        b.disabled = offline;
        const icon = on ? "mdi:check" : roomIcon(this._hass, this._config, r.name);
        const ri = b.querySelector("ha-icon");
        if (ri.getAttribute("icon") !== icon) ri.setAttribute("icon", icon);
      });
    }

    // Cleaning settings as chips; a tap opens the sheet.
    const sets = root.querySelector(".sets");
    const chips = [];
    if (!this._config.hide_settings) {
      const mode = DEAD.includes(m.mode) ? null : m.mode;
      if (mode) chips.push(["mode", mode === "vacuum" ? "mdi:fan" : "mdi:waves", optLabel(mode)]);
      if (m.fan && mode !== "mop") chips.push(["fan", "mdi:fan-speed-3", optLabel(m.fan)]);
      if (m.water && !DEAD.includes(m.water) && mode !== "vacuum" && m.water !== "off") chips.push(["water", "mdi:water", `${optLabel(m.water)} mop`]);
    }
    const sk = chips.map((c) => c.join(",")).join("|") + offline;
    if (sk !== this._keys.sets) {
      sets.innerHTML = chips
        .map(([k, icon, label]) => `<button class="chip" data-set="${k}"${offline ? " disabled" : ""} aria-haspopup="dialog"><ha-icon icon="${icon}"></ha-icon><span>${esc(label)}</span></button>`)
        .join("");
      this._keys.sets = sk;
    }

    // Buttons for the state, rebuilt only when the set changes (taps are never lost).
    const n = this._sel.size;
    const acts = [];
    if (m.key === "cleaning") acts.push(["pause", "Pause", "mdi:pause", C.amber], ["dock", "Dock", "mdi:home-import-outline", C.grey]);
    else if (m.key === "paused") acts.push(["resume", "Resume", "mdi:play", C.blue], ["dock", "Dock", "mdi:home-import-outline", C.grey]);
    else if (m.key === "returning") acts.push(["pause", "Pause", "mdi:pause", C.amber]);
    else {
      acts.push(["clean", n ? `Clean ${n} room${n > 1 ? "s" : ""}` : "Clean all", "mdi:play", C.blue]);
      // One control per job: Dock only while the robot is away from the dock.
      if (this._hass.states[this._config.entity]?.state !== "docked") acts.push(["dock", "Dock", "mdi:home-import-outline", C.grey]);
    }
    if (this._config.auto_clean) acts.push(["auto", this._config.auto_clean_name || "Auto clean", "mdi:account-arrow-right", null]);
    const ak = acts.map((a) => a[0]).join();
    const box = root.querySelector(".acts");
    if (ak !== this._keys.acts) {
      box.innerHTML = acts
        .map(([k, , icon, color]) => `<button class="pill" data-k="${k}"><ha-icon icon="${icon}"${color ? ` style="color:${color}"` : ""}></ha-icon><span></span></button>`)
        .join("");
      this._keys.acts = ak;
    }
    for (const [k, label] of acts) {
      const b = box.querySelector(`[data-k="${k}"]`);
      const sp = b.querySelector("span");
      if (sp.textContent !== label) sp.textContent = label;
      if (b.disabled !== offline) b.disabled = offline;
      if (k === "auto") {
        const on = m.auto?.state === "on";
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        b.disabled = !m.auto || DEAD.includes(m.auto.state);
      }
    }

    // The dock's jobs, run by hand (e.g. after an early Dock): only while the robot is on the
    // dock. Each glows while it runs; a tap starts or stops it at once.
    const dockBox = root.querySelector(".dock");
    const docked = this._hass.states[this._config.entity]?.state === "docked" || offline;
    const dry = seconds(hass.states[this._found.drying]);
    const jobs = [
      ["empty_sw", "mdi:delete-empty-outline", "Empty", "Emptying"],
      ["wash_sw", "mdi:water-sync", "Wash mop", "Washing"],
      ["dry_sw", "mdi:fan", "Dry", dry ? `Drying · ${mins(dry)}` : "Drying"],
    ].filter(([k]) => this._found[k] && !this._config.hide_dock_actions);
    const shown = docked ? jobs : [];
    const jk = shown.map((j) => j[0]).join();
    if (jk !== this._keys.dock) {
      dockBox.innerHTML = shown.map(([k, icon]) => `<button class="chip" data-dock="${k}"><ha-icon icon="${icon}"></ha-icon><span></span></button>`).join("");
      this._keys.dock = jk;
    }
    for (const [k, , idle, running] of shown) {
      const b = dockBox.querySelector(`[data-dock="${k}"]`);
      const on = hass.states[this._found[k]]?.state === "on";
      const label = on ? running : idle;
      const sp = b.querySelector("span");
      if (sp.textContent !== label) sp.textContent = label;
      b.classList.toggle("run", on);
      b.setAttribute("aria-pressed", String(on));
      b.disabled = offline || DEAD.includes(hass.states[this._found[k]]?.state);
    }
  }

  /* Rooms and segment ids per map, from roborock.get_maps (or the maps: option). */
  _loadMaps() {
    if (this._config.maps) {
      if (!this._maps)
        this._maps = this._config.maps.map((x) => ({ name: x.name, rooms: Object.entries(x.rooms || {}).map(([id, name]) => ({ id: Number(id), name })) }));
      return;
    }
    const opts = (this._hass.states[this._found?.map_select]?.attributes?.options || []).join("|");
    const stale = this._maps && this._mapsFor !== opts;
    const retry = !this._maps && this._mapsTried && Date.now() - this._mapsTried > 60000;
    if (this._mapsLoading || (this._maps && !stale) || (this._mapsTried && !retry && !stale)) return;
    if (typeof this._hass.callWS !== "function") return;
    this._mapsLoading = true;
    this._mapsTried = Date.now();
    const id = this._config.entity;
    this._hass
      .callWS({ type: "call_service", domain: "roborock", service: "get_maps", target: { entity_id: id }, return_response: true })
      .then((r) => {
        const maps = r?.response?.[id]?.maps;
        if (Array.isArray(maps)) {
          this._maps = maps.map((x) => ({ name: x.name, rooms: Object.entries(x.rooms || {}).map(([sid, name]) => ({ id: Number(sid), name })) }));
          this._mapsFor = opts;
        }
      })
      .catch(() => {})
      .finally(() => {
        this._mapsLoading = false;
        this._render();
      });
  }

  _syncMap(url) {
    if (url === this._mapUrl) return;
    this._mapUrl = url;
    if (typeof Image === "undefined") return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (this._mapUrl !== url) return;
      this._mapImg = img;
      this._mapCrop = cropBox(img);
      this._paintMap();
    };
    img.src = url;
  }

  _paintMap() {
    const img = this._mapImg;
    const box = this._mapEl;
    const cv = box?.querySelector("canvas");
    if (!img || !cv || box.hidden) return;
    const pad = 8;
    const W = box.clientWidth - pad * 2;
    const H = box.clientHeight - pad * 2;
    const c = this._mapCrop;
    if (W <= 0 || H <= 0 || !c?.w || !c?.h) return;
    const s = Math.min(W / c.w, H / c.h);
    const w = Math.round(c.w * s);
    const h = Math.round(c.h * s);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  }

  async _dockJob(k) {
    const id = this._found[k];
    const on = this._hass.states[id]?.state === "on";
    const c = DOCK_CONFIRM[k]?.[on ? "stop" : "start"];
    if (c) {
      const ok = await confirmDialog({
        title: c.title, icon: on ? "mdi:stop-circle-outline" : c.icon, color: on ? C.orange : C.blue,
        primary: this._m?.name || "Vacuum", secondary: c.text, confirmLabel: c.label,
      });
      if (!ok) return;
    }
    return this._call("switch", on ? "turn_off" : "turn_on", { entity_id: id });
  }

  async _action(k) {
    const id = this._config.entity;
    if (k === "clean") {
      const segs = [...this._sel];
      this._sel.clear();
      this._render();
      if (segs.length) return this._call("vacuum", "send_command", { entity_id: id, command: "app_segment_clean", params: [{ segments: segs, repeat: 1 }] });
      return this._call("vacuum", "start", { entity_id: id });
    }
    if (k === "resume") return this._call("vacuum", "start", { entity_id: id });
    if (k === "pause") return this._call("vacuum", "pause", { entity_id: id });
    if (k === "dock") return this._call("vacuum", "return_to_base", { entity_id: id });
    if (k === "auto") {
      const a = this._config.auto_clean;
      const on = this._hass.states[a]?.state === "on";
      const [domain] = a.split(".");
      const svc = ["automation", "input_boolean", "switch"].includes(domain) ? domain : "homeassistant";
      return this._call(svc, on ? "turn_off" : "turn_on", { entity_id: a });
    }
  }

  /* ---- Cleaning settings sheet ---- */

  _rows() {
    const m = this._m;
    const f = this._found;
    const st = (id) => (id ? this._hass.states[id] : undefined);
    const v = st(this._config.entity);
    const mode = DEAD.includes(m.mode) ? null : m.mode;
    const rows = [];
    if (f.mode && st(f.mode)) rows.push({ k: "mode", label: "Mode", cur: mode, opts: offer(st(f.mode).attributes?.options, mode, ORDER.mode) });
    if (v?.attributes?.fan_speed_list) rows.push({ k: "fan", label: "Suction", cur: m.fan, opts: offer(v.attributes.fan_speed_list, m.fan, ORDER.fan), hide: mode === "mop" });
    if (f.mop_water && st(f.mop_water)) rows.push({ k: "water", label: "Mop water", cur: m.water, opts: offer(st(f.mop_water).attributes?.options, m.water, ORDER.water), hide: mode === "vacuum" });
    // Deep and Deep+ routes only apply when mopping alone; suction only when vacuuming.
    if (f.mop_route && st(f.mop_route)) {
      const all = offer(st(f.mop_route).attributes?.options, m.route, ORDER.route);
      const opts = mode === "mop" ? all : all.filter((o) => !["deep", "deep_plus"].includes(o) || o === m.route);
      rows.push({ k: "route", label: "Mop route", cur: m.route, opts, hide: mode === "vacuum" });
    }
    return rows;
  }

  _openSheet() {
    if (this._sheet) return;
    const host = document.createElement("rvc-settings-sheet");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${SHEET_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Cleaning settings">
        <div class="row"><div class="glyph" style="background:${tint(C.blue, 20)}"><ha-icon icon="mdi:tune-variant" style="color:${C.blue}"></ha-icon></div>
          <div class="title">Cleaning settings</div></div>
        <div class="rows"></div>
        <div class="actions"><button class="done"><span class="glyph"><ha-icon icon="mdi:check"></ha-icon></span>Done</button></div></div>`;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this._closeSheet();
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => this._closeSheet());
    root.querySelector(".done").addEventListener("click", () => this._closeSheet());
    root.querySelector(".rows").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b || b.getAttribute("aria-pressed") === "true") return;
      const k = b.closest("[data-k]").dataset.k;
      const f = this._found;
      const v = b.dataset.v;
      // Show the choice at once; the next state update confirms it.
      b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (k === "fan") this._call("vacuum", "set_fan_speed", { entity_id: this._config.entity, fan_speed: v });
      else this._call("select", "select_option", { entity_id: { mode: f.mode, water: f.mop_water, route: f.mop_route }[k], option: v });
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    this._sheet = { host, root, onKey, key: "" };
    this._syncSheet();
    root.querySelector(".done").focus();
  }

  _syncSheet() {
    const sh = this._sheet;
    if (!sh || !this._m) return;
    const rows = this._rows();
    const key = rows.map((r) => `${r.k}:${r.opts.join(",")}`).join("|");
    const box = sh.root.querySelector(".rows");
    if (key !== sh.key) {
      box.innerHTML = rows
        .map((r) => `<div class="sect" data-k="${r.k}"><div class="k">${esc(r.label)}</div><div class="seg">${r.opts
          .map((o) => `<button data-v="${esc(o)}">${esc(optLabel(o))}</button>`).join("")}</div></div>`)
        .join("");
      sh.key = key;
    }
    for (const r of rows) {
      const sect = box.querySelector(`[data-k="${r.k}"]`);
      sect.hidden = !!r.hide;
      sect.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === r.cur)));
    }
  }

  _closeSheet() {
    const sh = this._sheet;
    if (!sh) return;
    document.removeEventListener("keydown", sh.onKey, true);
    sh.host.remove();
    this._sheet = null;
  }

  async _call(domain, service, data) {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || "That did not work" }, bubbles: true, composed: true }));
    }
  }
}

async function registerRobotVacuumCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(RVC_TAG)) return;
  registry.define(RVC_TAG, RobotVacuumCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: RVC_TAG,
    name: "Robot vacuum",
    description: "Robot vacuum: state, battery, map with floors, room cleaning, cleaning settings and the buttons for the state.",
  });
  console.info(`%c ROBOT-VACUUM-CARD %c ${RVC_VERSION} `, "background:#2196f3;color:#fff", "");
}

registerRobotVacuumCard();
