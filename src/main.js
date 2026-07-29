import "./widget.css";
import "./increment-event-compact.css";
import "./glass-theme.css";
import "./countdown.css";
import { fetchFollowerCount } from "./api.js";
import {
  calculateCountdownState,
  calculateIncrementSeconds,
  calculateRingFit,
  DEFAULT_COUNTDOWN_PREVIEW_LEAD_SECONDS,
  formatClockTime,
  formatDurationParts,
  formatDurationSeconds,
  getCountdownDisplayPhase,
  getCountdownPreviewNowMs,
  getCountdownTickDelay,
  getChangedDurationUnits,
  parseWidgetConfig,
} from "./ringfit.js";

const widget = document.querySelector(".ringfit-widget");
const followerCountElement = document.querySelector("[data-follower-count]");
const previousFollowerCountElement = document.querySelector(
  "[data-follower-previous]",
);
const followerLabelElement = document.querySelector("[data-follower-label]");
const baselineElement = document.querySelector("[data-baseline]");
const actionTextElement = document.querySelector("[data-action-text]");
const resultLabelElement = document.querySelector("[data-result-label]");
const eventLabelElement = document.querySelector("[data-event-label]");
const totalDurationElement = document.querySelector("[data-total-duration]");
const incrementEventElement = document.querySelector("[data-increment-event]");
const incrementDurationElement = document.querySelector(
  "[data-increment-duration]",
);
const endingClockElement = document.querySelector("[data-ending-clock]");
const endLabelElement = document.querySelector("[data-end-label]");
const endingTimeElement = document.querySelector("[data-ending-time]");
const previousEndingTimeElement = document.querySelector(
  "[data-ending-time-previous]",
);

const config = parseWidgetConfig(window.location.search);
const environmentApiBase =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";
const apiBase = config.apiBase || environmentApiBase;
const numberFormatter = new Intl.NumberFormat("ko-KR");
const isCountdownMode = config.mode === "countdown";
const runtimeStartAtMs = config.startAtMs ?? Date.now();
const isCountdownPreview =
  isCountdownMode && config.previewFollowers !== null;
const countdownPreviewLoadedAtMs = Date.now();
const countdownStorageKey = [
  "eureka-ringfit-countdown",
  config.channelId,
  config.sessionId,
  runtimeStartAtMs,
].join(":");

let refreshTimer;
let countdownTimer;
let incrementEventTimer;
let gainAnimationTimer;
let previewAnimationTimer;
let countdownExitTimer;
let countdownResumeTimer;
let activeRequest;
let hasRenderedData = false;
let hasPlayedPreviewAnimation = false;
let previousFollowerCount = null;
let previousTotalSeconds = null;
let currentFollowerCount = null;
let highestFollowerCount = null;
let countdownEnded = false;
let countdownDisplayLocked = false;

function getCountdownNowMs() {
  if (!isCountdownPreview) {
    return Date.now();
  }

  return getCountdownPreviewNowMs({
    loadedAtMs: countdownPreviewLoadedAtMs,
    nowMs: Date.now(),
    startAtMs: runtimeStartAtMs,
  });
}

function loadCountdownSession() {
  if (!isCountdownMode || config.previewFollowers !== null) {
    return;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(countdownStorageKey) ?? "null");
    if (saved && Number.isFinite(saved.highestFollowerCount)) {
      highestFollowerCount = Math.max(
        config.initialFollowers,
        Math.trunc(saved.highestFollowerCount),
      );
      countdownEnded = Boolean(saved.ended);
    }
  } catch {
    // A blocked or malformed localStorage entry must not stop the OBS widget.
  }
}

function saveCountdownSession() {
  if (
    !isCountdownMode ||
    config.previewFollowers !== null ||
    highestFollowerCount === null
  ) {
    return;
  }

  try {
    localStorage.setItem(
      countdownStorageKey,
      JSON.stringify({
        ended: countdownEnded,
        highestFollowerCount,
      }),
    );
  } catch {
    // The absolute start time still keeps the timer accurate without storage.
  }
}

loadCountdownSession();

