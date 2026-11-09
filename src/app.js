const invoke = window.__TAURI__?.core?.invoke;
const $ = (s) => document.querySelector(s);
const ELEM = { Fire: ["Pyro", "#E8452C"], Water: ["Hydro", "#1B2FD0"], Wind: ["Anemo", "#1FB3AD"], Electric: ["Electro", "#9B4FD0"], Grass: ["Dendro", "#7DB04C"], Ice: ["Cryo", "#8FD3F0"], Rock: ["Geo", "#E8B93A"] };
const STAT = { FIGHT_PROP_HP:"HP",FIGHT_PROP_HP_PERCENT:"HP%",FIGHT_PROP_ATTACK:"ATK",FIGHT_PROP_ATTACK_PERCENT:"ATK%",FIGHT_PROP_DEFENSE:"DEF",FIGHT_PROP_DEFENSE_PERCENT:"DEF%",FIGHT_PROP_ELEMENT_MASTERY:"Maestria",FIGHT_PROP_CRITICAL:"Tasso crit.",FIGHT_PROP_CRITICAL_HURT:"Danno crit.",FIGHT_PROP_CHARGE_EFFICIENCY:"Rec. energia",FIGHT_PROP_HEAL_ADD:"Bonus cure" };
const state = { list: [], filter:"all", uid:"" };
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const msg = t => $("#msg").textContent=t;
const num = v => Math.round(Number(v)||0).toLocaleString("it-IT");
const img = u => u ? `<img alt="" loading="lazy" src="${esc(u)}" onerror="this.style.display='none'">` : "";
const label = id => STAT[id] || (id || "?").replace("FIGHT_PROP_","").replace(/_/g," ").toLowerCase();
const pct = id => /PERCENT|CRITICAL|CHARGE|HEAL_ADD|ADD_HURT/.test(id||"");
const val = (id,v) => `${num(v)}${pct(id)?"%":""}`;
const iconUrl = name => name ? `https://enka.network/ui/${String(name).replace(/\.png$/,"")}.png` : null;
const hashText = (map, hash, fallback="—") => map?.[String(hash)] || fallback;
const storeInfo = (store,id,depot) => store?.[`${id}-${depot}`] || store?.[String(id)] || {};
const weaponStoreInfo = (store,id) => store?.[String(id)] || store?.[id] || {};
const getName = (info,texts,id) => hashText(texts,info?.NameTextMapHash,`Personaggio ${id}`);

