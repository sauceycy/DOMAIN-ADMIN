export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // =========================
      // 1) Admin Login / Logout / Me
      // =========================
      if (request.method === "POST" && url.pathname === "/api/admin/login") {
        return handleAdminLogin(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/admin/logout") {
        return handleAdminLogout();
      }

      if (request.method === "GET" && url.pathname === "/api/admin/me") {
        const session = await getSession(request, env);
        if (!session.ok) return json({ loggedIn: false });
        return json({
          loggedIn: true,
          username: session.username,
        });
      }

      // =========================
      // 2) Admin Package APIs
      // =========================
      const adminMatch = url.pathname.match(/^\/api\/admin\/package\/([^/]+)$/);

      if (request.method === "GET" && adminMatch) {
        const session = await getSession(request, env);
        if (!session.ok) return unauthorized();
        return handleGetPackage(adminMatch[1], env);
      }

      if (request.method === "POST" && adminMatch) {
        const session = await getSession(request, env);
        if (!session.ok) return unauthorized();
        return handleSavePackage(adminMatch[1], request, env, session.username);
      }

      // =========================
      // 3) 新配置接口
      // =========================
      if (request.method === "GET" && url.pathname === "/api/config") {
        return handleConfig(request, env, ctx);
      }

      if (request.method === "POST" && url.pathname === "/api/domains") {
        return handleDomains(request, env);
      }

      // =========================
      // 4) 兼容旧接口：
      //    "/" 且带 packageid 时仍走原分发逻辑
      // =========================
      const packageId =
        request.headers.get("packageid") ||
        url.searchParams.get("packageid");

      if (request.method === "GET" && url.pathname === "/" && packageId) {
        return handleConfig(request, env, ctx);
      }

      // =========================
      // 5) 其他请求交给 React 静态资源
      // =========================
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json(
        {
          error: "internal error",
          message: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }
  },
};

// =========================
// Admin Login / Logout / Session
// =========================
async function handleAdminLogin(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "invalid json body" }, 400);

  const username = safeString(body.username);
  const password = safeString(body.password);

  if (!username || !password) {
    return json({ error: "username and password are required" }, 400);
  }

  const adminUsername = safeString(env.ADMIN_USERNAME);
  const adminPassword = safeString(env.ADMIN_PASSWORD);

  if (!adminUsername || !adminPassword || !safeString(env.SESSION_SECRET)) {
    return json({ error: "admin credentials are not configured" }, 500);
  }

  if (
    username !== adminUsername ||
    password !== adminPassword
  ) {
    return json({ error: "invalid username or password" }, 401);
  }

  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${username}.${expiresAt}`;
  const signature = await signValue(payload, env.SESSION_SECRET);
  const token = `${payload}.${signature}`;

  return new Response(
    JSON.stringify({
      ok: true,
      message: "login success",
      username,
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": makeSessionCookie(token, expiresAt),
      },
    }
  );
}

async function handleAdminLogout() {
  return new Response(
    JSON.stringify({ ok: true, message: "logout success" }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie":
          "admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
      },
    }
  );
}

async function getSession(request, env) {
  const cookies = parseCookie(request.headers.get("Cookie") || "");
  const token = cookies.admin_session;

  if (!token) return { ok: false };

  const parts = token.split(".");
  if (parts.length < 3) return { ok: false };

  const signature = parts.pop();
  const expiresAt = parts.pop();
  const username = parts.join(".");
  const payload = `${username}.${expiresAt}`;

  const expected = await signValue(payload, env.SESSION_SECRET);
  if (signature !== expected) return { ok: false };
  if (Number(expiresAt) < Date.now()) return { ok: false };

  return {
    ok: true,
    username,
  };
}

function makeSessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return [
    `admin_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

