const invoke = window.__TAURI__ ? window.__TAURI__.core.invoke : null;
const $ = (s) => document.querySelector(s);
const ELEM = { Fire: ["Pyro", "#E8452C"], Water: ["Hydro", "#1B2FD0"], Wind: ["Anemo", "#1FB3AD"], Electric: ["Electro", "#9B4FD0"], Grass: ["Dendro", "#7DB04C"], Ice: ["Cryo", "#8FD3F0"], Rock: ["Geo", "#E8B93A"] };
const STAT = { FIGHT_PROP_HP: "HP", FIGHT_PROP_HP_PERCENT: "HP%", FIGHT_PROP_ATTACK: "ATK", FIGHT_PROP_ATTACK_PERCENT: "ATK%", FIGHT_PROP_DEFENSE: "DEF", FIGHT_PROP_DEFENSE_PERCENT: "DEF%", FIGHT_PROP_ELEMENT_MASTERY: "Maestria", FIGHT_PROP_CRITICAL: "Tasso crit.", FIGHT_PROP_CRITICAL_HURT: "Danno crit.", FIGHT_PROP_CHARGE_EFFICIENCY: "Rec. energia", FIGHT_PROP_HEAL_ADD: "Bonus cure" };
if (!invoke) document.body.classList.add("web");
const state = { list: [], filter: "all" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const msg = (t) => ($("#msg").textContent = t);
const num = (v) => Math.round(v).toLocaleString("it-IT");
const img = (u) => (u ? `<img alt="" src="${esc(u)}">` : "");
const label = (id) => STAT[id] || (id || "?").replace("FIGHT_PROP_", "").replace(/_/g, " ").toLowerCase();
const isPct = (id) => /PERCENT|CRITICAL|CHARGE|HEAL_ADD|ADD_HURT/.test(id || "");
const val = (id, v) => (isPct(id) ? `${v}%` : num(v));

function load(json) {
  const data = JSON.parse(json);
  state.list = data.characters || [];
  const when = data.generated ? data.generated.replace("T", " ") : "?";
  msg(`${state.list.length} personaggi · UID ${data.uid} · ultimo sync ${when}`);
  renderFilters();
  route();
}

function renderFilters() {
  const f = $("#filters");
  f.innerHTML = `<button class="ch ${state.filter === "all" ? "on" : ""}" data-f="all">Tutti</button>` +
    Object.entries(ELEM).map(([k, [n, c]]) => `<button class="ch ${state.filter === k ? "on" : ""}" data-f="${k}"><i class="d" style="background:${c}"></i>${n}</button>`).join("");
  f.querySelectorAll("button").forEach((b) => (b.onclick = () => { state.filter = b.dataset.f; renderFilters(); renderRoster(); }));
}

function renderRoster() {
  $("#sheet").hidden = true; $("#roster").hidden = false; $("#filters").hidden = false;
  const items = state.list.filter((c) => state.filter === "all" || c.element === state.filter);
  $("#roster").innerHTML = items.map((c) => `
    <button class="bx card" data-id="${esc(c.id)}">
      <span class="sea pic">${img(c.icon)}</span>
      <span class="in"><b>${esc(c.name)}</b><small>Lv. ${esc(c.level)} · C${esc(c.cons)} · ${esc(ELEM[c.element]?.[0] || "")}</small></span>
    </button>`).join("");
  $("#roster").querySelectorAll(".card").forEach((b) => (b.onclick = () => { location.hash = "c-" + b.dataset.id; }));
}

function renderSheet(c) {
  $("#roster").hidden = true; $("#filters").hidden = true;
  const s = $("#sheet"); s.hidden = false;
  const t = c.stats;
  const rows = [["HP", num(t.hp)], ["ATK", num(t.atk)], ["DEF", num(t.dif)], ["Maestria", num(t.em)], ["Tasso critico", t.crit_rate + "%"], ["Danno critico", t.crit_dmg + "%"], ["Rec. energia", t.er + "%"]];
  const w = c.weapon;
  s.innerHTML = `
  <div><button class="ch back" id="back">← Roster</button>
    <div class="bx side"><div class="pic sea">${img(c.icon)}</div>
      <b style="font-size:24px">${esc(c.name)}</b><span>Lv. ${esc(c.level)} · C${esc(c.cons)} · ${esc(ELEM[c.element]?.[0] || "")}</span></div></div>
  <div>
    <h3>// TALENTI</h3><div class="row">${c.talents.map((x) => `<div class="bx tal">${img(x.icon)}<span><b>${esc(x.label)}</b><br>Lv. ${esc(x.level)}</span></div>`).join("")}</div>
    <h3>// ARMA</h3><div class="row">${w ? `<div class="bx tal" style="background:#fff">${img(w.icon)}<span><b>${esc(w.name)}</b><br>Lv. ${esc(w.level)} · A${esc(w.ascension)} · R${esc(w.refinement)}</span></div>` : "—"}</div>
    <h3>// MANUFATTI</h3><div class="arts">${c.artifacts.map((a) => `<div class="bx art">${img(a.icon)}<b>${esc(a.slot)}</b> +${esc(a.level)}<br>${esc(label(a.main.stat))} ${esc(val(a.main.stat, a.main.value))}<br><small>${esc(a.set)}<br>${a.subs.map((x) => esc(`${label(x.stat)} ${val(x.stat, x.value)}`)).join("<br>")}</small></div>`).join("")}</div>
  </div>
  <div class="bx stats"><b>// STATISTICHE</b>${rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join("")}</div>`;
  $("#back").onclick = () => { location.hash = ""; };
  window.scrollTo(0, 0);
}

$("#uidForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!invoke) return msg("Sync diretto disponibile solo nell'app Tauri. Qui usa il pulsante «Carica JSON».");
  const uid = $("#uid").value.trim(), script = $("#script").value.trim();
  const env = { NOTION_TOKEN: $("#n_token").value, NOTION_DATABASE_ID: $("#n_char").value, NOTION_WEAPONS_DATABASE_ID: $("#n_wpn").value, NOTION_ARTIFACTS_DATABASE_ID: $("#n_art").value };
  if (!/^\d{9,10}$/.test(uid)) return msg("UID non valido: servono 9 o 10 cifre.");
  if (!state.packed && !script) return msg("Indica il percorso dello script Python.");
  localStorage.setItem("uid", uid); localStorage.setItem("script", script);
  localStorage.setItem("notion", $("#notion").checked ? "1" : "");
  for (const [k, v] of Object.entries(env)) localStorage.setItem(k, v);
  msg("Sync in corso...");
  try {
    load(await invoke("run_sync", { script: script || null, uid, notion: $("#notion").checked, env }));
  } catch (err) {
    msg("Errore: " + String(err).slice(0, 600));
  }
};

function route() {
  const m = location.hash.match(/^#c-(.+)$/);
  const c = m && state.list.find((x) => x.id === m[1]);
  if (c) renderSheet(c); else renderRoster();
}
window.onhashchange = route;

$("#uid").value = localStorage.getItem("uid") || "";
$("#script").value = localStorage.getItem("script") || "";
$("#notion").checked = !!localStorage.getItem("notion");
for (const [id, k] of [["n_token", "NOTION_TOKEN"], ["n_char", "NOTION_DATABASE_ID"], ["n_wpn", "NOTION_WEAPONS_DATABASE_ID"], ["n_art", "NOTION_ARTIFACTS_DATABASE_ID"]]) $("#" + id).value = localStorage.getItem(k) || "";
if (invoke) {
  invoke("has_bundled").then((b) => { state.packed = b; if (b) document.body.classList.add("packed"); }).catch(() => {});
  invoke("read_data").then(load).catch(() => {});
}
$("#file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { load(await f.text()); } catch (err) { msg("File JSON non valido: " + err); }
};
