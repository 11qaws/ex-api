import "./widget.css";
import "./increment-event-compact.css";
import "./glass-theme.css";
import "./countdown.css";
import { fetchFollowerCount } from "./api.js";
import {
  calculateCountdownState,
  calculateIncrementSeconds,
  calculateRingFit,
  COUNTDOWN_END_PREVIEW_SECONDS,
  COUNTDOWN_FINAL_CHECK_SECONDS,
  COUNTDOWN_FIRST_REFRESH_DELAY_SECONDS,
  formatClockTime,
  formatDurationParts,
  formatDurationSeconds,
  getCountdownDisplayPhase,
  getCountdownDurationHighlight,
  getCountdownResultLabel,
  getCountdownTickDelay,
  getChangedDurationUnits,
  getNextCountdownRefreshAtMs,
  isCountdownEndCheckpoint,
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
const previewPreviousFollowers =
  config.previewFollowers === null
    ? null
    : Math.max(
        config.initialFollowers,
        config.previewFollowers - config.previewEventDelta,
      );
const previewFollowerSeconds =
  previewPreviousFollowers === null
    ? 0
    : Math.round(
        calculateRingFit(
          previewPreviousFollowers,
          config.initialFollowers,
          config.minutesPerFollower,
        ).minutes * 60,
      );
const previewBaseDurationSeconds =
  config.countdownDurationSource === "manual"
    ? config.manualDurationMinutes * 60
    : config.followerExtensionEnabled
      ? 0
      : previewFollowerSeconds;
const previewExtensionBaselineFollowers =
  config.countdownDurationSource === "manual" ||
  !config.followerExtensionEnabled
    ? previewPreviousFollowers
    : config.initialFollowers;
const previewAccruedSeconds =
  previewPreviousFollowers === null
    ? 0
    : previewBaseDurationSeconds +
      (config.followerExtensionEnabled
        ? calculateIncrementSeconds(
            Math.max(
              0,
              previewPreviousFollowers - previewExtensionBaselineFollowers,
            ),
            config.minutesPerFollower,
          )
        : 0);
const countdownPreviewBaseNowMs =
  config.previewSequence === "end"
    ? runtimeStartAtMs +
      Math.max(COUNTDOWN_END_PREVIEW_SECONDS, previewAccruedSeconds) * 1000 -
      COUNTDOWN_END_PREVIEW_SECONDS * 1000
    : runtimeStartAtMs - 60_000;
const countdownStorageKey = [
  "eureka-ringfit-countdown",
  config.channelId,
  config.sessionId,
  runtimeStartAtMs,
  config.countdownDurationSource,
  config.manualDurationMinutes,
  config.followerExtensionEnabled ? "extend" : "fixed",
].join(":");

let refreshTimer;
let countdownTimer;
let incrementEventTimer;
let gainAnimationTimer;
let previewAnimationTimer;
let countdownExitTimer;
let countdownResumeTimer;
let finalCheckTimer;
let activeRequest;
let hasRenderedData = false;
let hasPlayedPreviewAnimation = false;
let previousFollowerCount = null;
let previousTotalSeconds = null;
let currentFollowerCount = null;
let highestFollowerCount = null;
let countdownEnded = false;
let countdownDisplayLocked = false;
let finalCheckStartedAtMs = null;
let finalCheckRequestPending = false;
let gainActionOverride = "";
let lastCountdownCheckpointKey = "";
let pendingCountdownFollowerCount = null;
let countdownBaseFollowerCount = null;
let countdownBaseDurationSeconds = null;

function getCountdownNowMs() {
  if (!isCountdownPreview) {
    return Date.now();
  }

  return Math.max(
    0,
    countdownPreviewBaseNowMs + (Date.now() - countdownPreviewLoadedAtMs),
  );
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
      countdownBaseFollowerCount = Number.isFinite(saved.baseFollowerCount)
        ? Math.max(0, Math.trunc(saved.baseFollowerCount))
        : null;
      countdownBaseDurationSeconds = Number.isFinite(saved.baseDurationSeconds)
        ? Math.max(0, Math.trunc(saved.baseDurationSeconds))
        : null;
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
        baseDurationSeconds: countdownBaseDurationSeconds,
        baseFollowerCount: countdownBaseFollowerCount,
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
resultLabelElement.textContent = isCountdownMode
  ? getCountdownResultLabel({
      activeLabel: config.resultLabel,
      phase: getCountdownDisplayPhase({
        hasEnded: countdownEnded,
        nowMs: getCountdownNowMs(),
        startAtMs: runtimeStartAtMs,
      }).phase,
    })
  : config.resultLabel;
eventLabelElement.textContent = config.eventLabel;
endLabelElement.textContent = config.endLabel;
endingClockElement.hidden = !isCountdownMode;
baselineElement.textContent = config.baselineText.replaceAll(
  "{initial}",
  numberFormatter.format(config.initialFollowers),
);

function renderActionCopy(text, { transition = false } = {}) {
  const cacheKey = `${transition ? "transition" : "plain"}:${text}`;
  if (actionTextElement.dataset.copy === cacheKey) {
    return;
  }

  actionTextElement.classList.toggle(
    "is-transition-copy",
    transition,
  );
  actionTextElement.classList.toggle(
    "is-last-chance-copy",
    text === config.lastChanceText,
  );

  if (!transition || !text.includes(">>")) {
    actionTextElement.textContent = text;
    actionTextElement.dataset.copy = cacheKey;
    return;
  }

  const [currentText, ...nextParts] = text.split(">>");
  const current = document.createElement("span");
  current.textContent = currentText.trim();
  const arrows = document.createElement("span");
  arrows.className = "countdown-transition-arrows";
  arrows.textContent = ">>";
  const next = document.createElement("span");
  next.className = "countdown-transition-next";
  next.textContent = nextParts.join(">>").trim();
  actionTextElement.replaceChildren(current, arrows, next);
  actionTextElement.dataset.copy = cacheKey;
}

renderActionCopy(config.actionText);

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
    ["ending", "gain", "steady"].includes(highlight)
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
    if (highlight === "ending") {
      changeGroup.classList.add("ending-countdown-change");
    }
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

function renderCountdownAnnouncement(text, kind = "start") {
  const cacheKey = `${kind}:${text}`;
  if (totalDurationElement.dataset.announcement === cacheKey) {
    return;
  }

  const cue = document.createElement("mark");
  cue.className = `countdown-start-cue countdown-${kind}-cue`;
  const cueText = document.createElement("span");
  cueText.textContent = text;
  cue.append(cueText);
  totalDurationElement.replaceChildren(cue);
  totalDurationElement.dataset.announcement = cacheKey;
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
    baseDurationSeconds: countdownBaseDurationSeconds,
    extensionBaselineFollowers:
      countdownBaseFollowerCount ?? config.initialFollowers,
    followerExtensionEnabled: config.followerExtensionEnabled,
    followerCount: effectiveFollowerCount,
    initialFollowers: config.initialFollowers,
    minutesPerFollower: config.minutesPerFollower,
    nowMs,
    startAtMs: runtimeStartAtMs,
  });
}

