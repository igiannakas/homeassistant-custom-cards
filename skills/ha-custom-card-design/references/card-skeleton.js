/*
 * Card skeleton – copy, rename, fill in.  (Reference for the ha-custom-card-design skill.)
 *
 * Shows every pattern the real cards rely on:
 *   - build the DOM once, then update only nodes whose content changed (taps are never lost);
 *   - every value is a <button data-e="entity_id"> → its own more-info, via one delegated handler;
 *   - tiles are div role=button (no buttons inside buttons);
 *   - a Bubble-style confirm dialog made from an undefined tag + attachShadow;
 *   - actions rebuilt only when the set of actions changes;
 *   - registration after <home-assistant> exists, guarded against double loading.
 * Keep comments free of the two-character sequence that closes a block comment – the
 * HACS bundle concatenates files and a stray one breaks everything after it.
 */

const XC_VERSION = "1.0.0";
const XC_TAG = "example-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));

/* ---------- Confirm dialog (Bubble look) ---------- */

const DIALOG_CSS = `
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px;
    border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  .secondary { margin-top: 20px; padding: 0 8px; font-size: 15px; line-height: 21px; }
  .buttons { margin-top: 20px; display: grid; gap: 8px; }
  button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button.confirm { color: #fff; }
  button.confirm .glyph { background: rgba(255,255,255,.2); }
  button.confirm ha-icon { color: #fff; }
  button:active { filter: brightness(.92); }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
`;

