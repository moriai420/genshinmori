"""
Sincronizza la vetrina Genshin di Enka.Network con Notion.

- Personaggi con icone frontali.
- Statistiche arrotondate a numeri interi.
- Armi con livello, ascensione e raffinamento.
- Manufatti con set, livello e substat.
- Lettura dei database una volta per esecuzione.
- Aggiornamenti solo quando proprietà o icone cambiano.

Le pagine rappresentano l'equipaggiamento attuale:
- un personaggio per nome;
- un'arma per personaggio;
- un manufatto per personaggio e slot.

Non è un inventario delle singole copie possedute.
"""

import argparse
import json
import logging
import os
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import requests


# -------------------- Configurazione --------------------

UID = os.getenv("GENSHIN_UID", "").strip()
NOTION_TOKEN = os.getenv("NOTION_TOKEN", "").strip()

CHAR_DB = os.getenv("NOTION_DATABASE_ID", "").strip()
ART_DB = os.getenv("NOTION_ARTIFACTS_DATABASE_ID", "").strip()
WPN_DB = os.getenv("NOTION_WEAPONS_DATABASE_ID", "").strip()

LANG = "it"
TIMEOUT = (10, 40)
MAX_ATTEMPTS = 4

ENKA_BASE = "https://enka.network"
STORE_BASE = (
    "https://raw.githubusercontent.com/"
    "EnkaNetwork/API-docs/master/store"
)

NOTION_BASE = "https://api.notion.com/v1"

# Manteniamo la versione usata dal tuo script originale.
NOTION_VERSION = "2022-06-28"

WEAPON_TYPES = {
    "WEAPON_SWORD_ONE_HAND": "Spada",
    "WEAPON_CLAYMORE": "Claymore",
    "WEAPON_POLE": "Lancia",
    "WEAPON_CATALYST": "Catalizzatore",
    "WEAPON_BOW": "Arco",
}

ARTIFACT_SLOTS = {
    "EQUIP_BRACER": "Fiore",
    "EQUIP_NECKLACE": "Piuma",
    "EQUIP_SHOES": "Clessidra",
    "EQUIP_RING": "Calice",
    "EQUIP_DRESS": "Corona",
}

ARTIFACT_STATS = {
    "FIGHT_PROP_HP": "hp",
    "FIGHT_PROP_HP_PERCENT": "hp %",
    "FIGHT_PROP_ATTACK": "atk",
    "FIGHT_PROP_ATTACK_PERCENT": "atk %",
    "FIGHT_PROP_DEFENSE": "dif",
    "FIGHT_PROP_DEFENSE_PERCENT": "dif %",
    "FIGHT_PROP_ELEMENT_MASTERY": "EM",
    "FIGHT_PROP_CRITICAL": "CRIT rate %",
    "FIGHT_PROP_CRITICAL_HURT": "Danno critico %",
    "FIGHT_PROP_CHARGE_EFFICIENCY": "ER %",
}

# Facoltativo: inserisci solo associazioni ID/nome che hai verificato.
# Le associazioni arbitrarie del vecchio script sono state rimosse.
MANUAL_CHARACTERS = {}

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(message)s",
)
log = logging.getLogger("genshin-sync")


# -------------------- Proprietà Notion --------------------

def number(value):
    return {"number": int(round(float(value)))}


def title(value):
    return {"title": [{"text": {"content": str(value)}}]}


def select(value):
    return {"select": {"name": str(value)}}


def relation(page_id):
    return {"relation": [{"id": page_id}]}


def normalized_id(value):
    return str(value).replace("-", "").lower()


def title_text(page):
    parts = page.get("properties", {}).get("nick", {}).get("title", [])
    return "".join(
        part.get("plain_text", part.get("text", {}).get("content", ""))
        for part in parts
    )


def comparable_value(prop, kind):
    value = prop.get(kind)

    if kind == "title":
        return "".join(
            item.get("plain_text", item.get("text", {}).get("content", ""))
            for item in (value or [])
        )

    if kind == "select":
        return (value or {}).get("name")

    if kind == "relation":
        return {
            normalized_id(item["id"])
            for item in (value or [])
        }

    return value


