export const DEFAULT_CHANNEL_ID = "3d5546fc8d0dcb478c973a9bc1328980";
export const DEFAULT_INITIAL_FOLLOWERS = 1031;
export const DEFAULT_MINUTES_PER_FOLLOWER = 0.5;
export const DEFAULT_REFRESH_SECONDS = 30;
export const DEFAULT_WIDGET_WIDTH = 800;
export const DEFAULT_WIDGET_HEIGHT = 100;
export const DEFAULT_FONT_SIZE = 48;
export const DEFAULT_COPY = Object.freeze({
  actionText: "팔로우 눌러서 일요일 링피트",
  baselineText: "기준 {initial}명부터",
  eventLabel: "방금 적립",
  followerLabel: "지금 팔로워",
  resultLabel: "적립",
});

const FONT_RATIOS = Object.freeze({
  actionSize: 0.5,
  baselineSize: 0.278,
  eventLabelSize: 0.42,
  eventValueSize: 0.796,
  followerCountSize: 1.074,
  followerLabelSize: 0.333,
  totalSize: 1,
});

const CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;

function finiteNumber(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Math.trunc(finiteNumber(value, fallback));
  return Math.min(maximum, Math.max(minimum, parsed));
}

function boundedText(value, fallback, maximumLength) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maximumLength) : fallback;
}

function scaledFontSize(params, name, fontSize, minimum, maximum) {
  return boundedInteger(
    params.get(name),
    Math.round(fontSize * FONT_RATIOS[name]),
    minimum,
    maximum,
  );
}

export function isValidChannelId(value) {
  return CHANNEL_ID_PATTERN.test(value);
}

export function parseWidgetConfig(search = "") {
  const params = new URLSearchParams(search);
  const requestedChannelId = params.get("channelId") ?? DEFAULT_CHANNEL_ID;
  const channelId = isValidChannelId(requestedChannelId)
    ? requestedChannelId
    : DEFAULT_CHANNEL_ID;

  const initialFollowers = boundedInteger(
    params.get("initial"),
    DEFAULT_INITIAL_FOLLOWERS,
    0,
    1_000_000_000,
  );
  const minutesPerFollower = Math.min(
    1440,
    Math.max(
      0,
      finiteNumber(params.get("minutesPerFollower"), DEFAULT_MINUTES_PER_FOLLOWER),
    ),
  );
  const refreshSeconds = boundedInteger(
    params.get("refresh"),
    DEFAULT_REFRESH_SECONDS,
    10,
    300,
  );
  const widgetWidth = boundedInteger(
    params.get("width"),
    DEFAULT_WIDGET_WIDTH,
    480,
    3840,
  );
  const widgetHeight = boundedInteger(
    params.get("height"),
    DEFAULT_WIDGET_HEIGHT,
    64,
    1080,
  );
  const fontSize = boundedInteger(
    params.get("fontSize"),
    DEFAULT_FONT_SIZE,
    24,
    120,
  );
  const followerLabelSize = scaledFontSize(
    params,
    "followerLabelSize",
    fontSize,
    10,
    48,
  );
  const followerCountSize = scaledFontSize(
    params,
    "followerCountSize",
    fontSize,
    24,
    140,
  );
  const baselineSize = scaledFontSize(
    params,
    "baselineSize",
    fontSize,
    9,
    40,
  );
  const actionSize = scaledFontSize(
    params,
    "actionSize",
    fontSize,
    12,
    80,
  );
  const totalSize = scaledFontSize(
    params,
    "totalSize",
    fontSize,
    24,
    140,
  );
  const eventLabelSize = scaledFontSize(
    params,
    "eventLabelSize",
    fontSize,
    10,
    50,
  );
  const eventValueSize = scaledFontSize(
    params,
    "eventValueSize",
    fontSize,
    18,
    100,
  );
  const previewValue = params.get("preview");
  const previewFollowers =
    previewValue === null
      ? null
      : boundedInteger(previewValue, initialFollowers, 0, 1_000_000_000);
  const previewEventDelta = boundedInteger(
    params.get("eventDelta"),
    0,
    0,
    1_000_000,
  );

  return {
    actionSize,
    actionText: boundedText(
      params.get("actionText"),
      DEFAULT_COPY.actionText,
      60,
    ),
    apiBase: params.get("api")?.replace(/\/+$/, "") ?? "",
    baselineSize,
    baselineText: boundedText(
      params.get("baselineText"),
      DEFAULT_COPY.baselineText,
      50,
    ),
    channelId,
    eventLabel: boundedText(
      params.get("eventLabel"),
      DEFAULT_COPY.eventLabel,
      20,
    ),
    eventLabelSize,
    eventValueSize,
    followerCountSize,
    followerLabel: boundedText(
      params.get("followerLabel"),
      DEFAULT_COPY.followerLabel,
      30,
    ),
    followerLabelSize,
    fontSize,
    initialFollowers,
    minutesPerFollower,
    previewEventDelta,
    previewFollowers,
    refreshSeconds,
    resultLabel: boundedText(
      params.get("resultLabel"),
      DEFAULT_COPY.resultLabel,
      20,
    ),
    totalSize,
    widgetHeight,
    widgetWidth,
  };
}

export function calculateRingFit(
  followerCount,
  initialFollowers = DEFAULT_INITIAL_FOLLOWERS,
  minutesPerFollower = DEFAULT_MINUTES_PER_FOLLOWER,
) {
  const safeFollowerCount = boundedInteger(
    followerCount,
    initialFollowers,
    0,
    1_000_000_000,
  );
  const gainedFollowers = Math.max(0, safeFollowerCount - initialFollowers);
  const minutes = gainedFollowers * Math.max(0, minutesPerFollower);

  return {
    followerCount: safeFollowerCount,
    gainedFollowers,
    minutes,
  };
}

export function calculateIncrementSeconds(
  gainedFollowers,
  minutesPerFollower = DEFAULT_MINUTES_PER_FOLLOWER,
) {
  const safeGainedFollowers = boundedInteger(
    gainedFollowers,
    0,
    0,
    1_000_000,
  );
  return safeGainedFollowers * Math.max(0, minutesPerFollower) * 60;
}

export function formatMinutes(minutes) {
  if (Number.isInteger(minutes)) {
    return String(minutes);
  }

  return minutes.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

export function formatDurationSeconds(seconds) {
  const safeSeconds = Math.max(0, Math.round(finiteNumber(seconds, 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}초`;
  }

  if (remainingSeconds === 0) {
    return `${minutes}분`;
  }

  return `${minutes}분 ${remainingSeconds}초`;
}