widget.dataset.mode = config.mode;
widget.dataset.theme = config.theme;
document.documentElement.style.setProperty(
  "--widget-width",
  `${config.widgetWidth}px`,
);
document.documentElement.style.setProperty(
  "--widget-height",
  `${config.widgetHeight}px`,
);
document.documentElement.style.setProperty(
  "--main-font-size",
  `${config.fontSize}px`,
);
for (const [property, value] of [
  ["--follower-label-font-size", config.followerLabelSize],
  ["--follower-count-font-size", config.followerCountSize],
  ["--baseline-font-size", config.baselineSize],
  ["--action-font-size", config.actionSize],
  ["--total-font-size", config.totalSize],
  ["--event-label-font-size", config.eventLabelSize],
  ["--event-value-font-size", config.eventValueSize],
]) {
  document.documentElement.style.setProperty(property, `${value}px`);
}

followerLabelElement.textContent = config.followerLabel;
actionTextElement.textContent = config.actionText;
resultLabelElement.textContent = config.resultLabel;
eventLabelElement.textContent = config.eventLabel;
endLabelElement.textContent = config.endLabel;
endingClockElement.hidden = !isCountdownMode;
baselineElement.textContent = config.baselineText.replaceAll(
  "{initial}",
  numberFormatter.format(config.initialFollowers),
);

function renderFollowerMetric(followerCount) {
  previousFollowerCountElement.textContent = followerCountElement.textContent;
  followerCountElement.textContent = numberFormatter.format(followerCount);
}

function createDurationUnit(part) {
  const unitElement = document.createElement("span");
  unitElement.className = "duration-unit";
  unitElement.dataset.unit = part.unit;
  unitElement.textContent = part.label;
  return unitElement;
}

function renderTotalDuration(totalSeconds, { highlight = "auto" } = {}) {
  delete totalDurationElement.dataset.announcement;
  const parts = formatDurationParts(totalSeconds);
  const changedUnits = new Set(
    highlight === "gain"
      ? parts.map((part) => part.unit)
      : highlight === "none"
        ? []
        : getChangedDurationUnits(previousTotalSeconds, totalSeconds),
  );
  const fragment = document.createDocumentFragment();
  const hasActiveChangeGroup = totalDurationElement.querySelector(
    "mark.duration-change",
  );

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!changedUnits.has(part.unit)) {
      fragment.append(createDurationUnit(part));
      continue;
    }

    const changeGroup = document.createElement("mark");
    changeGroup.className = "duration-change";
    changeGroup.append(createDurationUnit(part));

    while (
      index + 1 < parts.length &&
      changedUnits.has(parts[index + 1].unit)
    ) {
      index += 1;
      changeGroup.append(createDurationUnit(parts[index]));
    }
    fragment.append(changeGroup);
  }

  if (
    highlight === "auto" &&
    changedUnits.size === 0 &&
    hasActiveChangeGroup
  ) {
    previousTotalSeconds = totalSeconds;
    return;
  }

  totalDurationElement.replaceChildren(fragment);
  previousTotalSeconds = totalSeconds;
}

function renderCountdownAnnouncement(text) {
  if (totalDurationElement.dataset.announcement === text) {
    return;
  }

  const cue = document.createElement("mark");
  cue.className = "countdown-start-cue";
  const cueText = document.createElement("span");
  cueText.textContent = text;
  cue.append(cueText);
  totalDurationElement.replaceChildren(cue);
  totalDurationElement.dataset.announcement = text;
  previousTotalSeconds = null;
}

function renderEndingTime(endAtMs) {
  const nextEndingTime = formatClockTime(endAtMs, {
    referenceTimestampMs: runtimeStartAtMs,
  });
  if (endingTimeElement.textContent === nextEndingTime) {
    return;
  }

  previousEndingTimeElement.textContent = endingTimeElement.textContent;
  endingTimeElement.textContent = nextEndingTime;
}

function getCountdownState(nowMs = getCountdownNowMs()) {
  const effectiveFollowerCount = Math.max(
    config.initialFollowers,
    highestFollowerCount ?? currentFollowerCount ?? config.initialFollowers,
  );

  return calculateCountdownState({
    followerCount: effectiveFollowerCount,
    initialFollowers: config.initialFollowers,
    minutesPerFollower: config.minutesPerFollower,
    nowMs,
    startAtMs: runtimeStartAtMs,
  });
}

