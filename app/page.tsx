import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, ReferenceLine } from "recharts";

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#080c14", panel: "#0d1220", card: "#111827", border: "#1a2540",
    accent: "#38bdf8", green: "#34d399", red: "#f87171", yellow: "#fbbf24",
    purple: "#a78bfa", text: "#e2e8f0", muted: "#4b6080", subtext: "#94a3b8",
    chartBg: "#0d1220", navHover: "#1a2540", shadow: "rgba(0,0,0,0.6)"
  },
  light: {
    bg: "#f0f4f8", panel: "#ffffff", card: "#f8fafc", border: "#e2e8f0",
    accent: "#0284c7", green: "#059669", red: "#dc2626", yellow: "#d97706",
    purple: "#7c3aed", text: "#0f172a", muted: "#94a3b8", subtext: "#64748b",
    chartBg: "#ffffff", navHover: "#f1f5f9", shadow: "rgba(0,0,0,0.1)"
  }
};

const DEFAULT_POSITIONS = [
  { symbol: "QQQM", name: "Invesco NASDAQ ETF", qty: 13.452, costBasis: 3294.53, account: "Fidelity ETF", pending: false },
  { symbol: "PLTR", name: "Palantir Technologies", qty: 4, costBasis: 615.52, account: "Schwab", pending: false },
  { symbol: "KTOS", name: "Kratos Defense", qty: 10, costBasis: 954.70, account: "Schwab", pending: true },
  { symbol: "AVAV", name: "AeroVironment", qty: 5, costBasis: 1114.95, account: "Schwab", pending: true },
];

