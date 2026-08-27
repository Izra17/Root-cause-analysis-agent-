import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Loader2,
  Send,
  Radio,
  TrendingDown,
  TrendingUp,
  Megaphone,
  Boxes,
  Truck,
  ShoppingCart,
  CircleCheck,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Deterministic pseudo-random (mulberry32) so the dataset is stable  */
/* across re-renders but still has organic texture.                   */
/* ------------------------------------------------------------------ */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(1337);
const jitter = (base, pct) => base * (1 + (rng() - 0.5) * pct);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEASONAL = [0.94, 0.9, 0.98, 1.0, 1.02, 1.04, 1.03, 1.02, 1.0, 1.05, 1.18, 1.28];
const REGIONS = [
  { key: "North", base: 210000, growth: 0.012 },
  { key: "South", base: 165000, growth: 0.015 },
  { key: "East", base: 188000, growth: 0.009 },
  { key: "West", base: 196000, growth: 0.013 },
];

/* Anomaly window: West region takes a hit in Sep/Oct from a marketing
   pullback that collided with a warehouse stockout event, compounded
   by shipping delays. Partial recovery begins in Nov. */
const WEST_ANOMALY = {
  8: { revenueMult: 0.66, mktMult: 0.52, stockout: 0.27, delay: 6.8, complaints: 3.4, nps: -24, fill: 0.71 },
  9: { revenueMult: 0.6, mktMult: 0.58, stockout: 0.24, delay: 7.2, complaints: 3.1, nps: -22, fill: 0.74 },
  10: { revenueMult: 0.86, mktMult: 0.82, stockout: 0.11, delay: 3.4, complaints: 1.6, nps: -8, fill: 0.89 },
};

function buildDataset() {
  const rows = [];
  REGIONS.forEach((r) => {
    for (let m = 0; m < 12; m++) {
      const growthMult = 1 + r.growth * m;
      let revenue = r.base * growthMult * SEASONAL[m];
      revenue = jitter(revenue, 0.05);

      let mktSpend = revenue * jitter(0.17, 0.15);
      let stockoutRate = Math.max(0.01, jitter(0.035, 0.5));
      let shippingDelay = jitter(2.1, 0.3);
      let complaints = jitter(45, 0.35);
      let nps = jitter(52, 0.15);
      let fillRate = Math.min(0.99, jitter(0.965, 0.02));

      if (r.key === "West" && WEST_ANOMALY[m]) {
        const a = WEST_ANOMALY[m];
        revenue *= a.revenueMult;
        mktSpend *= a.mktMult;
        stockoutRate = a.stockout;
        shippingDelay = a.delay;
        complaints *= a.complaints;
        nps += a.nps;
        fillRate = a.fill;
      }

      const avgPrice = jitter(58, 0.08);
      rows.push({
        month: MONTHS[m],
        monthIndex: m,
        region: r.key,
        revenue: Math.round(revenue),
        unitsSold: Math.round(revenue / avgPrice),
        marketingSpend: Math.round(mktSpend),
        stockoutRate: +stockoutRate.toFixed(3),
        shippingDelayDays: +shippingDelay.toFixed(1),
        complaints: Math.round(complaints),
        nps: Math.round(nps),
        fillRate: +fillRate.toFixed(3),
      });
    }
  });
  return rows;
}

/* ------------------------------------------------------------------ */
/* Stats derivation                                                    */
/* ------------------------------------------------------------------ */
function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function pctDelta(base, anomaly) {
  return ((anomaly - base) / base) * 100;
}

