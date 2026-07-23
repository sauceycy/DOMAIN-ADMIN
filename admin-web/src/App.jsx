import { useEffect, useState } from "react";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [packageId, setPackageId] = useState("1");
  const [domain, setDomain] = useState("");
  const [list, setList] = useState("");
  const [remark, setRemark] = useState("manual update");
  const [channels, setChannels] = useState([]);
  const [output, setOutput] = useState("{}");
  const [status, setStatus] = useState("准备就绪");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkMe();
  }, []);

  async function checkMe() {
    const res = await fetch("/api/admin/me", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (data.loggedIn) {
      setLoggedIn(true);
      setUsername(data.username || "");
    } else {
      setLoggedIn(false);
      setUsername("");
    }
  }

  async function login() {
    setLoading(true);
    setStatus("正在登录...");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || "登录失败");
        return;
      }

      setLoggedIn(true);
      setUsername(data.username || loginUsername);
      setStatus("登录成功");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
    });
    setLoggedIn(false);
    setUsername("");
    setStatus("已退出登录");
  }

  async function loadConfig() {
    setLoading(true);
    setStatus("正在加载配置...");
    try {
      const res = await fetch(`/api/admin/package/${encodeURIComponent(packageId)}`, {
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));
      setOutput(JSON.stringify(data, null, 2));

      if (!res.ok) {
        setStatus(data.error || "加载失败");
        return;
      }

      const config = data.config || {};
      setDomain(config.domain || "");
      setList(Array.isArray(config.list) ? config.list.join("\n") : "");
      setRemark(config.remark || "manual update");
      setChannels(configToChannelRows(config));
      setStatus("配置加载成功");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setLoading(true);
    setStatus("正在保存...");
    try {
      const res = await fetch(`/api/admin/package/${encodeURIComponent(packageId)}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain,
          list,
          remark,
          channels: channelRowsToConfig(channels),
        }),
      });

      const data = await res.json().catch(() => ({}));
      setOutput(JSON.stringify(data, null, 2));

      if (!res.ok) {
        setStatus(data.error || "保存失败");
        return;
      }

      const config = data.config || {};
      setDomain(config.domain || "");
      setList(Array.isArray(config.list) ? config.list.join("\n") : "");
      setRemark(config.remark || "manual update");
      setChannels(configToChannelRows(config));
      setStatus("保存成功");
    } finally {
      setLoading(false);
    }
  }

  function updateChannel(index, field, value) {
    setChannels((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function addChannel() {
    setChannels((current) => [
      ...current,
      { channel: "", domain: "", list: "" },
    ]);
  }

  function removeChannel(index) {
    setChannels((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  if (!loggedIn) {
    return (
      <div style={styles.page}>
        <div style={styles.loginWrap}>
          <div style={styles.loginCard}>
            <div style={styles.loginBadge}>Admin Login</div>
            <h1 style={styles.loginTitle}>后台登录</h1>
            <p style={styles.loginDesc}>登录后才能读取和修改 Cloudflare KV 配置。</p>

            <label style={styles.label}>用户名</label>
            <input
              style={styles.input}
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
            />

            <label style={styles.label}>密码</label>
            <input
              style={styles.input}
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />

            <button style={styles.primaryBtn} onClick={login} disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </button>

            <div style={styles.loginStatus}>{status}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topbar}>
          <div>
            <div style={styles.loginBadge}>Cloudflare KV Admin</div>
            <h1 style={styles.title}>域名配置管理后台</h1>
          </div>
          <div style={styles.userBox}>
            <span>当前管理员：{username}</span>
            <button style={styles.secondaryBtn} onClick={logout}>
              退出登录
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.formGrid}>
            <div>
              <label style={styles.label}>Package ID</label>
              <input
                style={styles.input}
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "end", gap: 12 }}>
              <button style={styles.primaryBtn} onClick={loadConfig} disabled={loading}>
                {loading ? "处理中..." : "加载配置"}
              </button>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <label style={styles.label}>Main Domain</label>
          <input
            style={styles.input}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />

          <label style={styles.label}>Backup Domains</label>
          <textarea
            style={styles.textarea}
            rows={8}
            value={list}
            onChange={(e) => setList(e.target.value)}
          />

          <label style={styles.label}>Remark</label>
          <input
            style={styles.input}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />

          <div style={{ marginTop: 16 }}>
            <button style={styles.primaryBtn} onClick={saveConfig} disabled={loading}>
              {loading ? "处理中..." : "保存到 KV"}
            </button>
          </div>

          <div style={styles.loginStatus}>{status}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>渠道域名</h3>
              <p style={styles.sectionDesc}>
                为当前 Package ID 配置各渠道的主域名和备用域名。
              </p>
            </div>
            <button style={styles.secondaryBtn} onClick={addChannel} disabled={loading}>
              添加渠道
            </button>
          </div>

          {channels.length === 0 ? (
            <div style={styles.emptyState}>暂无渠道配置，点击“添加渠道”开始设置。</div>
          ) : (
            channels.map((item, index) => (
              <div style={styles.channelCard} key={index}>
                <div style={styles.channelGrid}>
                  <div>
                    <label style={styles.label}>渠道标识</label>
                    <input
                      style={styles.input}
                      placeholder="例如 google-play"
                      value={item.channel}
                      onChange={(e) => updateChannel(index, "channel", e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>渠道主域名</label>
                    <input
                      style={styles.input}
                      placeholder="https://example.com"
                      value={item.domain}
                      onChange={(e) => updateChannel(index, "domain", e.target.value)}
                    />
                  </div>
                </div>
                <label style={styles.label}>渠道备用域名（每行一个）</label>
                <textarea
                  style={styles.textarea}
                  rows={3}
                  value={item.list}
                  onChange={(e) => updateChannel(index, "list", e.target.value)}
                />
                <button
                  style={styles.dangerBtn}
                  onClick={() => removeChannel(index)}
                  disabled={loading}
                >
                  删除渠道
                </button>
              </div>
            ))
          )}
        </div>

        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>接口返回</h3>
          <pre style={styles.codeBlock}>{output}</pre>
        </div>
      </div>
    </div>
  );
}

function configToChannelRows(config) {
  const source =
    config.channels || config.channelDomains ||
    (config.domains && !Array.isArray(config.domains) ? config.domains : {});

  if (Array.isArray(source)) {
    return source.map((item) => ({
      channel: item.channel || item.channelId || item.code || item.id || "",
      domain: item.domain || item.url || item.mainDomain || item.value || "",
      list: Array.isArray(item.list)
        ? item.list.join("\n")
        : Array.isArray(item.backupDomains)
          ? item.backupDomains.join("\n")
          : "",
    }));
  }

  if (!source || typeof source !== "object") return [];

  return Object.entries(source).map(([channel, value]) => ({
    channel,
    domain:
      typeof value === "string"
        ? value
        : value?.domain || value?.url || value?.mainDomain || value?.value || "",
    list:
      typeof value === "object" && Array.isArray(value?.list)
        ? value.list.join("\n")
        : typeof value === "object" && Array.isArray(value?.backupDomains)
          ? value.backupDomains.join("\n")
          : "",
  }));
}

function channelRowsToConfig(rows) {
  return rows.reduce((result, item) => {
    const channel = item.channel.trim();
    const domain = item.domain.trim();
    if (!channel || !domain) return result;

    result[channel] = {
      domain,
      list: [...new Set(
        item.list
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter((value) => value && value !== domain)
      )],
    };
    return result;
  }, {});
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
    color: "#e5e7eb",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  container: {
    maxWidth: 1080,
    margin: "0 auto",
    padding: 32,
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  userBox: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  loginWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loginCard: {
    width: "100%",
    maxWidth: 420,
    background: "rgba(15,23,42,0.85)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 24,
    padding: 24,
  },
  loginBadge: {
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: 999,
    background: "rgba(59,130,246,0.15)",
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 12,
  },
  loginTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
  },
  loginDesc: {
    color: "#94a3b8",
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  card: {
    background: "rgba(15,23,42,0.82)",
    border: "1px solid rgba(148,163,184,0.14)",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  label: {
    display: "block",
    marginBottom: 8,
    marginTop: 12,
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: 600,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(2,6,23,0.55)",
    color: "#f8fafc",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(2,6,23,0.55)",
    color: "#f8fafc",
    fontSize: 14,
    resize: "vertical",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  primaryBtn: {
    border: "none",
    borderRadius: 12,
    padding: "12px 18px",
    background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryBtn: {
    border: "1px solid rgba(148,163,184,0.2)",
    borderRadius: 12,
    padding: "10px 14px",
    background: "transparent",
    color: "#e5e7eb",
    fontWeight: 600,
    cursor: "pointer",
  },
  loginStatus: {
    marginTop: 14,
    color: "#cbd5e1",
    fontSize: 14,
  },
  codeBlock: {
    background: "rgba(2,6,23,0.75)",
    color: "#cbd5e1",
    padding: 16,
    borderRadius: 14,
    overflow: "auto",
    fontSize: 13,
    lineHeight: 1.7,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
  },
  sectionDesc: {
    color: "#94a3b8",
    margin: "6px 0 0",
    fontSize: 14,
  },
  emptyState: {
    padding: 20,
    borderRadius: 14,
    border: "1px dashed rgba(148,163,184,0.25)",
    color: "#94a3b8",
    textAlign: "center",
  },
  channelCard: {
    padding: 16,
    marginTop: 14,
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.16)",
    background: "rgba(2,6,23,0.3)",
  },
  channelGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 0.7fr) minmax(260px, 1.3fr)",
    gap: 16,
  },
  dangerBtn: {
    marginTop: 12,
    border: "1px solid rgba(248,113,113,0.35)",
    borderRadius: 10,
    padding: "9px 13px",
    background: "rgba(127,29,29,0.2)",
    color: "#fca5a5",
    fontWeight: 600,
    cursor: "pointer",
  },
};
