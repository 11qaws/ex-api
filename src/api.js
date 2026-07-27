const REQUEST_TIMEOUT_MS = 8_000;

export async function fetchFollowerCount(apiBase, channelId, signal) {
  if (!apiBase) {
    throw new Error("API 주소가 설정되지 않았습니다");
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => timeoutController.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(
      `${apiBase}/api/channels/${encodeURIComponent(channelId)}/follower-count`,
      {
        headers: { Accept: "application/json" },
        signal: timeoutController.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`팔로워 API 오류 (${response.status})`);
    }

    const data = await response.json();
    const followerCount = Number(data.followerCount);
    if (!Number.isInteger(followerCount) || followerCount < 0) {
      throw new Error("팔로워 API 응답 형식이 올바르지 않습니다");
    }

    return followerCount;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abort);
  }
}

