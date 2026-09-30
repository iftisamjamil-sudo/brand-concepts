/* Focus Garden timer.
   Progress (0–1) is published as --focus-progress and window.FocusGarden.setProgress.
   Completion dispatches a bubbling "focus-complete" CustomEvent on document. */
(function () {
  const PHASE_COPY = {
    idle: "Ready",
    running: "In session",
    paused: "Paused",
    complete: "Session complete",
  };

  const els = {};
  let phase = "idle";
  let selectedMinutes = 25;
  let totalMs = selectedMinutes * 60 * 1000;
  let remainingMs = totalMs;
  let progress = 0;
  let endAt = 0;
  let rafId = 0;
  let timeoutId = 0;
  let lastText = "";

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

  function setProgress(p) {
    const value = Number(p);
    const next = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    progress = next;
    const cssValue = formatUnit(next);
    document.documentElement.style.setProperty("--focus-progress", cssValue);
    document.documentElement.dataset.focusProgress = cssValue;
    if (els.scene) {
      els.scene.style.setProperty("--focus-progress", cssValue);
      els.scene.dataset.progress = cssValue;
    }
    if (els.track) {
      els.track.setAttribute("aria-valuenow", String(Math.round(next * 100)));
    }
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
