import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, LabelList, ReferenceLine
} from "recharts";
import { Plus, X, RotateCcw, Building2, Activity, AlertOctagon } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 1. SYNTHETIC DATABASE GENERATOR (deterministic, seed 42)
// ─────────────────────────────────────────────────────────────

const NAVY = "#002e47";
const BLUE = "#0073ae";
const CYAN = "#00a1e4";
const ORANGE = "#f5821e";
const RED = "#d64545";
const GREEN = "#16a34a";
const SLATE = "#64748b";

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ICP_INDUSTRIES = ["Wholesale", "Manufacturing", "Logistics", "Food & Beverage"];
const INDUSTRIES = [...ICP_INDUSTRIES, "Retail", "Pharma", "Automotive", "E-commerce"];
const SOURCES = ["Webinar", "Whitepaper download", "Trade fair", "Outbound BDR", "Referral", "Organic search", "Paid LinkedIn"];
const ORIGINAL_SOURCES = ["Organic Search", "Paid Social", "Direct Traffic", "Referrals", "Offline Sources", "Email Marketing"];
const COUNTRIES = ["Netherlands", "Belgium", "Germany", "Netherlands", "Netherlands"];
const FIRST = ["Jan", "Sanne", "Pieter", "Lotte", "Tom", "Eva", "Daan", "Femke", "Ruben", "Iris", "Bram", "Noa", "Sven", "Mila", "Koen", "Lara"];
const LAST = ["de Vries", "Jansen", "Bakker", "Visser", "Smit", "Meijer", "Mulder", "Bos", "Vos", "Peters", "Hendriks", "Dekker", "Brouwer", "Dijkstra"];
const COMPANY_A = ["Nova", "Delta", "Heuvel", "Polder", "Vecht", "Linde", "Maas", "Berk", "Kompas", "Anker", "Vortex", "Solide"];
const COMPANY_B = ["Trading", "Distribution", "Foods", "Parts", "Logistics", "Retail Group", "Supplies", "Components", "Wholesale", "Pharma"];

// Data quality drifts by creation-year cohort: older contacts were entered
// with less discipline, recent cohorts improve slightly but stay below target.
const YEAR_ADJ = { 2021: -0.14, 2022: -0.10, 2023: -0.05, 2024: 0, 2025: 0.05, 2026: 0.09 };

const REFERENCE_DATE = new Date("2026-06-01T00:00:00Z");
const REF_DATE_STR = "2026-06-01";
const dayMs = 86400000;
const daysAgo = (d) => new Date(REFERENCE_DATE.getTime() - d * dayMs);
const fmt = (date) => date.toISOString().slice(0, 10);
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const nf = (n) => n.toLocaleString("en-US");

// Probability of behavioural attributes per engagement level
const ATTR_P = {
  low:   { demoRequest: 0.05, pricingVisit: 0.18, emailEngaged: 0.45, contentDownload: 0.22, decisionMaker: 0.28, student: 0.05 },
  mid:   { demoRequest: 0.15, pricingVisit: 0.40, emailEngaged: 0.55, contentDownload: 0.50, decisionMaker: 0.35, student: 0.04 },
  high:  { demoRequest: 0.60, pricingVisit: 0.70, emailEngaged: 0.70, contentDownload: 0.55, decisionMaker: 0.60, student: 0.01 },
  other: { demoRequest: 0.03, pricingVisit: 0.10, emailEngaged: 0.25, contentDownload: 0.12, decisionMaker: 0.25, student: 0.10 },
};