function deriveStats(rows) {
  const byMonth = MONTHS.map((month, i) => {
    const monthRows = rows.filter((r) => r.monthIndex === i);
    return { month, total: monthRows.reduce((a, r) => a + r.revenue, 0) };
  });

  const byRegionMonth = {};
  REGIONS.forEach((r) => {
    byRegionMonth[r.key] = MONTHS.map((month, i) => {
      const row = rows.find((x) => x.region === r.key && x.monthIndex === i);
      return { month, revenue: row.revenue };
    });
  });

  const baselineIdx = [5, 6, 7]; // Jun, Jul, Aug
  const anomalyIdx = [8, 9]; // Sep, Oct

  const regionRevenueDeltaPct = {};
  REGIONS.forEach((r) => {
    const base = avg(baselineIdx.map((i) => byRegionMonth[r.key][i].revenue));
    const anom = avg(anomalyIdx.map((i) => byRegionMonth[r.key][i].revenue));
    regionRevenueDeltaPct[r.key] = +pctDelta(base, anom).toFixed(1);
  });

  const companyBase = avg(baselineIdx.map((i) => byMonth[i].total));
  const companyAnom = avg(anomalyIdx.map((i) => byMonth[i].total));
  const companyRevenueDeltaPct = +pctDelta(companyBase, companyAnom).toFixed(1);

  const topDriverRegion = Object.entries(regionRevenueDeltaPct).sort((a, b) => a[1] - b[1])[0][0];

  const westRows = rows.filter((r) => r.region === "West");
  const wBase = (field) => avg(baselineIdx.map((i) => westRows.find((r) => r.monthIndex === i)[field]));
  const wAnom = (field) => avg(anomalyIdx.map((i) => westRows.find((r) => r.monthIndex === i)[field]));

  const westMetrics = {
    marketingSpendDeltaPct: +pctDelta(wBase("marketingSpend"), wAnom("marketingSpend")).toFixed(1),
    stockoutRateBaselinePct: +(wBase("stockoutRate") * 100).toFixed(1),
    stockoutRateAnomalyPct: +(wAnom("stockoutRate") * 100).toFixed(1),
    shippingDelayBaselineDays: +wBase("shippingDelayDays").toFixed(1),
    shippingDelayAnomalyDays: +wAnom("shippingDelayDays").toFixed(1),
    complaintsBaseline: Math.round(wBase("complaints")),
    complaintsAnomaly: Math.round(wAnom("complaints")),
    npsBaseline: Math.round(wBase("nps")),
    npsAnomaly: Math.round(wAnom("nps")),
    fillRateBaselinePct: +(wBase("fillRate") * 100).toFixed(1),
    fillRateAnomalyPct: +(wAnom("fillRate") * 100).toFixed(1),
    revenueDeltaPct: regionRevenueDeltaPct.West,
  };

  return {
    byMonth,
    byRegionMonth,
    baselineWindow: baselineIdx.map((i) => MONTHS[i]),
    anomalyWindow: anomalyIdx.map((i) => MONTHS[i]),
    regionRevenueDeltaPct,
    companyRevenueDeltaPct,
    topDriverRegion,
    westMetrics,
  };
}

/* ------------------------------------------------------------------ */
/* Claude API helpers                                                   */
/* ------------------------------------------------------------------ */
async function callAgent(system, messages, options = {}) {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, mode: options.mode || "analysis" }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    throw new Error(`Backend returned HTTP ${res.status}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Agent API error ${res.status}`);
  }

  if (!data.text) throw new Error("Agent returned an empty response.");
  return data.text;
}

