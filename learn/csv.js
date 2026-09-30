/**
 * RFC 4180-style CSV parser and digest-field normalizers.
 * Quoted fields may contain commas, newlines, and escaped quotes ("").
 */

export function parseCsv(input) {
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"' && field === "") {
      inQuotes = true;
      continue;
    }

    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += c;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function csvToRecords(input) {
  const rows = parseCsv(input).filter((row) => row.some((cell) => String(cell).trim() !== ""));
  if (rows.length === 0) return { headers: [], records: [] };

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const records = rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = String(row[index] ?? "").trim();
    });
    return record;
  });

  return { headers, records };
}

function parseJsonish(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const candidates = [text];
  const unsmart = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (unsmart !== text) candidates.push(unsmart);

  for (const candidate of candidates) {
    if (!/^[\[{]/.test(candidate)) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["bullets", "summary", "items", "steps", "quiz", "cards", "questions"]) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return null;
}

function cleanBullet(line) {
  return String(line)
    .trim()
    .replace(/^([-*•·]|\d+[.)])\s+/, "")
    .trim();
}

export function parseSummaryBullets(raw) {
  const parsed = parseJsonish(raw);
  const list = asArray(parsed);
  let bullets = [];

  if (list) {
    bullets = list
      .map((item) => {
        if (typeof item === "string") return cleanBullet(item);
        if (item && typeof item === "object") {
          return cleanBullet(item.text || item.bullet || item.summary || item.label || "");
        }
        return "";
      })
      .filter(Boolean);
  } else {
    const text = String(raw ?? "").trim();
    if (!text) return [];
    const parts = text.split(/\r?\n|•/).map(cleanBullet).filter(Boolean);
    bullets = parts.length ? parts : [text];
  }

  return bullets.slice(0, 5);
}

export function timestampToSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/,/g, "");
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.floor(Number(raw));

  if (/^(?:\d+h)?(?:\d+m)?(?:\d+(?:\.\d+)?s)$/.test(raw) && /[hms]/.test(raw)) {
    const hours = Number(raw.match(/(\d+)h/)?.[1] || 0);
    const minutes = Number(raw.match(/(\d+)m/)?.[1] || 0);
    const seconds = Number(raw.match(/(\d+(?:\.\d+)?)s/)?.[1] || 0);
    return Math.floor(hours * 3600 + minutes * 60 + seconds);
  }

  const parts = raw.split(":").map((part) => part.trim());
  if (
    (parts.length === 2 || parts.length === 3) &&
    parts.every((part) => /^\d+(\.\d+)?$/.test(part))
  ) {
    const nums = parts.map(Number);
    if (nums.length === 2) return Math.floor(nums[0] * 60 + nums[1]);
    return Math.floor(nums[0] * 3600 + nums[1] * 60 + nums[2]);
  }

  return null;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`;
  return `${minutes}:${pad(secs)}`;
}

const STEP_TIME = String.raw`(?:\d+:\d+(?::\d+)?|\d+h\d+m\d+s|\d+m\d+s|\d+s)`;

function stepFromLine(line) {
  const text = String(line ?? "").trim();
  if (!text) return null;

  const patterns = [
    new RegExp(`^\\[(${STEP_TIME})\\]\\s*(.*)$`, "i"),
    new RegExp(`^(${STEP_TIME})\\s*[-–—|:]\\s*(.*)$`, "i"),
    new RegExp(`^(${STEP_TIME})\\s+(.+)$`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const seconds = timestampToSeconds(match[1]);
    return {
      seconds,
      displayTime: seconds == null ? match[1] : formatClock(seconds),
      label: (match[2] || "").trim() || "Key step",
    };
  }

  return { seconds: null, displayTime: "", label: text };
}

function stepFromObject(item) {
  if (!item || typeof item !== "object") return stepFromLine(item);
  const timeValue =
    item.time ?? item.timestamp ?? item.t ?? item.start ?? item.at ?? item.seconds ?? item.sec ?? "";
  const seconds = timestampToSeconds(timeValue);
  const label = String(
    item.text || item.label || item.title || item.step || item.idea || item.description || item.note || ""
  ).trim();
  if (seconds == null && !label) return null;
  return {
    seconds,
    displayTime: seconds == null ? "" : formatClock(seconds),
    label: label || "Key step",
  };
}

export function parseKeySteps(raw) {
  const parsed = parseJsonish(raw);
  const list = asArray(parsed);
  if (list) return list.map(stepFromObject).filter(Boolean);

  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(stepFromLine)
    .filter(Boolean);
}

function quizFromItem(item) {
  if (typeof item === "string") {
    const text = item.trim();
    if (!text) return null;
    const split = text.split(/\s*(?:\||—|–|-)\s*/);
    if (split.length >= 2 && split[0] && split[1]) {
      return { question: split[0].trim(), answer: split.slice(1).join(" - ").trim() };
    }
    return { question: text, answer: "" };
  }
  if (!item || typeof item !== "object") return null;
  const question = String(item.question || item.q || item.prompt || item.front || item.card || "").trim();
  const answer = String(item.answer || item.a || item.response || item.back || "").trim();
  if (!question && !answer) return null;
  return { question: question || "Question", answer };
}

export function parseQuiz(raw) {
  const parsed = parseJsonish(raw);
  const list = asArray(parsed);
  if (list) return list.map(quizFromItem).filter(Boolean);

  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(quizFromItem)
    .filter(Boolean);
}

const WORTH_TRUE = new Set(["1", "true", "yes", "y", "yep", "worth", "worth watching", "watch"]);

export function isWorthWatching(value) {
  return WORTH_TRUE.has(String(value ?? "").trim().toLowerCase());
}

export function videoIdFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery) return fromQuery;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex((part) => ["embed", "shorts", "live", "v"].includes(part));
      if (marker >= 0 && parts[marker + 1]) return parts[marker + 1];
    }
  } catch {
    return "";
  }
  return "";
}

export function youtubeAt(videoId, seconds) {
  const id = String(videoId || "").trim();
  if (!id || seconds == null || !Number.isFinite(Number(seconds))) return "";
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&t=${Math.floor(Number(seconds))}`;
}