function confirmDialog({ title, icon, color, secondary, confirmLabel }) {
  return new Promise((resolve) => {
    // An undefined tag: attachShadow works on it and nothing is added to HA's scoped registry.
    const host = document.createElement("xc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="secondary">${esc(secondary)}</div>
        <div class="buttons">
          <button class="confirm" style="background:${color}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
          <button class="cancel"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
        </div></div>`;
    const done = (ok) => {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(ok);
    };
    const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), done(false));
    root.querySelector(".backdrop").addEventListener("click", () => done(false));
    root.querySelector(".cancel").addEventListener("click", () => done(false));
    root.querySelector(".confirm").addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    root.querySelector(".confirm").focus();
  });
}

/* ---------- Card ---------- */

const CSS = `
  :host { display: block; }
  ha-card { padding: 6px; container-type: inline-size; }
  .label { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 2px 6px 6px; }
  .label ha-icon { --mdc-icon-size: 18px; color: ${C.orange}; }
  .title { font-size: 13px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color); white-space: nowrap; }
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 6px; }
  .tile { box-sizing: border-box; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px;
    cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); -webkit-tap-highlight-color: transparent;
    transition: background-color 180ms; }
  .tile.on { background: ${tint(C.orange, 10)}; }                 /* the glow = active */
  .shape { flex: 0 0 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${tint(C.grey, 20)}; }
  .shape ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .tile.on .shape { background: ${tint(C.orange, 20)}; }
  .tile.on .shape ha-icon { color: ${C.orange}; }
  .txt { flex: 1; min-width: 0; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Readings wrap instead of overflowing a narrow tile. */
  .vals { display: flex; flex-wrap: wrap; column-gap: 8px; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .vals [data-e] { all: unset; cursor: pointer; border-radius: 4px; white-space: nowrap; }
  .acts { display: grid; grid-template-columns: repeat(var(--n, 2), minmax(0, 1fr)); gap: 6px; margin-top: 6px; }
  .acts:empty { display: none; }
  .act { all: unset; box-sizing: border-box; height: 44px; border-radius: 22px; cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 6px; font-size: 13px; font-weight: 600; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); }
  /* filter, never transform: scaling moves the hit area mid-tap. */
  .tile:active, .act:active, .vals [data-e]:active { filter: brightness(.92); }
  .tile:focus-visible, .act:focus-visible, .vals [data-e]:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

class ExampleCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Example", items: [] };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "items", selector: { object: {} } }, // multi-entity fields inside lists need a custom editor
      ],
      computeLabel: (s) => ({ title: "Title", items: "Items" })[s.name] ?? s.name,
    };
  }

  setConfig(config) {
    if (!Array.isArray(config?.items)) throw new Error("Set items: a list of {name, entity, power}");
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

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const items = this._config.items;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><ha-icon icon="mdi:flash"></ha-icon><span class="title">${esc(this._config.title ?? "Example")}</span><span class="sum"></span></div>
      <div class="tiles">${items
        .map((it, i) => `<div class="tile" role="button" tabindex="0" data-i="${i}"><span class="shape"><ha-icon icon="${esc(it.icon || "mdi:power-socket-eu")}"></ha-icon></span>
          <span class="txt"><div class="nm">${esc(it.name)}</div><div class="vals"></div></span></div>`)
        .join("")}</div>
      <div class="acts"></div></ha-card>`;
    // One delegated handler: a value opens its own entity, the rest of a tile its main entity.
    const card = root.querySelector("ha-card");
    const open = (e) => {
      const v = e.target.closest("[data-e]");
      const tile = e.target.closest(".tile");
      const id = v ? v.dataset.e : tile ? items[Number(tile.dataset.i)].entity : null;
      if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
    };
    card.addEventListener("click", (e) => !e.target.closest(".act") && open(e));
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("tile")) {
        e.preventDefault();
        open(e);
      }
    });
    this._actKeys = null;
    this._built = true;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const S = this._hass.states;
    // Only touch the DOM when something changed, so a tap is never lost mid-update.
    const set = (node, html) => {
      if (node && node.innerHTML !== html) node.innerHTML = html;
    };
    let onCount = 0;
    this._config.items.forEach((it, i) => {
      const el = root.querySelectorAll(".tile")[i];
      const on = S[it.entity]?.state === "on";
      onCount += on ? 1 : 0;
      el.classList.toggle("on", on);
      const w = num(S[it.power]?.state);
      set(
        el.querySelector(".vals"),
        `<button data-e="${esc(it.entity)}">${on ? "On" : "Off"}</button>` +
          (it.power ? `<button data-e="${esc(it.power)}">${fmt(w)} W</button>` : ""),
      );
    });
    const sum = onCount ? `${onCount} on` : "All off";
    const s = root.querySelector(".sum");
    if (s.textContent !== sum) s.textContent = sum;

    // Actions: rebuilt only when the set changes. [key, label, icon, confirm?]
    const acts = onCount ? [["alloff", "All off", "mdi:power", true]] : [["allon", "All on", "mdi:power"]];
    const keys = acts.map((a) => a[0]).join();
    if (keys !== this._actKeys) {
      const box = root.querySelector(".acts");
      box.style.setProperty("--n", String(acts.length));
      box.innerHTML = acts.map(([k, label, icon]) => `<button class="act" data-k="${k}"><ha-icon icon="${icon}"></ha-icon>${esc(label)}</button>`).join("");
      box.querySelectorAll(".act").forEach((b) => b.addEventListener("click", () => this._action(b.dataset.k)));
      this._actKeys = keys;
    }
  }

  async _action(k) {
    const ids = this._config.items.map((it) => it.entity);
    if (k === "allon") return this._call("homeassistant", "turn_on", { entity_id: ids }); // benign: immediate
    const ok = await confirmDialog({
      title: "Turn everything off", icon: "mdi:power", color: C.orange,
      secondary: "Every item on this card switches off.", confirmLabel: "Turn off",
    });
    if (ok) this._call("homeassistant", "turn_off", { entity_id: ids });
  }

  async _call(domain, service, data) {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || "That did not work" }, bubbles: true, composed: true }));
    }
  }
}

async function registerExampleCard() {
  await window.customElements.whenDefined("home-assistant");
  if (window.customElements.get(XC_TAG)) return; // loaded twice (old /local copy + HACS) is harmless
  window.customElements.define(XC_TAG, ExampleCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: XC_TAG, name: "Example", description: "What the card does in one line." });
  console.info(`%c EXAMPLE-CARD %c ${XC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerExampleCard();

/*
 * Long-press (when a tile has tap = act, hold = sheet). The mobile pitfalls, in code:
 *
 *   el.addEventListener("pointerdown", (e) => { timer = setTimeout(() => { held = true; openSheet(); }, 500); });
 *   el.addEventListener("pointermove", (e) => { if (moved more than 10px) clearTimeout(timer); });
 *   ["pointerup", "pointercancel", "pointerleave"].forEach((t) => el.addEventListener(t, () => clearTimeout(timer)));
 *   el.addEventListener("contextmenu", (e) => e.preventDefault());
 *   el.addEventListener("touchend", (e) => { if (held) e.preventDefault(); });
 *   el.addEventListener("click", (e) => { if (held) { held = false; return; } act(); });
 *
 * In the sheet: ignore backdrop clicks until 350 ms after the finger lifts, or the lift's own
 * click closes the sheet the moment it opens.
 */
