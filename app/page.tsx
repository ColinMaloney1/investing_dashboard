"use client";

import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

type ThemeName = "dark" | "light";

type QuoteMap = Record<
  string,
  {
    current: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    volume: number;
  }
>;

type Position = {
  symbol: string;
  name: string;
  qty: number;
  costBasis: number;
  account: string;
  pending: boolean;
};

const THEMES = {
  dark: {
    bg: "#080c14",
    panel: "#0d1220",
    card: "#111827",
    border: "#1a2540",
    accent: "#38bdf8",
    green: "#34d399",
    red: "#f87171",
    yellow: "#fbbf24",
    purple: "#a78bfa",
    text: "#e2e8f0",
    muted: "#4b6080",
    subtext: "#94a3b8",
    chartBg: "#0d1220",
    navHover: "#1a2540",
    shadow: "rgba(0,0,0,0.6)",
  },
  light: {
    bg: "#f0f4f8",
    panel: "#ffffff",
    card: "#f8fafc",
    border: "#e2e8f0",
    accent: "#0284c7",
    green: "#059669",
    red: "#dc2626",
    yellow: "#d97706",
    purple: "#7c3aed",
    text: "#0f172a",
    muted: "#94a3b8",
    subtext: "#64748b",
    chartBg: "#ffffff",
    navHover: "#f1f5f9",
    shadow: "rgba(0,0,0,0.1)",
  },
} as const;

const DEFAULT_POSITIONS: Position[] = [
  {
    symbol: "QQQM",
    name: "Invesco NASDAQ ETF",
    qty: 13.452,
    costBasis: 3294.53,
    account: "Fidelity ETF",
    pending: false,
  },
  {
    symbol: "PLTR",
    name: "Palantir Technologies",
    qty: 4,
    costBasis: 615.52,
    account: "Schwab",
    pending: false,
  },
  {
    symbol: "KTOS",
    name: "Kratos Defense",
    qty: 10,
    costBasis: 954.7,
    account: "Schwab",
    pending: true,
  },
  {
    symbol: "AVAV",
    name: "AeroVironment",
    qty: 5,
    costBasis: 1114.95,
    account: "Schwab",
    pending: true,
  },
];

const ORDER_DETAILS: Record<
  string,
  { limitPrice: number; bid: number; ask: number; last: number; created: string }
> = {
  KTOS: {
    limitPrice: 95.47,
    bid: 95.42,
    ask: 95.7,
    last: 95.61,
    created: "03/17/2026 5:50 PM ET",
  },
  AVAV: {
    limitPrice: 222.99,
    bid: 222.41,
    ask: 223.5,
    last: 222.55,
    created: "03/17/2026 5:49 PM ET",
  },
};

const CASH = [
  { name: "Brokerage Cash", value: 2086.78 },
  { name: "ETF Cash", value: 1.29 },
];

const NAV = [
  { id: "overview", icon: "⬡", label: "Overview" },
  { id: "positions", icon: "◈", label: "Positions" },
  { id: "benchmark", icon: "◉", label: "vs S&P 500" },
  { id: "orders", icon: "◎", label: "Orders" },
  { id: "manage", icon: "⊕", label: "Manage Portfolio" },
] as const;