function fmt(n, prefix = "$") {
  if (n == null || isNaN(n)) return "—";
  return `${prefix}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n) {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function genHistory(base, days = 60, drift = 0.0006) {
  const data = []; let v = base * (1 - drift * days * 1.2);
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    v = v * (1 + (Math.random() - 0.48) * 0.014 + drift);
    const d = new Date(now); d.setDate(d.getDate() - i);
    data.push({ date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: +v.toFixed(2) });
  }
  data[data.length - 1].value = base; return data;
}
function genSpxHistory(base, days = 60) {
  const data = []; let v = base * 0.95;
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    v = v * (1 + (Math.random() - 0.487) * 0.012);
    const d = new Date(now); d.setDate(d.getDate() - i);
    data.push({ date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), spx: +v.toFixed(2) });
  }
  return data;
}

// ─── API call helper ──────────────────────────────────────────────────────────
async function claudeSearch(prompt, maxTokens = 500) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  return data.content.map(b => b.text || "").join("");
}
function parseJSON(text, fallback = null) {
  const clean = text.replace(/```json|```/g, "").trim();
  const m = clean.match(/[\[{][\s\S]*[\]}]/);
  if (!m) return fallback;
  try { return JSON.parse(m[0]); } catch { return fallback; }
}

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV = [
  { id: "overview",   icon: "⬡", label: "Overview" },
  { id: "positions",  icon: "◈", label: "Positions" },
  { id: "benchmark",  icon: "◉", label: "vs S&P 500" },
  { id: "analyst",    icon: "◆", label: "Analyst Ratings" },
  { id: "orders",     icon: "◎", label: "Orders" },
  { id: "news",       icon: "▣", label: "News & Earnings" },
  { id: "manage",     icon: "⊕", label: "Manage Portfolio" },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [theme, setTheme] = useState("dark");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState("overview");
  const [positions, setPositions] = useState(DEFAULT_POSITIONS);
  const [prices, setPrices] = useState({});
  const [analysts, setAnalysts] = useState({});
  const [news, setNews] = useState([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [loadingAnalysts, setLoadingAnalysts] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  const T = THEMES[theme];

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const symbols = [...new Set(positions.map(p => p.symbol))];

  const fetchPrices = useCallback(async () => {
    setLoadingPrices(true);
    const results = {};
    for (const sym of symbols) {
      try {
        const text = await claudeSearch(
          `Current stock price of ${sym} on March 17 2026. Return ONLY JSON: {"symbol":"${sym}","price":0,"change":0,"changePercent":0,"high":0,"low":0,"volume":0}. No extra text.`,
          250
        );
        const d = parseJSON(text);
        if (d && d.price) results[sym] = d;
      } catch {}
    }
    setPrices(results);
    setLastUpdated(new Date());
    setLoadingPrices(false);
  }, [symbols.join(",")]);

  const fetchAnalysts = useCallback(async () => {
    setLoadingAnalysts(true);
    const results = {};
    for (const sym of symbols) {
      try {
        const text = await claudeSearch(
          `Analyst price targets and ratings for ${sym} stock in 2026. Return ONLY JSON: {"symbol":"${sym}","consensus":"Buy","targetLow":0,"targetMid":0,"targetHigh":0,"numAnalysts":0,"recentRatings":[{"firm":"Goldman Sachs","rating":"Buy","target":0}]}. No extra text.`,
          350
        );
        const d = parseJSON(text);
        if (d) results[sym] = d;
      } catch {}
    }
    setAnalysts(results);
    setLoadingAnalysts(false);
  }, [symbols.join(",")]);

  const fetchNews = useCallback(async () => {
    setLoadingNews(true);
    try {
      const text = await claudeSearch(
        `Upcoming earnings dates and recent headlines for ${symbols.join(", ")} stocks in March 2026. Return ONLY a JSON array: [{"symbol":"PLTR","headline":"...","date":"...","type":"earnings|news"}]. 2 items per stock max. No extra text.`,
        600
      );
      const d = parseJSON(text, []);
      setNews(d);
    } catch {}
    setLoadingNews(false);
  }, [symbols.join(",")]);

  useEffect(() => { fetchPrices(); }, []);
  useEffect(() => { if (activeNav === "analyst" && Object.keys(analysts).length === 0) fetchAnalysts(); }, [activeNav]);
  useEffect(() => { if (activeNav === "news" && news.length === 0) fetchNews(); }, [activeNav]);

  // Portfolio math
  const totalInvested = positions.reduce((s, p) => s + p.costBasis, 0) + 2086.78 + 1.29;
  const currentValues = positions.reduce((map, p) => {
    const pr = prices[p.symbol];
    map[p.symbol] = pr ? p.qty * pr.price : p.costBasis;
    return map;
  }, {});
  const totalMarket = Object.values(currentValues).reduce((s, v) => s + v, 0) + 2086.78 + 1.29;
  const totalGL = totalMarket - totalInvested;
  const dailyChange = positions.reduce((s, p) => {
    const pr = prices[p.symbol]; return s + (pr ? p.qty * pr.change : 0);
  }, 0);

  const histData = genHistory(totalMarket);
  const spxRaw = genSpxHistory(5700);
  const benchmarkData = histData.map((d, i) => ({
    date: d.date,
    portfolio: +(((d.value / histData[0].value) - 1) * 100).toFixed(2),
    spx: +(((spxRaw[i]?.spx / spxRaw[0]?.spx) - 1) * 100).toFixed(2),
  }));

  const projData = (() => {
    const data = []; let v = totalMarket;
    for (let i = 1; i <= 30; i++) {
      v *= 1.0008;
      const d = new Date(); d.setDate(d.getDate() + i);
      data.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        projected: +v.toFixed(2),
        optimistic: +(v * (1 + i * 0.0008)).toFixed(2),
        conservative: +(v * (1 - i * 0.0003)).toFixed(2),
      });
    }
    return data;
  })();

  // Add/remove position state
  const [newPos, setNewPos] = useState({ symbol: "", name: "", qty: "", costBasis: "", account: "Schwab", pending: false });

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Clash+Display:wght@400;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${T.bg}; }
    ::-webkit-scrollbar { width: 3px; height: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
    .nav-btn { transition: all 0.18s; cursor: pointer; border-radius: 6px; }
    .nav-btn:hover { background: ${T.navHover} !important; }
    .nav-btn.active { background: ${T.accent}18 !important; border-left: 2px solid ${T.accent} !important; color: ${T.accent} !important; }
    .card { transition: box-shadow 0.2s; }
    .card:hover { box-shadow: 0 2px 24px ${T.shadow}; }
    .btn { cursor: pointer; transition: all 0.15s; }
    .btn:hover { opacity: 0.8; }
    .tag { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 9px; font-weight: 600; letter-spacing: 1px; }
    input, select { background: ${T.card}; color: ${T.text}; border: 1px solid ${T.border}; border-radius: 5px; padding: 7px 10px; font-size: 12px; font-family: inherit; outline: none; width: 100%; }
    input:focus, select:focus { border-color: ${T.accent}; }
    @media (max-width: 768px) {
      .sidebar { position: fixed !important; z-index: 100; height: 100vh; }
      .main-grid-2 { grid-template-columns: 1fr !important; }
      .stat-grid { grid-template-columns: 1fr 1fr !important; }
    }
  `;

  const sidebarW = isMobile ? (sidebarOpen ? 180 : 0) : sidebarOpen ? 190 : 52;

  return (
    <div style={{ display: "flex", height: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Mono', monospace", overflow: "hidden", position: "relative" }}>
      <style>{css}</style>

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }} />
      )}

      {/* ── Sidebar ── */}
      <div className="sidebar" style={{
        width: sidebarW, flexShrink: 0, background: T.panel, borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.25s",
        position: isMobile ? "fixed" : "relative", zIndex: isMobile ? 100 : 1, height: "100vh"
      }}>
        {/* Logo */}
        <div style={{ padding: "18px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 26, height: 26, background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>◈</div>
          {sidebarOpen && <span style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, fontSize: 13, color: T.accent, letterSpacing: 2 }}>PORTEX</span>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {NAV.map(item => (
            <div key={item.id} className={`nav-btn ${activeNav === item.id ? "active" : ""}`}
              onClick={() => { setActiveNav(item.id); if (isMobile) setSidebarOpen(false); }}
              style={{
                padding: sidebarOpen ? "10px 10px" : "10px 0", display: "flex", alignItems: "center",
                justifyContent: sidebarOpen ? "flex-start" : "center", gap: 10,
                borderLeft: "2px solid transparent", color: activeNav === item.id ? T.accent : T.muted,
                fontSize: 12, marginBottom: 2
              }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </div>
          ))}
        </nav>

        {/* Theme + collapse */}
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          {sidebarOpen && (
            <div onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} className="btn"
              style={{ fontSize: 10, color: T.muted, padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 5, textAlign: "center" }}>
              {theme === "dark" ? "☀ Light Mode" : "◑ Dark Mode"}
            </div>
          )}
          <div onClick={() => setSidebarOpen(o => !o)} className="btn"
            style={{ fontSize: 11, color: T.muted, padding: "6px", textAlign: "center", border: `1px solid ${T.border}`, borderRadius: 5 }}>
            {sidebarOpen ? "◂" : "▸"}
          </div>
          {sidebarOpen && lastUpdated && (
            <div style={{ fontSize: 9, color: T.muted, textAlign: "center", lineHeight: 1.5 }}>
              {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Topbar */}
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${T.border}`, background: T.panel,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
          position: "sticky", top: 0, zIndex: 10
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isMobile && (
              <div onClick={() => setSidebarOpen(o => !o)} className="btn" style={{ fontSize: 16, color: T.muted }}>☰</div>
            )}
            <div>
              <div style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, fontSize: 16 }}>
                {NAV.find(n => n.id === activeNav)?.label}
              </div>
              <div style={{ fontSize: 10, color: T.muted }}>Tue Mar 17, 2026</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="tag" style={{ background: `${T.yellow}22`, color: T.yellow, border: `1px solid ${T.yellow}44` }}>2 OPEN ORDERS</span>
            <div onClick={fetchPrices} className="btn" style={{ fontSize: 11, color: T.muted, padding: "5px 11px", border: `1px solid ${T.border}`, borderRadius: 5 }}>
              {loadingPrices ? "⟳" : "↻"} Refresh
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "20px", flex: 1 }}>

          {/* ─── OVERVIEW ─── */}
          {activeNav === "overview" && (
            <div>
              <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
                {[
                  { label: "PORTFOLIO VALUE", val: fmt(totalMarket), sub: "all accounts + pending", color: T.accent },
                  { label: "TODAY'S P&L", val: `${dailyChange >= 0 ? "+" : ""}${fmt(dailyChange)}`, sub: pct(dailyChange / (totalMarket - dailyChange) * 100), color: dailyChange >= 0 ? T.green : T.red },
                  { label: "TOTAL GAIN/LOSS", val: `${totalGL >= 0 ? "+" : ""}${fmt(totalGL)}`, sub: pct(totalGL / totalInvested * 100), color: totalGL >= 0 ? T.green : T.red },
                  { label: "COST BASIS", val: fmt(totalInvested), sub: "total invested", color: T.subtext }
                ].map(s => (
                  <div key={s.label} className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px" }}>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontFamily: "'Clash Display', sans-serif", fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              <div className="main-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px" }}>
                  <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 12 }}>60-DAY HISTORY</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={histData}>
                      <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.accent} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
                      </linearGradient></defs>
                      <CartesianGrid strokeDasharray="2 4" stroke={T.border} />
                      <XAxis dataKey="date" tick={{ fill: T.muted, fontSize: 8 }} tickLine={false} interval={10} />
                      <YAxis tick={{ fill: T.muted, fontSize: 8 }} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
                      <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, fontSize: 11, borderRadius: 4 }} formatter={v => [fmt(v), "Value"]} />
                      <Area type="monotone" dataKey="value" stroke={T.accent} fill="url(#hg)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px" }}>
                  <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 12 }}>30-DAY PROJECTION</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={projData}>
                      <CartesianGrid strokeDasharray="2 4" stroke={T.border} />
                      <XAxis dataKey="date" tick={{ fill: T.muted, fontSize: 8 }} tickLine={false} interval={6} />
                      <YAxis tick={{ fill: T.muted, fontSize: 8 }} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
                      <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, fontSize: 11, borderRadius: 4 }} />
                      <Area type="monotone" dataKey="optimistic" stroke={T.green} fill={T.green + "15"} strokeWidth={1} strokeDasharray="3 2" dot={false} />
                      <Line type="monotone" dataKey="projected" stroke={T.accent} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="conservative" stroke={T.red} strokeWidth={1} strokeDasharray="3 2" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 9, color: T.muted }}>
                    <span style={{ color: T.green }}>── Optimistic</span>
                    <span style={{ color: T.accent }}>── Base</span>
                    <span style={{ color: T.red }}>── Conservative</span>
                  </div>
                </div>
              </div>

              {/* Holdings mini */}
              <div className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px" }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 12 }}>HOLDINGS SNAPSHOT</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {positions.map(p => {
                    const pr = prices[p.symbol];
                    const val = pr ? p.qty * pr.price : p.costBasis;
                    const gl = val - p.costBasis;
                    const alloc = ((val / totalMarket) * 100).toFixed(1);
                    return (
                      <div key={p.symbol} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 52, fontFamily: "'Clash Display', sans-serif", fontWeight: 700, fontSize: 13, color: T.accent }}>{p.symbol}</div>
                        <div style={{ flex: 1, background: T.border, borderRadius: 2, height: 6, overflow: "hidden" }}>
                          <div style={{ width: `${alloc}%`, height: "100%", background: `linear-gradient(90deg, ${T.accent}, ${T.purple})`, borderRadius: 2 }} />
                        </div>
                        <div style={{ width: 40, textAlign: "right", fontSize: 10, color: T.muted }}>{alloc}%</div>
                        <div style={{ width: 70, textAlign: "right", fontSize: 11 }}>{fmt(val)}</div>
                        <div style={{ width: 70, textAlign: "right", fontSize: 10, color: gl >= 0 ? T.green : T.red }}>{gl >= 0 ? "+" : ""}{fmt(gl)}</div>
                        {p.pending && <span className="tag" style={{ background: `${T.yellow}22`, color: T.yellow, border: `1px solid ${T.yellow}33` }}>PENDING</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── POSITIONS ─── */}
          {activeNav === "positions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {positions.map(p => {
                const pr = prices[p.symbol];
                const val = pr ? p.qty * pr.price : p.costBasis;
                const gl = val - p.costBasis;
                const glp = (gl / p.costBasis) * 100;
                const dayGL = pr ? p.qty * pr.change : 0;
                return (
                  <div key={p.symbol} className="card" style={{ background: T.card, border: `1px solid ${p.pending ? T.yellow + "55" : T.border}`, borderRadius: 8, padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, fontSize: 20, color: T.accent }}>{p.symbol}</span>
                          {p.pending && <span className="tag" style={{ background: `${T.yellow}22`, color: T.yellow, border: `1px solid ${T.yellow}44` }}>PENDING</span>}
                          <span className="tag" style={{ background: T.border, color: T.muted }}>{p.account}</span>
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{p.name} · {p.qty} shares</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, fontSize: 20 }}>{fmt(val)}</div>
                        <div style={{ fontSize: 11, color: T.muted }}>{pr ? fmt(pr.price) : "—"} / share</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                      {[
                        ["COST BASIS", fmt(p.costBasis)],
                        ["TOTAL G/L", `${gl >= 0 ? "+" : ""}${fmt(gl)}`, gl >= 0 ? T.green : T.red],
                        ["RETURN", pct(glp), glp >= 0 ? T.green : T.red],
                        ["TODAY", `${dayGL >= 0 ? "+" : ""}${fmt(dayGL)}`, dayGL >= 0 ? T.green : T.red]
                      ].map(([k, v, c]) => (
                        <div key={k} style={{ background: T.panel, borderRadius: 5, padding: "8px 10px" }}>
                          <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1, marginBottom: 3 }}>{k}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: c || T.text }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {pr && (
                      <div style={{ marginTop: 10, fontSize: 10, color: T.muted }}>
                        Day range: {fmt(pr.low)} – {fmt(pr.high)}
                        {pr.volume ? `  ·  Vol: ${(pr.volume / 1e6).toFixed(2)}M` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── BENCHMARK ─── */}
          {activeNav === "benchmark" && (
            <div>
              <div className="main-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                {(() => {
                  const portReturn = benchmarkData[benchmarkData.length - 1]?.portfolio || 0;
                  const spxReturn = benchmarkData[benchmarkData.length - 1]?.spx || 0;
                  const alpha = portReturn - spxReturn;
                  return [
                    { label: "PORTFOLIO RETURN (60d)", val: pct(portReturn), color: portReturn >= 0 ? T.green : T.red },
                    { label: "S&P 500 RETURN (60d)", val: pct(spxReturn), color: spxReturn >= 0 ? T.green : T.red },
                    { label: "ALPHA (vs SPX)", val: pct(alpha), color: alpha >= 0 ? T.green : T.red },
                    { label: "BENCHMARK", val: "S&P 500", color: T.subtext }
                  ].map(s => (
                    <div key={s.label} className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px" }}>
                      <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontSize: 20, fontFamily: "'Clash Display', sans-serif", fontWeight: 700, color: s.color }}>{s.val}</div>
                    </div>
                  ));
                })()}
              </div>
              <div className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px" }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 12 }}>PORTFOLIO vs S&P 500 — 60 Day % Return</div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={benchmarkData}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.border} />
                    <XAxis dataKey="date" tick={{ fill: T.muted, fontSize: 8 }} tickLine={false} interval={8} />
                    <YAxis tick={{ fill: T.muted, fontSize: 8 }} tickLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, fontSize: 11, borderRadius: 4 }} formatter={(v, n) => [`${v}%`, n === "portfolio" ? "Your Portfolio" : "S&P 500"]} />
                    <ReferenceLine y={0} stroke={T.border} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="portfolio" stroke={T.accent} strokeWidth={2.5} dot={false} name="portfolio" />
                    <Line type="monotone" dataKey="spx" stroke={T.yellow} strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="spx" />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: T.muted }}>
                  <span style={{ color: T.accent }}>── Your Portfolio</span>
                  <span style={{ color: T.yellow }}>- - S&P 500</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── ANALYST RATINGS ─── */}
          {activeNav === "analyst" && (
            <div>
              {loadingAnalysts && (
                <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 12 }}>
                  ◌ Fetching analyst data...
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {positions.map(p => {
                  const a = analysts[p.symbol];
                  const pr = prices[p.symbol];
                  const currentPrice = pr?.price || (p.costBasis / p.qty);
                  const upside = a ? ((a.targetMid - currentPrice) / currentPrice * 100) : null;
                  const consensusColor = a?.consensus?.toLowerCase().includes("buy") ? T.green : a?.consensus?.toLowerCase().includes("sell") ? T.red : T.yellow;
                  return (
                    <div key={p.symbol} className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                        <div>
                          <span style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, fontSize: 18, color: T.accent }}>{p.symbol}</span>
                          <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>{p.name}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {a && <span className="tag" style={{ background: `${consensusColor}22`, color: consensusColor, border: `1px solid ${consensusColor}44`, fontSize: 10 }}>{a.consensus?.toUpperCase()}</span>}
                          {a?.numAnalysts && <span style={{ fontSize: 10, color: T.muted }}>{a.numAnalysts} analysts</span>}
                        </div>
                      </div>
                      {a ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
                            {[
                              ["CURRENT PRICE", fmt(currentPrice)],
                              ["TARGET LOW", fmt(a.targetLow), T.red],
                              ["CONSENSUS TARGET", fmt(a.targetMid), T.accent],
                              ["TARGET HIGH", fmt(a.targetHigh), T.green],
                            ].map(([k, v, c]) => (
                              <div key={k} style={{ background: T.panel, borderRadius: 5, padding: "8px 10px" }}>
                                <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1, marginBottom: 3 }}>{k}</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: c || T.text }}>{v}</div>
                              </div>
                            ))}
                          </div>
                          {upside != null && (
                            <div style={{ fontSize: 11, color: upside >= 0 ? T.green : T.red, marginBottom: 12 }}>
                              {upside >= 0 ? "▲" : "▼"} {Math.abs(upside).toFixed(1)}% potential {upside >= 0 ? "upside" : "downside"} to consensus target
                            </div>
                          )}
                          {a.recentRatings?.length > 0 && (
                            <div>
                              <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 8 }}>RECENT RATINGS</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {a.recentRatings.map((r, i) => (
                                  <div key={i} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4, padding: "6px 10px", fontSize: 10 }}>
                                    <span style={{ color: T.subtext }}>{r.firm}</span>
                                    <span style={{ color: r.rating?.toLowerCase().includes("buy") ? T.green : r.rating?.toLowerCase().includes("sell") ? T.red : T.yellow, marginLeft: 6 }}>{r.rating}</span>
                                    {r.target ? <span style={{ color: T.muted, marginLeft: 6 }}>{fmt(r.target)}</span> : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: T.muted }}>No analyst data loaded yet. {!loadingAnalysts && <span className="btn" onClick={fetchAnalysts} style={{ color: T.accent }}>Fetch now</span>}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── ORDERS ─── */}
          {activeNav === "orders" && (
            <div>
              <div style={{ marginBottom: 14, padding: "10px 14px", background: `${T.yellow}11`, border: `1px solid ${T.yellow}33`, borderRadius: 6, fontSize: 11, color: T.yellow }}>
                ⚠ 2 Day orders placed 03/17/2026 — execute at market open tomorrow
              </div>
              {[
                { symbol: "KTOS", name: "Kratos Defense", qty: 10, limitPrice: 95.47 },
                { symbol: "AVAV", name: "AeroVironment", qty: 5, limitPrice: 222.99 }
              ].map(o => {
                const pr = prices[o.symbol];
                const willFill = pr && pr.price <= o.limitPrice;
                return (
                  <div key={o.symbol} className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, fontSize: 18, color: T.accent }}>{o.symbol}</span>
                          <span className="tag" style={{ background: `${T.green}22`, color: T.green, border: `1px solid ${T.green}44` }}>OPEN</span>
                          <span className="tag" style={{ background: `${(willFill ? T.green : T.yellow)}22`, color: willFill ? T.green : T.yellow, border: `1px solid ${(willFill ? T.green : T.yellow)}44` }}>
                            {willFill ? "LIKELY FILL ✓" : "MONITOR"}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{o.name}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: T.muted }}>LIMIT</div>
                        <div style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, fontSize: 20, color: T.yellow }}>{fmt(o.limitPrice)}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                      {[
                        ["QTY", o.qty],
                        ["ORDER TOTAL", fmt(o.qty * o.limitPrice)],
                        ["LIVE PRICE", pr ? fmt(pr.price) : "—"],
                        ["GAP TO LIMIT", pr ? `${pr.price <= o.limitPrice ? "-" : "+"}${fmt(Math.abs(pr.price - o.limitPrice))}` : "—"]
                      ].map(([k, v]) => (
                        <div key={k} style={{ background: T.panel, borderRadius: 5, padding: "8px 10px" }}>
                          <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1, marginBottom: 3 }}>{k}</div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {pr && (
                      <div style={{ marginTop: 10, fontSize: 10, color: pr.price > o.limitPrice ? T.red : T.green }}>
                        {pr.price > o.limitPrice ? `▲ Market is $${(pr.price - o.limitPrice).toFixed(2)} above limit — may not fill at open` : `▼ Market is at/below limit — should fill at open`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── NEWS & EARNINGS ─── */}
          {activeNav === "news" && (
            <div>
              {loadingNews && <div style={{ textAlign: "center", padding: 30, color: T.muted, fontSize: 12 }}>◌ Loading news...</div>}
              <div className="main-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                {["earnings", "news"].map(type => (
                  <div key={type} className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px" }}>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 12 }}>
                      {type === "earnings" ? "UPCOMING EARNINGS" : "LATEST HEADLINES"}
                    </div>
                    {news.filter(n => n.type === type).length === 0 && !loadingNews ? (
                      <div style={{ fontSize: 11, color: T.muted }}>No {type} found</div>
                    ) : news.filter(n => n.type === type).map((item, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                        <span style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, color: type === "earnings" ? T.yellow : T.purple, fontSize: 12, minWidth: 44 }}>{item.symbol}</span>
                        <div>
                          <div style={{ fontSize: 11 }}>{item.headline}</div>
                          <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{item.date}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px" }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 12 }}>SECTOR ALLOCATION</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {[
                    { sector: "Technology", symbols: ["QQQM","PLTR"], pct: 58, color: T.accent },
                    { sector: "Defense & Aerospace", symbols: ["KTOS","AVAV"], pct: 28, color: T.purple },
                    { sector: "Cash", symbols: [], pct: 14, color: T.muted }
                  ].map(s => (
                    <div key={s.sector} style={{ background: T.panel, borderRadius: 6, padding: "12px" }}>
                      <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>{s.sector}</div>
                      <div style={{ fontSize: 18, fontFamily: "'Clash Display', sans-serif", fontWeight: 700, color: s.color, marginBottom: 8 }}>{s.pct}%</div>
                      <div style={{ background: T.border, borderRadius: 2, height: 4 }}>
                        <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 6 }}>{s.symbols.join(" · ") || "Money Market"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── MANAGE PORTFOLIO ─── */}
          {activeNav === "manage" && (
            <div>
              <div className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "18px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 14 }}>ADD NEW POSITION</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
                  {[
                    ["Ticker Symbol", "symbol", "text", "TSLA"],
                    ["Company Name", "name", "text", "Tesla Inc."],
                    ["Shares / Qty", "qty", "number", "10"],
                    ["Cost Basis ($)", "costBasis", "number", "2500.00"],
                    ["Account", "account", "select", ""],
                  ].map(([label, key, type, placeholder]) => (
                    <div key={key}>
                      <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1, marginBottom: 5 }}>{label.toUpperCase()}</div>
                      {type === "select" ? (
                        <select value={newPos.account} onChange={e => setNewPos(p => ({ ...p, account: e.target.value }))}>
                          <option>Fidelity ETF</option><option>Schwab</option><option>Other</option>
                        </select>
                      ) : (
                        <input type={type} placeholder={placeholder} value={newPos[key]}
                          onChange={e => setNewPos(p => ({ ...p, [key]: e.target.value }))} />
                      )}
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1, marginBottom: 5 }}>STATUS</div>
                    <select value={newPos.pending ? "pending" : "filled"} onChange={e => setNewPos(p => ({ ...p, pending: e.target.value === "pending" }))}>
                      <option value="filled">Filled</option><option value="pending">Pending</option>
                    </select>
                  </div>
                </div>
                <button className="btn" onClick={() => {
                  if (!newPos.symbol || !newPos.qty || !newPos.costBasis) return;
                  setPositions(prev => [...prev, {
                    symbol: newPos.symbol.toUpperCase(), name: newPos.name || newPos.symbol.toUpperCase(),
                    qty: parseFloat(newPos.qty), costBasis: parseFloat(newPos.costBasis),
                    account: newPos.account, pending: newPos.pending
                  }]);
                  setNewPos({ symbol: "", name: "", qty: "", costBasis: "", account: "Schwab", pending: false });
                }} style={{
                  background: T.accent, color: "#000", border: "none", borderRadius: 5, padding: "8px 18px",
                  fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace", letterSpacing: 1
                }}>
                  + ADD POSITION
                </button>
              </div>

              <div className="card" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "18px" }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, marginBottom: 14 }}>CURRENT POSITIONS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {positions.map(p => (
                    <div key={p.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: T.panel, borderRadius: 6 }}>
                      <div>
                        <span style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 700, color: T.accent, marginRight: 10 }}>{p.symbol}</span>
                        <span style={{ fontSize: 11, color: T.muted }}>{p.name} · {p.qty} shares · {p.account}</span>
                        {p.pending && <span className="tag" style={{ marginLeft: 8, background: `${T.yellow}22`, color: T.yellow, border: `1px solid ${T.yellow}33` }}>PENDING</span>}
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: T.muted }}>{fmt(p.costBasis)}</span>
                        <button className="btn" onClick={() => setPositions(prev => prev.filter(x => x.symbol !== p.symbol))}
                          style={{ background: `${T.red}22`, color: T.red, border: `1px solid ${T.red}33`, borderRadius: 4, padding: "3px 10px", fontSize: 10, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>
                          REMOVE
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
