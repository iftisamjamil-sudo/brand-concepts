import { findVideo } from "./csv.js";
import { loadVideos } from "./data.js";
import { renderVideoPage } from "./video-view.js";

const root = document.querySelector("#digest");
const params = new URLSearchParams(window.location.search);
const id = params.get("id") || "";

function showError(message) {
  root.replaceChildren();
  const panel = document.createElement("div");
  panel.className = "panel panel-error";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Sheet";
  const title = document.createElement("h2");
  title.textContent = "Couldn’t load the sheet";
  const copy = document.createElement("p");
  copy.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", load);
  panel.append(eyebrow, title, copy, retry);
  root.append(panel);
}

async function load() {
  try {
    const videos = await loadVideos();
    renderVideoPage(root, findVideo(videos, id));
  } catch (error) {
    console.error(error);
    showError("The published CSV didn’t load. Check the connection and try again.");
  }
}

load();
