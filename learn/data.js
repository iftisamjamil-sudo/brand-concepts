import { videosFromCsv } from "./csv.js";

/**
 * Published Google Sheet, read live in the browser. Rows are not copied into the site.
 *
 * CORS: docs.google.com answers this URL with a 307 whose Access-Control-Allow-Origin
 * echoes the page origin. The redirected googleusercontent.com file sends
 * Access-Control-Allow-Origin: *. A static page can fetch it directly; no proxy.
 */
export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSivYNmuFgU0Lfc234cItqYkbgkU7lAiI5VC_K3-Tbl7ovVbRk9X1JTlbiH6LmmY54aBuhO7Dl2uurx/pub?gid=1567771403&single=true&output=csv";

export async function fetchSheetCsv() {
  const response = await fetch(SHEET_CSV_URL, {
    method: "GET",
    cache: "no-store",
    mode: "cors",
    redirect: "follow",
    headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" },
  });

  if (!response.ok) {
    throw new Error(`The sheet responded with ${response.status}.`);
  }

  const text = await response.text();
  if (/^\s*</.test(text)) {
    throw new Error("The sheet response was not CSV.");
  }
  return text;
}

export async function loadVideos() {
  const text = await fetchSheetCsv();
  return videosFromCsv(text);
}
