import "./editor.css";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_FONT_SIZE,
  DEFAULT_INITIAL_FOLLOWERS,
  DEFAULT_MINUTES_PER_FOLLOWER,
  DEFAULT_REFRESH_SECONDS,
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
const copyButton = document.querySelector("[data-copy-link]");
const widgetBaseUrl = new URL("../", window.location.href);

const textParameters = [
  "followerLabel",
  "baselineText",
  "actionText",
  "resultLabel",
  "eventLabel",
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

let previewTimer;
let copyStatusTimer;
let currentPreviewUrl = "";

function formValue(name) {
  return form.elements.namedItem(name)?.value ?? "";
}

function normalizedConfig() {
  const params = new URLSearchParams();

  for (const name of textParameters) {
    params.set(name, formValue(name));
  }

  for (const name of [
    "channelId",
    "initial",
    "minutesPerFollower",
    "refresh",
    "width",
    "height",
    "fontSize",
    ...fontParameters,
  ]) {
    params.set(name, formValue(name));
  }

  return parseWidgetConfig(params);
}

function buildWidgetUrl(config, { preview = false } = {}) {
  const url = new URL(widgetBaseUrl);
  const params = url.searchParams;

  params.set("channelId", config.channelId);
  params.set("initial", String(config.initialFollowers));
  params.set("minutesPerFollower", String(config.minutesPerFollower));
  params.set("refresh", String(config.refreshSeconds));
  params.set("width", String(config.widgetWidth));
  params.set("height", String(config.widgetHeight));
  params.set("fontSize", String(config.fontSize));

  for (const name of textParameters) {
    params.set(name, config[name]);
  }
  for (const name of fontParameters) {
    params.set(name, String(config[name]));
  }

  if (preview) {
    params.set("preview", String(config.initialFollowers + 4));
    params.set("eventDelta", "1");
  }

  return url.toString();
}

function updatePreviewScale(config) {
  const availableWidth = Math.max(1, previewViewport.clientWidth - 32);
  const scale = Math.min(1, availableWidth / config.widgetWidth);

  previewCanvas.style.setProperty("--preview-width", `${config.widgetWidth}px`);
  previewCanvas.style.setProperty("--preview-height", `${config.widgetHeight}px`);
  previewCanvas.style.setProperty("--preview-scale", String(scale));
  previewViewport.style.setProperty(
    "--preview-stage-height",
    `${Math.ceil(config.widgetHeight * scale) + 32}px`,
  );
  previewFrame.width = String(config.widgetWidth);
  previewFrame.height = String(config.widgetHeight);
}

function render({ reloadPreview = true } = {}) {
  const config = normalizedConfig();
  const liveUrl = buildWidgetUrl(config);
  currentPreviewUrl = buildWidgetUrl(config, { preview: true });

  widgetLink.value = liveUrl;
  openLink.href = liveUrl;
  previewSize.textContent = `${config.widgetWidth} × ${config.widgetHeight}`;
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

replayButton.addEventListener("click", () => {
  previewFrame.src = "about:blank";
  window.requestAnimationFrame(() => {
    previewFrame.src = currentPreviewUrl;
  });
});

copyButton.addEventListener("click", async () => {
  clearTimeout(copyStatusTimer);

  try {
    await navigator.clipboard.writeText(widgetLink.value);
    copyStatus.textContent = "복사됨. OBS에 붙여넣으면 끝!";
    copyButton.dataset.state = "success";
  } catch {
    widgetLink.select();
    copyStatus.textContent = "자동 복사가 막혔어요. 선택된 링크를 직접 복사해 주세요.";
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
  Number(formValue("refresh")) !== DEFAULT_REFRESH_SECONDS ||
  Number(formValue("fontSize")) !== DEFAULT_FONT_SIZE
) {
  form.reset();
}

render();
