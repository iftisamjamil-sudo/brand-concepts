import { loadVideos } from "./data.js";
import { fillLibrary } from "./library-view.js";

const list = document.querySelector("#library");
const search = document.querySelector("#search");
const worth = document.querySelector("#worth");
const count = document.querySelector("#count");

let videos = [];
let status = "loading";
let message = "";

function paint() {
  const result = fillLibrary(list, {
    status,
    message,
    videos,
    query: search.value,
    worthOnly: worth.checked,
    onRetry: load,
  });

  if (status === "loading") {
    count.textContent = "Loading…";
    return;
  }
  if (status === "error") {
    count.textContent = "Sheet unavailable";
    return;
  }

  const noun = result.shown === 1 ? "digest" : "digests";
  count.textContent = videos.length === 0 ? "0 digests · live sheet" : `${result.shown} ${noun} · live sheet`;
}

async function load() {
  status = "loading";
  message = "";
  paint();
  try {
    videos = await loadVideos();
    status = "ready";
  } catch (error) {
    videos = [];
    status = "error";
    message = error?.code === "BAD_CSV" ? error.message : "The published CSV didn’t load. Check the connection and try again.";
    console.error(error);
  }
  paint();
}

search.addEventListener("input", paint);
worth.addEventListener("change", paint);
load();
