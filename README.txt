# 原神のモリ — Genshin no Mori

Browser-based Genshin Impact showcase and game catalog.

## Features
- Load the public character showcase using an Enka.Network UID.
- Display showcase character stats, equipped weapons, artifacts, and talent levels.
- Set local build targets for character level and combat stats.
- Open weapon details with English descriptions, base stats, and refinement passive text from genshin-db.
- Browse the full English game catalog for characters, weapons, and artifacts, independently of the UID showcase.
- Character metadata fallback from genshin-db helps when Enka's static character store is behind the game version.

## Important: showcase vs. owned roster
Enka's public UID endpoint returns the characters currently displayed in the player's public showcase, not the complete account inventory. The Game Catalog tab lists all characters in the game, but it cannot determine which characters the account owns unless the player adds them to the Enka showcase or another supported account-data source is integrated.

## Files
- `src/index.html`, `src/style.css`, `src/app.js`: browser app.
- `worker.js`: Cloudflare Worker proxy. Deploy this file as the Worker code.

## Cloudflare Worker setup
1. Open the existing `genshinmori` Worker in Cloudflare.
2. Choose **Edit code** / **Quick edit**.
3. Replace the Worker code with the complete contents of `worker.js` from this project.
4. Click **Deploy**.
5. Verify these routes in a browser:
   - `/api/uid/YOUR_UID`
   - `/store/loc.json`
   - `/store/characters.json`
   - `/store/weapons.json`
   - `/db/characters?query=names&matchCategories=true&resultLanguage=English`
   - `/db/weapons?query=names&matchCategories=true&resultLanguage=English`

The Worker proxies Enka, the Enka static store, and the genshin-db API. The app's `db` routes are used for the English game catalog and weapon details.

## Run the browser app
Open `src/index.html` in a modern browser, or publish the contents of `src/` on a static hosting service. The app uses the Cloudflare Worker URL configured in `src/app.js`:
`https://genshinmori.serena-aiazzi777.workers.dev`

## Data sources
- Enka.Network: player showcase and live character build data.
- EnkaNetwork/API-docs: static localization and character store.
- genshin-db / genshin-db-api: English game data for characters, weapons, and artifacts.

Game data and artwork belong to their respective creators and publishers. This is an unofficial fan project and is not affiliated with HoYoverse.
