import "./editor.css";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_COPY,
  DEFAULT_COUNTDOWN_COPY,
  DEFAULT_FONT_SIZE,
  DEFAULT_INITIAL_FOLLOWERS,
  DEFAULT_MINUTES_PER_FOLLOWER,
  getCountdownPreviewStartAtMs,
  parseWidgetConfig,
} from "./ringfit.js";

const form = document.querySelector("[data-editor-form]");
const previewFrame = document.querySelector("[data-preview-frame]");
const previewViewport = document.querySelector("[data-preview-viewport]");
const previewCanvas = document.querySelector("[data-preview-canvas]");
const previewSize = document.querySelector("[data-preview-size]");
const widgetLink = document.querySelector("[data-widget-link]");
const openLink = document.querySelector("[data-open-link]");
const copyStatus = document.querySelector("[data-copy-status]");
const replayButton = document.querySelector("[data-replay]");
const accrualPreviewControl = document.querySelector(
  "[data-accrual-preview-control]",
);
const countdownPreviewControls = document.querySelector(
  "[data-countdown-preview-controls]",
);
const previewSequenceButtons = [
  ...document.querySelectorAll("[data-preview-sequence]"),
];
const copyButton = document.querySelector("[data-copy-link]");
const modeTabs = [...document.querySelectorAll("[data-mode-tab]")];
const modeOnlyElements = [...document.querySelectorAll("[data-mode-only]")];
const startDisplay = document.querySelector("[data-start-display]");
const startWarning = document.querySelector("[data-start-warning]");
const startDateButtons = [...document.querySelectorAll("[data-start-date]")];
const startShiftButtons = [...document.querySelectorAll("[data-start-shift]")];
const fontSizeReadout = document.querySelector("[data-font-size-readout]");
const widgetBaseUrl = new URL("../", window.location.href);

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_START_HOUR = 14;
const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

const textParameters = [
  "followerLabel",
  "baselineText",
  "actionText",
  "resultLabel",
  "eventLabel",
  "endLabel",
  "lastChanceText",
  "startPreviewText",
  "startText",
  "endedText",
];
const modeTextParameters = [...textParameters];
const fontParameters = [
  "followerLabelSize",
  "followerCountSize",
  "baselineSize",
  "actionSize",
  "totalSize",
  "eventLabelSize",
  "eventValueSize",
];
const fontRatios = {
  actionSize: 0.5,
  baselineSize: 0.278,
  eventLabelSize: 0.42,
  eventValueSize: 0.796,
  followerCountSize: 1.074,
  followerLabelSize: 0.333,
  totalSize: 1,
};
const modeDefaults = {
  accrual: {
    ...DEFAULT_COPY,
    endLabel: DEFAULT_COUNTDOWN_COPY.endLabel,
    endedText: DEFAULT_COUNTDOWN_COPY.endedText,
    lastChanceText: DEFAULT_COUNTDOWN_COPY.lastChanceText,
    startPreviewText: DEFAULT_COUNTDOWN_COPY.startPreviewText,
    startText: DEFAULT_COUNTDOWN_COPY.startText,
  },
  countdown: DEFAULT_COUNTDOWN_COPY,
};
const modeDrafts = {
  accrual: { ...modeDefaults.accrual },
  countdown: { ...modeDefaults.countdown },
};

let activeMode = "accrual";
let previewTimer;
let copyStatusTimer;
let currentPreviewUrl = "";
let activePreviewSequence = "start";

function formValue(name) {
  return form.elements.namedItem(name)?.value ?? "";
}

function setFormValue(name, value) {
  const input = form.elements.namedItem(name);
  if (input) {
    input.value = value;
  }
}

function parseKoreaDateTime(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = "0"] = match;
  return (
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ) - KOREA_OFFSET_MS
  );
}

