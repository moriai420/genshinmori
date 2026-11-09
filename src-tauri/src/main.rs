#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::time::Duration;

#[tauri::command]
async fn fetch_enka(uid: String) -> Result<Value, String> {
    if !uid.chars().all(|c| c.is_ascii_digit()) || !(9..=10).contains(&uid.len()) {
        return Err("UID non valido: inserisci 9 o 10 cifre.".into());
    }

    let client = reqwest::Client::builder()
        .user_agent("GenshinCodex/1.0")
        .timeout(Duration::from_secs(35))
        .build()
        .map_err(|e| format!("Client HTTP: {e}"))?;

    let enka_url = format!("https://enka.network/api/uid/{uid}/");
    let player: Value = client.get(&enka_url).send().await
        .map_err(|e| format!("Impossibile contattare Enka.Network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Enka.Network: {e}"))?
        .json().await
        .map_err(|e| format!("Risposta Enka non valida: {e}"))?;

    let store_base = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store";
    let (loc, characters, weapons) = tokio::try_join!(
        async {
            client.get(format!("{store_base}/loc.json")).send().await
                .map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?
                .json::<Value>().await.map_err(|e| e.to_string())
        },
        async {
            client.get(format!("{store_base}/characters.json")).send().await
                .map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?
                .json::<Value>().await.map_err(|e| e.to_string())
        },
        async {
            client.get(format!("{store_base}/weapons.json")).send().await
                .map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?
                .json::<Value>().await.map_err(|e| e.to_string())
        }
    ).map_err(|e| format!("Impossibile scaricare il catalogo Enka: {e}"))?;

    Ok(json!({
        "uid": uid,
        "generated": chrono_free_timestamp(),
        "player": player,
        "localization": loc,
        "characters_store": characters,
        "weapons_store": weapons
    }))
}

fn chrono_free_timestamp() -> String {
    // Timestamp ISO leggibile senza dipendenze aggiuntive.
    // Il client visualizza comunque la data locale quando disponibile.
    format!("{:?}", std::time::SystemTime::now())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_enka])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio di Genshin Codex");
}