function mapEnka(payload) {
  const player = payload.player || {};
  const avatars = player.avatarInfoList || [];
  const loc = payload.localization || {};
  const texts = {...(loc.en||{}),...(loc.it||{})};
  const charStore = payload.characters_store || {};
  const weaponStore = payload.weapons_store || {};
  return {
    uid: payload.uid,
    generated: new Date().toLocaleString("it-IT"),
    characters: avatars.map(av => {
      const id=String(av.avatarId), info=storeInfo(charStore,id,av.skillDepotId);
      const fight=av.fightPropMap||{}, props=av.propMap||{};
      const talents=(info.SkillOrder||[]).slice(0,3).map((skillId,i)=>({
        label:["Normale","Abilità","Esplosione"][i],
        icon:iconUrl(info.Skills?.[String(skillId)]),
        level:(av.skillLevelMap||{})[String(skillId)]||1
      }));
      let weapon=null, artifacts=[];
      for (const eq of av.equipList||[]) {
        const flat=eq.flat||{};
        if(flat.itemType==="ITEM_WEAPON") {
          const data=eq.weapon||{}, wid=eq.itemId;
          const wi=weaponStoreInfo(weaponStore,wid);
          const aff=data.affixMap||{};
          const refine=Math.max(0,...Object.values(aff).map(Number))+1;
          weapon={
            id:wid, name:hashText(texts,flat.nameTextMapHash,`Arma ${wid}`),
            icon:iconUrl(flat.icon), type:flat.weaponType||wi.weaponType||"",
            rarity:flat.rankLevel||wi.rankLevel||4, level:data.level||1,
            ascension:data.promoteLevel||0, refinement:refine,
            mainStat:wi?.weaponProp?.[0]?.propType || wi?.weaponProp?.[0]?.type || "",
            baseAtk:wi?.weaponProp?.[0]?.initValue ?? null,
            secondaryStat:wi?.weaponProp?.[1]?.propType || wi?.weaponProp?.[1]?.type || "",
            secondaryValue:wi?.weaponProp?.[1]?.initValue ?? null,
            description:hashText(texts,wi.DescTextMapHash,"Descrizione non disponibile nel catalogo Enka."),
            passiveName:hashText(texts,wi.Awaken?wi.Awaken?.NameTextMapHash:wi.NameTextMapHash,""),
            passive:hashText(texts,wi.Awaken?wi.Awaken?.DescTextMapHash:wi.DescTextMapHash,"Descrizione passiva non disponibile nel catalogo Enka."),
            refineText:wi.Awaken?.DescTextMapHash ? hashText(texts,wi.Awaken.DescTextMapHash,"") : ""
          };
        } else if(flat.itemType==="ITEM_RELIQUARY") {
          const main=flat.reliquaryMainstat||{};
          const subs=flat.reliquarySubstats||flat.subStatList||[];
          artifacts.push({
            slot:({EQUIP_BRACER:"Fiore",EQUIP_NECKLACE:"Piuma",EQUIP_SHOES:"Clessidra",EQUIP_RING:"Calice",EQUIP_DRESS:"Corona"})[flat.equipType]||"?",
            set:hashText(texts,flat.setNameTextMapHash,"Set non identificato"),
            icon:iconUrl(flat.icon),
            level:Math.max(0,(eq.reliquary?.level||1)-1),
            main:{stat:main.mainPropId,value:main.statValue||0},
            subs:subs.map(x=>({stat:x.appendPropId||x.propType,value:x.statValue||0}))
          });
        }
      }
      const side=info.SideIconName||info.IconName||"";
      const charIcon=iconUrl(side.replace("UI_AvatarIcon_Side_","UI_AvatarIcon_"));
      return {
        id,name:getName(info,texts,id),element:info.Element||null,icon:charIcon,
        level:props["4001"]?.val??props["4001"]?.ival??1,
        cons:(av.talentIdList||[]).length,
        stats:{hp: fight["2000"]||0,atk:fight["2001"]||0,dif:fight["2002"]||0,em:fight["28"]||0,crit_rate:(fight["20"]||0)*100,crit_dmg:(fight["22"]||0)*100,er:(fight["23"]||0)*100},
        talents,weapon,artifacts
      };
    })
  };
}
function load(data) {
  state.list=data.characters||[]; state.uid=data.uid||"";
  $("#uid").value=state.uid;
  msg(`${state.list.length} personaggi · UID ${state.uid} · sincronizzato ${data.generated||"ora"}`);
  renderFilters(); route();
}
function renderFilters() {
  $("#filters").innerHTML=`<button class="ch ${state.filter==="all"?"on":""}" data-f="all">Tutti</button>`+
    Object.entries(ELEM).map(([k,[n,c]])=>`<button class="ch ${state.filter===k?"on":""}" data-f="${k}"><i class="d" style="background:${c}"></i>${n}</button>`).join("");
  $("#filters").querySelectorAll("button").forEach(b=>b.onclick=()=>{state.filter=b.dataset.f;renderFilters();renderRoster();});
}
function renderRoster() {
  $("#sheet").hidden=true;$("#roster").hidden=false;$("#filters").hidden=false;
  const items=state.list.filter(c=>state.filter==="all"||c.element===state.filter);
  $("#roster").innerHTML=items.map(c=>`<button class="bx card" data-id="${esc(c.id)}"><span class="sea pic">${img(c.icon)}</span><span class="in"><b>${esc(c.name)}</b><small>Lv. ${esc(c.level)} · C${esc(c.cons)} · ${esc(ELEM[c.element]?.[0]||"")}</small></span></button>`).join("");
  $("#roster").querySelectorAll(".card").forEach(b=>b.onclick=()=>location.hash="c-"+b.dataset.id);
}
const TARGET_KEYS=["level","hp","atk","dif","em","crit_rate","crit_dmg","er"];
const TARGET_LABELS={level:"Livello",hp:"HP",atk:"ATK",dif:"DEF",em:"Maestria",crit_rate:"Tasso critico",crit_dmg:"Danno critico",er:"Ricarica energia"};
function targetFor(c){try{return JSON.parse(localStorage.getItem(`targets:${state.uid}:${c.id}`)||"{}");}catch{return {};}}
function saveTarget(c,key,value){const t=targetFor(c);t[key]=value===""?null:Number(value);localStorage.setItem(`targets:${state.uid}:${c.id}`,JSON.stringify(t));}
function progressBar(current,target,key){
  if(target==null||target===""||!Number.isFinite(Number(target)))return `<div class="progress muted"><span>Obiettivo non impostato</span></div>`;
  const cur=Number(current)||0, goal=Number(target), ratio=goal<=0?(cur>=goal?100:0):Math.min(100,Math.max(0,cur/goal*100));
  const diff=Math.max(0,goal-cur);
  return `<div class="progress"><i style="width:${ratio}%"></i></div><small class="delta">${ratio>=100?"Obiettivo raggiunto":`Mancano ${num(diff)}${["crit_rate","crit_dmg","er"].includes(key)?"%":""}`} · ${Math.round(ratio)}%</small>`;
}
function renderSheet(c){
  $("#roster").hidden=true;$("#filters").hidden=true;const s=$("#sheet");s.hidden=false;
  const t=c.stats||{}, goal=targetFor(c), rows=[["hp","HP",t.hp],["atk","ATK",t.atk],["dif","DEF",t.dif],["em","Maestria",t.em],["crit_rate","Tasso critico",t.crit_rate],["crit_dmg","Danno critico",t.crit_dmg],["er","Ricarica energia",t.er]];
  const w=c.weapon;
  s.innerHTML=`
  <div><button class="ch back" id="back">← Roster</button><div class="bx side"><div class="pic sea">${img(c.icon)}</div><b style="font-size:24px">${esc(c.name)}</b><span>Lv. ${esc(c.level)} · C${esc(c.cons)} · ${esc(ELEM[c.element]?.[0]||"")}</span></div></div>
  <div class="middle">
    <h3>// TALENTI</h3><div class="row">${(c.talents||[]).map(x=>`<div class="bx tal">${img(x.icon)}<span><b>${esc(x.label)}</b><br>Lv. ${esc(x.level)}</span></div>`).join("")}</div>
    <h3>// ARMA — clicca per i dettagli</h3><div class="row">${w?`<button type="button" class="bx tal weapon-card" id="weaponOpen">${img(w.icon)}<span><b>${esc(w.name)}</b><br>Lv. ${esc(w.level)} · A${esc(w.ascension)} · R${esc(w.refinement)}<br><small>${esc(w.rarity)}★</small></span><b class="weapon-arrow">↗</b></button>`:"—"}</div>
    <h3>// OBIETTIVI BUILD</h3>
    <div class="bx target-panel"><p>Imposta i valori che vuoi raggiungere. Gli obiettivi vengono salvati su questo dispositivo per UID e personaggio.</p>
      <div class="target-level"><label>Livello desiderato<input data-target="level" type="number" min="1" max="90" value="${esc(goal.level??"")}"></label><span>Attuale: ${esc(c.level)}</span>${progressBar(c.level,goal.level,"level")}</div>
      <div class="target-grid">${rows.map(([key,name,current])=>`<label class="target-stat"><span>${name}</span><input data-target="${key}" type="number" min="0" step="any" placeholder="Obiettivo" value="${esc(goal[key]??"")}"><small>Attuale: ${num(current)}${["crit_rate","crit_dmg","er"].includes(key)?"%":""}</small>${progressBar(current,goal[key],key)}</label>`).join("")}</div>
    </div>
    <h3>// MANUFATTI</h3><div class="arts">${(c.artifacts||[]).map(a=>`<div class="bx art">${img(a.icon)}<b>${esc(a.slot)}</b> +${esc(a.level)}<br>${esc(label(a.main?.stat))} ${esc(val(a.main?.stat,a.main?.value))}<br><small>${esc(a.set)}<br>${(a.subs||[]).map(x=>esc(`${label(x.stat)} ${val(x.stat,x.value)}`)).join("<br>")}</small></div>`).join("")}</div>
  </div>
  <div class="bx stats"><b>// STATISTICHE ATTUALI</b>${rows.map(([k,n,v])=>`<div><span>${n}</span><span>${num(v)}${["crit_rate","crit_dmg","er"].includes(k)?"%":""}</span></div>`).join("")}</div>`;
  $("#back").onclick=()=>location.hash="";
  s.querySelectorAll("[data-target]").forEach(input=>input.addEventListener("change",()=>{saveTarget(c,input.dataset.target,input.value);renderSheet(c);}));
  if(w)$("#weaponOpen").onclick=()=>showWeapon(w);
  window.scrollTo(0,0);
}
function showWeapon(w){
  $("#weaponContent").innerHTML=`<div class="weapon-detail">${img(w.icon)}<div><p class="eyebrow">// DETTAGLIO ARMA</p><h2 id="weaponTitle">${esc(w.name)}</h2><p>${"★".repeat(Math.min(5,Number(w.rarity)||4))}</p><p>Livello ${esc(w.level)} · Ascensione ${esc(w.ascension)} · Raffinamento ${esc(w.refinement)}</p>
  <h3>Statistiche base</h3><p>${esc(label(w.mainStat))}: ${w.baseAtk==null?"—":num(w.baseAtk)}</p><p>${esc(label(w.secondaryStat))}: ${w.secondaryValue==null?"—":num(w.secondaryValue)}</p>
  <h3>Descrizione</h3><p>${esc(w.description||"Non disponibile nel catalogo.")}</p><h3>Abilità passiva</h3><p>${esc(w.passiveName||w.name)}</p><p>${esc(w.passive||"Descrizione non disponibile nel catalogo Enka.")}</p></div></div>`;
  $("#weaponModal").hidden=false;
}
$("#closeWeapon").onclick=()=>$("#weaponModal").hidden=true;
$("#weaponModal").onclick=e=>{if(e.target.id==="weaponModal")$("#weaponModal").hidden=true;};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("#weaponModal").hidden=true;});
function route(){const m=location.hash.match(/^#c-(.+)$/);const c=m&&state.list.find(x=>x.id===m[1]);if(c)renderSheet(c);else renderRoster();}
window.onhashchange=route;
$("#uidForm").onsubmit=async e=>{
  e.preventDefault();
  if(!invoke)return msg("La sincronizzazione tramite UID richiede l'app desktop GENSHIN▪CODEX (Tauri).");
  const uid=$("#uid").value.trim();
  if(!/^\d{9,10}$/.test(uid))return msg("UID non valido: servono 9 o 10 cifre.");
  localStorage.setItem("lastUID",uid);msg("Contatto Enka.Network e scarico la vetrina...");
  try{const payload=await invoke("fetch_enka",{uid});const data=mapEnka(payload);load(data);if(!data.characters.length)msg("Nessun personaggio trovato. Rendi pubblica la vetrina e i dettagli dei personaggi su Enka.Network.");}
  catch(err){msg("Errore: "+String(err).slice(0,500));}
};
$("#uid").value=localStorage.getItem("lastUID")||"";
if(!invoke)document.body.classList.add("web");