export function safeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return "";
  }
  return "";
}

export function normalizeVideo(record, index = 0) {
  const source = record || {};
  const videoId = String(source.video_id || "").trim() || videoIdFromUrl(source.url);
  const thumbnail =
    safeHttpUrl(source.thumbnail_url) ||
    (/^[A-Za-z0-9_-]{6,}$/.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");

  return {
    index,
    videoId,
    title: String(source.title || "").trim(),
    channel: String(source.channel || "").trim(),
    url: safeHttpUrl(source.url) || (videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : ""),
    length: String(source.length || "").trim(),
    digestDate: String(source.digest_date || "").trim(),
    thumbnailUrl: thumbnail,
    summaryBullets: parseSummaryBullets(source.summary_bullets),
    steps: parseKeySteps(source.key_steps_timestamps),
    actionItem: String(source.action_item || "").trim(),
    quiz: parseQuiz(source.quiz_json),
    verdict: String(source.verdict || "").trim(),
    verdictReason: String(source.verdict_reason || "").trim(),
    worthWatching: isWorthWatching(source.worth_watching),
  };
}

export function videosFromCsv(input) {
  const { headers, records } = csvToRecords(input);
  if (headers.length === 0) return [];

  const known = new Set(headers);
  if (!known.has("video_id") && !known.has("title")) {
    const error = new Error("CSV is missing video_id and title columns.");
    error.code = "BAD_CSV";
    throw error;
  }

  return records
    .map((record, index) => normalizeVideo(record, index))
    .filter((video) => video.videoId || video.title || video.url);
}

export function videoKey(video) {
  return video.videoId || `row-${video.index}`;
}

export function findVideo(videos, id) {
  const key = String(id || "").trim();
  if (!key) return null;
  const byId = videos.find((video) => video.videoId === key);
  if (byId) return byId;
  const rowMatch = key.match(/^row-(\d+)$/);
  if (!rowMatch) return null;
  return videos.find((video) => video.index === Number(rowMatch[1])) || null;
}

export function filterVideos(videos, { query = "", worthOnly = false } = {}) {
  const needle = String(query).trim().toLowerCase();
  return videos.filter((video) => {
    if (worthOnly && !video.worthWatching) return false;
    if (!needle) return true;
    const haystack = [
      video.title,
      video.channel,
      video.verdict,
      video.verdictReason,
      video.actionItem,
      video.summaryBullets.join(" "),
      video.steps.map((step) => `${step.displayTime} ${step.label}`).join(" "),
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function verdictTone(verdict) {
  const text = String(verdict || "").toLowerCase();
  if (!text) return "neutral";
  if (/skip|pass|avoid|not worth|don't watch|do not watch|\bno\b/.test(text)) return "bad";
  if (/maybe|mixed|skim|partial|unsure/.test(text)) return "mid";
  if (/watch|yes|worth|strong|great|keep|recommend/.test(text)) return "good";
  return "neutral";
}