function fmt(n: number | null | undefined, prefix = "$") {
  if (n == null || Number.isNaN(n)) return "—";
  return `${prefix}${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function genHistory(base: number, days = 60, drift = 0.0006) {
  const data: { date: string; value: number }[] = [];
  let v = base * (1 - drift * days * 1.2);
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    v = v * (1 + (Math.random() - 0.48) * 0.014 + drift);
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: +v.toFixed(2),
    });
  }

  data[data.length - 1].value = base;
  return data;
}

function genSpxHistory(base: number, days = 60) {
  const data: { date: string; spx: number }[] = [];
  let v = base * 0.95;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    v = v * (1 + (Math.random() - 0.487) * 0.012);
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      spx: +v.toFixed(2),
    });
  }

  return data;
}

export default function Dashboard() {
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState("overview");
  const [positions, setPositions] = useState<Position[]>(DEFAULT_POSITIONS);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  const [newPos, setNewPos] = useState({
    symbol: "",
    name: "",
    qty: "",
    costBasis: "",
    account: "Schwab",
    pending: false,
  });

  const T = THEMES[theme];

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const symbols = useMemo(() => [...new Set(positions.map((p) => p.symbol))], [positions]);

  async function fetchPrices() {
    try {
      setLoadingPrices(true);
      setQuoteError("");

      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load quotes");
      }

      setQuotes(data.quotes || {});
      setLastUpdated(new Date());
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : "Failed to load quotes");
    } finally {
      setLoadingPrices(false);
    }
  }

  useEffect(() => {
    fetchPrices();
  }, [symbols.join(",")]);

  const totalCash = CASH.reduce((s, c) => s + c.value, 0);

  const currentValues: Record<string, number> = {};
  positions.forEach((p) => {
    const live = quotes[p.symbol];
    const currentPrice = live?.current || p.costBasis / p.qty;
    currentValues[p.symbol] = p.qty * currentPrice;
  });

  const totalInvested = positions.reduce((s, p) => s + p.costBasis, 0) + totalCash;
  const totalMarket = Object.values(currentValues).reduce((s, v) => s + v, 0) + totalCash;
  const totalGL = totalMarket - totalInvested;
  const totalGLPct = totalInvested ? (totalGL / totalInvested) * 100 : 0;

  const dailyChange = positions.reduce((s, p) => {
    const q = quotes[p.symbol];
    return s + (q ? p.qty * q.change : 0);
  }, 0);

  const histData = genHistory(totalMarket);
  const spxRaw = genSpxHistory(5700);
  const benchmarkData = histData.map((d, i) => ({
    date: d.date,
    portfolio: +(((d.value / histData[0].value) - 1) * 100).toFixed(2),
    spx: +(((spxRaw[i]?.spx / spxRaw[0]?.spx) - 1) * 100).toFixed(2),
  }));

  const projData = (() => {
    const data: { date: string; projected: number; optimistic: number; conservative: number }[] = [];
    let v = totalMarket;
    for (let i = 1; i <= 30; i++) {
      v *= 1.0008;
      const d = new Date();
      d.setDate(d.getDate() + i);
      data.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        projected: +v.toFixed(2),
        optimistic: +(v * (1 + i * 0.0008)).toFixed(2),
        conservative: +(v * (1 - i * 0.0003)).toFixed(2),
      });
    }
    return data;
  })();

  const css = `
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
    .btn:hover { opacity: 0.85; }
    .tag { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 9px; font-weight: 600; letter-spacing: 1px; }
    input, select {
      background: ${T.card};
      color: ${T.text};
      border: 1px solid ${T.border};
      border-radius: 5px;
      padding: 7px 10px;
      font-size: 12px;
      width: 100%;
      outline: none;
    }
    input:focus, select:focus { border-color: ${T.accent}; }
    @media (max-width: 768px) {
      .sidebar { position: fixed !important; z-index: 100; height: 100vh; }
      .main-grid-2 { grid-template-columns: 1fr !important; }
      .stat-grid { grid-template-columns: 1fr 1fr !important; }
    }
  `;

  const sidebarW = isMobile ? (sidebarOpen ? 180 : 0) : sidebarOpen ? 190 : 52;

  const addPosition = () => {
    if (!newPos.symbol || !newPos.name || !newPos.qty || !newPos.costBasis) return;
    setPositions((prev) => [
      ...prev,
      {
        symbol: newPos.symbol.toUpperCase(),
        name: newPos.name,
        qty: Number(newPos.qty),
        costBasis: Number(newPos.costBasis),
        account: newPos.account,
        pending: newPos.pending,
      },
    ]);
    setNewPos({
      symbol: "",
      name: "",
      qty: "",
      costBasis: "",
      account: "Schwab",
      pending: false,
    });
  };

  const removePosition = (symbol: string) => {
    setPositions((prev) => prev.filter((p) => p.symbol !== symbol));
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: T.bg,
        color: T.text,
        overflow: "hidden",
        position: "relative",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <style>{css}</style>

      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
        />
      )}

      <div
        className="sidebar"
        style={{
          width: sidebarW,
          flexShrink: 0,
          background: T.panel,
          borderRight: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.25s",
          position: isMobile ? "fixed" : "relative",
          zIndex: isMobile ? 100 : 1,
          height: "100vh",
        }}
      >
        <div
          style={{
            padding: "18px 14px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            ◈
          </div>
          {sidebarOpen && (
            <span
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: T.accent,
                letterSpacing: 2,
              }}
            >
              PORTEX
            </span>
          )}
        </div>

        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {NAV.map((item) => (
            <div
              key={item.id}
              className={`nav-btn ${activeNav === item.id ? "active" : ""}`}
              onClick={() => {
                setActiveNav(item.id);
                if (isMobile) setSidebarOpen(false);
              }}
              style={{
                padding: sidebarOpen ? "10px 10px" : "10px 0",
                display: "flex",
                alignItems: "center",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                gap: 10,
                marginBottom: 4,
                color: T.subtext,
                borderLeft: "2px solid transparent",
              }}
            >
              <span>{item.icon}</span>
              {sidebarOpen && <span style={{ fontSize: 12 }}>{item.label}</span>}
            </div>
          ))}
        </nav>

        <div style={{ padding: 8, borderTop: `1px solid ${T.border}` }}>
          <button
            className="btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            style={{
              width: "100%",
              background: T.card,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 12,
            }}
          >
            Toggle Theme
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            padding: "18px 22px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            position: "sticky",
            top: 0,
            background: T.bg,
            zIndex: 5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              style={{
                background: T.panel,
                color: T.text,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              ☰
            </button>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Investing Dashboard</div>
              <div style={{ fontSize: 11, color: T.subtext }}>
                {loadingPrices
                  ? "Refreshing live quotes..."
                  : quoteError
                  ? quoteError
                  : lastUpdated
                  ? `Last updated ${lastUpdated.toLocaleTimeString()}`
                  : "Ready"}
              </div>
            </div>
          </div>

          <button
            className="btn"
            onClick={fetchPrices}
            style={{
              background: T.accent,
              color: "#001018",
              border: "none",
              borderRadius: 6,
              padding: "10px 14px",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ padding: 22 }}>
          <div
            className="stat-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <StatCard T={T} title="Portfolio Value" value={fmt(totalMarket)} subtitle="Market value incl. cash" />
            <StatCard T={T} title="Total Gain/Loss" value={fmt(totalGL)} subtitle={pct(totalGLPct)} />
            <StatCard T={T} title="Day Change" value={fmt(dailyChange)} subtitle="Live daily move" />
            <StatCard T={T} title="Cash" value={fmt(totalCash)} subtitle="Available cash" />
          </div>

          {activeNav === "overview" && (
            <div className="main-grid-2" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
              <Panel T={T} title="Portfolio Value History">
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <AreaChart data={histData}>
                      <defs>
                        <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.accent} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={T.accent} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={T.border} strokeDasharray="2 2" />
                      <XAxis dataKey="date" tick={{ fill: T.subtext, fontSize: 10 }} />
                      <YAxis tick={{ fill: T.subtext, fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke={T.accent} fill="url(#gradPortfolio)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel T={T} title="Allocation">
                <div style={{ display: "grid", gap: 10 }}>
                  {positions.map((p) => {
                    const mv = currentValues[p.symbol] || p.costBasis;
                    const weight = totalMarket ? (mv / totalMarket) * 100 : 0;
                    return (
                      <div key={p.symbol} style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                          <span>{p.symbol}</span>
                          <span>{weight.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: 8, background: T.border, borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${weight}%`, height: "100%", background: T.accent }} />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <span>Cash</span>
                      <span>{((totalCash / totalMarket) * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 8, background: T.border, borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${(totalCash / totalMarket) * 100}%`, height: "100%", background: T.purple }} />
                    </div>
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {activeNav === "positions" && (
            <Panel T={T} title="Current Positions">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: T.subtext, textAlign: "left" }}>
                      <th style={thStyle}>Symbol</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Qty</th>
                      <th style={thStyle}>Price</th>
                      <th style={thStyle}>Day %</th>
                      <th style={thStyle}>Market Value</th>
                      <th style={thStyle}>Cost Basis</th>
                      <th style={thStyle}>Gain/Loss</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const q = quotes[p.symbol];
                      const price = q?.current ?? p.costBasis / p.qty;
                      const mv = p.qty * price;
                      const gl = mv - p.costBasis;
                      const glPct = p.costBasis ? (gl / p.costBasis) * 100 : 0;
                      return (
                        <tr key={p.symbol} style={{ borderTop: `1px solid ${T.border}` }}>
                          <td style={tdStyle}>{p.symbol}</td>
                          <td style={tdStyle}>{p.name}</td>
                          <td style={tdStyle}>{p.qty}</td>
                          <td style={tdStyle}>{fmt(price)}</td>
                          <td style={{ ...tdStyle, color: (q?.changePercent ?? 0) >= 0 ? T.green : T.red }}>
                            {pct(q?.changePercent ?? 0)}
                          </td>
                          <td style={tdStyle}>{fmt(mv)}</td>
                          <td style={tdStyle}>{fmt(p.costBasis)}</td>
                          <td style={{ ...tdStyle, color: gl >= 0 ? T.green : T.red }}>
                            {fmt(gl)} / {pct(glPct)}
                          </td>
                          <td style={tdStyle}>
                            <span
                              className="tag"
                              style={{
                                background: p.pending ? `${T.yellow}20` : `${T.green}20`,
                                color: p.pending ? T.yellow : T.green,
                              }}
                            >
                              {p.pending ? "PENDING" : "LIVE"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {activeNav === "benchmark" && (
            <Panel T={T} title="Portfolio vs S&P 500">
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={benchmarkData}>
                    <CartesianGrid stroke={T.border} strokeDasharray="2 2" />
                    <XAxis dataKey="date" tick={{ fill: T.subtext, fontSize: 10 }} />
                    <YAxis tick={{ fill: T.subtext, fontSize: 10 }} unit="%" />
                    <Tooltip />
                    <ReferenceLine y={0} stroke={T.border} />
                    <Line type="monotone" dataKey="portfolio" stroke={T.accent} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="spx" stroke={T.purple} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          {activeNav === "orders" && (
            <Panel T={T} title="Open Orders">
              <div style={{ display: "grid", gap: 10 }}>
                {positions
                  .filter((p) => p.pending)
                  .map((p) => {
                    const od = ORDER_DETAILS[p.symbol];
                    const live = quotes[p.symbol];
                    const last = live?.current ?? od?.last ?? p.costBasis / p.qty;
                    return (
                      <div
                        key={p.symbol}
                        style={{
                          border: `1px solid ${T.border}`,
                          borderRadius: 8,
                          padding: 12,
                          display: "grid",
                          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        <div>
                          <div style={{ color: T.subtext, fontSize: 10 }}>Symbol</div>
                          <div>{p.symbol}</div>
                        </div>
                        <div>
                          <div style={{ color: T.subtext, fontSize: 10 }}>Qty</div>
                          <div>{p.qty}</div>
                        </div>
                        <div>
                          <div style={{ color: T.subtext, fontSize: 10 }}>Limit</div>
                          <div>{fmt(od?.limitPrice)}</div>
                        </div>
                        <div>
                          <div style={{ color: T.subtext, fontSize: 10 }}>Last</div>
                          <div>{fmt(last)}</div>
                        </div>
                        <div>
                          <div style={{ color: T.subtext, fontSize: 10 }}>Notional</div>
                          <div>{fmt((od?.limitPrice ?? 0) * p.qty)}</div>
                        </div>
                        <div>
                          <div style={{ color: T.subtext, fontSize: 10 }}>Created</div>
                          <div>{od?.created ?? "—"}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Panel>
          )}

          {activeNav === "manage" && (
            <div className="main-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Panel T={T} title="Add Position">
                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    placeholder="Symbol"
                    value={newPos.symbol}
                    onChange={(e) => setNewPos({ ...newPos, symbol: e.target.value })}
                  />
                  <input
                    placeholder="Name"
                    value={newPos.name}
                    onChange={(e) => setNewPos({ ...newPos, name: e.target.value })}
                  />
                  <input
                    placeholder="Quantity"
                    value={newPos.qty}
                    onChange={(e) => setNewPos({ ...newPos, qty: e.target.value })}
                  />
                  <input
                    placeholder="Cost Basis"
                    value={newPos.costBasis}
                    onChange={(e) => setNewPos({ ...newPos, costBasis: e.target.value })}
                  />
                  <select
                    value={newPos.account}
                    onChange={(e) => setNewPos({ ...newPos, account: e.target.value })}
                  >
                    <option>Schwab</option>
                    <option>Fidelity ETF</option>
                    <option>Brokerage</option>
                  </select>
                  <select
                    value={String(newPos.pending)}
                    onChange={(e) => setNewPos({ ...newPos, pending: e.target.value === "true" })}
                  >
                    <option value="false">Live Position</option>
                    <option value="true">Pending Order</option>
                  </select>
                  <button
                    className="btn"
                    onClick={addPosition}
                    style={{
                      background: T.accent,
                      color: "#001018",
                      border: "none",
                      borderRadius: 6,
                      padding: "10px 12px",
                      fontWeight: 700,
                    }}
                  >
                    Add Position
                  </button>
                </div>
              </Panel>

              <Panel T={T} title="Remove Position">
                <div style={{ display: "grid", gap: 8 }}>
                  {positions.map((p) => (
                    <div
                      key={p.symbol}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        padding: 10,
                      }}
                    >
                      <div>
                        <div>{p.symbol}</div>
                        <div style={{ fontSize: 10, color: T.subtext }}>{p.name}</div>
                      </div>
                      <button
                        className="btn"
                        onClick={() => removePosition(p.symbol)}
                        style={{
                          background: `${T.red}20`,
                          color: T.red,
                          border: `1px solid ${T.red}40`,
                          borderRadius: 6,
                          padding: "8px 10px",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel T={T} title="30-Day Projection">
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={projData}>
                      <CartesianGrid stroke={T.border} strokeDasharray="2 2" />
                      <XAxis dataKey="date" tick={{ fill: T.subtext, fontSize: 10 }} />
                      <YAxis tick={{ fill: T.subtext, fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="projected" stroke={T.accent} dot={false} />
                      <Line type="monotone" dataKey="optimistic" stroke={T.green} dot={false} />
                      <Line type="monotone" dataKey="conservative" stroke={T.red} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({
  T,
  title,
  children,
}: {
  T: (typeof THEMES)[ThemeName];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function StatCard({
  T,
  title,
  value,
  subtitle,
}: {
  T: (typeof THEMES)[ThemeName];
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div
      className="card"
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div style={{ color: T.subtext, fontSize: 11 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{value}</div>
      <div style={{ color: T.subtext, fontSize: 11, marginTop: 6 }}>{subtitle}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 8px",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 8px",
  verticalAlign: "top",
};