function renderCountdown({
  highlightGain = false,
  nowMs = getCountdownNowMs(),
} = {}) {
  const state = getCountdownState(nowMs);
  const displayPhase = getCountdownDisplayPhase({
    hasEnded: countdownEnded || state.hasEnded,
    nowMs,
    startAtMs: runtimeStartAtMs,
  });
  const remainingSeconds = countdownEnded ? 0 : state.remainingSeconds;

  renderEndingTime(state.endAtMs);
  widget.dataset.countdownState = displayPhase.phase;

  if (displayPhase.phase === "count-in") {
    renderCountdownAnnouncement(`${displayPhase.cueSeconds}초`);
    actionTextElement.textContent = config.actionText;
  } else if (displayPhase.phase === "starting") {
    renderCountdownAnnouncement(config.startText);
    actionTextElement.textContent = config.actionText;
  } else {
    renderTotalDuration(remainingSeconds, {
      highlight: highlightGain ? "gain" : "none",
    });
  }

  if (displayPhase.phase === "waiting") {
    actionTextElement.textContent = `${config.waitingText} · ${config.actionText}`;
  } else if (displayPhase.phase === "ended") {
    actionTextElement.textContent = config.endedText;
    if (!countdownEnded) {
      countdownEnded = true;
      saveCountdownSession();
    }
  } else if (displayPhase.phase === "running") {
    actionTextElement.textContent = config.actionText;
  }
}

function renderFollowerCount(
  followerCount,
  {
    highlightGain = false,
    nowMs = isCountdownMode ? getCountdownNowMs() : Date.now(),
  } = {},
) {
  const result = calculateRingFit(
    followerCount,
    config.initialFollowers,
    config.minutesPerFollower,
  );

  currentFollowerCount = result.followerCount;
  renderFollowerMetric(result.followerCount);
  if (isCountdownMode) {
    renderCountdown({ highlightGain, nowMs });
  } else {
    renderTotalDuration(result.minutes * 60);
  }

  widget.dataset.state = "ready";
  widget.removeAttribute("title");
  hasRenderedData = true;

  return result;
}

function resetCountdownGainPresentation() {
  clearTimeout(countdownExitTimer);
  clearTimeout(countdownResumeTimer);
  countdownDisplayLocked = false;
  widget.classList.remove("is-countdown-gain", "is-countdown-gain-exit");
}

function hideIncrementEvent() {
  clearTimeout(incrementEventTimer);
  clearTimeout(gainAnimationTimer);
  incrementEventElement.classList.remove("is-visible");
  incrementEventElement.hidden = true;
  widget.classList.remove("has-increment", "is-gain-update");
}

function beginCountdownGainPresentation() {
  resetCountdownGainPresentation();
  countdownDisplayLocked = true;
  widget.classList.add("is-countdown-gain");

  countdownExitTimer = window.setTimeout(() => {
    widget.classList.add("is-countdown-gain-exit");
  }, 1_500);

  countdownResumeTimer = window.setTimeout(() => {
    countdownDisplayLocked = false;
    widget.classList.remove("is-countdown-gain", "is-countdown-gain-exit");
    renderCountdown();
  }, 1_860);
}

function playPreviewAnimation() {
  const previousPreviewFollowers = Math.max(
    config.initialFollowers,
    config.previewFollowers - config.previewEventDelta,
  );

  hideIncrementEvent();
  resetCountdownGainPresentation();
  highestFollowerCount = previousPreviewFollowers;
  countdownEnded = false;
  renderFollowerCount(previousPreviewFollowers, {
    nowMs: isCountdownMode ? getCountdownNowMs() : Date.now(),
  });
  previousFollowerCount = previousPreviewFollowers;

  clearTimeout(previewAnimationTimer);
  const previewGainDelay =
    650 +
    (isCountdownMode
      ? DEFAULT_COUNTDOWN_PREVIEW_LEAD_SECONDS * 1000
      : 0);
  previewAnimationTimer = window.setTimeout(() => {
    highestFollowerCount = Math.max(
      highestFollowerCount,
      config.previewFollowers,
    );
    renderFollowerCount(config.previewFollowers, {
      highlightGain: isCountdownMode,
      nowMs: isCountdownMode ? getCountdownNowMs() : Date.now(),
    });
    showIncrementEvent(config.previewEventDelta);
    previousFollowerCount = config.previewFollowers;
  }, previewGainDelay);
}