function ensureCountdownBasis(followerCount) {
  if (!isCountdownMode) {
    return;
  }

  const safeFollowerCount = Math.max(0, Math.trunc(followerCount));
  if (countdownBaseFollowerCount === null) {
    countdownBaseFollowerCount =
      config.countdownDurationSource === "manual" ||
      !config.followerExtensionEnabled
        ? safeFollowerCount
        : config.initialFollowers;
  }

  if (countdownBaseDurationSeconds === null) {
    if (config.countdownDurationSource === "manual") {
      countdownBaseDurationSeconds = config.manualDurationMinutes * 60;
    } else if (config.followerExtensionEnabled) {
      countdownBaseDurationSeconds = 0;
    } else {
      countdownBaseDurationSeconds = Math.round(
        calculateRingFit(
          safeFollowerCount,
          config.initialFollowers,
          config.minutesPerFollower,
        ).minutes * 60,
      );
    }
  }
}

function clearFinalCheck() {
  clearTimeout(finalCheckTimer);
  finalCheckStartedAtMs = null;
  finalCheckRequestPending = false;
}

function finalizeCountdownIfReady() {
  if (
    finalCheckStartedAtMs === null ||
    finalCheckRequestPending ||
    countdownEnded
  ) {
    return;
  }

  const state = getCountdownState();
  if (state.remainingSeconds > 0) {
    clearFinalCheck();
    return;
  }

  const elapsedMs = getCountdownNowMs() - finalCheckStartedAtMs;
  if (elapsedMs < COUNTDOWN_FINAL_CHECK_SECONDS * 1000) {
    clearTimeout(finalCheckTimer);
    finalCheckTimer = window.setTimeout(
      finalizeCountdownIfReady,
      COUNTDOWN_FINAL_CHECK_SECONDS * 1000 - elapsedMs + 24,
    );
    return;
  }

  countdownEnded = true;
  clearFinalCheck();
  saveCountdownSession();
  renderCountdown();
}