// Korea-shifted calendar fields, so date maths never depends on the browser
// timezone. Start times are always read as Asia/Seoul.
function koreaParts(timestampMs) {
  const shifted = new Date(timestampMs + KOREA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toStartInputValue(timestampMs) {
  const { year, month, day, hour, minute } = koreaParts(timestampMs);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

function formatStartLabel(timestampMs) {
  const { month, day, hour, minute, weekday } = koreaParts(timestampMs);
  const meridiem = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const weekdayName = WEEKDAY_NAMES[weekday];
  return `${month}월 ${day}일(${weekdayName}) ${meridiem} ${hour12}:${pad(minute)}`;
}

function koreaMidnightMs(timestampMs) {
  return (
    Math.floor((timestampMs + KOREA_OFFSET_MS) / DAY_MS) * DAY_MS -
    KOREA_OFFSET_MS
  );
}

function defaultStartAtMs(nowMs = Date.now()) {
  const midnight = koreaMidnightMs(nowMs);
  const daysToSunday = (7 - koreaParts(nowMs).weekday) % 7;
  const candidate =
    midnight + daysToSunday * DAY_MS + DEFAULT_START_HOUR * 60 * MINUTE_MS;
  return candidate <= nowMs ? candidate + 7 * DAY_MS : candidate;
}

function startAtMs() {
  return parseKoreaDateTime(formValue("startAt")) ?? defaultStartAtMs();
}

function setStartAtMs(timestampMs) {
  setFormValue("startAt", toStartInputValue(timestampMs));
}

// The session id groups the peak follower count and finished state of one
// workout. Deriving it from the start time keeps runs apart without asking the
// user to invent a name.
function sessionIdFor(timestampMs) {
  const { year, month, day, hour, minute } = koreaParts(timestampMs);
  return `ringfit-${year}${pad(month)}${pad(day)}-${pad(hour)}${pad(minute)}`;
}

function updateStartDisplay() {
  const current = startAtMs();
  startDisplay.textContent = formatStartLabel(current);
  startWarning.hidden = current > Date.now();
}

function shiftStartMinutes(deltaMinutes) {
  setStartAtMs(startAtMs() + deltaMinutes * MINUTE_MS);
}

function moveStartToDate(target) {
  const current = startAtMs();
  const nowMs = Date.now();
  const timeOfDayMs = current - koreaMidnightMs(current);
  const todayMidnight = koreaMidnightMs(nowMs);

  let midnight = todayMidnight;
  if (target === "tomorrow") {
    midnight = todayMidnight + DAY_MS;
  } else if (target === "sunday") {
    midnight = todayMidnight + ((7 - koreaParts(nowMs).weekday) % 7) * DAY_MS;
  }

  setStartAtMs(midnight + timeOfDayMs);
}

function normalizedConfig() {
  const params = new URLSearchParams();

  params.set("mode", activeMode);
  for (const name of textParameters) {
    params.set(name, formValue(name));
  }

  for (const name of [
    "theme",
    "channelId",
    "initial",
    "minutesPerFollower",
    "width",
    "height",
    "fontSize",
    ...fontParameters,
  ]) {
    params.set(name, formValue(name));
  }

  if (activeMode === "countdown") {
    const current = startAtMs();
    params.set("startAt", String(Math.trunc(current / 1000)));
    params.set("session", sessionIdFor(current));
  }

  return parseWidgetConfig(params);
}

function buildWidgetUrl(
  config,
  { preview = false, previewSequence = activePreviewSequence } = {},
) {
  const url = new URL(widgetBaseUrl);
  const params = url.searchParams;

  params.set("channelId", config.channelId);
  params.set("initial", String(config.initialFollowers));
  params.set("minutesPerFollower", String(config.minutesPerFollower));
  params.set("width", String(config.widgetWidth));
  params.set("height", String(config.widgetHeight));
  params.set("fontSize", String(config.fontSize));
  params.set("theme", config.theme);

  for (const name of textParameters) {
    params.set(name, config[name]);
  }
  for (const name of fontParameters) {
    params.set(name, String(config[name]));
  }

  if (config.mode === "countdown") {
    params.set("mode", "countdown");
    if (config.startAtMs !== null) {
      params.set("startAt", String(Math.trunc(config.startAtMs / 1000)));
    }
    params.set("session", config.sessionId);
  }

  if (preview) {
    params.set(
      "preview",
      String(
        config.mode === "countdown"
          ? config.initialFollowers + 240
          : config.initialFollowers + 4,
      ),
    );
    params.set("eventDelta", "1");
    params.set("refresh", config.mode === "countdown" ? "30" : "10");
    if (config.mode === "countdown") {
      // Keep the sample clock on :00 so each follower moves the ending clock
      // by exactly 30 seconds (:00 <-> :30), regardless of iframe load time.
      params.set("startAt", String(getCountdownPreviewStartAtMs()));
      params.set("session", `preview-${Date.now()}`);
      params.set("previewSequence", previewSequence);
    }
  }

  return url.toString();
}

function updatePreviewScale(config) {
  const availableWidth = Math.max(1, previewViewport.clientWidth - 32);
  const scale = Math.min(1, availableWidth / config.widgetWidth);

  previewCanvas.style.setProperty("--preview-width", `${config.widgetWidth}px`);
  previewCanvas.style.setProperty(
    "--preview-height",
    `${config.widgetHeight}px`,
  );
  previewCanvas.style.setProperty("--preview-scale", String(scale));
  previewViewport.style.setProperty(
    "--preview-stage-height",
    `${Math.ceil(config.widgetHeight * scale) + 32}px`,
  );
  previewFrame.width = String(config.widgetWidth);
  previewFrame.height = String(config.widgetHeight);
}

function updateModeControls() {
  const isCountdown = activeMode === "countdown";
  accrualPreviewControl.hidden = isCountdown;
  countdownPreviewControls.hidden = !isCountdown;
  for (const button of previewSequenceButtons) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.previewSequence === activePreviewSequence),
    );
  }
}

