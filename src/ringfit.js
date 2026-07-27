export const DEFAULT_CHANNEL_ID = "3d5546fc8d0dcb478c973a9bc1328980";
export const DEFAULT_INITIAL_FOLLOWERS = 1031;
export const DEFAULT_MINUTES_PER_FOLLOWER = 0.5;
export const DEFAULT_REFRESH_SECONDS = 30;
export const DEFAULT_WIDGET_WIDTH = 800;
export const DEFAULT_WIDGET_HEIGHT = 100;
export const DEFAULT_FONT_SIZE = 48;

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
    15,
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
    apiBase: params.get("api")?.replace(/\/+$/, "") ?? "",
    channelId,
    fontSize,
    initialFollowers,
    minutesPerFollower,
    previewEventDelta,
    previewFollowers,
    refreshSeconds,
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