def changed_properties(existing, desired):
    changed = {}

    for name, new_prop in desired.items():
        kind = next(iter(new_prop))
        old_prop = existing.get(name)

        if (
            old_prop is None
            or comparable_value(old_prop, kind)
            != comparable_value(new_prop, kind)
        ):
            changed[name] = new_prop

    return changed


def external_icon(url):
    return {
        "type": "external",
        "external": {"url": url},
    }


# -------------------- HTTP --------------------

def request_json(session, method, url, **kwargs):
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = session.request(
                method,
                url,
                timeout=TIMEOUT,
                **kwargs,
            )
        except requests.RequestException:
            # Non ripetiamo automaticamente scritture dall'esito incerto:
            # una creazione potrebbe essere già arrivata al server.
            if method.upper() != "GET" or attempt == MAX_ATTEMPTS - 1:
                raise

            time.sleep(2 ** attempt)
            continue

        if response.status_code == 429:
            if attempt == MAX_ATTEMPTS - 1:
                response.raise_for_status()

            try:
                delay = float(response.headers.get("Retry-After", 2))
            except ValueError:
                delay = 2

            time.sleep(max(delay, 1))
            continue

        if (
            response.status_code >= 500
            and method.upper() == "GET"
            and attempt < MAX_ATTEMPTS - 1
        ):
            time.sleep(2 ** attempt)
            continue

        if not response.ok:
            raise RuntimeError(
                f"{method} {url}: HTTP {response.status_code}\n"
                f"{response.text[:1500]}"
            )

        return response.json()

    raise RuntimeError(f"Tentativi esauriti: {method} {url}")


def download_json(url):
    with requests.Session() as session:
        session.headers.update({
            "User-Agent": "notion-genshin-sync/2.0",
        })
        return request_json(session, "GET", url)


# -------------------- Client Notion --------------------

class NotionClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {NOTION_TOKEN}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        })

        self.pages = {}
        self.last_request = 0.0
        self.counts = Counter()

    def close(self):
        self.session.close()

    def api(self, method, path, **kwargs):
        # Richieste Notion sequenziali e distanziate.
        wait = 0.4 - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)

        try:
            return request_json(
                self.session,
                method,
                f"{NOTION_BASE}/{path}",
                **kwargs,
            )
        finally:
            self.last_request = time.monotonic()

    def load_database(self, database_id):
        key = normalized_id(database_id)
        if key in self.pages:
            return

        pages = []
        cursor = None

        while True:
            payload = {"page_size": 100}
            if cursor:
                payload["start_cursor"] = cursor

            result = self.api(
                "POST",
                f"databases/{database_id}/query",
                json=payload,
            )
            pages.extend(result.get("results", []))

            if not result.get("has_more"):
                break

            cursor = result["next_cursor"]

        self.pages[key] = pages
        log.info("Database caricato: %s pagine", len(pages))

    def find(self, database_id, page_title):
        matches = [
            page
            for page in self.pages[normalized_id(database_id)]
            if title_text(page) == page_title
        ]

        if len(matches) > 1:
            raise RuntimeError(
                f"Più pagine con titolo '{page_title}'. "
                "Risolvi i duplicati prima di sincronizzare."
            )

        return matches[0] if matches else None

    def legacy_weapon(self, database_id, weapon_name, character_id):
        """
        Riutilizza una vecchia pagina arma solo se:
        - ha il vecchio titolo;
        - è collegata esclusivamente al personaggio corrente.
        """
        page = self.find(database_id, weapon_name)
        if not page:
            return None

        linked_ids = comparable_value(
            page.get("properties", {}).get("Personaggio", {}),
            "relation",
        )

        if linked_ids == {normalized_id(character_id)}:
            return page

        return None

    def upsert(
        self,
        database_id,
        page_title,
        properties,
        icon_url=None,
        existing=None,
    ):
        if existing is None:
            existing = self.find(database_id, page_title)

        if existing:
            page_id = existing["id"]
            changes = changed_properties(
                existing.get("properties", {}),
                properties,
            )

            old_icon = existing.get("icon") or {}
            old_url = (old_icon.get("external") or {}).get("url")

            icon_changed = (
                icon_url is not None
                and old_url != icon_url
            )

            if not changes and not icon_changed:
                self.counts["invariate"] += 1
                return page_id, "invariata"

            payload = {}
            if changes:
                payload["properties"] = changes
            if icon_changed:
                payload["icon"] = external_icon(icon_url)

            updated = self.api(
                "PATCH",
                f"pages/{page_id}",
                json=payload,
            )

            existing.clear()
            existing.update(updated)
            self.counts["aggiornate"] += 1
            return page_id, "aggiornata"

        payload = {
            "parent": {"database_id": database_id},
            "properties": properties,
        }
        if icon_url:
            payload["icon"] = external_icon(icon_url)

        created = self.api("POST", "pages", json=payload)
        self.pages[normalized_id(database_id)].append(created)

        self.counts["create"] += 1
        return created["id"], "creata"


