"use client";

import React, { useEffect, useMemo, useState } from "react";

type ThemeName = "dark" | "light";

type QuoteMap = Record<
  string,
  {
    current: number;
    change: number;
    percent: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
  }
>;

type BasePosition = {
  symbol: string;
  name: string;
  qty: number;
  costBasis: number;
  account: string;
  pending?: boolean;
  fallbackPrice: number;
  limitPrice?: number;
  bid?: number;
  ask?: number;
  last?: number;
  created?: string;
};

const BASE_POSITIONS: BasePosition[] = [
  {
    symbol: "QQQM",
    name: "Invesco NASDAQ 100 ETF",
    qty: 13.452,
    costBasis: 3294.53,
    account: "Fidelity ETF",
    fallbackPrice: 248.45,
  },
  {
    symbol: "PLTR",
    name: "Palantir Technologies",
    qty: 4,
    costBasis: 615.52,
    account: "Schwab",
    fallbackPrice: 154.9,
  },
  {
    symbol: "KTOS",
    name: "Kratos Defense",
    qty: 10,
    costBasis: 954.7,
    account: "Schwab",
    pending: true,
    fallbackPrice: 95.42,
    limitPrice: 95.47,
    bid: 95.42,
    ask: 95.7,
    last: 95.61,
    created: "03/17/2026 5:50 PM ET",
  },
  {
    symbol: "AVAV",
    name: "AeroVironment",
    qty: 5,
    costBasis: 1114.95,
    account: "Schwab",
    pending: true,
    fallbackPrice: 222.51,
    limitPrice: 222.99,
    bid: 222.41,
    ask: 223.5,
    last: 222.55,
    created: "03/17/2026 5:49 PM ET",
  },
];

const CASH = [
  { name: "Brokerage Cash", value: 2086.78 },
  { name: "ETF Cash", value: 1.29 },
];

const THEMES = {
  dark: {
    bg: "#080c14",
    panel: "#0d1220",
    card: "#111827",
    border: "#1a2540",
    accent: "#38bdf8",
    green: "#34d399",
    red: "#f87171",
    text: "#e2e8f0",
    subtext: "#94a3b8",
    navHover: "#1a2540",
    shadow: "rgba(0,0,0,0.45)",
  },
  light: {
    bg: "#f0f4f8",
    panel: "#ffffff",
    card: "#f8fafc",
    border: "#e2e8f0",
    accent: "#0284c7",
    green: "#059669",
    red: "#dc2626",
    text: "#0f172a",
    subtext: "#64748b",
    navHover: "#f1f5f9",
    shadow: "rgba(0,0,0,0.12)",
  },
};

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Orders" },
  { id: "cash", label: "Cash" },
] as const;

