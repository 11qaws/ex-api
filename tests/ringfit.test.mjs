import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCountdownState,
  calculateIncrementSeconds,
  calculateRingFit,
  formatClockTime,
  formatDurationSeconds,
  formatDurationParts,
  formatMinutes,
  getCountdownDisplayPhase,
  getCountdownDurationHighlight,
  getCountdownResultLabel,
  getNextCountdownRefreshAtMs,
  getCountdownPreviewNowMs,
  getCountdownPreviewStartAtMs,
  getCountdownTickDelay,
  getChangedDurationUnits,
  isCountdownEndCheckpoint,
  parseWidgetConfig,
} from "../src/ringfit.js";

test("기준 1031명에서 한 명당 0.5분을 적립한다", () => {
  assert.deepEqual(calculateRingFit(1033), {
    followerCount: 1033,
    gainedFollowers: 2,
    minutes: 1,
  });
});

test("기준보다 팔로워가 줄어도 링피트 시간은 음수가 되지 않는다", () => {
  assert.deepEqual(calculateRingFit(1020), {
    followerCount: 1020,
    gainedFollowers: 0,
    minutes: 0,
  });
});

test("홀수 명 증가분은 0.5분 단위로 표시한다", () => {
  assert.equal(calculateRingFit(1034).minutes, 1.5);
  assert.equal(formatMinutes(1.5), "1.5");
});

test("URL 설정을 안전한 범위로 제한한다", () => {
  const config = parseWidgetConfig(
    "?initial=-30&refresh=2&minutesPerFollower=0.25&preview=1040",
  );

  assert.equal(config.initialFollowers, 0);
  assert.equal(config.refreshSeconds, 10);
  assert.equal(config.minutesPerFollower, 0.25);
  assert.equal(config.previewFollowers, 1040);
});

test("옵션이 없는 URL은 내기 기본값 1031명과 0.5분을 쓴다", () => {
  const config = parseWidgetConfig("?preview=1033");

  assert.equal(config.initialFollowers, 1031);
  assert.equal(config.minutesPerFollower, 0.5);
  assert.equal(config.refreshSeconds, 30);
  assert.equal(config.previewFollowers, 1033);
  assert.equal(config.previewEventDelta, 0);
  assert.equal(config.widgetWidth, 650);
  assert.equal(config.widgetHeight, 100);
  assert.equal(config.fontSize, 48);
  assert.equal(config.followerLabel, "지금 팔로워");
  assert.equal(config.baselineText, "기준 {initial}명부터");
  assert.equal(config.actionText, "팔로우 눌러서 일요일 링피트");
  assert.equal(config.resultLabel, "적립");
  assert.equal(config.eventLabel, "방금 추가");
  assert.equal(config.followerLabelSize, 16);
  assert.equal(config.followerCountSize, 52);
  assert.equal(config.baselineSize, 13);
  assert.equal(config.actionSize, 24);
  assert.equal(config.totalSize, 48);
  assert.equal(config.eventLabelSize, 20);
  assert.equal(config.eventValueSize, 38);
  assert.equal(config.theme, "glass");
});

test("유리 테마를 기본값으로 사용하고 종이 테마도 URL 옵션으로 허용한다", () => {
  assert.equal(parseWidgetConfig("?theme=glass").theme, "glass");
  assert.equal(parseWidgetConfig("?theme=paper").theme, "paper");
  assert.equal(parseWidgetConfig("?theme=unknown").theme, "glass");
});

test("운동 타이머 URL은 시작시각과 모든 상태 문구를 읽는다", () => {
  const config = parseWidgetConfig(
    "?mode=countdown&startAt=1785646800&session=20260802&waitingText=곧%20시작&startPreviewText=운동%20준비&startText=운동%20시작&lastChanceText=끝난줄&endedText=운동%20완료",
  );

  assert.equal(config.mode, "countdown");
  assert.equal(config.startAtMs, 1_785_646_800_000);
  assert.equal(config.sessionId, "20260802");
  assert.equal(config.actionText, "팔로우 누르면 링피트 +30초");
  assert.equal(config.resultLabel, "운동");
  assert.equal(config.endLabel, "이대로면");
  assert.equal(config.waitingText, "곧 시작");
  assert.equal(config.startPreviewText, "운동 준비");
  assert.equal(config.startText, "운동 시작");
  assert.equal(config.lastChanceText, "끝난줄");
  assert.equal(config.endedText, "운동 완료");
});

