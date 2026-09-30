/**
 * Echo competitor intelligence.
 *
 * Plans and recent changes are fetched at runtime from published Google Sheets
 * CSVs. The published file responds with Access-Control-Allow-Origin: *, so a
 * static host can read it directly from the browser.
 *
 * Proxy note: if a host blocks that cross-origin read, serve the two URLs
 * below from the same origin and point PLANS_URL / CHANGES_URL at the proxy.
 * Do not paste prices into this file.
 */
const PLANS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQnayPtWCg_TAtnfMaGDwQKLo_6w9i-8vFoXwqW8SpDioTJEI7YX7J--phyZQrIGYaW9v8n9F6BXhuQ/pub?gid=1760620978&single=true&output=csv";
const CHANGES_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQnayPtWCg_TAtnfMaGDwQKLo_6w9i-8vFoXwqW8SpDioTJEI7YX7J--phyZQrIGYaW9v8n9F6BXhuQ/pub?gid=542438143&single=true&output=csv";

const TEAM_SIZE = 5;

const PLAN_COLUMNS = [
  "Competitor",
  "Plan",
  "Monthly / seat",
  "Annual / seat",
  "Free plan limits",
  "Top 3 features",
];

const CHANGE_COLUMNS = ["Competitor", "Date", "Title", "Summary", "Link", "Source"];