function render({ reloadPreview = true } = {}) {
  const config = normalizedConfig();
  const liveUrl = buildWidgetUrl(config);
  currentPreviewUrl = buildWidgetUrl(config, {
    preview: true,
    previewSequence: activePreviewSequence,
  });

  widgetLink.value = liveUrl;
  openLink.href = liveUrl;
  previewSize.textContent = `${config.widgetWidth} × ${config.widgetHeight}`;
  previewViewport.dataset.theme = config.theme;
  fontSizeReadout.textContent = String(config.fontSize);
  updateModeControls();
  updateStartDisplay();
  updatePreviewScale(config);

  if (reloadPreview) {
    previewFrame.src = currentPreviewUrl;
  }
}

function scheduleRender() {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(render, 110);
}

function clampInput(input) {
  if (input.type !== "number") {
    return;
  }

  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    return;
  }

  input.value = String(Math.min(maximum, Math.max(minimum, value)));
}

function syncOverallFontSize(value) {
  for (const name of fontParameters) {
    const input = form.elements.namedItem(name);
    input.value = String(Math.round(Number(value) * fontRatios[name]));
    clampInput(input);
  }
}

function saveModeDraft() {
  for (const name of modeTextParameters) {
    modeDrafts[activeMode][name] = formValue(name);
  }
}

function switchMode(nextMode) {
  if (nextMode === activeMode) {
    return;
  }

  saveModeDraft();
  activeMode = nextMode;
  setFormValue("mode", activeMode);
  for (const name of modeTextParameters) {
    setFormValue(name, modeDrafts[activeMode][name]);
  }

  for (const tab of modeTabs) {
    tab.setAttribute("aria-pressed", String(tab.dataset.modeTab === activeMode));
  }
  for (const element of modeOnlyElements) {
    element.hidden = element.dataset.modeOnly !== activeMode;
  }

  render();
}

form.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  if (input.name === "fontSize") {
    fontSizeReadout.textContent = input.value;
    syncOverallFontSize(input.value);
  }

  scheduleRender();
});

form.addEventListener(
  "change",
  (event) => {
    if (event.target instanceof HTMLInputElement) {
      clampInput(event.target);
      render();
    }
  },
  true,
);

for (const tab of modeTabs) {
  tab.addEventListener("click", () => {
    switchMode(tab.dataset.modeTab);
  });
}

for (const button of startDateButtons) {
  button.addEventListener("click", () => {
    moveStartToDate(button.dataset.startDate);
    render();
  });
}

for (const button of startShiftButtons) {
  button.addEventListener("click", () => {
    shiftStartMinutes(Number(button.dataset.startShift));
    render();
  });
}

replayButton.addEventListener("click", () => {
  currentPreviewUrl = buildWidgetUrl(normalizedConfig(), { preview: true });
  previewFrame.src = currentPreviewUrl;
});

for (const button of previewSequenceButtons) {
  button.addEventListener("click", () => {
    activePreviewSequence = button.dataset.previewSequence;
    for (const candidate of previewSequenceButtons) {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    }
    currentPreviewUrl = buildWidgetUrl(normalizedConfig(), {
      preview: true,
      previewSequence: activePreviewSequence,
    });
    previewFrame.src = currentPreviewUrl;
  });
}

copyButton.addEventListener("click", async () => {
  clearTimeout(copyStatusTimer);

  try {
    await navigator.clipboard.writeText(widgetLink.value);
    copyStatus.textContent = "복사됨. OBS에 붙여넣으면 끝!";
    copyButton.dataset.state = "success";
  } catch {
    widgetLink.select();
    copyStatus.textContent =
      "자동 복사가 막혔어요. 선택된 링크를 직접 복사해 주세요.";
    copyButton.dataset.state = "error";
  }

  copyStatusTimer = window.setTimeout(() => {
    copyStatus.textContent = "";
    delete copyButton.dataset.state;
  }, 3200);
});

const resizeObserver = new ResizeObserver(() => {
  updatePreviewScale(normalizedConfig());
});
resizeObserver.observe(previewViewport);

if (
  formValue("channelId") !== DEFAULT_CHANNEL_ID ||
  Number(formValue("initial")) !== DEFAULT_INITIAL_FOLLOWERS ||
  Number(formValue("minutesPerFollower")) !== DEFAULT_MINUTES_PER_FOLLOWER ||
  Number(formValue("fontSize")) !== DEFAULT_FONT_SIZE
) {
  form.reset();
}

setStartAtMs(defaultStartAtMs());

for (const element of modeOnlyElements) {
  element.hidden = element.dataset.modeOnly !== activeMode;
}
render();
