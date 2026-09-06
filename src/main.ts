import { invoke } from "@tauri-apps/api/core";

const playBtn = document.getElementById("play-btn");
const statusText = document.getElementById("status");

if (playBtn && statusText) {
  playBtn.addEventListener("click", async () => {
    statusText.innerText = "Initialisation...";
    try {
      // Appelle la fonction Rust nommée "launch_minecraft"
      const response = await invoke("launch_minecraft");
      statusText.innerText = response as string;
    } catch (error) {
      statusText.innerText = "Erreur: " + error;
    }
  });
}