test("운동 타이머의 누락 없는 기본 문구를 제공한다", () => {
  const config = parseWidgetConfig("?mode=countdown");

  assert.equal(config.followerLabel, "지금 팔로워");
  assert.equal(config.baselineText, "기준 {initial}명부터");
  assert.equal(config.actionText, "팔로우 누르면 링피트 +30초");
  assert.equal(config.resultLabel, "운동");
  assert.equal(config.eventLabel, "방금 추가");
  assert.equal(config.endLabel, "이대로면");
  assert.equal(config.waitingText, "시작 전");
  assert.equal(config.startPreviewText, "준비중 >> 링피트");
  assert.equal(config.startText, "링피트 시작!!");
  assert.equal(config.lastChanceText, "끝난줄?");
  assert.equal(config.endedText, "링피트 종료");
  assert.equal(config.previewSequence, "start");
});

test("운동 시작 연출은 -60초부터 시작해 +3초에 정상 타이머로 전환한다", () => {
  const startAtMs = 100_000;

  assert.deepEqual(
    getCountdownDisplayPhase({ nowMs: startAtMs - 60_001, startAtMs }),
    { cueSeconds: null, phase: "waiting" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({ nowMs: startAtMs - 60_000, startAtMs }),
    { cueSeconds: -60, phase: "count-in" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({ nowMs: startAtMs - 59_000, startAtMs }),
    { cueSeconds: -59, phase: "count-in" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({ nowMs: startAtMs - 1_000, startAtMs }),
    { cueSeconds: -1, phase: "count-in" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({ nowMs: startAtMs, startAtMs }),
    { cueSeconds: null, phase: "starting" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({ nowMs: startAtMs + 2_999, startAtMs }),
    { cueSeconds: null, phase: "starting" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({
      nowMs: startAtMs + 3_000,
      remainingSeconds: 31,
      startAtMs,
    }),
    { cueSeconds: null, phase: "running" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({
      nowMs: startAtMs + 3_000,
      remainingSeconds: 30,
      startAtMs,
    }),
    { cueSeconds: null, phase: "ending" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({
      nowMs: startAtMs + 3_000,
      remainingSeconds: 0,
      startAtMs,
    }),
    { cueSeconds: null, phase: "final-check" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({
      finalCheckActive: true,
      nowMs: startAtMs + 3_000,
      remainingSeconds: 30,
      startAtMs,
    }),
    { cueSeconds: null, phase: "final-check" },
  );
  assert.deepEqual(
    getCountdownDisplayPhase({
      hasEnded: true,
      nowMs: startAtMs + 3_000,
      startAtMs,
    }),
    { cueSeconds: null, phase: "ended" },
  );
});

test("시작 전에는 적립, 시작 후에는 운동 라벨을 사용한다", () => {
  assert.equal(
    getCountdownResultLabel({ activeLabel: "운동", phase: "waiting" }),
    "적립",
  );
  assert.equal(
    getCountdownResultLabel({ activeLabel: "운동", phase: "count-in" }),
    "적립",
  );
  assert.equal(
    getCountdownResultLabel({ activeLabel: "운동", phase: "starting" }),
    "운동",
  );
  assert.equal(
    getCountdownResultLabel({ activeLabel: "운동", phase: "running" }),
    "운동",
  );
});

test("진행 중 타이머 배경은 유지하고 시간 추가 때만 다시 그린다", () => {
  assert.equal(
    getCountdownDurationHighlight({
      highlightGain: false,
      phase: "running",
    }),
    "steady",
  );
  assert.equal(
    getCountdownDurationHighlight({
      highlightGain: true,
      phase: "running",
    }),
    "gain",
  );
  assert.equal(
    getCountdownDurationHighlight({
      highlightGain: false,
      phase: "ending",
    }),
    "ending",
  );
  assert.equal(
    getCountdownDurationHighlight({
      highlightGain: true,
      phase: "starting",
    }),
    "none",
  );
});

test("30초 팔로워 조회는 시작시각 기준 00·30초와 첫 +5초에 맞춘다", () => {
  const startAtMs = 100_000;

  assert.equal(
    getNextCountdownRefreshAtMs({
      nowMs: startAtMs - 60_350,
      startAtMs,
    }),
    startAtMs - 60_000,
  );
  assert.equal(
    getNextCountdownRefreshAtMs({
      nowMs: startAtMs - 60_000,
      startAtMs,
    }),
    startAtMs - 30_000,
  );
  assert.equal(
    getNextCountdownRefreshAtMs({
      nowMs: startAtMs - 30_000,
      startAtMs,
    }),
    startAtMs + 5_000,
  );
  assert.equal(
    getNextCountdownRefreshAtMs({
      nowMs: startAtMs,
      startAtMs,
    }),
    startAtMs + 5_000,
  );
  assert.equal(
    getNextCountdownRefreshAtMs({
      nowMs: startAtMs + 5_000,
      startAtMs,
    }),
    startAtMs + 30_000,
  );
  assert.equal(
    getNextCountdownRefreshAtMs({
      nowMs: startAtMs + 30_000,
      startAtMs,
    }),
    startAtMs + 60_000,
  );
});

test("종료 30초 안에서는 지정된 남은시간에만 추가 조회한다", () => {
  for (const checkpoint of [30, 20, 10, 5, 1, 0]) {
    assert.equal(isCountdownEndCheckpoint(checkpoint), true);
  }

  for (const otherSecond of [31, 29, 2, -1, Number.NaN]) {
    assert.equal(isCountdownEndCheckpoint(otherSecond), false);
  }
});

test("운동 시작 전에도 다음 정각 초 경계에 맞춰 갱신한다", () => {
  const startAtMs = 100_000;

  assert.equal(
    getCountdownTickDelay({
      nowMs: startAtMs - 3_350,
      startAtMs,
    }),
    374,
  );
  assert.equal(
    getCountdownTickDelay({
      nowMs: startAtMs + 1_350,
      startAtMs,
    }),
    674,
  );
});

test("알 수 없는 모드는 기존 적립 위젯으로 되돌린다", () => {
  const config = parseWidgetConfig("?mode=unknown");

  assert.equal(config.mode, "accrual");
  assert.equal(config.startAtMs, null);
  assert.equal(config.resultLabel, "적립");
});

test("절대 시작시각과 팔로워 적립량으로 남은시간과 종료시각을 계산한다", () => {
  const startAtMs = Date.UTC(2026, 7, 2, 5, 0, 0);
  const beforeGain = calculateCountdownState({
    followerCount: 1270,
    initialFollowers: 1031,
    minutesPerFollower: 0.5,
    nowMs: startAtMs,
    startAtMs,
  });
  const afterGain = calculateCountdownState({
    followerCount: 1271,
    initialFollowers: 1031,
    minutesPerFollower: 0.5,
    nowMs: startAtMs,
    startAtMs,
  });

  assert.equal(beforeGain.remainingSeconds, 7170);
  assert.equal(afterGain.remainingSeconds, 7200);
  assert.equal(afterGain.endAtMs - beforeGain.endAtMs, 30_000);
});

test("OBS가 늦게 로딩돼도 실제 경과시간만큼 즉시 차감한다", () => {
  const startAtMs = 1_000_000;
  const state = calculateCountdownState({
    followerCount: 1271,
    initialFollowers: 1031,
    minutesPerFollower: 0.5,
    nowMs: startAtMs + 70_400,
    startAtMs,
  });

  assert.equal(state.remainingSeconds, 7130);
  assert.equal(state.hasStarted, true);
  assert.equal(state.hasEnded, false);
});

test("예상 종료시각은 한국시간 시계와 자정 이후 날짜를 표시한다", () => {
  const reference = Date.UTC(2026, 7, 2, 14, 59, 30);

  assert.equal(
    formatClockTime(reference, {
      referenceTimestampMs: reference,
    }),
    "23:59:30",
  );
  assert.equal(
    formatClockTime(reference + 60_000, {
      referenceTimestampMs: reference,
    }),
    "8.3. 00:00:30",
  );
});

test("미리보기 종료시각은 시작 :00에서 팔로워마다 정확히 30초씩 이동한다", () => {
  const loadedAtMs = Date.UTC(2026, 6, 29, 11, 40, 59, 554);
  const startAtMs = getCountdownPreviewStartAtMs(loadedAtMs);
  const beforeGain = calculateCountdownState({
    followerCount: 1270,
    initialFollowers: 1031,
    minutesPerFollower: 0.5,
    nowMs: startAtMs,
    startAtMs,
  });
  const afterGain = calculateCountdownState({
    followerCount: 1271,
    initialFollowers: 1031,
    minutesPerFollower: 0.5,
    nowMs: startAtMs,
    startAtMs,
  });

  assert.equal(startAtMs, Date.UTC(2026, 6, 29, 11, 40, 0, 0));
  assert.equal(formatClockTime(beforeGain.endAtMs), "22:39:30");
  assert.equal(formatClockTime(afterGain.endAtMs), "22:40:00");
  assert.equal(afterGain.endAtMs - beforeGain.endAtMs, 30_000);
});

test("운동 시작 미리보기의 가상 시계는 시작시각 60초 전부터 흐른다", () => {
  const startAtMs = Date.UTC(2026, 6, 29, 11, 40, 0);
  const loadedAtMs = 10_000;

  assert.equal(
    getCountdownPreviewNowMs({
      loadedAtMs,
      nowMs: loadedAtMs,
      startAtMs,
    }),
    startAtMs - 60_000,
  );
  assert.equal(
    getCountdownPreviewNowMs({
      loadedAtMs,
      nowMs: loadedAtMs + 60_000,
      startAtMs,
    }),
    startAtMs,
  );
  assert.equal(
    getCountdownPreviewNowMs({
      loadedAtMs,
      nowMs: loadedAtMs + 65_000,
      startAtMs,
    }),
    startAtMs + 5_000,
  );
});

test("운동 미리보기 시퀀스는 시작과 종료만 허용한다", () => {
  assert.equal(parseWidgetConfig("?previewSequence=start").previewSequence, "start");
  assert.equal(parseWidgetConfig("?previewSequence=end").previewSequence, "end");
  assert.equal(
    parseWidgetConfig("?previewSequence=unknown").previewSequence,
    "start",
  );
});

test("초 단위 결과를 자연스러운 시간·분·초 문장으로 바꾼다", () => {
  assert.equal(formatDurationSeconds(30), "30초");
  assert.equal(formatDurationSeconds(60), "1분");
  assert.equal(formatDurationSeconds(90), "1분 30초");
  assert.equal(formatDurationSeconds(3599), "59분 59초");
  assert.equal(formatDurationSeconds(3600), "1시간");
  assert.equal(formatDurationSeconds(3630), "1시간 30초");
  assert.equal(formatDurationSeconds(3660), "1시간 1분");
  assert.equal(formatDurationSeconds(3690), "1시간 1분 30초");
  assert.equal(formatDurationSeconds(7200), "2시간");
  assert.equal(formatDurationSeconds(7290), "2시간 1분 30초");
});

test("누적 시간을 비교 가능한 시간·분·초 조각으로 나눈다", () => {
  assert.deepEqual(formatDurationParts(3690), [
    { label: "1시간", unit: "hours", value: 1 },
    { label: "1분", unit: "minutes", value: 1 },
    { label: "30초", unit: "seconds", value: 30 },
  ]);
});

test("적립시간이 바뀌면 현재 시·분·초 전체를 한 묶음으로 강조한다", () => {
  assert.deepEqual(getChangedDurationUnits(null, 3690), [
    "hours",
    "minutes",
    "seconds",
  ]);
  assert.deepEqual(getChangedDurationUnits(3600, 3690), [
    "hours",
    "minutes",
    "seconds",
  ]);
  assert.deepEqual(getChangedDurationUnits(3660, 3690), [
    "hours",
    "minutes",
    "seconds",
  ]);
  assert.deepEqual(getChangedDurationUnits(7170, 7200), ["hours"]);
  assert.deepEqual(getChangedDurationUnits(7170, 7290), [
    "hours",
    "minutes",
    "seconds",
  ]);
  assert.deepEqual(getChangedDurationUnits(3690, 7290), [
    "hours",
    "minutes",
    "seconds",
  ]);
  assert.deepEqual(getChangedDurationUnits(3690, 3690), []);
});

test("새 팔로워 인원을 30초 단위 이벤트로 계산한다", () => {
  assert.equal(calculateIncrementSeconds(1), 30);
  assert.equal(calculateIncrementSeconds(2), 60);
  assert.equal(calculateIncrementSeconds(3), 90);
});

test("미리보기 증가 인원을 URL에서 받는다", () => {
  assert.equal(parseWidgetConfig("?eventDelta=3").previewEventDelta, 3);
});

test("편집기 라이브 미리보기용 10초 갱신을 허용한다", () => {
  assert.equal(parseWidgetConfig("?refresh=10").refreshSeconds, 10);
});

test("위젯 가로·세로·폰트 크기를 안전한 범위에서 받는다", () => {
  const config = parseWidgetConfig("?width=1600&height=140&fontSize=72");

  assert.equal(config.widgetWidth, 1600);
  assert.equal(config.widgetHeight, 140);
  assert.equal(config.fontSize, 72);

  const bounded = parseWidgetConfig("?width=10&height=9999&fontSize=500");
  assert.equal(bounded.widgetWidth, 480);
  assert.equal(bounded.widgetHeight, 1080);
  assert.equal(bounded.fontSize, 120);
});

test("전체 폰트 크기를 바꾸면 위치별 기본 크기도 함께 비례한다", () => {
  const config = parseWidgetConfig("?fontSize=72");

  assert.equal(config.followerLabelSize, 24);
  assert.equal(config.followerCountSize, 77);
  assert.equal(config.baselineSize, 20);
  assert.equal(config.actionSize, 36);
  assert.equal(config.totalSize, 72);
  assert.equal(config.eventLabelSize, 30);
  assert.equal(config.eventValueSize, 57);
});

test("위치별 문구와 글자 크기를 URL에서 안전하게 받는다", () => {
  const config = parseWidgetConfig(
    "?followerLabel=%20%20팔로워%20체크%20%20&baselineText=기준%20{initial}명&actionText=눌러라!&resultLabel=누적&eventLabel=방금!&followerLabelSize=2&followerCountSize=999&totalSize=81",
  );

  assert.equal(config.followerLabel, "팔로워 체크");
  assert.equal(config.baselineText, "기준 {initial}명");
  assert.equal(config.actionText, "눌러라!");
  assert.equal(config.resultLabel, "누적");
  assert.equal(config.eventLabel, "방금!");
  assert.equal(config.followerLabelSize, 10);
  assert.equal(config.followerCountSize, 140);
  assert.equal(config.totalSize, 81);
});

test("빈 문구는 기본 문구로 되돌리고 너무 긴 문구는 자른다", () => {
  const config = parseWidgetConfig(
    `?resultLabel=%20%20&followerLabel=${encodeURIComponent("가".repeat(40))}`,
  );

  assert.equal(config.resultLabel, "적립");
  assert.equal(config.followerLabel.length, 30);
});
