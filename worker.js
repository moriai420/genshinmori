const ENKA = "https://enka.network";
const STORE = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store";
const WEAPONS = "https://gitlab.com/Dimbreath/AnimeGameData/-/raw/master/ExcelBinOutput/WeaponExcelConfigData.json";
const GENSHIN_DB = "https://genshin-db-api.vercel.app/api/v5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    let upstream;
    if (/^\/api\/uid\/\d{9,10}$/.test(url.pathname)) {
      const uid = url.pathname.split("/").pop();
      upstream = `${ENKA}/api/uid/${uid}/`;
    } else if (url.pathname === "/store/weapons.json") {
      upstream = WEAPONS;
    } else if (/^\/store\/(loc|characters)\.json$/.test(url.pathname)) {
      upstream = `${STORE}${url.pathname.replace("/store", "")}`;
    } else if (/^\/db\/(characters|weapons|artifacts|talents|constellations)$/.test(url.pathname)) {
      upstream = `${GENSHIN_DB}${url.pathname.replace("/db", "")}${url.search}`;
    } else if (url.pathname === "/db/stats") {
      upstream = `${GENSHIN_DB}/stats${url.search}`;
    } else {
      return new Response("Not found", { status: 404, headers: cors });
    }

    try {
      const response = await fetch(upstream, {
        headers: { "User-Agent": "GENSHIN-NO-MORI/1.0", "Accept": "application/json" }
      });
      const headers = new Headers(cors);
      headers.set("Content-Type", response.headers.get("Content-Type") || "application/json; charset=utf-8");
      headers.set("Cache-Control", "public, max-age=300");
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Upstream unavailable", details: String(error) }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }
  }
};
