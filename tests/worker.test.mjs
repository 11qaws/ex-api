import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../worker/src/index.js";

const channelId = "3d5546fc8d0dcb478c973a9bc1328980";
const env = {
  ALLOWED_ORIGIN: "https://11qaws.github.io",
  CHZZK_CLIENT_ID: "test-client",
  CHZZK_CLIENT_SECRET: "test-secret",
};

test("공식 치지직 응답에서 팔로워 수만 안전하게 추린다", async () => {
  const fetchStub = async (url, options) => {
    assert.equal(url.searchParams.get("channelIds"), channelId);
    assert.equal(options.headers["Client-Id"], "test-client");
    assert.equal(options.headers["Client-Secret"], "test-secret");

    return Response.json({
      content: {
        data: [{ channelId, followerCount: 1033 }],
      },
    });
  };

  const response = await handleRequest(
    new Request(
      `https://api.example.com/api/channels/${channelId}/follower-count`,
    ),
    env,
    fetchStub,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.channelId, channelId);
  assert.equal(body.followerCount, 1033);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://11qaws.github.io",
  );
});

test("잘못된 채널 ID는 upstream 호출 전에 거절한다", async () => {
  let called = false;
  const response = await handleRequest(
    new Request("https://api.example.com/api/channels/nope/follower-count"),
    env,
    async () => {
      called = true;
      return Response.json({});
    },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("비밀키가 없으면 치지직 공개 채널 응답을 사용한다", async () => {
  const fetchStub = async (url, options) => {
    assert.equal(
      url.href,
      `https://api.chzzk.naver.com/service/v1/channels/${channelId}`,
    );
    assert.match(options.headers["User-Agent"], /^Mozilla\/5\.0/);

    return Response.json({
      code: 200,
      content: {
        channelId,
        followerCount: 1039,
      },
    });
  };

  const response = await handleRequest(
    new Request(
      `https://api.example.com/api/channels/${channelId}/follower-count`,
    ),
    {},
    fetchStub,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.channelId, channelId);
  assert.equal(body.followerCount, 1039);
  assert.match(body.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