// =========================
// 原分发逻辑
// =========================
async function handleConfig(request, env, ctx) {
  const url = new URL(request.url);

  const packageId =
    request.headers.get("packageid") ||
    url.searchParams.get("packageid");

  if (!packageId) {
    return json({ error: "missing packageId" }, 400);
  }

  const config = await env.allconfig.get(`package_${packageId}`, {
    type: "json",
  });

  if (!config) {
    return json({ error: "config not found" }, 404);
  }

  const version = config.version || 1;

  const cacheKey = new Request(
    `${url.origin}${url.pathname}?pid=${packageId}&v=${version}`
  );

  const cache = caches.default;
  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  const domain = await getDomain(config);

  const payload = {
    code: 0,
    data: {
      domain: domain,
    },
    msg: "Successfully",
    success: true,
  };

  const encoded = base64EncodeUtf8(JSON.stringify(payload));

  response = new Response(encoded, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// =========================
// 渠道域名批量查询
// =========================
async function handleDomains(request, env) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "invalid json body" }, 400);

  const packageId =
    safeString(body.packageid) ||
    safeString(body.packageId) ||
    safeString(request.headers.get("packageid")) ||
    safeString(url.searchParams.get("packageid"));

  if (!packageId) {
    return json({ error: "packageid is required" }, 400);
  }

  const packageConfig = await env.allconfig.get(`package_${packageId}`, {
    type: "json",
  });

  if (!packageConfig) {
    return json({ error: "package config not found" }, 404);
  }

  const channels = normalizeStringArray(body.channels);
  if (body.channels != null && !channels) {
    return json({ error: "channels must be an array or string" }, 400);
  }

  if (!channels || channels.length === 0) {
    const domain = await resolveDomainValue(packageConfig);
    if (!domain) {
      return json({ error: "default domain not found" }, 404);
    }

    return json({
      code: 0,
      data: {
        packageid: packageId,
        domain,
        domains: {},
        missing: [],
      },
      msg: "Successfully",
      success: true,
    });
  }

  const domains = {};
  const missing = [];

  for (const channel of channels) {
    const config = await getChannelConfig(packageId, packageConfig, channel, env);
    if (!config) {
      missing.push(channel);
      continue;
    }

    const domain = await resolveDomainValue(config);
    if (domain) {
      domains[channel] = domain;
    } else {
      missing.push(channel);
    }
  }

  return json({
    code: 0,
    data: {
      packageid: packageId,
      domains,
      missing,
    },
    msg: "Successfully",
    success: true,
  });
}

async function getChannelConfig(packageId, packageConfig, channel, env) {
  const embeddedConfig = getEmbeddedChannelConfig(packageConfig, channel);
  if (embeddedConfig) return embeddedConfig;

  const keys = [
    `package_${packageId}_channel_${channel}`,
    `package_${packageId}_${channel}`,
    `channel_${packageId}_${channel}`,
  ];

  for (const key of keys) {
    const value = await getKvJsonOrText(key, env);
    if (value) return value;
  }

  return null;
}

function getEmbeddedChannelConfig(packageConfig, channel) {
  if (!packageConfig || typeof packageConfig !== "object") return null;

  const maps = [
    packageConfig.channels,
    packageConfig.channelDomains,
    packageConfig.domains,
  ];

  for (const map of maps) {
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    if (map[channel]) return map[channel];
  }

  if (Array.isArray(packageConfig.channels)) {
    return packageConfig.channels.find((item) => {
      if (!item || typeof item !== "object") return false;
      return (
        safeString(item.channel) === channel ||
        safeString(item.channelId) === channel ||
        safeString(item.code) === channel ||
        safeString(item.id) === channel
      );
    }) || null;
  }

  return null;
}