function extractJson(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

const ANALYSIS_SCHEMA = `Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "headline": "one sentence executive summary of what happened",
  "overallImpact": "short phrase quantifying the company-level impact",
  "rootCauses": [
    {"rank": 1, "title": "short cause name", "category": "Marketing|Inventory|Operations|Sales", "impactPct": -6.5, "confidence": "High|Medium|Low", "evidence": "one sentence citing the specific numbers that support this"}
  ],
  "recommendations": [
    {"action": "specific corrective action", "addresses": "root cause title it targets", "priority": "High|Medium|Low", "expectedImpact": "short expected outcome"}
  ]
}
Return 3 to 4 rootCauses sorted by the size of impactPct (most negative first), and 3 to 4 recommendations, one per major cause.`;

const SYSTEM_PROMPT = `You are an operations analyst performing root cause analysis on retail business performance data. You are given condensed statistics already computed from sales, marketing, inventory and operations records across four regions over a fiscal year — not raw rows. Reason about which factors caused the revenue anomaly, quantify each factor's contribution, and recommend concrete corrective actions a regional operations team could act on this week. Be specific and numeric. Do not invent facts not implied by the provided statistics. ${ANALYSIS_SCHEMA}`;

/* ------------------------------------------------------------------ */
/* UI atoms                                                             */
/* ------------------------------------------------------------------ */
const CATEGORY_ICON = {
  Marketing: Megaphone,
  Inventory: Boxes,
  Operations: Truck,
  Sales: ShoppingCart,
};

const CONF_STYLE = {
  High: "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/10",
  Medium: "text-[var(--amber)] border-[var(--amber)]/40 bg-[var(--amber)]/10",
  Low: "text-[var(--muted)] border-[var(--border)] bg-white/[0.02]",
};

function fmtUSD(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function Waveform({ series }) {
  const w = 640, h = 72, pad = 6;
  const vals = series.map((s) => s.total);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i) => pad + (i / (series.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const points = series.map((s, i) => `${x(i)},${y(s.total)}`).join(" ");
  const anomStartX = x(8) - 6, anomEndX = x(9) + 6;
  const lowIdx = vals.indexOf(Math.min(...vals.slice(7, 11))) ;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <rect x={anomStartX} y={0} width={anomEndX - anomStartX} height={h} fill="var(--red)" opacity="0.08" />
      <polyline points={points} fill="none" stroke="var(--cyan)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <circle cx={x(lowIdx)} cy={y(vals[lowIdx])} r="3.2" fill="var(--red)" />
      <circle cx={x(lowIdx)} cy={y(vals[lowIdx])} r="7" fill="var(--red)" opacity="0.18" />
    </svg>
  );
}

function StatusDot({ state }) {
  const map = {
    idle: { color: "bg-[var(--muted)]", label: "IDLE" },
    running: { color: "bg-[var(--amber)] animate-pulse", label: "ANALYZING" },
    done: { color: "bg-[var(--green)]", label: "COMPLETE" },
    error: { color: "bg-[var(--red)]", label: "ERROR" },
  };
  const s = map[state];
  return (
    <span className="inline-flex items-center gap-2 mono text-[11px] tracking-widest text-[var(--muted)]">
      <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
      {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                       */
/* ------------------------------------------------------------------ */
export default function RCAAgent() {
  const rows = useMemo(() => buildDataset(), []);
  const stats = useMemo(() => deriveStats(rows), [rows]);

  const chartData = useMemo(
    () =>
      MONTHS.map((month, i) => ({
        month,
        North: stats.byRegionMonth.North[i].revenue,
        South: stats.byRegionMonth.South[i].revenue,
        East: stats.byRegionMonth.East[i].revenue,
        West: stats.byRegionMonth.West[i].revenue,
      })),
    [stats]
  );

  const [agentState, setAgentState] = useState("idle"); // idle | running | done | error
  const [analysis, setAnalysis] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [chatLog, setChatLog] = useState([]); // {role, content}
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog, chatBusy]);

  async function runAnalysis() {
    setAgentState("running");
    setErrorMsg("");
    try {
      const payload = {
        baselineWindow: stats.baselineWindow,
        anomalyWindow: stats.anomalyWindow,
        companyMonthlyRevenue: stats.byMonth,
        companyRevenueDeltaPctBaselineVsAnomaly: stats.companyRevenueDeltaPct,
        regionRevenueDeltaPctBaselineVsAnomaly: stats.regionRevenueDeltaPct,
        largestDecliningRegion: stats.topDriverRegion,
        largestDecliningRegionMetrics: stats.westMetrics,
      };
      const text = await callAgent(SYSTEM_PROMPT, [
        { role: "user", content: `Analyze this business performance data and identify root causes plus corrective actions:\n${JSON.stringify(payload)}` },
      ]);
      const parsed = extractJson(text);
      setAnalysis(parsed);
      setAgentState("done");
    } catch (e) {
      setErrorMsg(e.message || "Analysis failed. Check the backend and ANTHROPIC_API_KEY.");
      setAgentState("error");
    }
  }

  async function askAgent() {
    const q = chatInput.trim();
    if (!q || chatBusy) return;
    setChatInput("");
    const nextLog = [...chatLog, { role: "user", content: q }];
    setChatLog(nextLog);
    setChatBusy(true);
    try {
      const context = `Reference data for this business (already established): baseline window ${stats.baselineWindow.join(
        "/"
      )}, anomaly window ${stats.anomalyWindow.join("/")}. Region revenue change vs baseline: ${JSON.stringify(
        stats.regionRevenueDeltaPct
      )}. Largest declining region: ${stats.topDriverRegion} with metrics ${JSON.stringify(
        stats.westMetrics
      )}. Prior root cause analysis: ${JSON.stringify(analysis)}. Answer the operator's question directly and concisely (under 90 words), grounded only in this data. Plain text, no markdown headers.`;
      const text = await callAgent(context, [
        ...nextLog.map((m) => ({ role: m.role, content: m.content })),
      ]);
      setChatLog([...nextLog, { role: "assistant", content: text.trim() }]);
    } catch (e) {
      setChatLog([...nextLog, { role: "assistant", content: `⚠ Agent connection failed: ${e.message || "unknown error"}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full rca-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .rca-root{
          --bg:#0a0d12; --panel:#11151d; --panel2:#151a23; --border:#232a37;
          --text:#e8ecf3; --muted:#8994a6; --cyan:#4fd1c5; --amber:#e9a23b; --red:#ee6a6a; --green:#4ade80;
          background:
            radial-gradient(1200px 500px at 15% -10%, rgba(79,209,197,0.06), transparent 60%),
            radial-gradient(900px 400px at 100% 0%, rgba(233,162,59,0.05), transparent 55%),
            var(--bg);
          color: var(--text);
          font-family: 'Inter', sans-serif;
        }
        .rca-root .display{ font-family:'Space Grotesk', sans-serif; }
        .rca-root .mono{ font-family:'JetBrains Mono', monospace; }
        .rca-root .panel{ background:var(--panel); border:1px solid var(--border); border-radius:10px; }
        .rca-root .panel2{ background:var(--panel2); border:1px solid var(--border); border-radius:8px; }
        .rca-root ::selection{ background:rgba(79,209,197,0.25); }
        .rca-root .scanline{ background-image: repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px); }
        .rca-root button:focus-visible, .rca-root input:focus-visible{ outline: 2px solid var(--cyan); outline-offset: 2px; }
        .rca-root .run-btn{ background: linear-gradient(180deg, #17c2b3, #0fa89b); color:#04211d; }
        .rca-root .run-btn:hover{ filter: brightness(1.08); }
        .rca-root .run-btn:disabled{ opacity:0.55; cursor:not-allowed; filter:none; }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="mono text-[11px] tracking-[0.25em] text-[var(--cyan)] mb-2">DIAGNOSTIC CONSOLE</div>
            <h1 className="display text-2xl sm:text-3xl font-semibold flex items-center gap-2">
              <Activity size={24} className="text-[var(--cyan)]" strokeWidth={2.2} />
              Root Cause Analysis Agent
            </h1>
            <p className="text-[var(--muted)] text-sm mt-1.5 max-w-xl">
              Reads sales, marketing, inventory and operations signals across four regions, isolates what
              drove the performance change, and ranks corrective actions by expected impact.
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-2 pt-1">
            <StatusDot state={agentState} />
            <span className="mono text-[11px] text-[var(--muted)]">FY2025 · 4 regions · 12 mo</span>
          </div>
        </div>

        {/* Signal strip */}
        <div className="panel p-4 sm:p-5 mb-5">
          <div className="flex items-center gap-2 mb-1 text-[var(--muted)] mono text-[11px] tracking-widest">
            <Radio size={12} /> COMPANY REVENUE SIGNAL — ANOMALY WINDOW HIGHLIGHTED
          </div>
          <Waveform series={stats.byMonth} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3 pt-3 border-t border-[var(--border)]">
            <div>
              <div className="text-[11px] text-[var(--muted)] mono">REVENUE, BASELINE→ANOMALY</div>
              <div className={`display text-lg font-semibold flex items-center gap-1 ${stats.companyRevenueDeltaPct < 0 ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
                {stats.companyRevenueDeltaPct < 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                {stats.companyRevenueDeltaPct}%
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--muted)] mono">MOST-IMPACTED REGION</div>
              <div className="display text-lg font-semibold">{stats.topDriverRegion}</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--muted)] mono">{stats.topDriverRegion.toUpperCase()} REVENUE Δ</div>
              <div className="display text-lg font-semibold text-[var(--red)]">{stats.westMetrics.revenueDeltaPct}%</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--muted)] mono">FILL RATE, BASELINE→ANOMALY</div>
              <div className="display text-lg font-semibold">
                {stats.westMetrics.fillRateBaselinePct}% → <span className="text-[var(--amber)]">{stats.westMetrics.fillRateAnomalyPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Region revenue chart */}
        <div className="panel p-4 sm:p-5 mb-5">
          <div className="text-[var(--muted)] mono text-[11px] tracking-widest mb-3">REVENUE BY REGION</div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#8994a6", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis tick={{ fill: "#8994a6", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <ReferenceArea x1="Sep" x2="Oct" fill="var(--red)" fillOpacity={0.07} />
                <Tooltip
                  contentStyle={{ background: "#151a23", border: "1px solid #232a37", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#e8ecf3" }}
                  formatter={(v) => fmtUSD(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8994a6" }} />
                <Line type="monotone" dataKey="North" stroke="#8994a6" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="South" stroke="#4fd1c5" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="East" stroke="#7c9cf0" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="West" stroke="#ee6a6a" strokeWidth={2.2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Run control */}
        <div className="flex items-center justify-between panel2 p-4 mb-6">
          <div className="text-sm text-[var(--muted)] max-w-md">
            {agentState === "idle" && "No diagnostic run yet. The agent will read the signals above and identify what's driving the change."}
            {agentState === "running" && "Reading region deltas, correlating marketing / inventory / operations signals…"}
            {agentState === "done" && "Diagnostic complete. Ranked causes and recommendations below."}
            {agentState === "error" && `Diagnostic failed: ${errorMsg}`}
          </div>
          <button
            onClick={runAnalysis}
            disabled={agentState === "running"}
            className="run-btn shrink-0 px-4 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2 transition"
          >
            {agentState === "running" ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
            {agentState === "running" ? "Running diagnostic…" : agentState === "done" ? "Re-run diagnostic" : "Run diagnostic"}
          </button>
        </div>

        {/* Results */}
        {analysis && (
          <div className="space-y-5 mb-6">
            <div className="panel p-4 sm:p-5">
              <div className="text-[var(--muted)] mono text-[11px] tracking-widest mb-2">FINDING</div>
              <p className="display text-lg sm:text-xl font-medium leading-snug">{analysis.headline}</p>
              <p className="text-[var(--amber)] mono text-sm mt-1.5">{analysis.overallImpact}</p>
            </div>

            <div>
              <div className="text-[var(--muted)] mono text-[11px] tracking-widest mb-3">ROOT CAUSES, RANKED BY IMPACT</div>
              <div className="space-y-3">
                {(analysis.rootCauses || []).map((c, i) => {
                  const Icon = CATEGORY_ICON[c.category] || AlertTriangle;
                  return (
                    <div key={i} className="panel p-4 flex gap-4">
                      <div className="mono text-2xl font-semibold text-[var(--border)] leading-none w-8 shrink-0">{String(c.rank ?? i + 1).padStart(2, "0")}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Icon size={15} className="text-[var(--cyan)]" />
                          <span className="font-semibold">{c.title}</span>
                          <span className={`mono text-[11px] px-2 py-0.5 rounded border ${CONF_STYLE[c.confidence] || CONF_STYLE.Low}`}>{c.confidence} confidence</span>
                          <span className="mono text-[11px] text-[var(--muted)]">{c.category}</span>
                          <span className="ml-auto mono text-sm font-semibold text-[var(--red)]">{c.impactPct > 0 ? "+" : ""}{c.impactPct}%</span>
                        </div>
                        <p className="text-sm text-[var(--muted)] leading-relaxed">{c.evidence}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[var(--muted)] mono text-[11px] tracking-widest mb-3">RECOMMENDED CORRECTIVE ACTIONS</div>
              <div className="grid sm:grid-cols-2 gap-3">
                {(analysis.recommendations || []).map((r, i) => (
                  <div key={i} className="panel2 p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <CircleCheck size={15} className="text-[var(--green)] shrink-0" />
                      <span className={`mono text-[10px] px-1.5 py-0.5 rounded border ${r.priority === "High" ? "text-[var(--red)] border-[var(--red)]/40" : r.priority === "Medium" ? "text-[var(--amber)] border-[var(--amber)]/40" : "text-[var(--muted)] border-[var(--border)]"}`}>
                        {r.priority} priority
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-snug">{r.action}</p>
                    <p className="text-xs text-[var(--muted)] mt-1.5">Addresses: {r.addresses}</p>
                    <p className="text-xs text-[var(--cyan)] mt-1">{r.expectedImpact}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Ask the agent */}
        <div className="panel overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-[var(--border)] text-[var(--muted)] mono text-[11px] tracking-widest">
            ASK THE AGENT
          </div>
          <div className="px-4 sm:px-5 py-4 max-h-72 overflow-y-auto space-y-3">
            {chatLog.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Run the diagnostic, then ask follow-up questions — e.g. "why did fill rate collapse in West?"
                or "what happens if we don't act on the marketing cut?"
              </p>
            )}
            {chatLog.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
                <span className={`mono text-[11px] mr-2 ${m.role === "user" ? "text-[var(--cyan)]" : "text-[var(--amber)]"}`}>
                  {m.role === "user" ? "you >" : "agent >"}
                </span>
                {m.content}
              </div>
            ))}
            {chatBusy && (
              <div className="text-sm text-[var(--muted)] flex items-center gap-2">
                <span className="mono text-[11px] text-[var(--amber)]">agent &gt;</span>
                <Loader2 size={13} className="animate-spin" /> thinking…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-t border-[var(--border)]">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askAgent()}
              placeholder="Ask about a driver, a region, or a recommendation…"
              className="flex-1 bg-transparent mono text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none px-2 py-1.5"
            />
            <button
              onClick={askAgent}
              disabled={chatBusy || !chatInput.trim()}
              aria-label="Send"
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--panel2)] border border-[var(--border)] text-[var(--cyan)] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--cyan)]/50 transition"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
