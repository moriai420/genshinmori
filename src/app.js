const invoke = null;
const $ = (s) => document.querySelector(s);
const ELEM = { Fire: ["Pyro", "#E8452C"], Water: ["Hydro", "#1B2FD0"], Wind: ["Anemo", "#1FB3AD"], Electric: ["Electro", "#9B4FD0"], Grass: ["Dendro", "#7DB04C"], Ice: ["Cryo", "#8FD3F0"], Rock: ["Geo", "#E8B93A"] };
const STAT = { FIGHT_PROP_HP:"HP",FIGHT_PROP_HP_PERCENT:"HP%",FIGHT_PROP_ATTACK:"ATK",FIGHT_PROP_ATTACK_PERCENT:"ATK%",FIGHT_PROP_DEFENSE:"DEF",FIGHT_PROP_DEFENSE_PERCENT:"DEF%",FIGHT_PROP_ELEMENT_MASTERY:"Elemental Mastery",FIGHT_PROP_CRITICAL:"CRIT Rate",FIGHT_PROP_CRITICAL_HURT:"CRIT DMG",FIGHT_PROP_CHARGE_EFFICIENCY:"Energy Recharge",FIGHT_PROP_HEAL_ADD:"Healing Bonus" };
const state = { list: [], filter:"all", uid:"" };
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const msg = t => $("#msg").textContent=t;
const num = v => Math.round(Number(v)||0).toLocaleString("en-US");
const img = u => u ? `<img alt="" loading="lazy" src="${esc(u)}" onerror="this.style.display='none'">` : "";
const label = id => STAT[id] || (id || "?").replace("FIGHT_PROP_","").replace(/_/g," ").toLowerCase();
const pct = id => /PERCENT|CRITICAL|CHARGE|HEAL_ADD|ADD_HURT/.test(id||"");
const val = (id,v) => `${num(v)}${pct(id)?"%":""}`;
const iconUrl = name => name ? `https://enka.network/ui/${String(name).replace(/\.png$/,"")}.png` : null;
const hashText = (map, hash, fallback="—") => map?.[String(hash)] || fallback;
const storeInfo = (store,id,depot) => store?.[`${id}-${depot}`] || store?.[String(id)] || {};
const weaponStoreInfo = (store,id) => store?.[String(id)] || store?.[id] || {};
const getName = (info,texts,id) => hashText(texts,info?.NameTextMapHash,`Character ${id}`);

