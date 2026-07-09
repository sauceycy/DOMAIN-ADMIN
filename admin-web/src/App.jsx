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
      setStatus("保存成功");
    } finally {
      setLoading(false);
    }
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
          <h3 style={{ marginTop: 0 }}>接口返回</h3>
          <pre style={styles.codeBlock}>{output}</pre>
        </div>
      </div>
    </div>
  );
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
};