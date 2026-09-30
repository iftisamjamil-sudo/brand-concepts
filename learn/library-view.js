import { filterVideos, verdictTone, videoKey } from "./csv.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function thumbnail(video, className) {
  const frame = el("div", className || "thumb");
  if (video.thumbnailUrl) {
    const img = document.createElement("img");
    img.src = video.thumbnailUrl;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.remove();
      frame.classList.add("is-fallback");
    });
    frame.append(img);
  } else {
    frame.classList.add("is-fallback");
  }
  return frame;
}

function card(video) {
  const link = document.createElement("a");
  link.className = "card";
  link.href = `/learn/video.html?id=${encodeURIComponent(videoKey(video))}`;

  const frame = thumbnail(video);
  if (video.verdict) {
    frame.append(el("span", `verdict tone-${verdictTone(video.verdict)}`, video.verdict));
  }
  if (video.worthWatching) {
    frame.append(el("span", "worth-flag", "Worth watching"));
  }

  const body = el("div", "card-body");
  body.append(el("h2", null, video.title || "Untitled video"));

  const meta = el("p", "meta");
  const bits = [video.channel, video.length, video.digestDate].filter(Boolean);
  if (bits.length === 0) meta.textContent = video.videoId ? "YouTube" : "Digest";
  else {
    bits.forEach((bit, index) => {
      if (index) meta.append(el("span", "dot", "·"));
      meta.append(document.createTextNode(bit));
    });
  }
  body.append(meta);
  link.append(frame, body);
  return link;
}

export function fillLibrary(root, state) {
  root.replaceChildren();

  if (state.status === "loading") {
    const panel = el("div", "panel");
    panel.append(el("p", "eyebrow", "Sheet"));
    panel.append(el("h2", null, "Loading digests…"));
    panel.append(el("p", null, "Reading the published CSV in the browser."));
    root.append(panel);
    return { shown: 0, total: 0 };
  }

  if (state.status === "error") {
    const panel = el("div", "panel panel-error");
    panel.append(el("p", "eyebrow", "Sheet"));
    panel.append(el("h2", null, "Couldn’t load the sheet"));
    panel.append(el("p", null, state.message || "The published CSV didn’t load. Try again."));
    const retry = el("button", "button", "Try again");
    retry.type = "button";
    retry.addEventListener("click", () => state.onRetry?.());
    panel.append(retry);
    root.append(panel);
    return { shown: 0, total: 0 };
  }

  const videos = state.videos || [];
  const shown = filterVideos(videos, { query: state.query, worthOnly: state.worthOnly });

  if (videos.length === 0) {
    const panel = el("div", "panel");
    panel.append(el("p", "eyebrow", "Empty library"));
    panel.append(el("h2", null, "No digests yet"));
    panel.append(
      el(
        "p",
        null,
        "This page reads the published sheet live. When a video row is added, it shows up here on refresh — thumbnail, verdict, and all."
      )
    );
    const notes = el("ul", "empty-notes");
    const items = [
      ["Summary", "Up to five bullets from the sheet."],
      ["Steps", "Each timestamp opens YouTube at that second."],
      ["Quiz", "Question on the front, answer on the back."],
    ];
    items.forEach(([title, copy]) => {
      const item = el("li");
      item.append(el("h3", null, title));
      item.append(el("p", null, copy));
      notes.append(item);
    });
    root.append(panel, notes);
    return { shown: 0, total: 0 };
  }

  if (shown.length === 0) {
    const panel = el("div", "panel");
    panel.append(el("p", "eyebrow", "Filter"));
    panel.append(el("h2", null, "Nothing matches"));
    panel.append(
      el(
        "p",
        null,
        state.worthOnly && !String(state.query || "").trim()
          ? "No rows are marked worth watching."
          : "Try a different search, or turn off the worth-watching filter."
      )
    );
    root.append(panel);
    return { shown: 0, total: videos.length };
  }

  const grid = el("div", "grid");
  shown.forEach((video) => grid.append(card(video)));
  root.append(grid);
  return { shown: shown.length, total: videos.length };
}
