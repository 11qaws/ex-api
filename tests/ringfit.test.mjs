import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateIncrementSeconds,
  calculateRingFit,
  formatDurationSeconds,
  formatDurationParts,
  formatMinutes,
  getChangedDurationUnits,
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

test("시간은 따로 비교하고 분·초는 하나의 변경 묶음으로 고른다", () => {
  assert.deepEqual(getChangedDurationUnits(null, 3690), []);
  assert.deepEqual(getChangedDurationUnits(3600, 3690), [
    "minutes",
    "seconds",
  ]);
  assert.deepEqual(getChangedDurationUnits(3660, 3690), [
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