function currency(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function number(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export default function Page() {
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [activeNav, setActiveNav] = useState("overview");
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [error, setError] = useState<string>("");

  const T = THEMES[theme];

  const symbols = useMemo(
    () => BASE_POSITIONS.map((p) => p.symbol).join(","),
    []
  );

  async function refreshQuotes() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load quotes");
      }

      const data = (await res.json()) as {
        quotes: QuoteMap;
        updatedAt: string;
      };

      setQuotes(data.quotes || {});
      setLastUpdated(data.updatedAt || new Date().toISOString());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to refresh quotes";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshQuotes();
    const id = window.setInterval(refreshQuotes, 60000);
    return () => window.clearInterval(id);
  }, []);

  const investedPositions = BASE_POSITIONS.filter((p) => !p.pending);
  const openOrders = BASE_POSITIONS.filter((p) => p.pending);

  const holdings = investedPositions.map((p) => {
    const live = quotes[p.symbol];
    const price = live?.current ?? p.fallbackPrice;
    const dayChangePct = live?.percent ?? 0;
    const marketValue = p.qty * price;
    const gainLoss = marketValue - p.costBasis;
    const gainLossPct = p.costBasis ? (gainLoss / p.costBasis) * 100 : 0;

    return {
      ...p,
      price,
      dayChangePct,
      marketValue,
      gainLoss,
      gainLossPct,
    };
  });

  const liveOrders = openOrders.map((p) => {
    const live = quotes[p.symbol];
    return {
      ...p,
      bid: live?.current ?? p.bid ?? p.fallbackPrice,
      ask: p.ask ?? p.fallbackPrice,
      last: live?.current ?? p.last ?? p.fallbackPrice,
    };
  });

  const totalCash = CASH.reduce((sum, c) => sum + c.value, 0);
  const totalInvestedMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const totalPortfolioValue = totalInvestedMarketValue + totalCash;
  const totalGain = totalInvestedMarketValue - totalCostBasis;
  const totalGainPct = totalCostBasis ? (totalGain / totalCostBasis) * 100 : 0;
  const openOrderExposure = liveOrders.reduce(
    (sum, o) => sum + (o.limitPrice || 0) * o.qty,
    0
  );

  const allocation = [
    ...holdings.map((h) => ({ name: h.symbol, value: h.marketValue })),
    { name: "Cash", value: totalCash },
  ];

  const css = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .nv { transition: all .18s; cursor: pointer; border-radius: 10px; }
    .nv:hover { background: ${T.navHover}; }
    .nv.on { background: ${T.accent}20; color: ${T.accent}; border: 1px solid ${T.accent}50; }
    .card { transition: transform .18s ease, box-shadow .18s ease; }
    .card:hover { transform: translateY(-1px); box-shadow: 0 10px 30px ${T.shadow}; }
    .heading { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    button { font: inherit; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr !important; }
      .stats { grid-template-columns: 1fr 1fr !important; }
      .split { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 640px) {
      .stats { grid-template-columns: 1fr !important; }
    }
  `;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text }}>
      <style>{css}</style>

      <div
        className="layout"
        style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh" }}
      >
        <aside
          style={{
            borderRight: `1px solid ${T.border}`,
            background: T.panel,
            padding: 20,
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <div className="heading" style={{ fontSize: 24, fontWeight: 700 }}>
              investing_dashboard
            </div>
            <div style={{ color: T.subtext, fontSize: 12, marginTop: 6 }}>
              Live portfolio snapshot
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {NAV.map((item) => (
              <div
                key={item.id}
                className={`nv ${activeNav === item.id ? "on" : ""}`}
                onClick={() => setActiveNav(item.id)}
                style={{
                  padding: "12px 14px",
                  border: `1px solid ${
                    activeNav === item.id ? `${T.accent}50` : "transparent"
                  }`,
                  fontSize: 14,
                }}
              >
                {item.label}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, display: "grid", gap: 10 }}>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: T.card,
                color: T.text,
                cursor: "pointer",
              }}
            >
              Toggle theme
            </button>

            <button
              onClick={refreshQuotes}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${T.accent}70`,
                background: `${T.accent}20`,
                color: T.text,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Refreshing..." : "Refresh quotes"}
            </button>
          </div>
        </aside>

        <main style={{ padding: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: 24,
            }}
          >
            <div>
              <div className="heading" style={{ fontSize: 36, fontWeight: 700 }}>
                Portfolio command center
              </div>
              <div style={{ color: T.subtext, fontSize: 14, marginTop: 8 }}>
                Live quotes for QQQM, PLTR, KTOS, and AVAV.
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${T.border}`,
                background: T.panel,
                borderRadius: 16,
                padding: 14,
                minWidth: 260,
              }}
            >
              <div style={{ fontSize: 12, color: T.subtext }}>Quote status</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>
                {error ? "Error loading quotes" : loading ? "Refreshing now..." : "Connected"}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: error ? T.red : T.subtext }}>
                {error || (lastUpdated ? `Last updated: ${new Date(lastUpdated).toLocaleString()}` : "Waiting for first refresh")}
              </div>
            </div>
          </div>

          <div
            className="stats"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <StatCard
              T={T}
              title="Total Portfolio Value"
              value={currency(totalPortfolioValue)}
              subtitle="Holdings + cash"
            />
            <StatCard
              T={T}
              title="Invested Value"
              value={currency(totalInvestedMarketValue)}
              subtitle={`${((totalInvestedMarketValue / totalPortfolioValue) * 100).toFixed(1)}% invested`}
            />
            <StatCard
              T={T}
              title="Unrealized Gain/Loss"
              value={currency(totalGain)}
              subtitle={`${pct(totalGainPct)} vs cost basis`}
              positive={totalGain >= 0}
            />
            <StatCard
              T={T}
              title="Open Order Exposure"
              value={currency(openOrderExposure)}
              subtitle="If both pending orders fill"
            />
          </div>

          {activeNav === "overview" && (
            <div className="split" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
              <Panel T={T} title="Allocation" subtitle="Current portfolio mix">
                <div style={{ display: "grid", gap: 14 }}>
                  {allocation.map((item) => {
                    const width = totalPortfolioValue ? (item.value / totalPortfolioValue) * 100 : 0;
                    return (
                      <div
                        key={item.name}
                        style={{
                          border: `1px solid ${T.border}`,
                          background: T.card,
                          borderRadius: 14,
                          padding: 14,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            <div style={{ color: T.subtext, fontSize: 12 }}>{currency(item.value)}</div>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: T.accent,
                              border: `1px solid ${T.accent}50`,
                              borderRadius: 999,
                              padding: "6px 10px",
                              height: "fit-content",
                            }}
                          >
                            {width.toFixed(1)}%
                          </div>
                        </div>
                        <div style={{ height: 10, width: "100%", borderRadius: 999, background: T.border, overflow: "hidden" }}>
                          <div style={{ width: `${width}%`, height: "100%", borderRadius: 999, background: T.accent }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel T={T} title="Cash" subtitle="Available dry powder">
                <div
                  style={{
                    borderRadius: 18,
                    background: theme === "dark" ? "#020617" : "#e2e8f0",
                    border: `1px solid ${T.border}`,
                    padding: 18,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ color: T.subtext, fontSize: 12 }}>Available cash</div>
                  <div className="heading" style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>
                    {currency(totalCash)}
                  </div>
                  <div style={{ color: T.subtext, fontSize: 12, marginTop: 8 }}>
                    {((totalCash / totalPortfolioValue) * 100).toFixed(1)}% of portfolio
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {CASH.map((c) => (
                    <div
                      key={c.name}
                      style={{
                        border: `1px solid ${T.border}`,
                        background: T.card,
                        borderRadius: 14,
                        padding: 14,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        <div style={{ color: T.subtext, fontSize: 12 }}>Ready to deploy</div>
                      </div>
                      <div style={{ fontWeight: 700 }}>{currency(c.value)}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {activeNav === "positions" && (
            <Panel T={T} title="Active positions" subtitle="Current invested holdings with live pricing">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr style={{ color: T.subtext, fontSize: 12, textAlign: "left" }}>
                      <th style={thStyle}>Symbol</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Qty</th>
                      <th style={thStyle}>Live Price</th>
                      <th style={thStyle}>Day %</th>
                      <th style={thStyle}>Market Value</th>
                      <th style={thStyle}>Cost Basis</th>
                      <th style={thStyle}>Gain/Loss</th>
                      <th style={thStyle}>Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.symbol} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={tdStyle}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "8px 10px",
                              borderRadius: 10,
                              background: T.border,
                              fontWeight: 700,
                            }}
                          >
                            {h.symbol}
                          </span>
                        </td>
                        <td style={tdStyle}>{h.name}</td>
                        <td style={tdStyle}>{number(h.qty)}</td>
                        <td style={tdStyle}>{currency(h.price)}</td>
                        <td style={tdStyle}>
                          <span style={{ color: h.dayChangePct >= 0 ? T.green : T.red, fontWeight: 700 }}>
                            {pct(h.dayChangePct)}
                          </span>
                        </td>
                        <td style={tdStyle}>{currency(h.marketValue)}</td>
                        <td style={tdStyle}>{currency(h.costBasis)}</td>
                        <td style={tdStyle}>
                          <div style={{ color: h.gainLoss >= 0 ? T.green : T.red, fontWeight: 700 }}>
                            {currency(h.gainLoss)}
                          </div>
                          <div style={{ color: h.gainLoss >= 0 ? T.green : T.red, fontSize: 12 }}>
                            {pct(h.gainLossPct)}
                          </div>
                        </td>
                        <td style={tdStyle}>{h.account}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {activeNav === "orders" && (
            <Panel T={T} title="Open orders" subtitle="Pending entries with live last price">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 16,
                }}
              >
                {liveOrders.map((o) => (
                  <div
                    key={o.symbol}
                    className="card"
                    style={{
                      border: `1px solid ${T.border}`,
                      background: T.card,
                      borderRadius: 18,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10, marginBottom: 12 }}>
                      <div>
                        <div className="heading" style={{ fontSize: 22, fontWeight: 700 }}>
                          {o.symbol}
                        </div>
                        <div style={{ color: T.subtext, fontSize: 12 }}>{o.name}</div>
                      </div>
                      <div
                        style={{
                          borderRadius: 999,
                          padding: "6px 10px",
                          border: `1px solid ${T.accent}50`,
                          color: T.accent,
                          fontSize: 12,
                        }}
                      >
                        OPEN
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <MiniMetric T={T} label="Qty" value={String(o.qty)} />
                      <MiniMetric T={T} label="Limit" value={currency(o.limitPrice || 0)} />
                      <MiniMetric T={T} label="Bid / Mark" value={currency(o.bid || 0)} />
                      <MiniMetric T={T} label="Ask" value={currency(o.ask || 0)} />
                      <MiniMetric T={T} label="Last" value={currency(o.last || 0)} />
                      <MiniMetric T={T} label="Notional" value={currency((o.limitPrice || 0) * o.qty)} />
                    </div>

                    <div style={{ marginTop: 12, color: T.subtext, fontSize: 12 }}>
                      Created: {o.created}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {activeNav === "cash" && (
            <Panel T={T} title="Cash and buying power" subtitle="Liquidity overview">
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: 16, padding: 16 }}>
                  <div style={{ color: T.subtext, fontSize: 12 }}>Total cash</div>
                  <div className="heading" style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
                    {currency(totalCash)}
                  </div>
                </div>

                <div style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: 16, padding: 16 }}>
                  <div style={{ color: T.subtext, fontSize: 12 }}>Open order exposure</div>
                  <div className="heading" style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
                    {currency(openOrderExposure)}
                  </div>
                  <div style={{ color: T.subtext, fontSize: 12, marginTop: 8 }}>
                    Remaining cash after fills: {currency(totalCash - openOrderExposure)}
                  </div>
                </div>
              </div>
            </Panel>
          )}
        </main>
      </div>
    </div>
  );
}

function Panel({
  T,
  title,
  subtitle,
  children,
}: {
  T: (typeof THEMES)[ThemeName];
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        border: `1px solid ${T.border}`,
        background: T.panel,
        borderRadius: 20,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div className="heading" style={{ fontSize: 22, fontWeight: 700 }}>
          {title}
        </div>
        <div style={{ color: T.subtext, fontSize: 12, marginTop: 4 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function StatCard({
  T,
  title,
  value,
  subtitle,
  positive,
}: {
  T: (typeof THEMES)[ThemeName];
  title: string;
  value: string;
  subtitle: string;
  positive?: boolean;
}) {
  let color = T.text;
  if (positive === true) color = T.green;
  if (positive === false) color = T.red;

  return (
    <div
      className="card"
      style={{
        border: `1px solid ${T.border}`,
        background: T.panel,
        borderRadius: 20,
        padding: 18,
      }}
    >
      <div style={{ color: T.subtext, fontSize: 12 }}>{title}</div>
      <div className="heading" style={{ fontSize: 28, fontWeight: 700, marginTop: 10, color }}>
        {value}
      </div>
      <div style={{ color: T.subtext, fontSize: 12, marginTop: 8 }}>{subtitle}</div>
    </div>
  );
}

function MiniMetric({
  T,
  label,
  value,
}: {
  T: (typeof THEMES)[ThemeName];
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        background: T.panel,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ color: T.subtext, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "12px 10px",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "14px 10px",
  verticalAlign: "top",
};