function beginFinalCheck(nowMs) {
  if (finalCheckStartedAtMs !== null || countdownEnded) {
    return;
  }

  finalCheckStartedAtMs = nowMs;
  clearTimeout(finalCheckTimer);
  finalCheckTimer = window.setTimeout(
    finalizeCountdownIfReady,
    COUNTDOWN_FINAL_CHECK_SECONDS * 1000 + 24,
  );
}

function renderCountdown({
  highlightGain = false,
  nowMs = getCountdownNowMs(),
} = {}) {
  const state = getCountdownState(nowMs);
  const displayPhase = getCountdownDisplayPhase({
    finalCheckActive: finalCheckStartedAtMs !== null,
    hasEnded: countdownEnded,
    nowMs,
    remainingSeconds: state.remainingSeconds,
    startAtMs: runtimeStartAtMs,
  });
  const remainingSeconds = countdownEnded ? 0 : state.remainingSeconds;

  renderEndingTime(state.endAtMs);
  widget.dataset.countdownState = displayPhase.phase;
  resultLabelElement.textContent = getCountdownResultLabel({
    activeLabel: config.resultLabel,
    phase: displayPhase.phase,
  });

  if (displayPhase.phase === "count-in") {
    renderCountdownAnnouncement(`${displayPhase.cueSeconds}초`);
    renderActionCopy(config.startPreviewText, { transition: true });
  } else if (displayPhase.phase === "starting") {
    renderCountdownAnnouncement(config.startText);
    renderActionCopy(config.actionText);
  } else if (displayPhase.phase === "ending") {
    renderTotalDuration(remainingSeconds, {
      highlight: getCountdownDurationHighlight({
        highlightGain,
        phase: displayPhase.phase,
      }),
    });
    renderActionCopy(gainActionOverride || config.actionText);
  } else if (displayPhase.phase === "final-check") {
    renderCountdownAnnouncement("0초", "final");
    renderActionCopy(gainActionOverride || config.actionText);
  } else if (displayPhase.phase === "ended") {
    renderCountdownAnnouncement(config.endedText, "ended");
    renderActionCopy("");
  } else {
    renderTotalDuration(remainingSeconds, {
      highlight: getCountdownDurationHighlight({
        highlightGain,
        phase: displayPhase.phase,
      }),
    });
  }

  if (displayPhase.phase === "waiting") {
    renderActionCopy(config.actionText);
  } else if (displayPhase.phase === "running") {
    renderActionCopy(gainActionOverride || config.actionText);
  }
}

