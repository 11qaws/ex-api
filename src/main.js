import "./widget.css";
import "./increment-event-compact.css";
import { fetchFollowerCount } from "./api.js";
import {
  calculateIncrementSeconds,
  calculateRingFit,
  formatDurationParts,
  formatDurationSeconds,
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
const incrementDurationElement = document.querySelector("[data-increment-duration]");

const config = parseWidgetConfig(window.location.search);
const environmentApiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";
const apiBase = config.apiBase || environmentApiBase;
const numberFormatter = new Intl.NumberFormat("ko-KR");

let refreshTimer;
let incrementEventTimer;
let gainAnimationTimer;
let previewAnimationTimer;
let activeRequest;
let hasRenderedData = false;
let hasPlayedPreviewAnimation = false;
let previousFollowerCount = null;
let previousTotalSeconds = null;

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
baselineElement.textContent = config.baselineText.replaceAll(
  "{initial}",
  numberFormatter.format(config.initialFollowers),
);

function renderFollowerCount(followerCount) {
  const result = calculateRingFit(
    followerCount,
    config.initialFollowers,
    config.minutesPerFollower,
  );

  previousFollowerCountElement.textContent = followerCountElement.textContent;
  followerCountElement.textContent = numberFormatter.format(result.followerCount);
  renderTotalDuration(result.minutes * 60);
  widget.dataset.state = "ready";
  widget.removeAttribute("title");
  hasRenderedData = true;

  return result;
}

function createDurationUnit(part) {
  const unitElement = document.createElement("span");
  unitElement.className = "duration-unit";
  unitElement.dataset.unit = part.unit;
  unitElement.textContent = part.label;
  return unitElement;
}

function renderTotalDuration(totalSeconds) {
  const parts = formatDurationParts(totalSeconds);
  const changedUnits = new Set(
    getChangedDurationUnits(previousTotalSeconds, totalSeconds),
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

  if (changedUnits.size === 0 && hasActiveChangeGroup) {
    previousTotalSeconds = totalSeconds;
    return;
  }

  totalDurationElement.replaceChildren(fragment);
  previousTotalSeconds = totalSeconds;
}

function hideIncrementEvent() {
  clearTimeout(incrementEventTimer);
  clearTimeout(gainAnimationTimer);
  incrementEventElement.classList.remove("is-visible");
  incrementEventElement.hidden = true;
  widget.classList.remove("has-increment", "is-gain-update");
}

function playPreviewAnimation() {
  const previousPreviewFollowers = Math.max(
    config.initialFollowers,
    config.previewFollowers - config.previewEventDelta,
  );

  hideIncrementEvent();
  renderFollowerCount(previousPreviewFollowers);
  previousFollowerCount = previousPreviewFollowers;

  clearTimeout(previewAnimationTimer);
  previewAnimationTimer = window.setTimeout(() => {
    renderFollowerCount(config.previewFollowers);
    showIncrementEvent(config.previewEventDelta);
    previousFollowerCount = config.previewFollowers;
  }, 650);
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
  widget.classList.remove("is-gain-update");
  void widget.offsetWidth;
  widget.classList.add("is-gain-update");
  incrementEventElement.classList.add("is-visible");

  clearTimeout(gainAnimationTimer);
  gainAnimationTimer = window.setTimeout(() => {
    widget.classList.remove("is-gain-update");
  }, 1_150);

  clearTimeout(incrementEventTimer);
  incrementEventTimer = window.setTimeout(hideIncrementEvent, 6_000);
}

function renderError(error) {
  widget.dataset.state = hasRenderedData ? "stale" : "error";
  widget.title = error.message;

  if (!hasRenderedData) {
    followerCountElement.textContent = "연결X";
    totalDurationElement.textContent = "—";
    hideIncrementEvent();
  }
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
        renderFollowerCount(config.previewFollowers);
      }
      return;
    }

    const followerCount = await fetchFollowerCount(
      apiBase,
      config.channelId,
      activeRequest.signal,
    );
    renderFollowerCount(followerCount);

    if (
      previousFollowerCount !== null &&
      followerCount > previousFollowerCount
    ) {
      showIncrementEvent(followerCount - previousFollowerCount);
    }
    previousFollowerCount = followerCount;
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

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
  }
});

refresh();
