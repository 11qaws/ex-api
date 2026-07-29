export const DEFAULT_CHANNEL_ID = "3d5546fc8d0dcb478c973a9bc1328980";
export const DEFAULT_INITIAL_FOLLOWERS = 1031;
export const DEFAULT_MINUTES_PER_FOLLOWER = 0.5;
export const DEFAULT_REFRESH_SECONDS = 30;
export const DEFAULT_WIDGET_WIDTH = 650;
export const DEFAULT_WIDGET_HEIGHT = 100;
export const DEFAULT_FONT_SIZE = 48;
export const DEFAULT_WIDGET_THEME = "glass";
export const DEFAULT_WIDGET_MODE = "accrual";
export const DEFAULT_COUNTDOWN_PREVIEW_LEAD_SECONDS = 60;
export const COUNTDOWN_CUE_SECONDS = 60;
export const COUNTDOWN_START_HOLD_SECONDS = 3;
export const COUNTDOWN_FIRST_REFRESH_DELAY_SECONDS = 5;
export const COUNTDOWN_END_PREVIEW_SECONDS = 30;
export const COUNTDOWN_FINAL_CHECK_SECONDS = 3;
export const COUNTDOWN_END_CHECKPOINTS = Object.freeze([30, 20, 10, 5, 1, 0]);
export const DEFAULT_COPY = Object.freeze({
  actionText: "팔로우 눌러서 일요일 링피트",
  baselineText: "기준 {initial}명부터",
  eventLabel: "방금 추가",
  followerLabel: "지금 팔로워",
  resultLabel: "적립",
});
export const DEFAULT_COUNTDOWN_COPY = Object.freeze({
  ...DEFAULT_COPY,
  actionText: "팔로우 누르면 링피트 +30초",
  endLabel: "이대로면",
  endedText: "링피트 종료",
  lastChanceText: "끝난줄?",
  resultLabel: "업보",
  startPreviewText: "준비중 >> 링피트",
  startText: "링피트 시작!!",
  waitingText: "시작 전",
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
const WIDGET_THEMES = new Set(["glass", "paper"]);
const WIDGET_MODES = new Set(["accrual", "countdown"]);
const COUNTDOWN_PREVIEW_SEQUENCES = new Set(["start", "end"]);

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

function timestampMilliseconds(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    const milliseconds =
      Math.abs(numericValue) < 10_000_000_000
        ? numericValue * 1000
        : numericValue;
    return Math.max(0, Math.trunc(milliseconds));
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function isValidChannelId(value) {
  return CHANNEL_ID_PATTERN.test(value);
}

export function getCountdownPreviewStartAtMs(nowMs = Date.now()) {
  const safeNowMs = Math.max(0, finiteNumber(nowMs, Date.now()));
  return Math.floor(safeNowMs / 60_000) * 60_000;
}

export function getCountdownPreviewNowMs({
  loadedAtMs,
  nowMs = Date.now(),
  startAtMs,
  leadSeconds = DEFAULT_COUNTDOWN_PREVIEW_LEAD_SECONDS,
}) {
  const safeLoadedAtMs = Math.max(0, finiteNumber(loadedAtMs, Date.now()));
  const safeNowMs = Math.max(
    safeLoadedAtMs,
    finiteNumber(nowMs, safeLoadedAtMs),
  );
  const safeStartAtMs = Math.max(
    0,
    finiteNumber(startAtMs, safeLoadedAtMs),
  );
  const safeLeadMs =
    Math.max(0, finiteNumber(leadSeconds, 0)) * 1000;

  return Math.max(
    0,
    safeStartAtMs - safeLeadMs + (safeNowMs - safeLoadedAtMs),
  );
}

export function getCountdownDisplayPhase({
  finalCheckActive = false,
  hasEnded = false,
  nowMs,
  remainingSeconds = Number.POSITIVE_INFINITY,
  startAtMs,
}) {
  if (hasEnded) {
    return { cueSeconds: null, phase: "ended" };
  }

  const safeStartAtMs = Math.max(0, finiteNumber(startAtMs, 0));
  const safeNowMs = Math.max(0, finiteNumber(nowMs, safeStartAtMs));
  const deltaMs = safeNowMs - safeStartAtMs;

  if (deltaMs < -COUNTDOWN_CUE_SECONDS * 1000) {
    return { cueSeconds: null, phase: "waiting" };
  }
  if (deltaMs < 0) {
    return {
      cueSeconds: Math.floor(deltaMs / 1000),
      phase: "count-in",
    };
  }
  if (deltaMs < COUNTDOWN_START_HOLD_SECONDS * 1000) {
    return { cueSeconds: null, phase: "starting" };
  }
  if (finalCheckActive || remainingSeconds <= 0) {
    return { cueSeconds: null, phase: "final-check" };
  }
  if (remainingSeconds <= COUNTDOWN_END_PREVIEW_SECONDS) {
    return { cueSeconds: null, phase: "ending" };
  }
  return { cueSeconds: null, phase: "running" };
}

export function getCountdownTickDelay({
  nowMs,
  startAtMs,
  paddingMs = 24,
}) {
  const safeStartAtMs = Math.max(0, finiteNumber(startAtMs, 0));
  const safeNowMs = Math.max(0, finiteNumber(nowMs, safeStartAtMs));
  const offsetMs = safeNowMs - safeStartAtMs;
  const remainderMs = ((offsetMs % 1000) + 1000) % 1000;

  return 1000 - remainderMs + Math.max(0, finiteNumber(paddingMs, 0));
}

export function getNextCountdownRefreshAtMs({
  nowMs,
  startAtMs,
  refreshSeconds = DEFAULT_REFRESH_SECONDS,
}) {
  const safeStartAtMs = Math.max(0, finiteNumber(startAtMs, 0));
  const safeNowMs = Math.max(0, finiteNumber(nowMs, safeStartAtMs));
  const refreshMs =
    Math.max(1, finiteNumber(refreshSeconds, DEFAULT_REFRESH_SECONDS)) * 1000;
  const firstRefreshAtMs =
    safeStartAtMs + COUNTDOWN_FIRST_REFRESH_DELAY_SECONDS * 1000;
  const offsetMs = safeNowMs - safeStartAtMs;

  if (offsetMs >= 0 && safeNowMs < firstRefreshAtMs) {
    return firstRefreshAtMs;
  }

  const nextStep = Math.floor(offsetMs / refreshMs) + 1;
  const nextGridAtMs = safeStartAtMs + nextStep * refreshMs;

  return nextGridAtMs === safeStartAtMs
    ? firstRefreshAtMs
    : nextGridAtMs;
}

export function isCountdownEndCheckpoint(remainingSeconds) {
  return COUNTDOWN_END_CHECKPOINTS.includes(
    Math.trunc(finiteNumber(remainingSeconds, -1)),
  );
}

export function parseWidgetConfig(search = "") {
  const params = new URLSearchParams(search);
  const requestedMode = params.get("mode") ?? DEFAULT_WIDGET_MODE;
  const mode = WIDGET_MODES.has(requestedMode)
    ? requestedMode
    : DEFAULT_WIDGET_MODE;
  const defaultCopy =
    mode === "countdown" ? DEFAULT_COUNTDOWN_COPY : DEFAULT_COPY;
  const requestedTheme = params.get("theme") ?? DEFAULT_WIDGET_THEME;
  const theme = WIDGET_THEMES.has(requestedTheme)
    ? requestedTheme
    : DEFAULT_WIDGET_THEME;
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
  const requestedPreviewSequence = params.get("previewSequence") ?? "start";
  const previewSequence = COUNTDOWN_PREVIEW_SEQUENCES.has(
    requestedPreviewSequence,
  )
    ? requestedPreviewSequence
    : "start";

  return {
    actionSize,
    actionText: boundedText(
      params.get("actionText"),
      defaultCopy.actionText,
      60,
    ),
    apiBase: params.get("api")?.replace(/\/+$/, "") ?? "",
    baselineSize,
    baselineText: boundedText(
      params.get("baselineText"),
      defaultCopy.baselineText,
      50,
    ),
    channelId,
    endLabel: boundedText(
      params.get("endLabel"),
      DEFAULT_COUNTDOWN_COPY.endLabel,
      12,
    ),
    endedText: boundedText(
      params.get("endedText"),
      DEFAULT_COUNTDOWN_COPY.endedText,
      30,
    ),
    eventLabel: boundedText(
      params.get("eventLabel"),
      defaultCopy.eventLabel,
      20,
    ),
    eventLabelSize,
    eventValueSize,
    followerCountSize,
    followerLabel: boundedText(
      params.get("followerLabel"),
      defaultCopy.followerLabel,
      30,
    ),
    followerLabelSize,
    fontSize,
    initialFollowers,
    lastChanceText: boundedText(
      params.get("lastChanceText"),
      DEFAULT_COUNTDOWN_COPY.lastChanceText,
      20,
    ),
    minutesPerFollower,
    mode,
    previewEventDelta,
    previewFollowers,
    previewSequence,
    refreshSeconds,
    resultLabel: boundedText(
      params.get("resultLabel"),
      defaultCopy.resultLabel,
      20,
    ),
    sessionId: boundedText(params.get("session"), "default", 48).replace(
      /[^\p{L}\p{N}._-]/gu,
      "-",
    ),
    startText: boundedText(
      params.get("startText"),
      DEFAULT_COUNTDOWN_COPY.startText,
      20,
    ),
    startPreviewText: boundedText(
      params.get("startPreviewText"),
      DEFAULT_COUNTDOWN_COPY.startPreviewText,
      30,
    ),
    startAtMs: timestampMilliseconds(params.get("startAt")),
    theme,
    totalSize,
    waitingText: boundedText(
      params.get("waitingText"),
      DEFAULT_COUNTDOWN_COPY.waitingText,
      20,
    ),
    widgetHeight,
    widgetWidth,
  };
}

export function calculateCountdownState({
  followerCount,
  initialFollowers = DEFAULT_INITIAL_FOLLOWERS,
  minutesPerFollower = DEFAULT_MINUTES_PER_FOLLOWER,
  nowMs,
  startAtMs,
}) {
  const safeNowMs = Math.max(0, finiteNumber(nowMs, Date.now()));
  const safeStartAtMs = Math.max(0, finiteNumber(startAtMs, safeNowMs));
  const ringFit = calculateRingFit(
    followerCount,
    initialFollowers,
    minutesPerFollower,
  );
  const accruedSeconds = Math.round(ringFit.minutes * 60);
  const elapsedSeconds = Math.max(
    0,
    Math.floor((safeNowMs - safeStartAtMs) / 1000),
  );
  const remainingSeconds = Math.max(0, accruedSeconds - elapsedSeconds);

  return {
    accruedSeconds,
    endAtMs: safeStartAtMs + accruedSeconds * 1000,
    hasEnded: safeNowMs >= safeStartAtMs && remainingSeconds === 0,
    hasStarted: safeNowMs >= safeStartAtMs,
    remainingSeconds,
  };
}

export function formatClockTime(
  timestampMs,
  {
    referenceTimestampMs = timestampMs,
    timeZone = "Asia/Seoul",
  } = {},
) {
  const safeTimestamp = Math.max(0, finiteNumber(timestampMs, 0));
  const safeReference = Math.max(
    0,
    finiteNumber(referenceTimestampMs, safeTimestamp),
  );
  const clockFormatter = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  });
  const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "numeric",
    timeZone,
  });
  const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  const clock = clockFormatter.format(safeTimestamp);

  if (
    dateKeyFormatter.format(safeTimestamp) ===
    dateKeyFormatter.format(safeReference)
  ) {
    return clock;
  }

  return `${dateFormatter.format(safeTimestamp).replace(/\s/g, "")} ${clock}`;
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

export function formatDurationParts(seconds) {
  const safeSeconds = Math.max(0, Math.round(finiteNumber(seconds, 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const parts = [];

  if (hours > 0) {
    parts.push({ label: `${hours}시간`, unit: "hours", value: hours });
  }
  if (minutes > 0) {
    parts.push({ label: `${minutes}분`, unit: "minutes", value: minutes });
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push({
      label: `${remainingSeconds}초`,
      unit: "seconds",
      value: remainingSeconds,
    });
  }

  return parts;
}

export function getChangedDurationUnits(previousSeconds, currentSeconds) {
  const currentParts = formatDurationParts(currentSeconds);
  if (previousSeconds === currentSeconds) {
    return [];
  }

  return currentParts.map((part) => part.unit);
}

export function formatDurationSeconds(seconds) {
  return formatDurationParts(seconds)
    .map((part) => part.label)
    .join(" ");
}