function renderFollowerCount(
  followerCount,
  {
    highlightGain = false,
    nowMs = isCountdownMode ? getCountdownNowMs() : Date.now(),
  } = {},
) {
  ensureCountdownBasis(followerCount);
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

function resetCountdownGainPresentation({ clearActionOverride = true } = {}) {
  clearTimeout(countdownExitTimer);
  clearTimeout(countdownResumeTimer);
  countdownDisplayLocked = false;
  widget.classList.remove("is-countdown-gain", "is-countdown-gain-exit");
  if (clearActionOverride) {
    gainActionOverride = "";
  }
}

function hideIncrementEvent() {
  clearTimeout(incrementEventTimer);
  clearTimeout(gainAnimationTimer);
  incrementEventElement.classList.remove("is-visible");
  incrementEventElement.hidden = true;
  widget.classList.remove("has-increment", "is-gain-update");
}

function beginCountdownGainPresentation() {
  resetCountdownGainPresentation({ clearActionOverride: false });
  countdownDisplayLocked = true;
  widget.classList.add("is-countdown-gain");

  countdownExitTimer = window.setTimeout(() => {
    widget.classList.add("is-countdown-gain-exit");
  }, 1_500);

  countdownResumeTimer = window.setTimeout(() => {
    countdownDisplayLocked = false;
    widget.classList.remove("is-countdown-gain", "is-countdown-gain-exit");
    gainActionOverride = "";
    renderCountdown();
  }, 1_860);
}

function playPreviewAnimation() {
  hideIncrementEvent();
  resetCountdownGainPresentation();
  clearFinalCheck();
  highestFollowerCount = previewPreviousFollowers;
  countdownBaseFollowerCount = null;
  countdownBaseDurationSeconds = null;
  countdownEnded = false;
  renderFollowerCount(previewPreviousFollowers, {
    nowMs: isCountdownMode ? getCountdownNowMs() : Date.now(),
  });
  previousFollowerCount = previewPreviousFollowers;

  clearTimeout(previewAnimationTimer);
  const previewGainDelay = isCountdownMode
    ? config.previewSequence === "end"
      ? COUNTDOWN_END_PREVIEW_SECONDS * 1000 + 650
      : (60 + COUNTDOWN_FIRST_REFRESH_DELAY_SECONDS) * 1000
    : 650;
  previewAnimationTimer = window.setTimeout(() => {
    processFollowerCount(config.previewFollowers, {
      forcePresentation: true,
      nowMs: isCountdownMode ? getCountdownNowMs() : Date.now(),
    });
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

function shouldDeferCountdownGain(nowMs) {
  return (
    isCountdownMode &&
    highestFollowerCount !== null &&
    nowMs < runtimeStartAtMs + COUNTDOWN_FIRST_REFRESH_DELAY_SECONDS * 1000
  );
}

function processFollowerCount(
  followerCount,
  {
    forcePresentation = false,
    nowMs = isCountdownMode ? getCountdownNowMs() : Date.now(),
  } = {},
) {
  let gainedFollowers = 0;
  let presentedFollowerCount = followerCount;

  if (isCountdownMode) {
    const mergedFollowerCount = Math.max(
      followerCount,
      pendingCountdownFollowerCount ?? followerCount,
    );
    presentedFollowerCount = mergedFollowerCount;
    ensureCountdownBasis(mergedFollowerCount);
    const previousHighWater =
      highestFollowerCount ??
      Math.max(config.initialFollowers, mergedFollowerCount);

    if (
      !forcePresentation &&
      config.followerExtensionEnabled &&
      mergedFollowerCount > previousHighWater &&
      shouldDeferCountdownGain(nowMs)
    ) {
      pendingCountdownFollowerCount = Math.max(
        pendingCountdownFollowerCount ?? mergedFollowerCount,
        mergedFollowerCount,
      );
      return;
    }

    pendingCountdownFollowerCount = null;
    if (
      config.followerExtensionEnabled &&
      !countdownEnded &&
      mergedFollowerCount > previousHighWater
    ) {
      gainedFollowers = mergedFollowerCount - previousHighWater;
    }
    if (!countdownEnded) {
      const stateBeforeGain = getCountdownState(nowMs);
      if (
        gainedFollowers > 0 &&
        stateBeforeGain.hasStarted &&
        stateBeforeGain.remainingSeconds <= 5
      ) {
        gainActionOverride = config.lastChanceText;
      }
      if (gainedFollowers > 0) {
        clearFinalCheck();
      }
      highestFollowerCount = Math.max(previousHighWater, mergedFollowerCount);
      saveCountdownSession();
    }
  } else if (
    previousFollowerCount !== null &&
    followerCount > previousFollowerCount
  ) {
    gainedFollowers = followerCount - previousFollowerCount;
  }

  renderFollowerCount(presentedFollowerCount, {
    highlightGain: isCountdownMode && gainedFollowers > 0,
    nowMs,
  });

  if (gainedFollowers > 0) {
    showIncrementEvent(gainedFollowers);
  }
  previousFollowerCount = presentedFollowerCount;
}

async function refresh({
  finalCheck = false,
  force = false,
  scheduleNext = true,
} = {}) {
  if (document.hidden && hasRenderedData && !force) {
    if (scheduleNext) {
      scheduleRefresh();
    }
    return;
  }

  activeRequest?.abort();
  activeRequest = new AbortController();
  widget.dataset.state = hasRenderedData ? "refreshing" : "loading";

  try {
    if (config.previewFollowers !== null) {
      if (!hasPlayedPreviewAnimation) {
        hasPlayedPreviewAnimation = true;
        playPreviewAnimation();
      } else if (config.previewEventDelta === 0) {
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
    if (finalCheck) {
      finalCheckRequestPending = false;
      finalizeCountdownIfReady();
    }
    if (scheduleNext) {
      scheduleRefresh();
    }
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (!isCountdownMode) {
    refreshTimer = window.setTimeout(
      refresh,
      config.refreshSeconds * 1000,
    );
    return;
  }

  const nowMs = getCountdownNowMs();
  const nextRefreshAtMs = getNextCountdownRefreshAtMs({
    nowMs,
    refreshSeconds: config.refreshSeconds,
    startAtMs: runtimeStartAtMs,
  });
  refreshTimer = window.setTimeout(
    runScheduledCountdownRefresh,
    Math.max(24, nextRefreshAtMs - nowMs + 24),
  );
}

function maybeRefreshCountdownCheckpoint(nowMs) {
  if (!isCountdownMode || countdownEnded) {
    return false;
  }

  const state = getCountdownState(nowMs);
  if (!state.hasStarted || !isCountdownEndCheckpoint(state.remainingSeconds)) {
    return false;
  }

  const checkpointKey = `${state.endAtMs}:${state.remainingSeconds}`;
  if (checkpointKey === lastCountdownCheckpointKey) {
    return true;
  }
  lastCountdownCheckpointKey = checkpointKey;

  const isFinalCheck = state.remainingSeconds === 0;
  if (isFinalCheck) {
    beginFinalCheck(nowMs);
    finalCheckRequestPending = true;
    renderCountdown({ nowMs });
  }
  void refresh({
    finalCheck: isFinalCheck,
    force: true,
    scheduleNext: false,
  });
  return true;
}

function runScheduledCountdownRefresh() {
  const nowMs = getCountdownNowMs();
  if (maybeRefreshCountdownCheckpoint(nowMs)) {
    scheduleRefresh();
    return;
  }

  void refresh();
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
    const nowMs = getCountdownNowMs();
    if (
      hasRenderedData &&
      currentFollowerCount !== null &&
      !countdownDisplayLocked
    ) {
      renderCountdown({ nowMs });
    }
    if (hasRenderedData && currentFollowerCount !== null) {
      maybeRefreshCountdownCheckpoint(nowMs);
    }
    scheduleCountdownTick();
  }, delay);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    if (isCountdownMode) {
      scheduleRefresh();
      if (!countdownDisplayLocked) {
        renderCountdown();
      }
      maybeRefreshCountdownCheckpoint(getCountdownNowMs());
    } else {
      refresh();
    }
  }
});

scheduleCountdownTick();
refresh();