function generateDatabase(seed = 42) {
  const rnd = mulberry32(seed);
  const records = [];
  let id = 100001;

  const fill = {
    lead:        { industry: 0.71, source: 0.63 },
    mql:         { industry: 0.78, source: 0.58 },
    sql:         { industry: 0.49, source: 0.31 },
    opportunity: { industry: 0.55, source: 0.36 },
    other:       { industry: 0.38, source: 0.22 },
  };

  function baseContact(stage, createdDaysAgo) {
    const p = fill[stage];
    const createdDate = daysAgo(createdDaysAgo);
    const year = createdDate.getUTCFullYear();
    const adj = YEAR_ADJ[year] ?? 0;
    const pSource = Math.min(0.97, Math.max(0.05, p.source + adj));
    const pIndustry = Math.min(0.97, Math.max(0.05, p.industry + adj));
    const first = pick(rnd, FIRST);
    const last = pick(rnd, LAST);
    const company = `${pick(rnd, COMPANY_A)} ${pick(rnd, COMPANY_B)} B.V.`;
    return {
      contact_id: id++,
      first_name: first,
      last_name: last,
      company,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, "")}@${company.split(" ")[0].toLowerCase()}.example`,
      country: pick(rnd, COUNTRIES),
      lifecycle_stage: stage,
      create_date: fmt(createdDate),
      original_source: pick(rnd, ORIGINAL_SOURCES),
      source: rnd() < pSource ? pick(rnd, SOURCES) : "",
      industry: rnd() < pIndustry ? pick(rnd, INDUSTRIES) : "",
      lead_score: Math.floor(rnd() * 100),
      became_mql_date: "",
      became_sql_date: "",
      became_opp_date: "",
      days_in_current_stage: 0,
      last_activity_date: "",
      attrs: {},
    };
  }

  // Scoring-relevant attributes. Fit attributes derive from the actual data
  // fields, so missing Industry directly costs fit points: the data quality
  // problem feeds straight into the scoring simulation.
  function assignAttrs(c, level) {
    const p = ATTR_P[level];
    const lastAct = c.last_activity_date ? new Date(c.last_activity_date) : null;
    c.attrs = {
      icpIndustry: ICP_INDUSTRIES.includes(c.industry),
      sizeFit: rnd() < 0.55,
      decisionMaker: rnd() < p.decisionMaker,
      targetCountry: c.country === "Netherlands" || c.country === "Belgium",
      demoRequest: rnd() < p.demoRequest,
      pricingVisit: rnd() < p.pricingVisit,
      emailEngaged: rnd() < p.emailEngaged,
      contentDownload: rnd() < p.contentDownload,
      competitor: rnd() < 0.04,
      student: rnd() < p.student,
      genericDomain: rnd() < 0.12,
      inactive90: lastAct ? (REFERENCE_DATE - lastAct) / dayMs > 90 : true,
    };
  }

  for (let i = 0; i < 3580; i++) {
    const created = 5 + Math.floor(rnd() * 1700);
    const c = baseContact("lead", created);
    c.days_in_current_stage = Math.min(created, Math.floor(rnd() * created) + 1);
    c.last_activity_date = fmt(daysAgo(Math.floor(rnd() * 200)));
    assignAttrs(c, "low");
    records.push(c);
  }

  for (let i = 0; i < 1155; i++) {
    const stuck = i < 410;
    const mqlAge = stuck ? 401 + Math.floor(rnd() * 350) : 10 + Math.floor(rnd() * 380);
    const created = mqlAge + 10 + Math.floor(rnd() * 600);
    const c = baseContact("mql", created);
    c.became_mql_date = fmt(daysAgo(mqlAge));
    c.days_in_current_stage = mqlAge;
    c.last_activity_date = stuck ? fmt(daysAgo(300 + Math.floor(rnd() * 400))) : fmt(daysAgo(Math.floor(rnd() * 90)));
    assignAttrs(c, "mid");
    records.push(c);
  }

  for (let i = 0; i < 86; i++) {
    const sqlAge = 5 + Math.floor(rnd() * 250);
    const mqlAge = sqlAge + 30 + Math.floor(rnd() * 500);
    const created = mqlAge + 20 + Math.floor(rnd() * 450);
    const c = baseContact("sql", created);
    c.became_mql_date = fmt(daysAgo(mqlAge));
    c.became_sql_date = fmt(daysAgo(sqlAge));
    c.days_in_current_stage = sqlAge;
    c.last_activity_date = fmt(daysAgo(Math.floor(rnd() * 30)));
    assignAttrs(c, "high");
    records.push(c);
  }

  for (let i = 0; i < 645; i++) {
    const bypassed = i >= 86;
    const oppAge = 5 + Math.floor(rnd() * 320);
    const mqlAge = oppAge + 60 + Math.floor(rnd() * 700);
    const created = mqlAge + 20 + Math.floor(rnd() * 450);
    const c = baseContact("opportunity", created);
    c.became_mql_date = rnd() < 0.85 ? fmt(daysAgo(mqlAge)) : "";
    c.became_sql_date = bypassed ? "" : fmt(daysAgo(oppAge + 10 + Math.floor(rnd() * 40)));
    c.became_opp_date = fmt(daysAgo(oppAge));
    c.days_in_current_stage = oppAge;
    c.last_activity_date = fmt(daysAgo(Math.floor(rnd() * 21)));
    assignAttrs(c, "high");
    records.push(c);
  }

  for (let i = 0; i < 3480; i++) {
    const created = 30 + Math.floor(rnd() * 1770);
    const c = baseContact("other", created);
    c.days_in_current_stage = created;
    c.last_activity_date = fmt(daysAgo(Math.floor(rnd() * 365)));
    assignAttrs(c, "other");
    records.push(c);
  }

  return records;
}

// ─────────────────────────────────────────────────────────────
// 2. SCORING MODEL (single authoritative Success Score)
// ─────────────────────────────────────────────────────────────

let uid = 0;
const mk = (label, points, field) => ({ id: ++uid, label, points, field });

const DEFAULT_FIT = () => [
  mk("Industry matches ICP", 15, "icpIndustry"),
  mk("Company size fits", 10, "sizeFit"),
  mk("Job title is decision maker", 15, "decisionMaker"),
  mk("Country within target market", 5, "targetCountry"),
];
const DEFAULT_ENG = () => [
  mk("Demo or contact requested", 20, "demoRequest"),
  mk("Pricing page visited", 10, "pricingVisit"),
  mk("Email opened or clicked", 5, "emailEngaged"),
  mk("Content downloaded", 10, "contentDownload"),
];
const DEFAULT_NEG = () => [
  mk("Competitor", 20, "competitor"),
  mk("Student or job seeker", 15, "student"),
  mk("Generic email domain", 5, "genericDomain"),
  mk("Inactive for more than 90 days", 10, "inactive90"),
];

// Custom criteria (no data field) match a deterministic ~20% of contacts
function hashMatch(contactId, critId) {
  return mulberry32(contactId * 9973 + critId * 7919)() < 0.2;
}

function rowMatches(contact, row) {
  if (row.field) return !!contact.attrs[row.field];
  return hashMatch(contact.contact_id, row.id);
}

function contactScore(contact, fit, eng, neg) {
  let s = 0;
  for (const r of fit) if (rowMatches(contact, r)) s += Number(r.points) || 0;
  for (const r of eng) if (rowMatches(contact, r)) s += Number(r.points) || 0;
  for (const r of neg) if (rowMatches(contact, r)) s -= Number(r.points) || 0;
  return s;
}

// Apply the model to the database: contacts that pass a threshold are
// actually promoted, opportunities that pass the SQL threshold get their
// missing SQL registration backfilled (automated routing closes the bypass).
function simulate(db, fit, eng, neg, mqlT, sqlT) {
  return db.map((r) => {
    const score = contactScore(r, fit, eng, neg);
    const c = { ...r, model_score: score };

    if (r.lifecycle_stage === "opportunity") {
      if (!r.became_sql_date && score >= sqlT) c.became_sql_date = REF_DATE_STR;
      return c;
    }
    if (r.lifecycle_stage === "sql") return c;

    if (score >= sqlT) {
      c.lifecycle_stage = "sql";
      c.became_sql_date = REF_DATE_STR;
      if (!c.became_mql_date) c.became_mql_date = REF_DATE_STR;
      c.days_in_current_stage = 0;
    } else if (score >= mqlT) {
      if (r.lifecycle_stage !== "mql") {
        c.lifecycle_stage = "mql";
        c.days_in_current_stage = 0;
      }
      if (!c.became_mql_date) c.became_mql_date = REF_DATE_STR;
    } else {
      // Below threshold: recycled into nurturing as Lead (also rescues 'Other')
      if (r.lifecycle_stage !== "lead") c.days_in_current_stage = 0;
      c.lifecycle_stage = "lead";
      c.became_mql_date = r.lifecycle_stage === "mql" ? "" : c.became_mql_date;
    }
    return c;
  });
}

// ─────────────────────────────────────────────────────────────
// 3. AGGREGATIONS
// ─────────────────────────────────────────────────────────────

const pctFilled = (rows, field) =>
  rows.length ? Math.round((rows.filter((r) => r[field] !== "").length / rows.length) * 100) : 0;

function aggregate(db) {
  const byStage = (s) => db.filter((r) => r.lifecycle_stage === s);
  const leads = byStage("lead");
  const mqls = byStage("mql");
  const sqls = byStage("sql");
  const opps = byStage("opportunity");
  const other = byStage("other");

  const everMql = db.filter((r) => r.became_mql_date || r.lifecycle_stage === "mql").length;
  const everSql = db.filter((r) => r.became_sql_date || r.lifecycle_stage === "sql").length;
  const funnel = [
    { stage: "Lead", key: "lead", count: leads.length + everMql + opps.filter(r => !r.became_mql_date).length, fill: BLUE, note: "Total funnel intake" },
    { stage: "MQL", key: "mql", count: everMql, fill: CYAN, note: "Ever reached MQL" },
    { stage: "SQL", key: "sql", count: everSql, fill: RED, note: "With a registered SQL date" },
    { stage: "Opportunity", key: "opportunity", count: opps.length, fill: ORANGE, note: "Deal created" },
  ];

  const bypassCount = opps.filter((r) => !r.became_sql_date).length;
  const mqlToSql = everMql > 0 ? (everSql / everMql) * 100 : 0;

  const overall = (rows) =>
    rows.length ? Math.round((pctFilled(rows, "industry") + pctFilled(rows, "source") + 100) / 3) : 0;

  const completeness = [
    { stage: "Lead", industry: pctFilled(leads, "industry"), source: pctFilled(leads, "source"), overall: overall(leads) },
    { stage: "MQL", industry: pctFilled(mqls, "industry"), source: pctFilled(mqls, "source"), overall: overall(mqls) },
    { stage: "SQL", industry: pctFilled(sqls, "industry"), source: pctFilled(sqls, "source"), overall: overall(sqls) },
    { stage: "Opportunity", industry: pctFilled(opps, "industry"), source: pctFilled(opps, "source"), overall: overall(opps) },
  ];

  const stuckMqls = mqls.filter((r) => r.days_in_current_stage > 400).length;
  const missingSourcePct = Math.round((db.filter((r) => r.source === "").length / db.length) * 100);

  const throughputs = opps
    .filter((r) => r.became_mql_date && r.became_opp_date)
    .map((r) => Math.round((new Date(r.became_opp_date) - new Date(r.became_mql_date)) / dayMs))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const medianThroughput = throughputs.length ? throughputs[Math.floor(throughputs.length / 2)] : 0;

  return {
    funnel, completeness, bypassCount, mqlToSql, stuckMqls,
    missingSourcePct, medianThroughput,
    otherCount: other.length, total: db.length,
    sqlCompleteness: completeness[2].overall, mqlCompleteness: completeness[1].overall,
  };
}

// Cohort statistics per contact creation year: are newer contacts
// maintained better than older ones?
function cohortStats(db) {
  const map = {};
  for (const r of db) {
    const y = r.create_date.slice(0, 4);
    if (!map[y]) map[y] = { year: y, count: 0, source: 0, industry: 0, valid: 0, everMql: 0, stuck: 0 };
    const m = map[y];
    m.count++;
    if (r.source !== "") m.source++;
    if (r.industry !== "") m.industry++;
    if (r.lifecycle_stage !== "other") m.valid++;
    if (r.became_mql_date || r.lifecycle_stage === "mql") m.everMql++;
    if (r.lifecycle_stage === "mql" && r.days_in_current_stage > 400) m.stuck++;
  }
  return Object.values(map)
    .sort((a, b) => a.year.localeCompare(b.year))
    .map((m) => ({
      year: m.year,
      count: m.count,
      sourcePct: Math.round((m.source / m.count) * 100),
      industryPct: Math.round((m.industry / m.count) * 100),
      validStagePct: Math.round((m.valid / m.count) * 100),
      mqlRatePct: Math.round((m.everMql / m.count) * 100),
      stuckCount: m.stuck,
    }));
}

function stageRecords(db, key) {
  switch (key) {
    case "lead": return db.filter((r) => r.lifecycle_stage === "lead");
    case "mql": return db.filter((r) => r.became_mql_date || r.lifecycle_stage === "mql");
    case "sql": return db.filter((r) => r.became_sql_date || r.lifecycle_stage === "sql");
    case "opportunity": return db.filter((r) => r.lifecycle_stage === "opportunity");
    default: return [];
  }
}

const STAGE_META = {
  lead: {
    title: "Leads", color: BLUE,
    definition: "Contacts currently in the Lead lifecycle stage that have not yet been promoted.",
    insight: "High volume, but without mandatory field validation incomplete data enters here and is never repaired further down the funnel.",
    recommendation: "Recommendation 1: Mandatory field validation on forms and imports",
  },
  mql: {
    title: "Marketing Qualified Leads", color: CYAN,
    definition: "All contacts that ever reached MQL status (current MQLs plus promoted contacts with an MQL date).",
    insight: "The scoring threshold promotes generously, but no mechanism recycles or archives MQLs over time. A share remains stuck for years.",
    recommendation: "Recommendation 3: Automated recycling and sunset workflow",
  },
  sql: {
    title: "Sales Qualified Leads", color: RED,
    definition: "Contacts with a registered SQL date. This is the formal qualification route that is rarely used in practice.",
    insight: "This stage is structurally under-registered. Most deals originate outside this route, which makes the conversion rate unmeasurable and leaves sales without a validated profile.",
    recommendation: "Recommendation 5: Automated SQL routing before deal creation",
  },
  opportunity: {
    title: "Opportunities", color: ORANGE,
    definition: "Contacts with an associated deal, regardless of whether the SQL step was registered.",
    insight: "Volume recovers here compared to SQL: the evidence of the bypass. Data completeness is also lowest exactly when sales needs context most.",
    recommendation: "Recommendation 5: Enforce SQL registration as a precondition for deal creation",
  },
};

// ─────────────────────────────────────────────────────────────
// 4. CSV EXPORT
// ─────────────────────────────────────────────────────────────

function downloadCsv(db, filename = "demo_crm_database_slimstock_poc.csv") {
  const cols = Object.keys(db[0]).filter((k) => k !== "attrs");
  const lines = [cols.join(";")];
  for (const r of db) lines.push(cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(";"));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// 5. SMALL UI COMPONENTS
// ─────────────────────────────────────────────────────────────

const InfoBadge = ({ children }) => (
  <div className="mt-3 inline-flex items-start gap-2 rounded-md bg-sky-50 border border-sky-200 px-3 py-2">
    <span className="mt-0.5 h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: CYAN }} />
    <span className="text-xs leading-snug" style={{ color: NAVY }}>{children}</span>
  </div>
);

const KpiCard = ({ label, value, sub, badge, accent }) => (
  <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col">
    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className="mt-2 flex items-baseline gap-2">
      <span className="text-3xl font-bold" style={{ color: accent || NAVY }}>{value}</span>
    </div>
    <div className="mt-1 text-xs text-slate-500">{sub}</div>
    {badge && (
      <div className="mt-3 text-[11px] font-medium rounded px-2 py-1 self-start"
        style={{ backgroundColor: "#fff4ea", color: "#b35c0e", border: "1px solid #f9cfa3" }}>{badge}</div>
    )}
  </div>
);

const FunnelTooltip = ({ active, payload, bypassCount }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-white border border-slate-200 shadow-lg px-4 py-3 text-sm">
      <div className="font-semibold" style={{ color: NAVY }}>{d.stage}</div>
      <div className="text-slate-600">{nf(d.count)} contacts</div>
      <div className="text-xs text-slate-400 mt-1">{d.note}</div>
      {d.stage === "Opportunity" && bypassCount > 0 && (
        <div className="text-xs mt-1 font-medium" style={{ color: RED }}>
          {nf(bypassCount)} deals without a registered SQL date
        </div>
      )}
      <div className="text-[10px] mt-2 font-semibold" style={{ color: BLUE }}>Click for detail dashboard →</div>
    </div>
  );
};

const severityStyles = {
  high: { border: "border-red-300", bg: "bg-red-50", dot: RED, label: "High risk" },
  medium: { border: "border-orange-300", bg: "bg-orange-50", dot: ORANGE, label: "Medium risk" },
  resolved: { border: "border-green-300", bg: "bg-green-50", dot: GREEN, label: "Resolved in simulation" },
};

const AlertCard = ({ alert, onDrill }) => {
  const [open, setOpen] = useState(false);
  const s = severityStyles[alert.severity];
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4 transition-shadow hover:shadow-md`}>
      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${alert.severity !== "resolved" ? "animate-pulse" : ""}`}
              style={{ backgroundColor: s.dot }} />
            <div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-bold" style={{ color: NAVY }}>{alert.metric}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: s.dot, color: "white" }}>{s.label}</span>
              </div>
              <div className="text-sm font-semibold mt-0.5" style={{ color: NAVY }}>{alert.title}</div>
            </div>
          </div>
          <span className="text-slate-400 text-lg leading-none mt-1">{open ? "−" : "+"}</span>
        </div>
      </button>
      {open && (
        <div className="mt-3 pl-5">
          <p className="text-xs text-slate-600 leading-relaxed">{alert.detail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-block text-[11px] font-semibold rounded px-2 py-1"
              style={{ backgroundColor: NAVY, color: "white" }}>{alert.recommendation}</span>
            {alert.drillStage && (
              <button onClick={() => onDrill(alert.drillStage)}
                className="text-[11px] font-semibold rounded px-2 py-1 border hover:opacity-80"
                style={{ borderColor: BLUE, color: BLUE }}>
                View in detail dashboard →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const stageLabel = {
  lead: { txt: "Lead", bg: "#e3f1f9", col: BLUE },
  mql: { txt: "MQL", bg: "#e0f6fd", col: "#00789f" },
  sql: { txt: "SQL", bg: "#fdecec", col: RED },
  opportunity: { txt: "Opportunity", bg: "#fff0e1", col: "#c2660b" },
  other: { txt: "Other", bg: "#eef1f4", col: SLATE },
};

function RecordTable({ rows, showModelScore }) {
  const issueOf = (r) => {
    const issues = [];
    if (r.source === "") issues.push("Missing source");
    if (r.industry === "") issues.push("Missing industry");
    if (r.lifecycle_stage === "mql" && r.days_in_current_stage > 400) issues.push(`${r.days_in_current_stage} days at MQL`);
    if (r.lifecycle_stage === "opportunity" && !r.became_sql_date) issues.push("SQL step bypassed");
    return issues;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3 font-semibold">ID</th>
            <th className="py-2 pr-3 font-semibold">Contact</th>
            <th className="py-2 pr-3 font-semibold">Company</th>
            <th className="py-2 pr-3 font-semibold">Created</th>
            <th className="py-2 pr-3 font-semibold">Stage</th>
            <th className="py-2 pr-3 font-semibold">{showModelScore ? "Model score" : "Score"}</th>
            <th className="py-2 pr-3 font-semibold">Source (custom)</th>
            <th className="py-2 pr-3 font-semibold">Industry</th>
            <th className="py-2 pr-3 font-semibold">Days in stage</th>
            <th className="py-2 pr-3 font-semibold">Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const issues = issueOf(r);
            const st = stageLabel[r.lifecycle_stage];
            const score = showModelScore && r.model_score !== undefined ? r.model_score : r.lead_score;
            return (
              <tr key={r.contact_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-3 text-slate-400">{r.contact_id}</td>
                <td className="py-2 pr-3 font-medium" style={{ color: NAVY }}>{r.first_name} {r.last_name}</td>
                <td className="py-2 pr-3 text-slate-600">{r.company}</td>
                <td className="py-2 pr-3 text-slate-500">{r.create_date}</td>
                <td className="py-2 pr-3">
                  <span className="rounded px-1.5 py-0.5 font-semibold" style={{ backgroundColor: st.bg, color: st.col }}>{st.txt}</span>
                </td>
                <td className="py-2 pr-3 font-semibold" style={{ color: score >= 65 ? GREEN : score >= 40 ? "#b35c0e" : SLATE }}>
                  {score}
                </td>
                <td className="py-2 pr-3">{r.source || <span className="italic" style={{ color: RED }}>empty</span>}</td>
                <td className="py-2 pr-3">{r.industry || <span className="italic" style={{ color: RED }}>empty</span>}</td>
                <td className="py-2 pr-3 text-slate-500">{r.days_in_current_stage}</td>
                <td className="py-2 pr-3">
                  {issues.length === 0
                    ? <span className="text-slate-300">none</span>
                    : issues.map((i) => (
                      <span key={i} className="inline-block mr-1 mb-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: "#fdecec", color: RED }}>{i}</span>
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Paginator({ page, pages, setPage }) {
  return (
    <div className="flex items-center justify-between mt-4">
      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
        className="text-xs font-medium rounded px-3 py-1.5 border border-slate-300 text-slate-600 disabled:opacity-40">Previous</button>
      <span className="text-xs text-slate-500">Page {page + 1} of {pages}</span>
      <button onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}
        className="text-xs font-medium rounded px-3 py-1.5 border border-slate-300 text-slate-600 disabled:opacity-40">Next</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 6. DRILL-DOWN: stage detail dashboard
// ─────────────────────────────────────────────────────────────

function StageDetail({ db, stageKey, onBack, simulated }) {
  const meta = STAGE_META[stageKey];
  const rows = useMemo(() => stageRecords(db, stageKey), [db, stageKey]);
  const [recordFilter, setRecordFilter] = useState("issues");
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const stats = useMemo(() => {
    const missingSource = rows.filter((r) => r.source === "").length;
    const missingIndustry = rows.filter((r) => r.industry === "").length;
    const scores = rows.map((r) => (simulated && r.model_score !== undefined ? r.model_score : r.lead_score));
    const avgScore = rows.length ? Math.round(scores.reduce((a, s) => a + s, 0) / rows.length) : 0;
    const sortedDays = rows.map((r) => r.days_in_current_stage).sort((a, b) => a - b);
    const medianDays = sortedDays.length ? sortedDays[Math.floor(sortedDays.length / 2)] : 0;
    const stuck = rows.filter((r) => r.days_in_current_stage > 400).length;
    const bypass = stageKey === "opportunity" ? rows.filter((r) => !r.became_sql_date).length : 0;

    const countBy = (field, emptyLabel) => {
      const map = {};
      rows.forEach((r) => {
        const k = r[field] === "" ? emptyLabel : r[field];
        map[k] = (map[k] || 0) + 1;
      });
      return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    };

    const buckets = [
      { name: "0-90", min: 0, max: 90 },
      { name: "91-180", min: 91, max: 180 },
      { name: "181-365", min: 181, max: 365 },
      { name: "366-500", min: 366, max: 500 },
      { name: "500+", min: 501, max: Infinity },
    ].map((b) => ({
      name: b.name,
      count: rows.filter((r) => r.days_in_current_stage >= b.min && r.days_in_current_stage <= b.max).length,
      risk: b.min > 365,
    }));

    return {
      missingSource, missingIndustry, avgScore, medianDays, stuck, bypass,
      bySource: countBy("source", "(empty)"),
      byIndustry: countBy("industry", "(empty)").slice(0, 9),
      ageBuckets: buckets,
    };
  }, [rows, stageKey, simulated]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (recordFilter === "issues") {
      r = rows.filter((x) =>
        x.source === "" || x.industry === "" ||
        x.days_in_current_stage > 400 ||
        (stageKey === "opportunity" && !x.became_sql_date)
      );
    } else if (recordFilter === "topscore") {
      r = [...rows].sort((a, b) =>
        ((simulated && b.model_score !== undefined ? b.model_score : b.lead_score) -
         (simulated && a.model_score !== undefined ? a.model_score : a.lead_score)));
    } else if (recordFilter === "oldest") {
      r = [...rows].sort((a, b) => b.days_in_current_stage - a.days_in_current_stage);
    }
    return r;
  }, [rows, recordFilter, stageKey, simulated]);

  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice(page * pageSize, page * pageSize + pageSize);
  const barTooltip = { contentStyle: { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 } };

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <button onClick={onBack}
              className="mt-1 flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50">
              ← Back to overview
            </button>
            <div>
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: meta.color }} />
                <h2 className="text-lg font-bold" style={{ color: NAVY }}>{meta.title}</h2>
                <span className="text-sm font-semibold text-slate-400">{nf(rows.length)} records</span>
                {simulated && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ backgroundColor: "#dcfce7", color: GREEN }}>Simulation</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">{meta.definition}</p>
            </div>
          </div>
          <button onClick={() => downloadCsv(rows, `demo_${stageKey}_records.csv`)}
            className="text-xs font-semibold text-white rounded-lg px-4 py-2 hover:opacity-90"
            style={{ backgroundColor: BLUE }}>
            Export this selection (CSV)
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs leading-relaxed" style={{ color: NAVY }}>
            <span className="font-semibold">Interpretation: </span>{meta.insight}
          </p>
          <span className="mt-2 inline-block text-[11px] font-semibold rounded px-2 py-1"
            style={{ backgroundColor: NAVY, color: "white" }}>{meta.recommendation}</span>
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Records" value={nf(rows.length)} sub="in this funnel stage" accent={meta.color} />
        <KpiCard label={simulated ? "Avg. model score" : "Avg. lead score"} value={stats.avgScore} sub="scale 0 to 100" />
        <KpiCard label="Missing source" value={rows.length ? `${Math.round((stats.missingSource / rows.length) * 100)}%` : "0%"}
          sub={`${nf(stats.missingSource)} records without a source`} accent={RED} />
        <KpiCard label="Missing industry" value={rows.length ? `${Math.round((stats.missingIndustry / rows.length) * 100)}%` : "0%"}
          sub={`${nf(stats.missingIndustry)} records without an industry`} accent={ORANGE} />
        {stageKey === "opportunity" ? (
          <KpiCard label="SQL step bypassed" value={nf(stats.bypass)} sub="deals without an SQL date" accent={stats.bypass > 0 ? RED : GREEN} />
        ) : (
          <KpiCard label="Median time in stage" value={`${stats.medianDays} days`}
            sub={stats.stuck > 0 ? `${nf(stats.stuck)} records older than 400 days` : "no stuck records"} />
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>Origin (custom Source field)</h3>
          <p className="text-xs text-slate-500 mt-1">The red bar shows records without source attribution.</p>
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.bySource} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fill: SLATE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: SLATE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip {...barTooltip} formatter={(v) => [nf(v), "Records"]} cursor={{ fill: "rgba(0,115,174,0.06)" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {stats.bySource.map((d) => <Cell key={d.name} fill={d.name === "(empty)" ? RED : meta.color} />)}
                  <LabelList dataKey="count" position="right" formatter={nf} style={{ fill: SLATE, fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>Industry</h3>
          <p className="text-xs text-slate-500 mt-1">Without an industry, segmentation and nurturing are impossible.</p>
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byIndustry} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fill: SLATE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: SLATE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip {...barTooltip} formatter={(v) => [nf(v), "Records"]} cursor={{ fill: "rgba(0,115,174,0.06)" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {stats.byIndustry.map((d) => <Cell key={d.name} fill={d.name === "(empty)" ? RED : meta.color} />)}
                  <LabelList dataKey="count" position="right" formatter={nf} style={{ fill: SLATE, fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>Time in stage (days)</h3>
          <p className="text-xs text-slate-500 mt-1">Records above 365 days (red) indicate missing routing.</p>
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.ageBuckets} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: SLATE, fontSize: 10 }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                <YAxis tick={{ fill: SLATE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip {...barTooltip} formatter={(v) => [nf(v), "Records"]} cursor={{ fill: "rgba(0,115,174,0.06)" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {stats.ageBuckets.map((d) => <Cell key={d.name} fill={d.risk ? RED : meta.color} />)}
                  <LabelList dataKey="count" position="top" formatter={nf} style={{ fill: NAVY, fontSize: 10, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>
            Records · {nf(filteredRows.length)} in selection
          </h3>
          <div className="flex gap-2 flex-wrap">
            {[["issues", "With data quality issues"], ["topscore", "Highest score first"], ["oldest", "Longest in stage"], ["all", "All records"]].map(([key, label]) => (
              <button key={key} onClick={() => { setRecordFilter(key); setPage(0); }}
                className="text-xs font-medium rounded-full px-3 py-1.5 border transition-colors"
                style={recordFilter === key
                  ? { backgroundColor: NAVY, color: "white", borderColor: NAVY }
                  : { backgroundColor: "white", color: SLATE, borderColor: "#cbd5e1" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <RecordTable rows={pageRows} showModelScore={simulated} />
        <Paginator page={page} pages={pages} setPage={setPage} />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 7. SCORING MODEL TAB (editable matrix driving the simulation)
// ─────────────────────────────────────────────────────────────

const COL = {
  label: { flex: 1, minWidth: 0 },
  points: { width: 58, flexShrink: 0 },
  match: { width: 64, flexShrink: 0, textAlign: "right" },
  del: { width: 28, flexShrink: 0, display: "flex", justifyContent: "center" },
};

function ScoreTable({ title, icon: Icon, color, rows, setRows, negative, matchCounts, total }) {
  const update = (id, field, value) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const remove = (id) => setRows((prev) => prev.filter((r) => r.id !== id));
  const add = () => setRows((prev) => [...prev, mk("New criterion", 5, null)]);

  const maxPts = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100" style={{ background: "#f8fafc" }}>
        <div className="flex items-center gap-2">
          <Icon size={15} style={{ color }} />
          <h3 className="text-sm font-semibold" style={{ color: NAVY }}>{title}</h3>
        </div>
        <span className="text-sm font-bold" style={{ color, fontVariantNumeric: "tabular-nums" }}>
          {negative ? "-" : ""}{maxPts} pt max
        </span>
      </div>

      <div className="px-3 pb-2 pt-2">
        <div className="flex items-center gap-1 pb-1.5"
          style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8" }}>
          <span style={COL.label}>Criterion</span>
          <span style={{ ...COL.points, textAlign: "center" }}>Points</span>
          <span style={COL.match}>% of DB</span>
          <span style={COL.del}></span>
        </div>

        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-1 border-b border-slate-50" style={{ height: 38 }}>
            <div style={COL.label}>
              <input type="text" value={r.label}
                onChange={(e) => update(r.id, "label", e.target.value)}
                className="w-full rounded-md bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                style={{ fontSize: 13, padding: "5px 6px" }} />
            </div>
            <div style={COL.points}>
              <input type="number" value={r.points}
                onChange={(e) => update(r.id, "points", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-md border border-slate-200 focus:outline-none focus:border-slate-400"
                style={{ fontSize: 13, padding: "5px 2px", textAlign: "center", fontVariantNumeric: "tabular-nums" }} />
            </div>
            <div style={{ ...COL.match, fontSize: 11, color: SLATE, fontVariantNumeric: "tabular-nums" }}>
              {total ? Math.round(((matchCounts[r.id] || 0) / total) * 100) : 0}%
            </div>
            <div style={COL.del}>
              <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-500"
                aria-label="Remove criterion" style={{ display: "flex" }}>
                <X size={13} />
              </button>
            </div>
          </div>
        ))}

        <button onClick={add} className="mt-2 mb-1 font-medium flex items-center gap-1 hover:opacity-70"
          style={{ color, fontSize: 12 }}>
          <Plus size={12} /> Add criterion
        </button>
        <p className="text-[10px] text-slate-400 mb-1">
          Custom criteria without a data field match an estimated 20% of contacts in the simulation.
        </p>
      </div>
    </div>
  );
}

function ThresholdControl({ label, color, value, setValue, max }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0, display: "inline-block" }} />
      <label style={{ fontSize: 12, fontWeight: 500, color: SLATE, whiteSpace: "nowrap", width: 96 }}>{label}</label>
      <input type="range" min={0} max={Math.max(max, 1)} value={Math.min(value, max)}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: 110, accentColor: color }} />
      <input type="number" value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="rounded-md border border-slate-200 focus:outline-none focus:border-slate-400"
        style={{ width: 56, fontSize: 13, padding: "4px 2px", textAlign: "center", fontVariantNumeric: "tabular-nums" }} />
    </div>
  );
}

function ScoringTab({ db, fit, setFit, eng, setEng, neg, setNeg, mqlT, setMqlT, sqlT, setSqlT, simAgg, asisAgg, onApply, resetModel }) {
  const maxPossible =
    fit.reduce((s, r) => s + (Number(r.points) || 0), 0) +
    eng.reduce((s, r) => s + (Number(r.points) || 0), 0);

  const setMql = (v) => { setMqlT(v); if (v >= sqlT) setSqlT(v + 1); };
  const setSql = (v) => { setSqlT(Math.max(v, mqlT + 1)); };

  // How many contacts match each criterion
  const matchCounts = useMemo(() => {
    const counts = {};
    const all = [...fit, ...eng, ...neg];
    for (const row of all) counts[row.id] = 0;
    for (const c of db) for (const row of all) if (rowMatches(c, row)) counts[row.id]++;
    return counts;
  }, [db, fit, eng, neg]);

  const compare = [
    { metric: "MQL", asis: asisAgg.funnel[1].count, simulated: simAgg.funnel[1].count },
    { metric: "SQL", asis: asisAgg.funnel[2].count, simulated: simAgg.funnel[2].count },
    { metric: "Bypass", asis: asisAgg.bypassCount, simulated: simAgg.bypassCount },
    { metric: "'Other'", asis: asisAgg.otherCount, simulated: simAgg.otherCount },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>
              Lead Scoring Matrix · single authoritative Success Score
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Replaces the 13 competing scoring properties from the baseline. Every change below re-scores all {nf(db.length)} contacts in the demo database.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={resetModel}
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
              <RotateCcw size={12} /> Reset model
            </button>
            <button onClick={onApply}
              className="text-xs font-semibold text-white rounded-lg px-4 py-2 hover:opacity-90"
              style={{ backgroundColor: GREEN }}>
              Apply to dashboard →
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-2">
            <ThresholdControl label="MQL threshold" color={ORANGE} value={mqlT} setValue={setMql} max={maxPossible} />
            <ThresholdControl label="SQL threshold" color={GREEN} value={sqlT} setValue={setSql} max={maxPossible} />
          </div>
          <p className="text-[11px] text-slate-500 max-w-md leading-relaxed">
            Example values, to be validated in the expert session. The SQL threshold triggers routing to Sales; the final SQL status remains an acceptance decision by Sales under the SLA, the score does not enforce it.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ScoreTable title="Fit (firmographic)" icon={Building2} color={NAVY} rows={fit} setRows={setFit} matchCounts={matchCounts} total={db.length} />
        <ScoreTable title="Engagement (behaviour)" icon={Activity} color={CYAN} rows={eng} setRows={setEng} matchCounts={matchCounts} total={db.length} />
        <ScoreTable title="Negative points" icon={AlertOctagon} color={RED} rows={neg} setRows={setNeg} negative matchCounts={matchCounts} total={db.length} />
      </div>

      <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>
          Model impact · as-is versus simulated
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Live preview of what this model does to the database. Contacts above the MQL threshold are promoted, contacts above the SQL threshold are routed to Sales, and 'Other' contacts are reclassified into the funnel.
        </p>
        <div className="h-64 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compare} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="metric" tick={{ fill: SLATE, fontSize: 12 }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
              <YAxis tick={{ fill: SLATE, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v, name) => [nf(v), name]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                cursor={{ fill: "rgba(0,115,174,0.06)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="asis" name="As-is" fill={SLATE} radius={[4, 4, 0, 0]} maxBarSize={42}>
                <LabelList dataKey="asis" position="top" formatter={nf} style={{ fill: SLATE, fontSize: 10, fontWeight: 700 }} />
              </Bar>
              <Bar dataKey="simulated" name="With scoring model" fill={CYAN} radius={[4, 4, 0, 0]} maxBarSize={42}>
                <LabelList dataKey="simulated" position="top" formatter={nf} style={{ fill: BLUE, fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <InfoBadge>
          Link with Recommendation 4: a single scoring matrix with agreed thresholds makes qualification measurable and consistent. The bars show the bypass shrinking and the 'Other' segment being rescued into the funnel.
        </InfoBadge>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 8. COHORT COMPARISON (contact creation year)
// ─────────────────────────────────────────────────────────────

function YearSelect({ value, setValue, years, label }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
      {label}
      <select value={value} onChange={(e) => setValue(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold focus:outline-none focus:border-slate-400"
        style={{ color: NAVY }}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
  );
}

function CohortSection({ cohorts, sim }) {
  const years = cohorts.map((c) => c.year);
  const [yearA, setYearA] = useState(years[0]);
  const [yearB, setYearB] = useState(years[years.length - 1]);
  const ca = cohorts.find((c) => c.year === yearA) || cohorts[0];
  const cb = cohorts.find((c) => c.year === yearB) || cohorts[cohorts.length - 1];

  const rows = [
    { label: "Contacts created", a: ca.count, b: cb.count, format: nf, neutral: true },
    { label: "Source field filled", a: ca.sourcePct, b: cb.sourcePct, unit: "%" },
    { label: "Industry field filled", a: ca.industryPct, b: cb.industryPct, unit: "%" },
    { label: "Valid lifecycle stage", a: ca.validStagePct, b: cb.validStagePct, unit: "%" },
    { label: "Reached MQL", a: ca.mqlRatePct, b: cb.mqlRatePct, unit: "%" },
  ];

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>
            Cohort comparison · contact creation year
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Are newer contacts maintained better than older ones? Grouped by the create date of each record in the data source.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <YearSelect label="Compare" value={yearA} setValue={setYearA} years={years} />
          <span className="text-xs text-slate-400 font-semibold">vs</span>
          <YearSelect label="" value={yearB} setValue={setYearB} years={years} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
        {/* Trend chart */}
        <div className="lg:col-span-3">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cohorts} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: SLATE, fontSize: 12 }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: SLATE, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip formatter={(v, name) => [`${v}%`, name]}
                  labelFormatter={(y) => {
                    const c = cohorts.find((x) => x.year === y);
                    return `Created in ${y} · ${c ? nf(c.count) : ""} contacts`;
                  }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={90} stroke={CYAN} strokeDasharray="6 4"
                  label={{ value: "Target 90%", position: "insideTopLeft", fill: BLUE, fontSize: 10 }} />
                <Line type="monotone" dataKey="sourcePct" name="Source field filled" stroke={RED} strokeWidth={2.5} dot={{ r: 4, fill: RED }} />
                <Line type="monotone" dataKey="industryPct" name="Industry field filled" stroke={ORANGE} strokeWidth={2.5} dot={{ r: 4, fill: ORANGE }} />
                <Line type="monotone" dataKey="validStagePct" name="Valid lifecycle stage" stroke={BLUE} strokeWidth={2.5} dot={{ r: 4, fill: BLUE }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Side-by-side comparison */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-3 text-xs font-semibold border-b border-slate-200" style={{ background: "#f8fafc" }}>
              <div className="px-3 py-2 text-slate-500">Metric</div>
              <div className="px-3 py-2 text-center" style={{ color: NAVY }}>{yearA}</div>
              <div className="px-3 py-2 text-center" style={{ color: NAVY }}>{yearB}</div>
            </div>
            {rows.map((r) => {
              const fmtV = r.format || ((v) => `${v}${r.unit || ""}`);
              const delta = r.b - r.a;
              const deltaColor = r.neutral ? SLATE : delta > 0 ? GREEN : delta < 0 ? RED : SLATE;
              return (
                <div key={r.label} className="grid grid-cols-3 text-xs border-b border-slate-100 last:border-0">
                  <div className="px-3 py-2.5 text-slate-600">{r.label}</div>
                  <div className="px-3 py-2.5 text-center font-semibold" style={{ color: NAVY, fontVariantNumeric: "tabular-nums" }}>
                    {fmtV(r.a)}
                  </div>
                  <div className="px-3 py-2.5 text-center font-semibold" style={{ color: NAVY, fontVariantNumeric: "tabular-nums" }}>
                    {fmtV(r.b)}
                    {!r.neutral && delta !== 0 && (
                      <span className="ml-1.5 text-[10px] font-bold" style={{ color: deltaColor }}>
                        {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <InfoBadge>
            {sim
              ? "In the simulation every cohort gets a valid lifecycle stage, but field completeness still depends on the year of entry: scoring cannot repair historical data gaps."
              : "Link with Recommendation 1: recent cohorts improve slightly, yet every year stays well below the 90% target. The trend confirms that ad-hoc discipline does not close the gap; structural field validation does."}
          </InfoBadge>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 9. DATA SOURCE TAB
// ─────────────────────────────────────────────────────────────

function DataTable({ db, simulated }) {
  const [stageFilter, setStageFilter] = useState("all");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 12;

  const filtered = useMemo(() => {
    let rows = stageFilter === "all" ? db : db.filter((r) => r.lifecycle_stage === stageFilter);
    if (onlyIssues) {
      rows = rows.filter((r) =>
        r.source === "" || r.industry === "" ||
        (r.lifecycle_stage === "mql" && r.days_in_current_stage > 400) ||
        (r.lifecycle_stage === "opportunity" && !r.became_sql_date)
      );
    }
    return rows;
  }, [db, stageFilter, onlyIssues]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>
            Data source · synthetic CRM export ({nf(db.length)} records){simulated ? " · simulation active" : ""}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Generated with a fixed seed (42): every demo shows exactly the same database. {nf(filtered.length)} records in current selection.
          </p>
        </div>
        <button onClick={() => downloadCsv(db, simulated ? "demo_crm_database_simulated.csv" : "demo_crm_database_slimstock_poc.csv")}
          className="text-xs font-semibold text-white rounded-lg px-4 py-2 hover:opacity-90"
          style={{ backgroundColor: BLUE }}>
          Download full database (CSV)
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {["all", "lead", "mql", "sql", "opportunity", "other"].map((s) => (
          <button key={s} onClick={() => { setStageFilter(s); setPage(0); }}
            className="text-xs font-medium rounded-full px-3 py-1.5 border transition-colors"
            style={stageFilter === s
              ? { backgroundColor: NAVY, color: "white", borderColor: NAVY }
              : { backgroundColor: "white", color: SLATE, borderColor: "#cbd5e1" }}>
            {s === "all" ? "All stages" : stageLabel[s].txt}
          </button>
        ))}
        <label className="flex items-center gap-2 text-xs text-slate-600 ml-2 cursor-pointer">
          <input type="checkbox" checked={onlyIssues}
            onChange={(e) => { setOnlyIssues(e.target.checked); setPage(0); }} />
          Show only records with data quality issues
        </label>
      </div>

      <RecordTable rows={rows} showModelScore={simulated} />
      <Paginator page={page} pages={pages} setPage={setPage} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 9. MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function LeadLifecycleDashboard() {
  const [tab, setTab] = useState("dashboard");
  const [activeLine, setActiveLine] = useState(null);
  const [drillStage, setDrillStage] = useState(null);
  const [mode, setMode] = useState("asis"); // 'asis' | 'simulated'

  const [fit, setFit] = useState(DEFAULT_FIT());
  const [eng, setEng] = useState(DEFAULT_ENG());
  const [neg, setNeg] = useState(DEFAULT_NEG());
  const [mqlT, setMqlT] = useState(40);
  const [sqlT, setSqlT] = useState(65);

  const baseDb = useMemo(() => generateDatabase(42), []);
  const simDb = useMemo(() => simulate(baseDb, fit, eng, neg, mqlT, sqlT), [baseDb, fit, eng, neg, mqlT, sqlT]);

  const asisAgg = useMemo(() => aggregate(baseDb), [baseDb]);
  const simAgg = useMemo(() => aggregate(simDb), [simDb]);

  const activeDb = mode === "simulated" ? simDb : baseDb;
  const agg = mode === "simulated" ? simAgg : asisAgg;
  const cohorts = useMemo(() => cohortStats(activeDb), [activeDb]);

  const resetModel = () => {
    setFit(DEFAULT_FIT());
    setEng(DEFAULT_ENG());
    setNeg(DEFAULT_NEG());
    setMqlT(40);
    setSqlT(65);
  };

  const openDrill = (key) => {
    setDrillStage(key);
    setTab("dashboard");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const applyModel = () => {
    setMode("simulated");
    setTab("dashboard");
    setDrillStage(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const sim = mode === "simulated";

  const alerts = [
    {
      id: 1, drillStage: "mql",
      severity: sim && agg.stuckMqls === 0 ? "resolved" : "high",
      metric: nf(agg.stuckMqls),
      title: "Contacts at MQL status for more than 400 days",
      detail: sim
        ? "In the simulation, MQLs below the threshold are recycled into nurturing, which clears most of the backlog. Remaining records still meet the MQL criteria and stay visible for follow-up."
        : "These contacts were never qualified or disqualified and distort funnel reporting. No workflow recycles them into nurturing or archives them.",
      recommendation: "Recommendation 3: Automated recycling and sunset workflow",
    },
    {
      id: 2, drillStage: null,
      severity: sim && agg.otherCount === 0 ? "resolved" : "high",
      metric: nf(agg.otherCount),
      title: "Active contacts without a valid Lifecycle Stage ('Other')",
      detail: sim
        ? "The scoring model classifies every contact, so the 'Other' segment is reabsorbed into the funnel. See the Data source tab to inspect where these records landed."
        : "A large share of the active database sits outside every segment and every nurturing flow. These contacts are invisible to reporting and scoring. Inspect them via the Data source tab, filter 'Other'.",
      recommendation: "Recommendation 2: Mandatory lifecycle mapping at intake",
    },
    {
      id: 3, drillStage: "lead",
      severity: "medium",
      metric: `${agg.missingSourcePct}%`,
      title: "Contacts without source attribution (custom field)",
      detail: "Without source registration, ROI per channel cannot be calculated. The native Original Source field fills automatically, but the custom Source field stays structurally empty. Scoring cannot repair missing data; this requires field validation at intake.",
      recommendation: "Recommendation 1: Mandatory field validation on forms",
    },
    {
      id: 4, drillStage: "opportunity",
      severity: sim && agg.bypassCount < asisAgg.bypassCount ? (agg.bypassCount === 0 ? "resolved" : "medium") : "medium",
      metric: nf(agg.bypassCount),
      title: "Opportunities without a registered SQL step",
      detail: sim
        ? "Automated routing backfills the SQL registration for deals that pass the SQL threshold. Remaining bypasses concern deals whose contact does not meet the scoring criteria, which is exactly the conversation Sales and Marketing need to have."
        : "Deals are created directly from MQL or even Lead. As a result, the official conversion rate is structurally understated and the qualification step is unmeasurable.",
      recommendation: "Recommendation 5: Automated SQL routing before deal creation",
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f1f5f9", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      <header style={{ backgroundColor: NAVY }} className="px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-white text-xl font-bold tracking-tight">Lead Lifecycle Performance Monitor</h1>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded"
                style={{ backgroundColor: ORANGE, color: "white" }}>Demo Data</span>
            </div>
            <p className="text-sky-200 text-xs mt-1">
              Proof of Concept · Computed from a generated dataset of {nf(asisAgg.total)} fictional contacts · No customer data (GDPR-compliant)
            </p>
          </div>
          <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: "#013a59" }}>
            {[["dashboard", "Dashboard"], ["scoring", "Scoring Model"], ["data", "Data Source"]].map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); setDrillStage(null); }}
                className="text-xs font-semibold rounded-md px-4 py-2 transition-colors"
                style={tab === key ? { backgroundColor: CYAN, color: NAVY } : { color: "#9fd6ef" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Mode toggle, visible on dashboard and data tabs */}
        {tab !== "scoring" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg p-1 bg-white border border-slate-200 shadow-sm">
              {[["asis", "As-is data"], ["simulated", "With scoring model"]].map(([key, label]) => (
                <button key={key} onClick={() => { setMode(key); setDrillStage(null); }}
                  className="text-xs font-semibold rounded-md px-4 py-2 transition-colors"
                  style={mode === key
                    ? { backgroundColor: key === "simulated" ? GREEN : NAVY, color: "white" }
                    : { color: SLATE }}>
                  {label}
                </button>
              ))}
            </div>
            {sim && (
              <div className="text-xs rounded-lg px-3 py-2 border"
                style={{ backgroundColor: "#dcfce7", borderColor: "#86efac", color: "#166534" }}>
                <span className="font-bold">Simulation active.</span> Lifecycle stages recalculated using the scoring matrix (MQL ≥ {mqlT}, SQL ≥ {sqlT}). Adjust the model in the Scoring Model tab.
              </div>
            )}
          </div>
        )}

        {tab === "data" ? (
          <DataTable db={activeDb} simulated={sim} />
        ) : tab === "scoring" ? (
          <ScoringTab
            db={baseDb}
            fit={fit} setFit={setFit}
            eng={eng} setEng={setEng}
            neg={neg} setNeg={setNeg}
            mqlT={mqlT} setMqlT={setMqlT}
            sqlT={sqlT} setSqlT={setSqlT}
            simAgg={simAgg} asisAgg={asisAgg}
            onApply={applyModel}
            resetModel={resetModel}
          />
        ) : drillStage ? (
          <StageDetail db={activeDb} stageKey={drillStage} onBack={() => setDrillStage(null)} simulated={sim} />
        ) : (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="MQL → SQL conversion"
                value={`${agg.mqlToSql.toFixed(1)}%`}
                sub={`${nf(agg.funnel[2].count)} SQLs out of ${nf(agg.funnel[1].count)} MQLs`}
                badge={sim ? "Simulated: qualification step in use" : "Bottleneck: unused qualification step"}
                accent={sim ? GREEN : undefined} />
              <KpiCard
                label="Median throughput"
                value={`${agg.medianThroughput} days`}
                sub="MQL → Opportunity (median)"
                badge={sim ? "Historical deals, unchanged in simulation" : "Bottleneck: no time-based routing"} />
              <KpiCard
                label="SQL step bypassed"
                value={nf(agg.bypassCount)}
                sub="Opportunities without SQL registration"
                badge={sim ? "Simulated: routing backfills registration" : "Bottleneck: unqualified handover"}
                accent={sim ? GREEN : undefined} />
              <KpiCard
                label="Contacts on 'Other'"
                value={nf(agg.otherCount)}
                sub={sim ? "reclassified into the funnel" : "outside every segment and workflow"}
                badge={sim ? "Simulated: full lifecycle coverage" : "Bottleneck: segmentation failure"}
                accent={sim ? GREEN : undefined} />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>
                    Funnel volume per Lifecycle Stage
                  </h2>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded"
                    style={{ backgroundColor: "#e3f1f9", color: BLUE }}>
                    Click a bar for detail
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {sim
                    ? "With the scoring model applied, the SQL stage fills up and the funnel becomes measurable end to end."
                    : "Volume recovers at Opportunity level while the SQL stage stays nearly empty: the qualification step is structurally bypassed."}
                </p>
                <div className="h-72 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agg.funnel} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="stage" tick={{ fill: SLATE, fontSize: 12 }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                      <YAxis tick={{ fill: SLATE, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<FunnelTooltip bypassCount={agg.bypassCount} />} cursor={{ fill: "rgba(0,115,174,0.06)" }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={90}
                        onClick={(d) => d && d.key && openDrill(d.key)}
                        style={{ cursor: "pointer" }}>
                        {agg.funnel.map((entry) => (
                          <Cell key={entry.stage}
                            fill={entry.key === "sql" && sim ? GREEN : entry.fill} />
                        ))}
                        <LabelList dataKey="count" position="top" formatter={nf}
                          style={{ fill: NAVY, fontSize: 12, fontWeight: 700 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <InfoBadge>
                  {sim
                    ? "Link with Recommendation 5: automated SQL routing makes every Opportunity pass through a registered qualification, so the conversion rate becomes measurable."
                    : "Link with Recommendation 5: automated SQL routing enforces a registered qualification for every Opportunity, making the conversion rate measurable."}
                </InfoBadge>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
                <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>
                  Field completeness per funnel stage (%)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Computed from the underlying records. {sim ? "Scoring cannot repair missing data: completeness only improves through field validation at intake (Recommendation 1)." : "Data quality drops exactly when sales needs the information most."}
                </p>
                <div className="h-72 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={agg.completeness} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="stage" tick={{ fill: SLATE, fontSize: 12 }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: SLATE, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip formatter={(v, name) => [`${v}%`, name]}
                        contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
                        onClick={(e) => setActiveLine(activeLine === e.dataKey ? null : e.dataKey)} />
                      <ReferenceLine y={90} stroke={CYAN} strokeDasharray="6 4"
                        label={{ value: "Target 90%", position: "insideTopRight", fill: BLUE, fontSize: 10 }} />
                      <Line type="monotone" dataKey="overall" name="Overall completeness" stroke={BLUE} strokeWidth={3}
                        dot={{ r: 4, fill: BLUE }} opacity={activeLine && activeLine !== "overall" ? 0.15 : 1} />
                      <Line type="monotone" dataKey="industry" name="Industry field" stroke={ORANGE} strokeWidth={2.5}
                        dot={{ r: 4, fill: ORANGE }} opacity={activeLine && activeLine !== "industry" ? 0.15 : 1} />
                      <Line type="monotone" dataKey="source" name="Source field (custom)" stroke={RED} strokeWidth={2.5}
                        dot={{ r: 4, fill: RED }} opacity={activeLine && activeLine !== "source" ? 0.15 : 1} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <InfoBadge>
                  Link with Recommendation 1: mandatory field validation at intake prevents incomplete records from entering the funnel and the decay from accumulating downstream.
                </InfoBadge>
              </div>
            </section>

            <CohortSection cohorts={cohorts} sim={sim} />

            <section className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: NAVY }}>
                  Action required · Database hygiene
                </h2>
                <span className="text-[11px] font-semibold px-2 py-1 rounded"
                  style={{ backgroundColor: "#fdecec", color: RED, border: "1px solid #f5b5b5" }}>
                  {alerts.filter((a) => a.severity !== "resolved").length} open signals
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                All counts are computed live from the data source. Click a signal for context, the linked recommendation and a drill-down into the detail dashboard.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {alerts.map((a) => <AlertCard key={a.id} alert={a} onDrill={openDrill} />)}
              </div>
            </section>
          </>
        )}

        <footer className="text-center text-[11px] text-slate-400 pb-4">
          All records are synthetically generated (seed 42). Names, companies and email addresses are fictional; any resemblance to existing persons or organisations is coincidental.
        </footer>
      </main>
    </div>
  );
}
