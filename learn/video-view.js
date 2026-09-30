import { verdictTone, youtubeAt } from "./csv.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sectionTitle(text) {
  return el("h2", "section-title", text);
}

export function renderVideoPage(root, video) {
  root.replaceChildren();

  if (!video) {
    const panel = el("div", "panel");
    panel.append(el("p", "eyebrow", "Missing"));
    panel.append(el("h2", null, "That digest isn’t in the sheet"));
    panel.append(el("p", null, "It may have been removed, or the link doesn’t match a video id."));
    const back = el("a", "button", "Back to the library");
    back.href = "/learn/";
    panel.append(back);
    root.append(panel);
    return;
  }

  const article = el("article", "digest");

  const hero = el("header", "detail-hero");
  const frame = el("div", "thumb detail-thumb");
  if (video.thumbnailUrl) {
    const img = document.createElement("img");
    img.src = video.thumbnailUrl;
    img.alt = "";
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
  hero.append(frame);

  const intro = el("div", "detail-intro");
  const meta = el("p", "meta");
  [video.channel, video.length, video.digestDate].filter(Boolean).forEach((bit, index) => {
    if (index) meta.append(el("span", "dot", "·"));
    meta.append(document.createTextNode(bit));
  });
  if (meta.childNodes.length) intro.append(meta);

  intro.append(el("h1", null, video.title || "Untitled video"));

  if (video.verdict || video.worthWatching) {
    const row = el("div", "verdict-row");
    if (video.verdict) row.append(el("span", `verdict tone-${verdictTone(video.verdict)}`, video.verdict));
    if (video.worthWatching) row.append(el("span", "worth-flag inline", "Worth watching"));
    intro.append(row);
  }
  if (video.verdictReason) intro.append(el("p", "reason", video.verdictReason));

  if (video.url) {
    const watch = el("a", "button", "Watch on YouTube");
    watch.href = video.url;
    watch.target = "_blank";
    watch.rel = "noopener noreferrer";
    intro.append(watch);
  }
  hero.append(intro);
  article.append(hero);

  const summary = el("section", "block");
  summary.append(sectionTitle("Summary"));
  if (video.summaryBullets.length) {
    const list = el("ul", "bullets");
    video.summaryBullets.forEach((bullet) => list.append(el("li", null, bullet)));
    summary.append(list);
  } else {
    summary.append(el("p", "quiet", "No summary on this digest."));
  }
  article.append(summary);

  const steps = el("section", "block");
  steps.append(sectionTitle("Key steps"));
  if (video.steps.length) {
    const list = el("ol", "steps");
    video.steps.forEach((step) => {
      const item = el("li");
      const href = youtubeAt(video.videoId, step.seconds);
      if (href) {
        const link = document.createElement("a");
        link.className = "step";
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(el("span", "step-time", step.displayTime));
        const label = el("span", "step-label");
        label.append(document.createTextNode(step.label));
        label.append(el("span", "sr-only", ` Opens YouTube at ${step.seconds} seconds.`));
        link.append(label);
        item.append(link);
      } else {
        const plain = el("div", "step step-static");
        if (step.displayTime) plain.append(el("span", "step-time", step.displayTime));
        plain.append(el("span", "step-label", step.label));
        item.append(plain);
      }
      list.append(item);
    });
    steps.append(list);
  } else {
    steps.append(el("p", "quiet", "No key steps on this digest."));
  }
  article.append(steps);

  const action = el("section", "block");
  action.append(sectionTitle("Action"));
  const callout = el("div", "action");
  callout.append(el("p", null, video.actionItem || "No action item on this digest."));
  action.append(callout);
  article.append(action);

  article.append(renderQuiz(video.quiz));
  root.append(article);
  document.title = `${video.title || "Digest"} · Brand Concepts`;
}

function renderQuiz(cards) {
  const section = el("section", "block");
  section.append(el("h2", "section-title", "Quiz"));

  if (!cards.length) {
    section.append(el("p", "quiet", "No quiz on this digest."));
    return section;
  }

  let index = 0;
  let flipped = false;

  const top = el("div", "quiz-top");
  const count = el("p", "quiz-count");
  top.append(el("p", "eyebrow", "Flashcards"));
  top.append(count);
  section.append(top);

  const scene = el("div", "flip");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "flip-hit";
  const inner = el("span", "flip-inner");
  const front = el("span", "face front");
  const back = el("span", "face back");
  const frontKicker = el("span", "face-kicker", "Question");
  const backKicker = el("span", "face-kicker", "Answer");
  const frontText = el("span", "face-text");
  const backText = el("span", "face-text");
  front.append(frontKicker, frontText);
  back.append(backKicker, backText);
  inner.append(front, back);
  button.append(inner);
  scene.append(button);
  section.append(scene);

  const hint = el("p", "quiet quiz-hint", "Tap the card to flip it.");
  section.append(hint);

  const nav = el("div", "quiz-nav");
  const prev = el("button", "button button-ghost", "Previous");
  const flipControl = el("button", "button", "Flip");
  const next = el("button", "button button-ghost", "Next");
  prev.type = "button";
  flipControl.type = "button";
  next.type = "button";
  nav.append(prev, flipControl, next);
  section.append(nav);

  function paint() {
    const card = cards[index];
    count.textContent = `${index + 1} of ${cards.length}`;
    frontText.textContent = card.question;
    backText.textContent = card.answer || "No answer on this card.";
    front.setAttribute("aria-hidden", flipped ? "true" : "false");
    back.setAttribute("aria-hidden", flipped ? "false" : "true");
    button.setAttribute("aria-pressed", flipped ? "true" : "false");
    button.setAttribute(
      "aria-label",
      flipped ? `Answer: ${backText.textContent}. Activate to show the question.` : `Question: ${card.question}. Activate to show the answer.`
    );
    scene.classList.toggle("is-flipped", flipped);
    prev.disabled = index === 0;
    next.disabled = index === cards.length - 1;
  }

  function toggle() {
    flipped = !flipped;
    paint();
  }

  button.addEventListener("click", toggle);
  flipControl.addEventListener("click", toggle);
  prev.addEventListener("click", () => {
    if (index === 0) return;
    index -= 1;
    flipped = false;
    paint();
  });
  next.addEventListener("click", () => {
    if (index === cards.length - 1) return;
    index += 1;
    flipped = false;
    paint();
  });

  section.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") next.click();
    if (event.key === "ArrowLeft") prev.click();
  });

  paint();
  return section;
}