const COLORS = {
  Otter: "#8eb6ff",
  Fireflies: "#f0a35e",
  Fathom: "#7fd0ff",
  "tl;dv": "#d7a0ff",
  Granola: "#d5de7a",
  "Read.ai": "#ff9aa8",
  Avoma: "#8ee0c2",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseCSV(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

function assertColumns(rows, required, label) {
  if (!rows.length) return;
  const keys = new Set(Object.keys(rows[0]));
  const missing = required.filter((name) => !keys.has(name));
  if (missing.length) {
    throw new Error(`${label} sheet is missing ${missing.join(", ")}`);
  }
}

function splitList(value) {
  const source = String(value || "").trim();
  if (!source) return [];
  const parts = [];
  let current = "";
  let depth = 0;
  for (const char of source) {
    if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    if (char === ";" && depth === 0) {
      const item = current.trim();
      if (item) parts.push(item);
      current = "";
    } else {
      current += char;
    }
  }
  const last = current.trim();
  if (last) parts.push(last);
  return parts;
}

function parseMoney(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function paidMonthly(value) {
  const amount = parseMoney(value);
  if (amount == null || amount <= 0) return null;
  return amount;
}

function roundCents(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function formatUsd(amount) {
  const rounded = roundCents(amount);
  const cents = Math.round((rounded + Number.EPSILON) * 100) % 100;
  return rounded.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatSheetDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return raw || "Date not set";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return raw;
  if (!match[3]) return `${month} ${match[1]}`;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

function dateSortValue(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return 0;
  const day = match[3] || "01";
  return Date.parse(`${match[1]}-${match[2]}-${day}T00:00:00Z`) || 0;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}

function shortUrl(value) {
  const href = safeUrl(value);
  if (!href) return "";
  const url = new URL(href);
  const path = url.pathname.replace(/\/$/, "");
  return `${url.hostname.replace(/^www\./, "")}${path}`;
}

function colorFor(name) {
  if (COLORS[name]) return COLORS[name];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 62% 72%)`;
}

function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      node.setAttribute(key, String(value));
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function groupPlans(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = row.Competitor;
    const plan = row.Plan;
    if (!name || !plan) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups.entries()].map(([name, plans]) => ({ name, plans }));
}

function isSkip(row) {
  return String(row.Source || "").trim().toLowerCase() === "skip";
}

function sourceRank(row) {
  return String(row.Source || "").trim().toLowerCase() === "changelog" ? 0 : 1;
}

function splitChanges(rows) {
  const feed = [];
  const notes = [];
  for (const row of rows) {
    if (!row.Competitor && !row.Title && !row.Summary) continue;
    if (isSkip(row)) notes.push(row);
    else feed.push(row);
  }
  feed.sort(
    (a, b) =>
      dateSortValue(b.Date) - dateSortValue(a.Date) ||
      sourceRank(a) - sourceRank(b) ||
      String(a.Title).localeCompare(String(b.Title))
  );
  return { feed, notes };
}

function buildChartModel(groups) {
  const points = [];
  const excluded = [];
  for (const group of groups) {
    let best = null;
    for (const plan of group.plans) {
      const monthly = paidMonthly(plan["Monthly / seat"]);
      if (monthly == null) {
        excluded.push({
          competitor: group.name,
          plan: plan.Plan,
          raw: plan["Monthly / seat"] || "blank",
        });
      } else if (!best || monthly < best.monthly) {
        best = {
          plan: plan.Plan,
          monthly,
          raw: plan["Monthly / seat"],
        };
      }
    }
    if (best) {
      points.push({
        competitor: group.name,
        plan: best.plan,
        monthly: best.monthly,
        raw: best.raw,
        team: roundCents(best.monthly * TEAM_SIZE),
      });
    }
  }
  points.sort(
    (a, b) =>
      a.team - b.team ||
      a.competitor.localeCompare(b.competitor, "en", { sensitivity: "base" })
  );
  return { points, excluded };
}

function axisMax(value) {
  if (value <= 0) return 1;
  const padded = value * 1.06;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidate = step * magnitude;
    if (candidate >= padded) return candidate;
  }
  return 10 * magnitude;
}

function joinNames(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function lowestSentence(points) {
  if (!points.length) return "";
  const low = points[0].team;
  const winners = points.filter((point) => point.team === low);
  const cost = formatUsd(low);
  if (winners.length === 1) {
    const winner = winners[0];
    return `${winner.competitor} ${winner.plan} is the lowest at ${cost} a month for ${TEAM_SIZE} seats (${winner.raw}/seat).`;
  }
  const names = joinNames(winners.map((winner) => `${winner.competitor} ${winner.plan}`));
  return `${names} are tied for lowest at ${cost} a month for ${TEAM_SIZE} seats.`;
}

function externalLink(url, label) {
  return h(
    "a",
    {
      href: url,
      target: "_blank",
      rel: "noopener noreferrer",
      referrerpolicy: "no-referrer",
    },
    label,
    h("span", { class: "sr-only" }, " (opens in a new tab)")
  );
}

function renderFeed(rows) {
  const feed = document.getElementById("feed");
  const notes = document.getElementById("notes");
  const { feed: items, notes: skipped } = splitChanges(rows);
  feed.replaceChildren();
  if (!items.length) {
    feed.append(h("p", { class: "loading" }, "No changelog rows were published."));
  } else {
    for (const item of items) {
      const href = safeUrl(item.Link);
      const source = item.Source || "Update";
      const main = h(
        "div",
        { class: "change-main" },
        h(
          "p",
          { class: "change-kicker" },
          h("span", { class: "swatch", style: `--swatch:${colorFor(item.Competitor)}` }),
          item.Competitor || "Unknown",
          h("span", { class: "source-pill" }, source)
        ),
        h("h3", null, item.Title || "Untitled update"),
        item.Summary ? h("p", { class: "summary" }, item.Summary) : null,
        href ? externalLink(href, "Read update") : null
      );
      const link = main.querySelector("a");
      if (link) link.classList.add("change-link");
      feed.append(
        h(
          "article",
          { class: "change", "data-title": item.Title || "" },
          h("p", { class: "change-date" }, formatSheetDate(item.Date)),
          main
        )
      );
    }
  }

  notes.replaceChildren();
  for (const note of skipped) {
    const href = safeUrl(note.Link);
    notes.append(
      h(
        "aside",
        { class: "collection-note" },
        h("p", { class: "index" }, "Kept out of the feed · source skip"),
        h("h3", null, note.Title || note.Competitor || "Collection note"),
        h(
          "p",
          null,
          [formatSheetDate(note.Date), note.Summary].filter(Boolean).join(" — ")
        ),
        href ? externalLink(href, "Open note") : null
      )
    );
  }
}

function renderChart(groups) {
  const mount = document.getElementById("chart");
  const { points, excluded } = buildChartModel(groups);
  const max = axisMax(points.reduce((peak, point) => Math.max(peak, point.team), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((share) => roundCents(max * share));
  const low = points[0]?.team;

  const list = h(
    "ol",
    { class: "bars" },
    points.map((point, index) => {
      const width = Math.max(2, (point.team / max) * 100);
      const lowest = point.team === low;
      return h(
        "li",
        {
          class: lowest ? "bar is-lowest" : "bar",
          "data-competitor": point.competitor,
          "data-plan": point.plan,
          "data-monthly": String(point.monthly),
          "data-team": String(point.team),
        },
        h(
          "div",
          { class: "bar-top" },
          h(
            "span",
            { class: "who" },
            h("span", { class: "rank" }, String(index + 1)),
            h("span", { class: "swatch", style: `--swatch:${colorFor(point.competitor)}` }),
            point.competitor,
            lowest ? h("span", { class: "lowest-tag" }, "Lowest") : null
          ),
          h("span", { class: "amt" }, formatUsd(point.team))
        ),
        h("p", { class: "bar-sub" }, `${point.plan} · ${point.raw}/seat × ${TEAM_SIZE}`),
        h(
          "div",
          {
            class: "track",
            role: "img",
            "aria-label": `${point.competitor} ${point.plan}, ${formatUsd(point.team)} a month for ${TEAM_SIZE} seats`,
          },
          h("div", { class: "fill", style: `width:${width}%` })
        )
      );
    })
  );

  const card = h(
    "div",
    { class: "chart-card" },
    points.length
      ? h("p", { class: "callout" }, lowestSentence(points))
      : h("p", { class: "callout" }, "No competitor published a numeric monthly price above $0."),
    h("p", { class: "axis-label" }, `USD per month · ${TEAM_SIZE} seats`),
    list,
    h(
      "div",
      { class: "scale", "aria-hidden": "true" },
      ticks.map((tick) => h("span", null, formatUsd(tick)))
    ),
    h(
      "details",
      { class: "excluded" },
      h(
        "summary",
        null,
        `Plans left off this chart (${excluded.length}) — free, $0, or not a monthly number`
      ),
      excluded.length
        ? h(
            "ul",
            null,
            excluded.map((item) => h("li", null, `${item.competitor} ${item.plan} — ${item.raw}`))
          )
        : h("p", null, "Every plan had a paid numeric monthly price.")
    )
  );

  mount.replaceChildren(card);
}

function freeLimits(plans) {
  const freePlan = plans.find((plan) => {
    const raw = String(plan["Monthly / seat"] || "").trim().toLowerCase();
    return raw === "free" || parseMoney(plan["Monthly / seat"]) === 0;
  });
  const source = freePlan || plans.find((plan) => plan["Free plan limits"]);
  return source ? source["Free plan limits"] : "";
}

function renderLimits(text) {
  const items = splitList(text);
  if (!items.length) return h("p", null, "No free-plan limits published.");
  if (items.length === 1) return h("p", null, items[0]);
  return h(
    "ul",
    null,
    items.map((item) => h("li", null, item))
  );
}

function renderCards(groups) {
  const mount = document.getElementById("plan-grid");
  if (!groups.length) {
    mount.replaceChildren(h("p", { class: "loading" }, "No plans were published."));
    return;
  }
  mount.replaceChildren(
    groups.map((group) => {
      const dates = [...new Set(group.plans.map((plan) => plan.Date).filter(Boolean))];
      const sources = [];
      const seen = new Set();
      for (const plan of group.plans) {
        const url = safeUrl(plan.Source);
        if (url && !seen.has(url)) {
          seen.add(url);
          sources.push(url);
        }
      }
      const noted = group.plans.filter((plan) => plan.Notes);
      const meta = h(
        "p",
        { class: "card-meta" },
        dates.length ? `Collected ${dates.map(formatSheetDate).join(", ")}` : "Collection date not set"
      );
      if (sources.length) {
        meta.append(document.createTextNode(" · "));
        sources.forEach((url, index) => {
          if (index) meta.append(document.createTextNode(", "));
          meta.append(externalLink(url, shortUrl(url)));
        });
      }
      return h(
        "article",
        { class: "plan-card", style: `--swatch:${colorFor(group.name)}`, "data-competitor": group.name },
        h(
          "h3",
          { class: "card-title" },
          h("span", { class: "swatch" }),
          group.name
        ),
        meta,
        h("div", { class: "limits" }, h("h4", null, "Free plan limits"), renderLimits(freeLimits(group.plans))),
        h(
          "ol",
          { class: "plan-list" },
          h(
            "li",
            { class: "plan-head", "aria-hidden": "true" },
            h("span", null, "Plan"),
            h("span", null, "Monthly / seat"),
            h("span", null, "Annual / seat")
          ),
          group.plans.map((plan) =>
            h(
              "li",
              null,
              h("span", { class: "pn" }, plan.Plan),
              h(
                "span",
                { class: "pv" },
                h("span", { class: "plabel" }, "Monthly / seat "),
                h("b", null, plan["Monthly / seat"] || "—")
              ),
              h(
                "span",
                { class: "pv" },
                h("span", { class: "plabel" }, "Annual / seat "),
                h("b", null, plan["Annual / seat"] || "—")
              )
            )
          )
        ),
        noted.length
          ? h(
              "details",
              { class: "notes" },
              h("summary", null, "Collector notes"),
              h(
                "ul",
                null,
                noted.map((plan) => h("li", null, `${plan.Plan}. ${plan.Notes}`))
              )
            )
          : null
      );
    })
  );
}

function renderFeatures(groups) {
  const mount = document.getElementById("feature-grid");
  const featureRows = groups.flatMap((group) =>
    group.plans.map((plan) => ({
      competitor: group.name,
      plan: plan.Plan,
      features: splitList(plan["Top 3 features"]),
    }))
  );
  if (!featureRows.length) {
    mount.replaceChildren(h("p", { class: "loading" }, "No features were published."));
    return;
  }
  const columns = Math.max(1, ...featureRows.map((row) => row.features.length));
  mount.style.setProperty("--feat-cols", String(columns));
  const head = h(
    "div",
    { class: "grid-head", "aria-hidden": "true" },
    h("span", null, "Plan"),
    ...Array.from({ length: columns }, (_, index) => h("span", null, `Feature ${index + 1}`))
  );
  const blocks = [];
  for (const group of groups) {
    const rows = featureRows.filter((row) => row.competitor === group.name);
    blocks.push(
      h(
        "section",
        { class: "comp-block", style: `--swatch:${colorFor(group.name)}` },
        h(
          "h3",
          { class: "comp-label" },
          h("span", { class: "swatch" }),
          group.name
        ),
        rows.map((row) =>
          h(
            "div",
            { class: "pf-row", "data-plan": `${row.competitor} ${row.plan}` },
            h("h4", { class: "plan-name" }, row.plan),
            row.features.map((feature, index) =>
              h("p", { class: "feat" }, h("span", { class: "n" }, String(index + 1)), h("span", null, feature))
            )
          )
        )
      )
    );
  }
  mount.replaceChildren(head, ...blocks);
}

function latestSheetDate(groups) {
  let best = "";
  let bestValue = -1;
  for (const group of groups) {
    for (const plan of group.plans) {
      const value = dateSortValue(plan.Date);
      if (value >= bestValue) {
        bestValue = value;
        best = plan.Date;
      }
    }
  }
  return best;
}

function showMountError(id, error) {
  const mount = document.getElementById(id);
  mount.replaceChildren(
    h(
      "p",
      { class: "error", role: "alert" },
      `${error.message}. If this is a CORS block, proxy the published CSV and update the URL in app.js.`
    )
  );
}

let loading = false;

async function fetchCSV(url) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Sheet request failed (${response.status})`);
  return parseCSV(await response.text());
}

async function load() {
  if (loading || typeof document === "undefined") return;
  loading = true;
  const button = document.getElementById("reload");
  const status = document.getElementById("status");
  button.disabled = true;
  status.classList.remove("is-error");
  status.textContent = "Fetching the sheets…";

  const [plansResult, changesResult] = await Promise.allSettled([
    fetchCSV(PLANS_URL),
    fetchCSV(CHANGES_URL),
  ]);

  if (changesResult.status === "fulfilled") {
    try {
      assertColumns(changesResult.value, CHANGE_COLUMNS, "Recent changes");
      renderFeed(changesResult.value);
    } catch (error) {
      showMountError("feed", error);
      document.getElementById("notes").replaceChildren();
    }
  } else {
    showMountError("feed", changesResult.reason);
    document.getElementById("notes").replaceChildren();
  }

  if (plansResult.status === "fulfilled") {
    try {
      assertColumns(plansResult.value, PLAN_COLUMNS, "Plans");
      const groups = groupPlans(plansResult.value);
      renderChart(groups);
      renderCards(groups);
      renderFeatures(groups);
    } catch (error) {
      showMountError("chart", error);
      showMountError("plan-grid", error);
      showMountError("feature-grid", error);
    }
  } else {
    showMountError("chart", plansResult.reason);
    showMountError("plan-grid", plansResult.reason);
    showMountError("feature-grid", plansResult.reason);
  }

  const fetched = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (plansResult.status === "fulfilled" && changesResult.status === "fulfilled") {
    let sheetDate = "";
    try {
      sheetDate = formatSheetDate(latestSheetDate(groupPlans(plansResult.value)));
    } catch {
      sheetDate = "";
    }
    status.textContent = sheetDate
      ? `Pricing sheet dated ${sheetDate}. Fetched ${fetched}.`
      : `Fetched ${fetched}.`;
  } else {
    status.classList.add("is-error");
    status.textContent = `Some sheet data did not load (${fetched}). The sections below show the error.`;
  }

  loading = false;
  button.disabled = false;
}

function init() {
  document.getElementById("plans-link").href = PLANS_URL;
  document.getElementById("changes-link").href = CHANGES_URL;
  document.getElementById("reload").addEventListener("click", () => {
    load();
  });
  load();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseCSV,
    splitList,
    parseMoney,
    paidMonthly,
    formatUsd,
    roundCents,
    groupPlans,
    splitChanges,
    buildChartModel,
    TEAM_SIZE,
  };
}