async function getKvJsonOrText(key, env) {
  const value = await env.allconfig.get(key);
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function resolveDomainValue(config) {
  if (typeof config === "string") return safeString(config);

  if (config && typeof config === "object") {
    if (config.domain || config.list) return getDomain(config);
    return (
      safeString(config.url) ||
      safeString(config.mainDomain) ||
      safeString(config.value)
    );
  }

  return "";
}

// =========================
// Admin 读写 package
// =========================
async function handleGetPackage(packageId, env) {
  const key = `package_${packageId}`;
  const config = await env.allconfig.get(key, { type: "json" });

  if (!config) {
    return json({ error: "config not found" }, 404);
  }

  return json({
    ok: true,
    key,
    config,
  });
}

async function handleSavePackage(packageId, request, env, username) {
  const key = `package_${packageId}`;
  const oldConfig = (await env.allconfig.get(key, { type: "json" })) || null;

  const body = await request.json().catch(() => null);
  if (!body) {
    return json({ error: "invalid json body" }, 400);
  }

  const newConfig = normalizeConfig(body, oldConfig, username);

  if (!newConfig.domain) {
    return json({ error: "domain is required" }, 400);
  }

  await env.allconfig.put(key, JSON.stringify(newConfig));

  return json({
    ok: true,
    message: "saved",
    key,
    config: newConfig,
  });
}

function normalizeConfig(body, oldConfig = null, username = "admin") {
  const now = new Date().toISOString();

  const domain =
    safeString(body.domain) ||
    safeString(body.url) ||
    safeString(body.mainDomain) ||
    safeString(oldConfig?.domain) ||
    "";

  let list =
    normalizeStringArray(body.list) ||
    normalizeStringArray(body.domains) ||
    normalizeStringArray(body.backupDomains) ||
    normalizeStringArray(oldConfig?.list) ||
    [];

  const updatedBy = username;

  const remark =
    safeString(body.remark) ||
    safeString(body.note) ||
    safeString(oldConfig?.remark) ||
    "manual update";

  list = uniqueStrings(list.filter((item) => item && item !== domain));

  const version = Number(oldConfig?.version || 0) + 1;
  const channels = normalizeChannelConfigs(
    body.channels ??
      body.channelDomains ??
      (body.domains && !Array.isArray(body.domains) ? body.domains : undefined) ??
      oldConfig?.channels ??
      oldConfig?.channelDomains ??
      (oldConfig?.domains && !Array.isArray(oldConfig.domains)
        ? oldConfig.domains
        : undefined)
  );

  return {
    domain,
    list,
    channels,
    version,
    updatedAt: now,
    updatedBy,
    remark,
  };
}

function normalizeChannelConfigs(value) {
  if (!value) return {};

  const entries = Array.isArray(value)
    ? value.map((item) => [
        safeString(item?.channel) ||
          safeString(item?.channelId) ||
          safeString(item?.code) ||
          safeString(item?.id),
        item,
      ])
    : typeof value === "object"
      ? Object.entries(value)
      : [];

  const channels = {};

  for (const [rawChannel, rawConfig] of entries) {
    const channel = safeString(rawChannel);
    if (!channel || !rawConfig) continue;

    if (typeof rawConfig === "string") {
      const domain = safeString(rawConfig);
      if (domain) channels[channel] = { domain, list: [] };
      continue;
    }

    if (typeof rawConfig !== "object") continue;

    const domain =
      safeString(rawConfig.domain) ||
      safeString(rawConfig.url) ||
      safeString(rawConfig.mainDomain) ||
      safeString(rawConfig.value);
    const list =
      normalizeStringArray(rawConfig.list) ||
      normalizeStringArray(rawConfig.backupDomains) ||
      [];

    if (!domain) continue;
    channels[channel] = {
      domain,
      list: uniqueStrings(list.filter((item) => item !== domain)),
    };
  }

  return channels;
}

// =========================
// 域名选择（已去掉 priority）
// 优先尝试备用域名，失败后回退主域名
// =========================
async function getDomain(config) {
  const { domain, list = [] } = config;

  for (const url of list) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(1500),
      });

      if (res.ok || res.status === 405) return url;
    } catch {}
  }

  return domain;
}

// =========================
// 工具函数
// =========================
async function signValue(value, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return toBase64Url(sig);
}

function toBase64Url(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseCookie(cookieHeader) {
  const out = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
}

function safeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeStringArray(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
    );
  }

  if (typeof value === "string") {
    return uniqueStrings(
      value
        .split(/[\n,]/)
        .map((v) => v.trim())
        .filter(Boolean)
    );
  }

  return null;
}

function uniqueStrings(arr) {
  return [...new Set(arr)];
}

function base64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function unauthorized() {
  return json({ error: "unauthorized" }, 401);
}