# -------------------- Dati Enka --------------------

def image_url(icon_name):
    if not icon_name:
        return None
    return f"{ENKA_BASE}/ui/{icon_name}.png"


def character_info(avatar, character_store):
    avatar_id = str(avatar["avatarId"])
    depot_id = avatar.get("skillDepotId")

    if depot_id is not None:
        variant = character_store.get(f"{avatar_id}-{depot_id}")
        if variant:
            return variant

    return character_store.get(avatar_id, {})


def front_icon(info):
    side = info.get("SideIconName", "")
    if side:
        return image_url(
            side.replace("UI_AvatarIcon_Side_", "UI_AvatarIcon_", 1)
        )

    icon = info.get("IconName", "")
    return image_url(
        icon.replace("UI_AvatarIcon_Side_", "UI_AvatarIcon_", 1)
    )


def localized(text_map, name_hash, fallback):
    return text_map.get(str(name_hash)) or fallback


def character_properties(avatar, name):
    props = avatar.get("propMap", {})
    fight = avatar.get("fightPropMap", {})

    level_prop = props.get("4001", {})
    level = level_prop.get("val", level_prop.get("ival", 1))

    return {
        "nick": title(name),
        "Livello": number(level),
        "C": number(len(avatar.get("talentIdList", []))),
        "hp": number(fight.get("2000", 0)),
        "atk": number(fight.get("2001", 0)),
        "dif": number(fight.get("2002", 0)),
        "EM": number(fight.get("28", 0)),
        "CRIT rate": number(float(fight.get("20", 0)) * 100),
        "CRIT dmg": number(float(fight.get("22", 0)) * 100),
        "ER": number(float(fight.get("23", 0)) * 100),
    }


def sync_weapon(
    notion,
    equipment,
    character_name,
    character_page_id,
    text_map,
    info,
):
    flat = equipment.get("flat", {})
    weapon = equipment.get("weapon", {})

    weapon_name = localized(
        text_map,
        flat.get("nameTextMapHash", ""),
        f"Arma {equipment.get('itemId', 'sconosciuta')}",
    )

    # Una pagina per l'arma attualmente equipaggiata dal personaggio.
    page_title = f"{character_name} - Arma"

    affixes = weapon.get("affixMap") or {}
    refinement = max(
        (int(value) for value in affixes.values()),
        default=0,
    ) + 1

    properties = {
        "nick": title(page_title),
        "Rarita'": select(f"{flat.get('rankLevel', 4)} stelle"),
        "Livello": number(weapon.get("level", 1)),
        "Ascensione": number(weapon.get("promoteLevel", 0)),
        "Raffinamento": number(refinement),
        "Personaggio": relation(character_page_id),
    }

    weapon_type = WEAPON_TYPES.get(
        flat.get("weaponType") or info.get("WeaponType")
    )
    if weapon_type:
        properties["Tipo"] = select(weapon_type)

    existing = notion.find(WPN_DB, page_title)

    if existing is None:
        existing = notion.legacy_weapon(
            WPN_DB,
            weapon_name,
            character_page_id,
        )

    _, status = notion.upsert(
        WPN_DB,
        page_title,
        properties,
        image_url(flat.get("icon")),
        existing=existing,
    )

    log.info("  Arma: %s — %s", weapon_name, status)


