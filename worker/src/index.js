const CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;
const CHZZK_CHANNELS_ENDPOINT =
  "https://openapi.chzzk.naver.com/open/v1/channels";
const CHZZK_PUBLIC_CHANNEL_ENDPOINT =
  "https://api.chzzk.naver.com/service/v1/channels";
const UPSTREAM_TIMEOUT_MS = 8_000;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    Vary: "Origin",
  };
}

function channelIdFromUrl(url) {
  const pathMatch = url.pathname.match(
    /^\/api\/channels\/([a-f0-9]{32})\/follower-count\/?$/i,
  );
  return pathMatch?.[1] ?? url.searchParams.get("channelId");
}

function createUpstreamRequest(channelId, env) {
  if (env.CHZZK_CLIENT_ID && env.CHZZK_CLIENT_SECRET) {
    const url = new URL(CHZZK_CHANNELS_ENDPOINT);
    url.searchParams.set("channelIds", channelId);

    return {
      url,
      options: {
        headers: {
          Accept: "application/json",
          "Client-Id": env.CHZZK_CLIENT_ID,
          "Client-Secret": env.CHZZK_CLIENT_SECRET,
        },
      },
    };
  }

  return {
    url: new URL(`${CHZZK_PUBLIC_CHANNEL_ENDPOINT}/${channelId}`),
    options: {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; ex-api-widget/0.1)",
      },
    },
  };
}

function findChannel(payload, channelId) {
  const authenticatedChannels = payload?.content?.data;
  if (Array.isArray(authenticatedChannels)) {
    return authenticatedChannels.find((item) => item.channelId === channelId);
  }

  const publicChannel = payload?.content;
  return publicChannel?.channelId === channelId ? publicChannel : null;
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const cors = corsHeaders(env);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const url = new URL(request.url);
  if (url.pathname === "/" || url.pathname === "/health") {
    return json({ ok: true, service: "ex-api" }, 200, {
      ...cors,
      "Cache-Control": "no-store",
    });
  }

  const channelId = channelIdFromUrl(url);
  if (!channelId || !CHANNEL_ID_PATTERN.test(channelId)) {
    return json({ error: "invalid_channel_id" }, 400, cors);
  }

  const upstreamRequest = createUpstreamRequest(channelId, env);

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetchImpl(upstreamRequest.url, {
      ...upstreamRequest.options,
      signal: timeoutController.signal,
    });

    if (!upstream.ok) {
      return json(
        { error: "chzzk_upstream_error", status: upstream.status },
        502,
        cors,
      );
    }

    const payload = await upstream.json();
    const channel = findChannel(payload, channelId);

    if (!channel || !Number.isInteger(channel.followerCount)) {
      return json({ error: "channel_not_found" }, 404, cors);
    }

    return json(
      {
        channelId,
        followerCount: channel.followerCount,
        updatedAt: new Date().toISOString(),
      },
      200,
      {
        ...cors,
        "Cache-Control": "public, max-age=15, s-maxage=15",
      },
    );
  } catch (error) {
    const reason = error.name === "AbortError" ? "upstream_timeout" : "upstream_failed";
    return json({ error: reason }, 502, cors);
  } finally {
    clearTimeout(timeoutId);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
