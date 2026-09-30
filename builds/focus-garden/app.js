/* Focus Garden timer.
   Progress (0–1) is published as --focus-progress and window.FocusGarden.setProgress.
   Completion dispatches a bubbling "focus-complete" CustomEvent on document.
   The scene helper maps that progress onto plant stage, visiting critters, and the sun. */
(function () {
  const PHASE_COPY = {
    idle: "Ready",
    running: "In session",
    paused: "Paused",
    complete: "Session complete",
  };

  const SETTLE_MS = 680;

  const els = {};
  let phase = "idle";
  let selectedMinutes = 25;
  let totalMs = selectedMinutes * 60 * 1000;
  let remainingMs = totalMs;
  let progress = 0;
  let endAt = 0;
  let rafId = 0;
  let timeoutId = 0;
  let visualRaf = 0;
  let visual = 0;
  let pendingCelebrate = false;
  let lastText = "";
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function formatUnit(value) {
    if (value >= 1) return "1";
    if (value <= 0) return "0";
    return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }

  function formatRemaining(ms) {
    const clamped = Math.max(0, ms);
    const totalSeconds = Math.ceil(clamped / 1000 - 1e-6);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return {
      text: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      minutes,
      seconds,
    };
  }

  const STAGE_CAPTION = {
    seed: "A seed rests in the soil.",
    sprout: "A sprout breaks the soil.",
    leaves: "Leaves open on a small stem.",
    tall: "The plant grows taller.",
    bloom: "The plant is in full bloom.",
  };

  const CRITTER_CAPTION = {
    beetle: "A beetle visits.",
    snail: "A snail crosses the soil.",
    butterfly: "A butterfly arrives.",
    bird: "A bird settles nearby.",
    firefly: "Fireflies glow.",
  };

  function stageFor(value) {
    if (value < 0.15) return "seed";
    if (value < 0.35) return "sprout";
    if (value < 0.55) return "leaves";
    if (value < 0.75) return "tall";
    return "bloom";
  }

  function crittersFor(value) {
    const critters = [];
    if (value >= 0.2) critters.push("beetle");
    if (value >= 0.4) critters.push("snail");
    if (value >= 0.6) critters.push("butterfly");
    if (value >= 0.8) critters.push("bird");
    if (value >= 0.96) critters.push("firefly");
    return critters;
  }

  function sceneCaption(stage, critters) {
    const line = STAGE_CAPTION[stage] || STAGE_CAPTION.seed;
    const newest = critters.length ? CRITTER_CAPTION[critters[critters.length - 1]] : "";
    const picture = newest ? `${line} ${newest}` : line;
    if (phase === "complete") return `Session complete. ${picture}`;
    return picture;
  }

  function refreshCaption() {
    if (!els.scene || !els.sceneStatus) return;
    const stage = els.scene.dataset.stage || "seed";
    const critters = (els.scene.dataset.critters || "").split(" ").filter(Boolean);
    const caption = sceneCaption(stage, critters);
    if (els.sceneStatus.textContent !== caption) els.sceneStatus.textContent = caption;
  }

  function placeSun(value) {
    if (!els.sun) return;
    const lift = Math.sin(value * Math.PI);
    const x = 108 + value * 424;
    const y = 172 - lift * 104;
    const scale = 1.12 - lift * 0.2;
    els.sun.setAttribute(
      "transform",
      `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})`
    );
  }

  function syncScene(value, announce) {
    placeSun(value);
    if (!els.scene) return;
    const stage = stageFor(value);
    const critters = crittersFor(value);
    const critterKey = critters.join(" ");
    if (els.scene.dataset.stage !== stage) els.scene.dataset.stage = stage;
    if ((els.scene.dataset.critters || "") !== critterKey) {
      els.scene.dataset.critters = critterKey;
    }
    const arrived = value >= 0.997 && progress >= 1;
    if (arrived && pendingCelebrate) playCelebrate();
    else els.scene.classList.toggle("is-complete", arrived);
    if (announce === false || !els.sceneStatus) return;
    const caption = sceneCaption(stage, critters);
    if (els.sceneStatus.textContent !== caption) {
      els.sceneStatus.textContent = caption;
    }
  }

  function playCelebrate() {
    pendingCelebrate = false;
    if (!els.scene) return;
    els.scene.classList.remove("is-complete");
    void els.scene.offsetWidth;
    els.scene.classList.add("is-complete");
    if (phase === "complete" && els.reset) els.reset.focus();
  }

  function celebrateScene() {
    if (!els.scene || progress < 1) return;
    pendingCelebrate = true;
    if (!visualRaf) playCelebrate();
  }

  function cancelVisual() {
    if (visualRaf) cancelAnimationFrame(visualRaf);
    visualRaf = 0;
  }

  function paint(value, announce) {
    visual = value;
    const cssValue = formatUnit(value);
    document.documentElement.style.setProperty("--focus-progress", cssValue);
    if (els.scene) els.scene.style.setProperty("--focus-progress", cssValue);
    syncScene(value, announce);
  }

  function animateVisual(target) {
    cancelVisual();
    const from = visual;
    if (Math.abs(from - target) < 0.0015) {
      paint(target, true);
      return;
    }
    const started = performance.now();
    const step = (now) => {
      if (phase === "running") {
        visualRaf = 0;
        paint(progress, true);
        return;
      }
      const t = Math.min(1, (now - started) / SETTLE_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        paint(from + (target - from) * eased, false);
        visualRaf = requestAnimationFrame(step);
        return;
      }
      visualRaf = 0;
      paint(target, true);
    };
    visualRaf = requestAnimationFrame(step);
  }

  function setProgress(p) {
    const value = Number(p);
    const next = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    progress = next;
    if (next < 1) pendingCelebrate = false;
    const logical = formatUnit(next);
    document.documentElement.dataset.focusProgress = logical;
    if (els.scene) els.scene.dataset.progress = logical;
    if (els.track) {
      els.track.setAttribute("aria-valuenow", String(Math.round(next * 100)));
    }
    // A running session paints the true ratio every frame. Idle jumps ease in.
    if (phase === "running" || reduceMotionQuery.matches) {
      cancelVisual();
      paint(next, true);
      return;
    }
    animateVisual(next);
  }

  function renderClock() {
    const formatted = formatRemaining(remainingMs);
    if (formatted.text === lastText) return;
    lastText = formatted.text;
    els.time.textContent = formatted.text;
    els.time.dateTime = `PT${formatted.minutes}M${formatted.seconds}S`;
  }

  function render() {
    renderClock();
    const running = phase === "running";
    els.toggleLabel.textContent = running ? "Pause" : "Start";
    els.toggle.setAttribute("aria-pressed", running ? "true" : "false");
    els.toggle.disabled = phase === "complete";
    // SVG elements do not reflect the HTMLElement.hidden IDL property.
    els.iconPlay.toggleAttribute("hidden", running);
    els.iconPause.toggleAttribute("hidden", !running);

    const locked = phase !== "idle";
    els.durationInputs.forEach((input) => {
      input.disabled = locked;
    });
    els.durations.classList.toggle("is-locked", locked);
    els.durations.setAttribute("aria-disabled", locked ? "true" : "false");

    const copy = PHASE_COPY[phase];
    if (els.status.textContent !== copy) els.status.textContent = copy;
    els.app.dataset.phase = phase;
    refreshCaption();
  }

  function clearTimers() {
    if (rafId) cancelAnimationFrame(rafId);
    if (timeoutId) clearTimeout(timeoutId);
    rafId = 0;
    timeoutId = 0;
  }

  function finish() {
    if (phase === "complete") return;
    phase = "complete";
    remainingMs = 0;
    clearTimers();
    window.FocusGarden.setProgress(1);
    render();
    document.dispatchEvent(
      new CustomEvent("focus-complete", {
        bubbles: true,
        detail: { minutes: selectedMinutes },
      })
    );
  }

  function tick() {
    if (phase !== "running") return;
    remainingMs = Math.max(0, endAt - performance.now());
    const ratio = totalMs <= 0 ? 1 : 1 - remainingMs / totalMs;
    window.FocusGarden.setProgress(ratio);
    renderClock();
    if (remainingMs <= 0) {
      finish();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (phase === "running" || phase === "complete") return;
    phase = "running";
    cancelVisual();
    paint(progress, true);
    endAt = performance.now() + remainingMs;
    clearTimers();
    timeoutId = window.setTimeout(finish, Math.max(0, remainingMs));
    rafId = requestAnimationFrame(tick);
    render();
  }

  function pause() {
    if (phase !== "running") return;
    remainingMs = Math.max(0, endAt - performance.now());
    phase = "paused";
    clearTimers();
    const ratio = totalMs <= 0 ? 1 : 1 - remainingMs / totalMs;
    window.FocusGarden.setProgress(ratio);
    render();
  }

  function reset() {
    clearTimers();
    phase = "idle";
    pendingCelebrate = false;
    totalMs = selectedMinutes * 60 * 1000;
    remainingMs = totalMs;
    window.FocusGarden.setProgress(0);
    render();
  }

  function applyMinutes(minutes) {
    if (phase !== "idle") return;
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    selectedMinutes = minutes;
    totalMs = minutes * 60 * 1000;
    remainingMs = totalMs;
    window.FocusGarden.setProgress(0);
    render();
  }

  function init() {
    els.app = document.getElementById("app");
    els.scene = document.getElementById("scene");
    els.sceneStatus = document.getElementById("scene-status");
    els.sun = document.querySelector("#scene .sun");
    els.time = document.getElementById("time");
    els.track = document.getElementById("track");
    els.durations = document.getElementById("durations");
    els.toggle = document.getElementById("toggle");
    els.toggleLabel = document.getElementById("toggle-label");
    els.iconPlay = document.getElementById("icon-play");
    els.iconPause = document.getElementById("icon-pause");
    els.reset = document.getElementById("reset");
    els.status = document.getElementById("status");
    els.durationInputs = Array.from(document.querySelectorAll('input[name="minutes"]'));

    window.FocusGarden = {
      setProgress,
      getProgress() {
        return progress;
      },
    };

    const checked = els.durationInputs.find((input) => input.checked);
    const initial = checked ? Number(checked.value) : 25;
    applyMinutes(Number.isFinite(initial) && initial > 0 ? initial : 25);

    els.toggle.addEventListener("click", () => {
      if (phase === "running") pause();
      else start();
    });
    els.reset.addEventListener("click", reset);
    els.durations.addEventListener("change", (event) => {
      const target = event.target;
      if (!target || target.name !== "minutes") return;
      applyMinutes(Number(target.value));
    });

    document.addEventListener("focus-complete", celebrateScene);

    document.addEventListener("visibilitychange", () => {
      if (phase !== "running") return;
      remainingMs = Math.max(0, endAt - performance.now());
      if (remainingMs <= 0) {
        finish();
        return;
      }
      window.FocusGarden.setProgress(1 - remainingMs / totalMs);
      renderClock();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
