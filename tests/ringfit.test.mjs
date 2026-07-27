import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateIncrementSeconds,
  calculateRingFit,
  formatDurationSeconds,
  formatMinutes,
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
  assert.equal(config.refreshSeconds, 15);
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
  assert.equal(config.widgetWidth, 800);
  assert.equal(config.widgetHeight, 100);
  assert.equal(config.fontSize, 48);
});

test("초 단위 결과를 자연스러운 분·초 문장으로 바꾼다", () => {
  assert.equal(formatDurationSeconds(30), "30초");
  assert.equal(formatDurationSeconds(60), "1분");
  assert.equal(formatDurationSeconds(90), "1분 30초");
  assert.equal(formatDurationSeconds(120), "2분");
});

test("새 팔로워 인원을 30초 단위 이벤트로 계산한다", () => {
  assert.equal(calculateIncrementSeconds(1), 30);
  assert.equal(calculateIncrementSeconds(2), 60);
  assert.equal(calculateIncrementSeconds(3), 90);
});

test("미리보기 증가 인원을 URL에서 받는다", () => {
  assert.equal(parseWidgetConfig("?eventDelta=3").previewEventDelta, 3);
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