def sync_artifact(
    notion,
    equipment,
    character_name,
    character_page_id,
    text_map,
):
    flat = equipment.get("flat", {})
    reliquary = equipment.get("reliquary", {})

    slot = ARTIFACT_SLOTS.get(flat.get("equipType"))
    if not slot:
        raise ValueError(
            f"Slot manufatto sconosciuto: {flat.get('equipType')}"
        )

    page_title = f"{character_name} - {slot}"
    set_hash = flat.get("setNameTextMapHash", "")

    properties = {
        "nick": title(page_title),
        "Tipo": select(slot),
        "Set": select(localized(
            text_map,
            set_hash,
            f"Set {set_hash or 'sconosciuto'}",
        )),
        "Livello": number(max(int(reliquary.get("level", 1)) - 1, 0)),
        "Personaggio": relation(character_page_id),
    }

    # Svuota le vecchie substat quando cambia il manufatto.
    for column in ARTIFACT_STATS.values():
        properties[column] = {"number": None}

    # I valori flat delle substat sono già nell'unità mostrata in gioco.
    for substat in flat.get("subStatList", []):
        column = ARTIFACT_STATS.get(substat.get("appendPropId"))
        if column:
            properties[column] = number(substat.get("statValue", 0))

    _, status = notion.upsert(
        ART_DB,
        page_title,
        properties,
        image_url(flat.get("icon")),
    )

    log.info("  Manufatto %s: %s", slot, status)


# -------------------- Esportazione JSON per l'app --------------------

def build_export(avatars, character_store, text_map):
    characters = []

    for avatar in avatars:
        avatar_id = str(avatar["avatarId"])
        info = character_info(avatar, character_store)

        name = MANUAL_CHARACTERS.get(avatar_id) or localized(
            text_map,
            info.get("NameTextMapHash", ""),
            f"Personaggio {avatar_id}",
        )

        fight = avatar.get("fightPropMap", {})
        level_prop = avatar.get("propMap", {}).get("4001", {})
        skills = info.get("Skills") or {}
        levels = avatar.get("skillLevelMap") or {}

        talents = []
        skill_order = (info.get("SkillOrder") or [])[:3]
        for label, skill_id in zip(("Normale", "Abilità", "Esplosione"), skill_order):
            talents.append({
                "label": label,
                "icon": image_url(skills.get(str(skill_id))),
                "level": levels.get(str(skill_id), 1),
            })

        weapon = None
        artifacts = []

        for equipment in avatar.get("equipList", []):
            flat = equipment.get("flat", {})
            item_type = flat.get("itemType")

            if item_type == "ITEM_WEAPON":
                data = equipment.get("weapon", {})
                affixes = data.get("affixMap") or {}
                weapon = {
                    "name": localized(
                        text_map,
                        flat.get("nameTextMapHash", ""),
                        f"Arma {equipment.get('itemId', 'sconosciuta')}",
                    ),
                    "icon": image_url(flat.get("icon")),
                    "type": WEAPON_TYPES.get(
                        flat.get("weaponType") or info.get("WeaponType")
                    ),
                    "rarity": flat.get("rankLevel", 4),
                    "level": data.get("level", 1),
                    "ascension": data.get("promoteLevel", 0),
                    "refinement": max((int(v) for v in affixes.values()), default=0) + 1,
                }

            elif item_type == "ITEM_RELIQUARY":
                main = flat.get("reliquaryMainstat", {})
                subs = (
                    flat.get("reliquarySubstats")
                    or flat.get("subStatList")
                    or []
                )
                set_hash = flat.get("setNameTextMapHash", "")
                artifacts.append({
                    "slot": ARTIFACT_SLOTS.get(flat.get("equipType"), "?"),
                    "set": localized(text_map, set_hash, f"Set {set_hash or 'sconosciuto'}"),
                    "icon": image_url(flat.get("icon")),
                    "level": max(int(equipment.get("reliquary", {}).get("level", 1)) - 1, 0),
                    "main": {"stat": main.get("mainPropId"), "value": main.get("statValue", 0)},
                    "subs": [
                        {"stat": x.get("appendPropId"), "value": x.get("statValue", 0)}
                        for x in subs
                    ],
                })

        characters.append({
            "id": avatar_id,
            "name": name,
            "element": info.get("Element"),
            "icon": front_icon(info),
            "level": level_prop.get("val", level_prop.get("ival", 1)),
            "cons": len(avatar.get("talentIdList", [])),
            "stats": {
                "hp": round(float(fight.get("2000", 0))),
                "atk": round(float(fight.get("2001", 0))),
                "dif": round(float(fight.get("2002", 0))),
                "em": round(float(fight.get("28", 0))),
                "crit_rate": round(float(fight.get("20", 0)) * 100, 1),
                "crit_dmg": round(float(fight.get("22", 0)) * 100, 1),
                "er": round(float(fight.get("23", 0)) * 100, 1),
            },
            "talents": talents,
            "weapon": weapon,
            "artifacts": artifacts,
        })

    return {
        "uid": UID,
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "characters": characters,
    }


