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
const previewTitle = document.querySelector("[data-preview-title]");
const widgetLink = document.querySelector("[data-widget-link]");
const openLink = document.querySelector("[data-open-link]");
const copyStatus = document.querySelector("[data-copy-status]");
const replayButton = document.querySelector("[data-replay]");
const copyButton = document.querySelector("[data-copy-link]");
const themeStamp = document.querySelector("[data-theme-stamp]");
const linkTitle = document.querySelector("[data-link-title]");
const linkDescription = document.querySelector("[data-link-description]");
const modeTabs = [...document.querySelectorAll("[data-mode-tab]")];
const modeOnlyElements = [...document.querySelectorAll("[data-mode-only]")];
const widgetBaseUrl = new URL("../", window.location.href);

const textParameters = [
  "followerLabel",
  "baselineText",
  "actionText",
  "resultLabel",
  "eventLabel",
  "endLabel",
  "waitingText",
  "startText",
  "endedText",
];
const modeTextParameters = [
  "followerLabel",
  "baselineText",
  "actionText",
  "resultLabel",
  "eventLabel",
  "endLabel",
  "waitingText",
  "startText",
  "endedText",
];
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
    startText: DEFAULT_COUNTDOWN_COPY.startText,
    waitingText: DEFAULT_COUNTDOWN_COPY.waitingText,
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
    ) -
    9 * 60 * 60 * 1000
  );
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
    const startAtMs = parseKoreaDateTime(formValue("startAt"));
    if (startAtMs !== null) {
      params.set("startAt", String(Math.trunc(startAtMs / 1000)));
    }
    params.set("session", formValue("session"));
  }

  return parseWidgetConfig(params);
}

function buildWidgetUrl(config, { preview = false } = {}) {
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
    params.set("refresh", "10");
    if (config.mode === "countdown") {
      // Keep the sample clock on :00 so each follower moves the ending clock
      // by exactly 30 seconds (:00 <-> :30), regardless of iframe load time.
      params.set("startAt", String(getCountdownPreviewStartAtMs()));
      params.set("session", `preview-${Date.now()}`);
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

function updateModeCopy() {
  const isCountdown = activeMode === "countdown";
  previewTitle.textContent = isCountdown
    ? "업보가 이렇게 이어짐"
    : "지금 이렇게 나감";
  replayButton.textContent = isCountdown
    ? "+30초 릴레이 다시 보기"
    : "+30초 다시 보기";
  linkTitle.textContent = isCountdown
    ? "업보 시작 링크 복사"
    : "다 됐으면 이거 복사";
  linkDescription.textContent = isCountdown
    ? "시작 시각이 URL에 들어갑니다. OBS 브라우저 소스 크기도 위 값과 똑같이 설정하세요."
    : "OBS 브라우저 소스 URL에 붙여넣고, 가로·세로도 위 값과 똑같이 설정하세요.";
}

function render({ reloadPreview = true } = {}) {
  const config = normalizedConfig();
  const liveUrl = buildWidgetUrl(config);
  currentPreviewUrl = buildWidgetUrl(config, { preview: true });

  widgetLink.value = liveUrl;
  openLink.href = liveUrl;
  previewSize.textContent = `${config.widgetWidth} × ${config.widgetHeight}`;
  previewViewport.dataset.theme = config.theme;
  themeStamp.textContent =
    config.theme === "glass" ? "유리 테마 · 뒤가 비침" : "종이 테마";
  updateModeCopy();
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
    tab.setAttribute(
      "aria-selected",
      String(tab.dataset.modeTab === activeMode),
    );
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

  const mirrorName = input.dataset.mirror;
  if (mirrorName) {
    const mirroredInput = form.elements.namedItem(mirrorName);
    mirroredInput.value = input.value;
    syncOverallFontSize(input.value);
  } else if (input.name === "fontSize") {
    const range = form.querySelector('[data-mirror="fontSize"]');
    range.value = input.value;
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

replayButton.addEventListener("click", () => {
  currentPreviewUrl = buildWidgetUrl(normalizedConfig(), { preview: true });
  previewFrame.src = currentPreviewUrl;
});

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
  Number(formValue("minutesPerFollower")) !==
    DEFAULT_MINUTES_PER_FOLLOWER ||
  Number(formValue("fontSize")) !== DEFAULT_FONT_SIZE
) {
  form.reset();
}

for (const element of modeOnlyElements) {
  element.hidden = element.dataset.modeOnly !== activeMode;
}
render();