function mapEnka(payload) {
  const player = payload.player || {};
  const avatars = player.avatarInfoList || [];
  const loc = payload.localization || {};
  const texts = {...(loc.en||{})};
  const charStore = payload.characters_store || {};
  const dbCharacters = payload.db_characters || [];
  const weaponStore = payload.weapons_store || {};
  return {
    uid: payload.uid,
    generated: new Date().toLocaleString("en-US"),
    characters: avatars.map(av => {
      const id=String(av.avatarId), info=storeInfo(charStore,id,av.skillDepotId);
      const dbChar=dbCharacters.find(x=>String(x.id)===id) || {};
      const fight=av.fightPropMap||{}, props=av.propMap||{};
      const talents=(info.SkillOrder||[]).slice(0,3).map((skillId,i)=>({
        label:["Normal Attack","Elemental Skill","Elemental Burst"][i],
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
            id:wid, name:hashText(texts,flat.nameTextMapHash,`Weapon ${wid}`),
            icon:iconUrl(flat.icon), type:flat.weaponType||wi.weaponType||"",
            rarity:flat.rankLevel||wi.rankLevel||4, level:data.level||1,
            ascension:data.promoteLevel||0, refinement:refine,
            mainStat:wi?.weaponProp?.[0]?.propType || wi?.weaponProp?.[0]?.type || "",
            baseAtk:wi?.weaponProp?.[0]?.initValue ?? null,
            secondaryStat:wi?.weaponProp?.[1]?.propType || wi?.weaponProp?.[1]?.type || "",
            secondaryValue:wi?.weaponProp?.[1]?.initValue ?? null,
            description:hashText(texts,wi.DescTextMapHash,"Description unavailable in the Enka catalog."),
            passiveName:hashText(texts,wi.Awaken?wi.Awaken?.NameTextMapHash:wi.NameTextMapHash,""),
            passive:hashText(texts,wi.Awaken?wi.Awaken?.DescTextMapHash:wi.DescTextMapHash,"Passive description unavailable in the Enka catalog."),
            refineText:wi.Awaken?.DescTextMapHash ? hashText(texts,wi.Awaken.DescTextMapHash,"") : ""
          };
        } else if(flat.itemType==="ITEM_RELIQUARY") {
          const main=flat.reliquaryMainstat||{};
          const subs=flat.reliquarySubstats||flat.subStatList||[];
          artifacts.push({
            slot:({EQUIP_BRACER:"Flower",EQUIP_NECKLACE:"Plume",EQUIP_SHOES:"Sands",EQUIP_RING:"Goblet",EQUIP_DRESS:"Circlet"})[flat.equipType]||"?",
            set:hashText(texts,flat.setNameTextMapHash,"Unknown set"),
            icon:iconUrl(flat.icon),
            level:Math.max(0,(eq.reliquary?.level||1)-1),
            main:{stat:main.mainPropId,value:main.statValue||0},
            subs:subs.map(x=>({stat:x.appendPropId||x.propType,value:x.statValue||0}))
          });
        }
      }
      const side=info.SideIconName||info.IconName||dbChar.images?.filename_sideIcon||"";
      const dbElement=({Pyro:"Fire",Hydro:"Water",Anemo:"Wind",Electro:"Electric",Dendro:"Grass",Cryo:"Ice",Geo:"Rock"})[dbChar.elementText]||null;
      const charIcon=dbChar.images?.mihoyo_icon || iconUrl(side.replace("UI_AvatarIcon_Side_","UI_AvatarIcon_"));
      return {
        id,name:info.NameTextMapHash?getName(info,texts,id):(dbChar.name||`Character ${id}`),element:info.Element||dbElement,icon:charIcon,
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
  msg(`${state.list.length} showcased characters · UID ${state.uid} · synced ${data.generated||"now"}`);
  renderFilters(); route();
}
function renderFilters() {
  $("#filters").innerHTML=`<button class="ch ${state.filter==="all"?"on":""}" data-f="all">All</button>`+
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
const TARGET_LABELS={level:"Level",hp:"HP",atk:"ATK",dif:"DEF",em:"Elemental Mastery",crit_rate:"CRIT Rate",crit_dmg:"CRIT DMG",er:"Energy Recharge"};
function targetFor(c){try{return JSON.parse(localStorage.getItem(`targets:${state.uid}:${c.id}`)||"{}");}catch{return {};}}
function saveTarget(c,key,value){const t=targetFor(c);t[key]=value===""?null:Number(value);localStorage.setItem(`targets:${state.uid}:${c.id}`,JSON.stringify(t));}
function progressBar(current,target,key){
  if(target==null||target===""||!Number.isFinite(Number(target)))return `<div class="progress muted"><span>No target set</span></div>`;
  const cur=Number(current)||0, goal=Number(target), ratio=goal<=0?(cur>=goal?100:0):Math.min(100,Math.max(0,cur/goal*100));
  const diff=Math.max(0,goal-cur);
  return `<div class="progress"><i style="width:${ratio}%"></i></div><small class="delta">${ratio>=100?"Target reached":`Remaining ${num(diff)}${["crit_rate","crit_dmg","er"].includes(key)?"%":""}`} · ${Math.round(ratio)}%</small>`;
}
function renderSheet(c){
  $("#roster").hidden=true;$("#filters").hidden=true;const s=$("#sheet");s.hidden=false;
  const t=c.stats||{}, goal=targetFor(c), rows=[["hp","HP",t.hp],["atk","ATK",t.atk],["dif","DEF",t.dif],["em","Maestria",t.em],["crit_rate","Tasso critico",t.crit_rate],["crit_dmg","Danno critico",t.crit_dmg],["er","Ricarica energia",t.er]];
  const w=c.weapon;
  s.innerHTML=`
  <div><button class="ch back" id="back">← Roster</button><div class="bx side"><div class="pic sea">${img(c.icon)}</div><b style="font-size:24px">${esc(c.name)}</b><span>Lv. ${esc(c.level)} · C${esc(c.cons)} · ${esc(ELEM[c.element]?.[0]||"")}</span></div></div>
  <div class="middle">
    <h3>// TALENTS</h3><div class="row">${(c.talents||[]).map(x=>`<div class="bx tal">${img(x.icon)}<span><b>${esc(x.label)}</b><br>Lv. ${esc(x.level)}</span></div>`).join("")}</div>
    <h3>// EQUIPPED WEAPON — click for details</h3><div class="row">${w?`<button type="button" class="bx tal weapon-card" id="weaponOpen">${img(w.icon)}<span><b>${esc(w.name)}</b><br>Lv. ${esc(w.level)} · A${esc(w.ascension)} · R${esc(w.refinement)}<br><small>${esc(w.rarity)}★</small></span><b class="weapon-arrow">↗</b></button>`:"—"}</div>
    <h3>// BUILD TARGETS</h3>
    <div class="bx target-panel"><p>Set your target values. Targets are saved on this device for each UID and character.</p>
      <div class="target-level"><label>Target Level<input data-target="level" type="number" min="1" max="90" value="${esc(goal.level??"")}"></label><span>Current: ${esc(c.level)}</span>${progressBar(c.level,goal.level,"level")}</div>
      <div class="target-grid">${rows.map(([key,name,current])=>`<label class="target-stat"><span>${name}</span><input data-target="${key}" type="number" min="0" step="any" placeholder="Obiettivo" value="${esc(goal[key]??"")}"><small>Current: ${num(current)}${["crit_rate","crit_dmg","er"].includes(key)?"%":""}</small>${progressBar(current,goal[key],key)}</label>`).join("")}</div>
    </div>
    <h3>// ARTIFACTS</h3><div class="arts">${(c.artifacts||[]).map(a=>`<div class="bx art">${img(a.icon)}<b>${esc(a.slot)}</b> +${esc(a.level)}<br>${esc(label(a.main?.stat))} ${esc(val(a.main?.stat,a.main?.value))}<br><small>${esc(a.set)}<br>${(a.subs||[]).map(x=>esc(`${label(x.stat)} ${val(x.stat,x.value)}`)).join("<br>")}</small></div>`).join("")}</div>
  </div>
  <div class="bx stats"><b>// CURRENT STATS</b>${rows.map(([k,n,v])=>`<div><span>${n}</span><span>${num(v)}${["crit_rate","crit_dmg","er"].includes(k)?"%":""}</span></div>`).join("")}</div>`;
  $("#back").onclick=()=>location.hash="";
  s.querySelectorAll("[data-target]").forEach(input=>input.addEventListener("change",()=>{saveTarget(c,input.dataset.target,input.value);renderSheet(c);}));
  if(w)$("#weaponOpen").onclick=()=>showWeapon(w);
  window.scrollTo(0,0);
}
async function showWeapon(w){
  const render = (detail=null) => {
    const d = detail?.result || detail || {};
    const rarity = Number(d.rarity || w.rarity || 4);
    const refinement = Math.min(5, Math.max(1, Number(w.refinement) || 1));
    const refine = d[`r${refinement}`] || d.r1 || {};
    const imageUrl = d.images?.icon || w.icon;
    const mainStat = d.mainStatText || label(w.secondaryStat || w.mainStat);
    const baseStat = d.baseStatText || (w.secondaryValue == null ? "" : num(w.secondaryValue));
    const baseAtk = d.baseAtkValue ?? w.baseAtk;
    const desc = d.description || w.description || "Description unavailable.";
    const passive = refine.description || w.passive || "Passive description unavailable.";
    $("#weaponContent").innerHTML=`<div class="weapon-detail">${img(imageUrl)}<div><p class="eyebrow">// WEAPON DETAILS</p><h2 id="weaponTitle">${esc(d.name || w.name)}</h2><p>${"★".repeat(Math.min(5,rarity))}</p><p>Level ${esc(w.level)} · Ascension ${esc(w.ascension)} · Refinement ${refinement}</p>
    <h3>Base Stats</h3><p>Base ATK: ${baseAtk==null?"—":num(baseAtk)}</p><p>${esc(mainStat)}: ${esc(baseStat)}</p>
    <h3>Description</h3><p>${esc(desc)}</p><h3>${esc(d.effectName || w.passiveName || "Passive Ability")}</h3><p>${esc(passive)}</p>
    ${d.story?`<details><summary>Weapon Lore</summary><p>${esc(d.story)}</p></details>`:""}
    </div></div>`;
  };
  render();
  $("#weaponModal").hidden=false;
  try {
    const base="https://genshinmori.serena-aiazzi777.workers.dev";
    const response=await fetch(`${base}/db/weapons?query=${encodeURIComponent(w.name)}&dumpResult=true&resultLanguage=English`);
    if(response.ok) render(await response.json());
  } catch(e) { /* Keep the Enka details visible if the extra database is unavailable. */ }
}
$("#closeWeapon").onclick=()=>$("#weaponModal").hidden=true;
$("#weaponModal").onclick=e=>{if(e.target.id==="weaponModal")$("#weaponModal").hidden=true;};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("#weaponModal").hidden=true;});
function route(){const m=location.hash.match(/^#c-(.+)$/);const c=m&&state.list.find(x=>x.id===m[1]);if(c)renderSheet(c);else renderRoster();}
window.onhashchange=route;
$("#uidForm").onsubmit=async e=>{
  e.preventDefault();
  const uid=$("#uid").value.trim();
  if(!/^\d{9,10}$/.test(uid))return msg("Invalid UID: enter 9 or 10 digits.");
  localStorage.setItem("lastUID",uid);msg("Connecting to Enka.Network and loading showcase...");
  try{
    const base="https://genshinmori.serena-aiazzi777.workers.dev";
    // Core Enka requests are required for the UID showcase.
    const coreUrls=[
      `${base}/api/uid/${uid}`,
      `${base}/store/loc.json`,
      `${base}/store/characters.json`,
      `${base}/store/weapons.json`
    ];
    const coreResponses=await Promise.all(coreUrls.map(u=>fetch(u)));
    const failedIndex=coreResponses.findIndex(r=>!r.ok);
    if(failedIndex!==-1) {
      const failed=coreResponses[failedIndex];
      const labels=["Enka UID profile","English/localization data","character store","weapon store"];
      throw new Error(`${labels[failedIndex]} returned HTTP ${failed.status}. Check the UID and public Enka showcase.`);
    }
    const [player,loc,characters,weapons]=await Promise.all(coreResponses.map(r=>r.json()));

    // The extra Genshin-DB lookup is optional: a catalog outage must not block UID sync.
    let dbCharacters=[];
    try {
      const dbResponse=await fetch(`${base}/db/characters?query=names&matchCategories=true&verboseCategories=true&resultLanguage=English`);
      if(dbResponse.ok) {
        const raw=await dbResponse.json();
        dbCharacters=Array.isArray(raw)?raw:(raw.result||[]);
      }
    } catch(e) {
      console.warn("Optional Genshin-DB character lookup unavailable:",e);
    }

    const data=mapEnka({uid,player,localization:loc,characters_store:characters,weapons_store:weapons,db_characters:dbCharacters});
    load(data);
    if(!data.characters.length)msg("No showcased characters found. Make your character showcase and character details public on Enka.Network.");
  }catch(err){
    const detail=String(err);
    msg(detail.includes("Failed to fetch")||detail.includes("NetworkError")
      ?"The browser could not contact Enka. This may be a network issue; please try again."
      :"Errore: "+detail.slice(0,450));
  }
};

// Full game catalog powered by genshin-db. This is separate from the UID showcase:
// Enka only returns characters currently displayed in the public showcase.
const catalogState={folder:"characters",names:[],items:[],loaded:false,query:""};
const dbBase="https://genshinmori.serena-aiazzi777.workers.dev";
async function dbFetch(path){
  const r=await fetch(`${dbBase}/db/${path}`);
  if(!r.ok) throw new Error(`Game database returned HTTP ${r.status}`);
  return r.json();
}
function catalogShow(){
  $("#roster").hidden=true;$("#filters").hidden=true;$("#sheet").hidden=true;
  $("#catalog").hidden=false;
  renderCatalog();
}
function renderCatalog(){
  const folder=catalogState.folder;
  const title={characters:"Characters",weapons:"Weapons",artifacts:"Artifacts"}[folder];
  const names=catalogState.names.filter(n=>n.toLowerCase().includes(catalogState.query.toLowerCase()));
  $("#catalog").innerHTML=`
    <div class="catalog-head"><div><p class="eyebrow">// GAME DATABASE</p><h2>${title}</h2><p>Complete game catalog · English data · Updated independently from your UID showcase</p></div><button class="ch" id="catalogBack">← My Showcase</button></div>
    <div class="catalog-tools">
      <div class="catalog-tabs">
        ${["characters","weapons","artifacts"].map(f=>`<button class="ch ${folder===f?"on":""}" data-folder="${f}">${f[0].toUpperCase()+f.slice(1)}</button>`).join("")}
      </div>
      <input id="catalogSearch" type="search" placeholder="Search ${title.toLowerCase()}..." value="${esc(catalogState.query)}">
    </div>
    <p class="catalog-count">${names.length} entries</p>
    <div class="catalog-grid">${names.map(n=>`<button class="bx catalog-card" data-name="${esc(n)}"><span class="catalog-thumb">${esc(n.slice(0,1))}</span><b>${esc(n)}</b></button>`).join("")}</div>
    <div id="catalogDetail" class="bx catalog-detail" hidden></div>`;
  $("#catalogBack").onclick=()=>{ $("#catalog").hidden=true; route(); };
  $("#catalog").querySelectorAll("[data-folder]").forEach(b=>b.onclick=()=>loadCatalog(b.dataset.folder));
  $("#catalogSearch").oninput=e=>{catalogState.query=e.target.value;const pos=e.target.selectionStart;renderCatalog();const input=$("#catalogSearch");input.focus();input.setSelectionRange(pos,pos);};
  $("#catalog").querySelectorAll(".catalog-card").forEach(b=>b.onclick=()=>showCatalogDetail(b.dataset.name));
}
async function loadCatalog(folder){
  catalogState.folder=folder;catalogState.query="";catalogState.names=[];catalogState.loaded=false;
  $("#catalog").hidden=false;$("#catalog").innerHTML='<p class="msg">Loading game catalog...</p>';
  try{
    const data=await dbFetch(`${folder}?query=names&matchCategories=true&resultLanguage=English`);
    catalogState.names=Array.isArray(data)?data:(data.result||[]);
    catalogState.loaded=true;renderCatalog();
  }catch(e){$("#catalog").innerHTML=`<p class="msg">Could not load catalog: ${esc(e.message)}</p><button class="ch" id="catalogRetry">Retry</button>`;$("#catalogRetry").onclick=()=>loadCatalog(folder);}
}
async function showCatalogDetail(name){
  const box=$("#catalogDetail");box.hidden=false;box.innerHTML=`<p>Loading ${esc(name)}...</p>`;box.scrollIntoView({behavior:"smooth",block:"start"});
  try{
    const data=await dbFetch(`${catalogState.folder}?query=${encodeURIComponent(name)}&dumpResult=true&resultLanguage=English`);
    const d=data.result||data;
    const imageUrl=d.images?.portrait||d.images?.card||d.images?.icon||d.images?.flower||"";
    const fields=[];
    if(d.elementText)fields.push(["Element",d.elementText]);
    if(d.weaponText)fields.push(["Weapon",d.weaponText]);
    if(d.region)fields.push(["Region",d.region]);
    if(d.affiliation)fields.push(["Affiliation",d.affiliation]);
    if(d.constellation)fields.push(["Constellation",d.constellation]);
    if(d.rarity)fields.push(["Rarity",`${d.rarity}★`]);
    if(d.weaponType)fields.push(["Weapon Type",d.weaponText||d.weaponType]);
    if(d.baseAtkValue)fields.push(["Base ATK",d.baseAtkValue]);
    if(d.mainStatText)fields.push(["Secondary Stat",`${d.mainStatText} ${d.baseStatText||""}`]);
    const refine=d.r1?.description||d.effectTemplateRaw||"";
    const effects=d.setBonus?Object.entries(d.setBonus).map(([k,v])=>`${k}: ${v}`).join("\n"):((d.twoPcBonus||d.fourPcBonus)?`2-Piece: ${d.twoPcBonus||""}\n4-Piece: ${d.fourPcBonus||""}`:"");
    box.innerHTML=`<div class="catalog-detail-inner">${imageUrl?`<img src="${esc(imageUrl)}" alt="">`:""}<div><p class="eyebrow">// ${catalogState.folder.toUpperCase()}</p><h2>${esc(d.name||name)}</h2><p>${esc(d.description||d.story||"")}</p><div class="catalog-facts">${fields.map(([k,v])=>`<p><b>${esc(k)}:</b> ${esc(v)}</p>`).join("")}</div>${d.effectName?`<h3>${esc(d.effectName)}</h3><p>${esc(refine)}</p>`:""}${effects?`<h3>Set Bonus</h3><p>${esc(effects)}</p>`:""}${d.title?`<p><b>${esc(d.title)}</b></p>`:""}</div></div>`;
  }catch(e){box.innerHTML=`<p>Details unavailable: ${esc(e.message)}</p>`;}
}
$("#openCatalog").onclick=()=>loadCatalog("characters");

$("#uid").value=localStorage.getItem("lastUID")||"";
document.body.classList.add("web");

// Calcolo e barra di progresso per gli obiettivi delle statistiche
function progressBar(current, target, key) {
  if (target == null || target === "" || !Number.isFinite(Number(target))) {
    return `<div class="progress muted"><span>No target set</span></div>`;
  }
  const cur = Number(current) || 0, goal = Number(target);
  const ratio = goal <= 0 ? (cur >= goal ? 100 : 0) : Math.min(100, Math.max(0, (cur / goal) * 100));
  const diff = Math.max(0, goal - cur);
  return `
    <div class="progress"><i style="width:${ratio}%"></i></div>
    <small class="delta">${ratio >= 100 ? "Target reached" : `Remaining ${num(diff)}${["crit_rate","crit_dmg","er"].includes(key) ? "%" : ""}`} · ${Math.round(ratio)}%</small>
  `;
}

// Mostra la modale con le info e gli effetti dell'arma cliccata
async function showWeapon(w) {
  const render = (detail = null) => {
    const d = detail?.result || detail || {};
    const rarity = Number(d.rarity || w.rarity || 4);
    const refinement = Math.min(5, Math.max(1, Number(w.refinement) || 1));
    const refine = d[`r${refinement}`] || d.r1 || {};
    const imageUrl = d.images?.icon || w.icon;
    const mainStat = d.mainStatText || label(w.secondaryStat || w.mainStat);
    const baseStat = d.baseStatText || (w.secondaryValue == null ? "" : num(w.secondaryValue));
    const baseAtk = d.baseAtkValue ?? w.baseAtk;
    const desc = d.description || w.description || "Description unavailable.";
    const passive = refine.description || w.passive || "Passive description unavailable.";
    
    $("#weaponContent").innerHTML = `
      <div class="weapon-detail">
        ${img(imageUrl)}
        <div>
          <p class="eyebrow">// WEAPON DETAILS</p>
          <h2 id="weaponTitle">${esc(d.name || w.name)}</h2>
          <p>${"★".repeat(Math.min(5, rarity))}</p>
          <p>Level ${esc(w.level)} · Ascension ${esc(w.ascension)} · Refinement ${refinement}</p>
          <h3>Base Stats</h3>
          <p>Base ATK: ${baseAtk == null ? "—" : num(baseAtk)}</p>
          <p>${esc(mainStat)}: ${esc(baseStat)}</p>
          <h3>Description</h3>
          <p>${esc(desc)}</p>
          <h3>${esc(d.effectName || w.passiveName || "Passive Ability")}</h3>
          <p>${esc(passive)}</p>
        </div>
      </div>`;
  };
  render();
  $("#weaponModal").hidden = false;
}