def write_export(path, avatars, character_store, text_map):
    data = build_export(avatars, character_store, text_map)
    folder = os.path.dirname(os.path.abspath(path))
    os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    log.info("JSON scritto: %s (%s personaggi)", path, len(data["characters"]))


# -------------------- Sincronizzazione --------------------

def sync(json_path=None, use_notion=True):
    required = {"GENSHIN_UID": UID}
    if use_notion:
        required["NOTION_TOKEN"] = NOTION_TOKEN
        required["NOTION_DATABASE_ID"] = CHAR_DB

    missing = [name for name, value in required.items() if not value]
    if missing:
        raise ValueError(
            "Variabili d'ambiente mancanti: " + ", ".join(missing)
        )

    log.info("Scarico i dati Enka...")

    urls = [
        f"{STORE_BASE}/loc.json",
        f"{STORE_BASE}/characters.json",
        f"{ENKA_BASE}/api/uid/{UID}/",
    ]

    with ThreadPoolExecutor(max_workers=3) as executor:
        localization, character_store, player = list(
            executor.map(download_json, urls)
        )

    text_map = {
        **localization.get("en", {}),
        **localization.get(LANG, {}),
    }

    if not text_map or not character_store:
        raise RuntimeError(
            "Dati statici Enka vuoti: sincronizzazione interrotta."
        )

    avatars = player.get("avatarInfoList") or []

    if json_path:
        write_export(json_path, avatars, character_store, text_map)

    if not avatars:
        log.warning(
            "Nessun personaggio disponibile: controlla che la vetrina "
            "e i dettagli dei personaggi siano pubblici."
        )
        return

    log.info("Trovati %s personaggi.", len(avatars))

    if not use_notion:
        log.info("Notion saltato (--no-notion).")
        return

    notion = NotionClient()
    failures = 0

    try:
        for database_id in (CHAR_DB, WPN_DB, ART_DB):
            if database_id:
                notion.load_database(database_id)

        for avatar in avatars:
            avatar_id = str(avatar["avatarId"])
            info = character_info(avatar, character_store)

            name = MANUAL_CHARACTERS.get(avatar_id) or localized(
                text_map,
                info.get("NameTextMapHash", ""),
                f"Personaggio {avatar_id}",
            )

            log.info("Sincronizzo %s...", name)

            try:
                character_page_id, status = notion.upsert(
                    CHAR_DB,
                    name,
                    character_properties(avatar, name),
                    front_icon(info),
                )
                log.info("  Personaggio: %s", status)

                for equipment in avatar.get("equipList", []):
                    item_type = equipment.get("flat", {}).get("itemType")

                    if item_type == "ITEM_WEAPON" and WPN_DB:
                        sync_weapon(
                            notion,
                            equipment,
                            name,
                            character_page_id,
                            text_map,
                            info,
                        )

                    elif item_type == "ITEM_RELIQUARY" and ART_DB:
                        sync_artifact(
                            notion,
                            equipment,
                            name,
                            character_page_id,
                            text_map,
                        )

            except (requests.RequestException, RuntimeError, ValueError) as exc:
                failures += 1
                log.error("Errore durante la sincronizzazione di %s: %s", name, exc)

        log.info(
            "Fine: %s create, %s aggiornate, %s invariate, "
            "%s personaggi con errori.",
            notion.counts["create"],
            notion.counts["aggiornate"],
            notion.counts["invariate"],
            failures,
        )

    finally:
        notion.close()

    if failures:
        raise RuntimeError(
            "Sincronizzazione parziale: controlla gli errori qui sopra."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync Enka -> Notion / JSON")
    parser.add_argument("--json", dest="json_path", help="scrive i dati in questo file JSON")
    parser.add_argument("--no-notion", action="store_true", help="non aggiorna Notion")
    args = parser.parse_args()

    try:
        sync(json_path=args.json_path, use_notion=not args.no_notion)
    except (requests.RequestException, RuntimeError, ValueError) as exc:
        log.error("%s", exc)
        raise SystemExit(1)