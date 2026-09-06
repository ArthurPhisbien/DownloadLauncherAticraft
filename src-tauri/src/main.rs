#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize, Serialize, Debug)]
struct ModManifest {
    version: String,
    minecraft_version: String,
    mods: Vec<ModItem>,
}

#[derive(Deserialize, Serialize, Debug)]
struct ModItem {
    name: String,
    filename: String,
    url: String,
}

#[tauri::command]
async fn sync_mods() -> Result<String, String> {
    let roaming = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let mods_dir = PathBuf::from(&roaming).join(".minecraft").join("mods");

    fs::create_dir_all(&mods_dir).map_err(|e| format!("Erreur création dossier mods: {}", e))?;

    let manifest_url = "https://raw.githubusercontent.com/ArthurPhisbien/ModAticraft/main/mods.json";
    
    let client = reqwest::Client::new();
    let response = client.get(manifest_url).send().await;

    if let Ok(res) = response {
        if let Ok(manifest) = res.json::<ModManifest>().await {
            for m in manifest.mods {
                let file_path = mods_dir.join(&m.filename);
                if !file_path.exists() {
                    let download_url = m.url
                        .replace("github.com", "raw.githubusercontent.com")
                        .replace("/blob/", "/");

                    if let Ok(mod_res) = client.get(&download_url).send().await {
                        if let Ok(bytes) = mod_res.bytes().await {
                            let _ = fs::write(&file_path, bytes);
                        }
                    }
                }
            }
        }
    }

    Ok("Mods synchronisés avec succès !".into())
}

#[tauri::command]
async fn launch_minecraft() -> Result<String, String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-StartApps | Where-Object {$_.Name -like '*Minecraft*'} | Select-Object -First 1 -ExpandProperty AppID"
        ])
        .output();

    if let Ok(res) = output {
        let app_id = String::from_utf8_lossy(&res.stdout)
            .replace("\r", "")
            .replace("\n", "")
            .trim()
            .to_string();
            
        if !app_id.is_empty() {
            let status = std::process::Command::new("explorer.exe")
                .arg(format!("shell:AppsFolder\\{}", app_id))
                .spawn();
            
            if status.is_ok() {
                return Ok("Minecraft Launcher lancé avec succès !".into());
            }
        }
    }

    Err("Impossible de trouver le Minecraft Launcher sur la machine. Vérifie son installation.".into())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            sync_mods,
            launch_minecraft
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}