function playGainAnimation(duration = 820) {
  clearTimeout(gainAnimationTimer);
  widget.classList.remove("is-gain-update");
  void widget.offsetWidth;
  widget.classList.add("is-gain-update");

  gainAnimationTimer = window.setTimeout(() => {
    widget.classList.remove("is-gain-update");
  }, duration);
}

function showIncrementEvent(gainedFollowers) {
  const gainedSeconds = calculateIncrementSeconds(
    gainedFollowers,
    config.minutesPerFollower,
  );
  if (gainedSeconds <= 0) {
    return;
  }

  incrementDurationElement.textContent = formatDurationSeconds(gainedSeconds);
  incrementEventElement.hidden = false;
  widget.classList.add("has-increment");
  incrementEventElement.classList.remove("is-visible");
  if (isCountdownMode) {
    beginCountdownGainPresentation();
  }
  playGainAnimation(isCountdownMode ? 1_150 : 820);
  incrementEventElement.classList.add("is-visible");

  clearTimeout(incrementEventTimer);
  incrementEventTimer = window.setTimeout(hideIncrementEvent, 2_200);
}

function renderError(error) {
  widget.dataset.state = hasRenderedData ? "stale" : "error";
  widget.title = error.message;

  if (!hasRenderedData) {
    followerCountElement.textContent = "연결X";
    totalDurationElement.textContent = "—";
    endingTimeElement.textContent = "—";
    hideIncrementEvent();
  }
}

function processFollowerCount(followerCount) {
  let gainedFollowers = 0;

  if (isCountdownMode) {
    const previousHighWater =
      highestFollowerCount ?? Math.max(config.initialFollowers, followerCount);
    if (!countdownEnded && followerCount > previousHighWater) {
      gainedFollowers = followerCount - previousHighWater;
    }
    if (!countdownEnded) {
      highestFollowerCount = Math.max(previousHighWater, followerCount);
      saveCountdownSession();
    }
  } else if (
    previousFollowerCount !== null &&
    followerCount > previousFollowerCount
  ) {
    gainedFollowers = followerCount - previousFollowerCount;
  }

  renderFollowerCount(followerCount, {
    highlightGain: isCountdownMode && gainedFollowers > 0,
  });

  if (gainedFollowers > 0) {
    showIncrementEvent(gainedFollowers);
  }
  previousFollowerCount = followerCount;
}

async function refresh() {
  if (document.hidden && hasRenderedData) {
    scheduleRefresh();
    return;
  }

  activeRequest?.abort();
  activeRequest = new AbortController();
  widget.dataset.state = hasRenderedData ? "refreshing" : "loading";

  try {
    if (config.previewFollowers !== null) {
      if (config.previewEventDelta > 0 && !hasPlayedPreviewAnimation) {
        hasPlayedPreviewAnimation = true;
        playPreviewAnimation();
      } else {
        processFollowerCount(config.previewFollowers);
      }
      return;
    }

    const followerCount = await fetchFollowerCount(
      apiBase,
      config.channelId,
      activeRequest.signal,
    );
    processFollowerCount(followerCount);
  } catch (error) {
    if (error.name !== "AbortError") {
      renderError(error);
    }
  } finally {
    scheduleRefresh();
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refresh, config.refreshSeconds * 1000);
}

function scheduleCountdownTick() {
  clearTimeout(countdownTimer);
  if (!isCountdownMode) {
    return;
  }

  const delay = getCountdownTickDelay({
    nowMs: getCountdownNowMs(),
    startAtMs: runtimeStartAtMs,
  });
  countdownTimer = window.setTimeout(() => {
    if (
      hasRenderedData &&
      currentFollowerCount !== null &&
      !countdownDisplayLocked
    ) {
      renderCountdown();
    }
    scheduleCountdownTick();
  }, delay);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
    if (isCountdownMode && !countdownDisplayLocked) {
      renderCountdown();
    }
  }
});

scheduleCountdownTick();
refresh();
