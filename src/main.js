import "./widget.css";
import { fetchFollowerCount } from "./api.js";
import {
  calculateIncrementSeconds,
  calculateRingFit,
  formatDurationSeconds,
  parseWidgetConfig,
} from "./ringfit.js";

const widget = document.querySelector(".ringfit-widget");
const followerCountElement = document.querySelector("[data-follower-count]");
const previousFollowerCountElement = document.querySelector(
  "[data-follower-previous]",
);
const baselineElement = document.querySelector("[data-baseline]");
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
let activeRequest;
let hasRenderedData = false;
let previousFollowerCount = null;

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

baselineElement.textContent = `기준 ${numberFormatter.format(
  config.initialFollowers,
)}명부터`;

function renderFollowerCount(followerCount) {
  const result = calculateRingFit(
    followerCount,
    config.initialFollowers,
    config.minutesPerFollower,
  );

  previousFollowerCountElement.textContent = followerCountElement.textContent;
  followerCountElement.textContent = numberFormatter.format(result.followerCount);
  const totalDuration = formatDurationSeconds(result.minutes * 60);
  totalDurationElement.textContent = totalDuration;
  widget.dataset.state = "ready";
  widget.removeAttribute("title");
  hasRenderedData = true;

  return result;
}

function hideIncrementEvent() {
  clearTimeout(incrementEventTimer);
  clearTimeout(gainAnimationTimer);
  incrementEventElement.classList.remove("is-visible");
  incrementEventElement.hidden = true;
  widget.classList.remove("has-increment", "is-gain-update");
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
      renderFollowerCount(config.previewFollowers);
      if (config.previewEventDelta > 0) {
        showIncrementEvent(config.previewEventDelta);
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
