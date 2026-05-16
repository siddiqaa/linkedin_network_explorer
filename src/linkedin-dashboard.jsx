import { useState, useCallback, useMemo, useRef } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

// ── Palette & theme ──────────────────────────────────────────────────────────
const C = {
  bg: "#0a0a0f",
  surface: "#12121a",
  card: "#1a1a26",
  border: "#2a2a3f",
  accent: "#6ee7b7",       // mint
  accent2: "#818cf8",      // indigo
  accent3: "#f472b6",      // pink
  muted: "#4a4a6a",
  text: "#e2e8f0",
  textDim: "#7c7c9e",
};

// ── Seniority classifier ────────────────────────────────────────────────────
const SENIORITY = [
  { label: "C-Suite / Founder", keywords: ["ceo","cto","coo","cfo","cpo","chief","founder","co-founder","president","owner","partner"], color: C.accent },
  { label: "VP / Director",     keywords: ["vp","vice president","director","head of","svp","evp","gm","general manager"], color: C.accent2 },
  { label: "Manager / Lead",    keywords: ["manager","lead","principal","staff","supervisor","team lead","tech lead"], color: "#a78bfa" },
  { label: "Senior / Mid",      keywords: ["senior","sr.","sr ","specialist","architect","consultant","advisor"], color: "#60a5fa" },
  { label: "Junior / Associate",keywords: ["junior","jr.","associate","assistant","coordinator","analyst","intern","entry"], color: "#34d399" },
  { label: "Unknown / Other",   keywords: [], color: C.muted },
];

function classifySeniority(title = "") {
  const t = title.toLowerCase();
  for (const s of SENIORITY) {
    if (s.keywords.some(k => t.includes(k))) return s.label;
  }
  return "Unknown / Other";
}


// ── Title normalizer ─────────────────────────────────────────────────────────
// Each rule: { pattern: RegExp, canonical: string }
// Rules are tested in order; first match wins.
// Raw title is preserved in Position_raw; normalized goes into Position.

const TITLE_RULES = [
  // ── C-Suite ──
  { pattern: /\bchief\s+exec/i,                              canonical: "CEO" },
  { pattern: /\bceo\b/i,                                     canonical: "CEO" },
  { pattern: /\bchief\s+tech/i,                              canonical: "CTO" },
  { pattern: /\bcto\b/i,                                     canonical: "CTO" },
  { pattern: /\bchief\s+prod/i,                              canonical: "CPO" },
  { pattern: /\bcpo\b/i,                                     canonical: "CPO" },
  { pattern: /\bchief\s+op/i,                                canonical: "COO" },
  { pattern: /\bcoo\b/i,                                     canonical: "COO" },
  { pattern: /\bchief\s+fin/i,                               canonical: "CFO" },
  { pattern: /\bcfo\b/i,                                     canonical: "CFO" },
  { pattern: /\bchief\s+rev/i,                               canonical: "CRO" },
  { pattern: /\bchief\s+mark/i,                              canonical: "CMO" },
  { pattern: /\bcmo\b/i,                                     canonical: "CMO" },
  { pattern: /\bchief\s+data/i,                              canonical: "CDO" },
  { pattern: /\bchief\s+info/i,                              canonical: "CIO" },
  { pattern: /\bchief\s+sec/i,                               canonical: "CISO" },
  { pattern: /\bchief\s+design/i,                            canonical: "Chief Design Officer" },
  { pattern: /\bchief\s+of\s+staff/i,                       canonical: "Chief of Staff" },
  { pattern: /\bco[\s-]?founder\b/i,                        canonical: "Co-Founder" },
  { pattern: /\bfounder\b/i,                                 canonical: "Founder" },
  { pattern: /\bpresident\b/i,                               canonical: "President" },
  { pattern: /\bmanaging\s+(director|partner)\b/i,          canonical: "Managing Director" },

  // ── VP ──
  { pattern: /\bevp\b|\bexec.*\bvp\b/i,                   canonical: "EVP" },
  { pattern: /\bsvp\b|\bsenior.*\bvp\b/i,                 canonical: "SVP" },
  { pattern: /\bvp\b.*\beng/i,                              canonical: "VP Engineering" },
  { pattern: /\bvp\b.*\bprod/i,                             canonical: "VP Product" },
  { pattern: /\bvp\b.*\bsales/i,                            canonical: "VP Sales" },
  { pattern: /\bvp\b.*\bmark/i,                             canonical: "VP Marketing" },
  { pattern: /\bvp\b.*\bdesign/i,                           canonical: "VP Design" },
  { pattern: /\bvp\b.*\bdata/i,                             canonical: "VP Data" },
  { pattern: /\bvp\b.*\bfin/i,                              canonical: "VP Finance" },
  { pattern: /\bvice\s+pres/i,                               canonical: "VP" },
  { pattern: /\bvp\b/i,                                      canonical: "VP" },

  // ── Director ──
  { pattern: /\bdir.*\beng/i,                                canonical: "Director of Engineering" },
  { pattern: /\bdir.*\bprod/i,                               canonical: "Director of Product" },
  { pattern: /\bdir.*\bsales/i,                              canonical: "Director of Sales" },
  { pattern: /\bdir.*\bmark/i,                               canonical: "Director of Marketing" },
  { pattern: /\bdir.*\bdesign/i,                             canonical: "Director of Design" },
  { pattern: /\bdir.*\bdata/i,                               canonical: "Director of Data" },
  { pattern: /\bdir.*\bhr\b|\bdir.*\bpeople/i,            canonical: "Director of People" },
  { pattern: /\bdirector\b/i,                                canonical: "Director" },
  { pattern: /\bhead\s+of\s+eng/i,                          canonical: "Head of Engineering" },
  { pattern: /\bhead\s+of\s+prod/i,                         canonical: "Head of Product" },
  { pattern: /\bhead\s+of\s+sales/i,                        canonical: "Head of Sales" },
  { pattern: /\bhead\s+of\s+mark/i,                         canonical: "Head of Marketing" },
  { pattern: /\bhead\s+of\s+design/i,                       canonical: "Head of Design" },
  { pattern: /\bhead\s+of\s+data/i,                         canonical: "Head of Data" },
  { pattern: /\bhead\s+of\b/i,                              canonical: "Head of" },
  { pattern: /\bgeneral\s+manager\b/i,                      canonical: "General Manager" },

  // ── Engineering ──
  { pattern: /\bstaff\b.*\beng/i,                           canonical: "Staff Engineer" },
  { pattern: /\bstaff\b.*\bswe\b/i,                        canonical: "Staff Engineer" },
  { pattern: /\bprincipal\b.*\beng/i,                       canonical: "Principal Engineer" },
  { pattern: /\bdistinguished\b.*\beng/i,                   canonical: "Distinguished Engineer" },
  { pattern: /\beng.*\bmanager\b|\bem\b/i,                canonical: "Engineering Manager" },
  { pattern: /\bsenior\b.*\bstaff\b.*\beng/i,             canonical: "Senior Staff Engineer" },
  { pattern: /\b(sr\.?|senior)\b.*\b(swe|software\s+eng)/i, canonical: "Senior Software Engineer" },
  { pattern: /\b(jr\.?|junior)\b.*\b(swe|software\s+eng)/i, canonical: "Junior Software Engineer" },
  { pattern: /\bsoftware\s+eng/i,                            canonical: "Software Engineer" },
  { pattern: /\bswe\b/i,                                     canonical: "Software Engineer" },
  { pattern: /\bfull[\s-]?stack/i,                           canonical: "Full Stack Engineer" },
  { pattern: /\bfrontend\b|\bfront[\s-]end\b/i,           canonical: "Frontend Engineer" },
  { pattern: /\bbackend\b|\bback[\s-]end\b/i,             canonical: "Backend Engineer" },
  { pattern: /\bmobile\b.*\b(eng|dev)/i,                    canonical: "Mobile Engineer" },
  { pattern: /\bios\b.*\b(eng|dev)/i,                       canonical: "iOS Engineer" },
  { pattern: /\bandroid\b.*\b(eng|dev)/i,                   canonical: "Android Engineer" },
  { pattern: /\bdevops\b/i,                                  canonical: "DevOps Engineer" },
  { pattern: /\bsite\s+rel/i,                                canonical: "SRE" },
  { pattern: /\bsre\b/i,                                     canonical: "SRE" },
  { pattern: /\bplatform\b.*\beng/i,                        canonical: "Platform Engineer" },
  { pattern: /\binfra.*\beng/i,                              canonical: "Infrastructure Engineer" },
  { pattern: /\bsecurity\b.*\beng/i,                        canonical: "Security Engineer" },
  { pattern: /\bqa\b|\bquality\s+assur/i,                  canonical: "QA Engineer" },
  { pattern: /\bembedded\b.*\beng/i,                        canonical: "Embedded Engineer" },
  { pattern: /\b(sr\.?|senior)\b.*\beng/i,                 canonical: "Senior Engineer" },
  { pattern: /\b(jr\.?|junior)\b.*\beng/i,                 canonical: "Junior Engineer" },
  { pattern: /\bengineer\b/i,                                canonical: "Engineer" },

  // ── Product ──
  { pattern: /\b(sr\.?|senior)\b.*\bpm\b/i,               canonical: "Senior Product Manager" },
  { pattern: /\b(sr\.?|senior)\b.*\bprod.*\bman/i,        canonical: "Senior Product Manager" },
  { pattern: /\bgroup\s+pm\b|\bgpm\b/i,                   canonical: "Group Product Manager" },
  { pattern: /\bprincipal\s+pm\b/i,                         canonical: "Principal Product Manager" },
  { pattern: /\bstaff\s+pm\b/i,                             canonical: "Staff Product Manager" },
  { pattern: /\bprod.*\bman|\bpm\b/i,                      canonical: "Product Manager" },
  { pattern: /\bprod.*\bown/i,                               canonical: "Product Owner" },

  // ── Design ──
  { pattern: /\b(sr\.?|senior)\b.*\b(ux|ui|product)\s*(design|research)/i, canonical: "Senior Designer" },
  { pattern: /\bux\s*research/i,                             canonical: "UX Researcher" },
  { pattern: /\bux\b|\buser\s+exp/i,                       canonical: "UX Designer" },
  { pattern: /\bui\b.*\bdesign/i,                           canonical: "UI Designer" },
  { pattern: /\bprod.*\bdesign/i,                            canonical: "Product Designer" },
  { pattern: /\bgraphic\s+design/i,                          canonical: "Graphic Designer" },
  { pattern: /\bbrand\s+design/i,                            canonical: "Brand Designer" },
  { pattern: /\bmotion\s+design/i,                           canonical: "Motion Designer" },
  { pattern: /\bdesign\b/i,                                  canonical: "Designer" },

  // ── Data & ML ──
  { pattern: /\bml\s+eng|\bmachine\s+learn.*\beng/i,      canonical: "ML Engineer" },
  { pattern: /\bai\s+eng/i,                                  canonical: "AI Engineer" },
  { pattern: /\bdata\s+eng/i,                                canonical: "Data Engineer" },
  { pattern: /\b(sr\.?|senior)\b.*\bdata\s+sci/i,         canonical: "Senior Data Scientist" },
  { pattern: /\bdata\s+sci/i,                                canonical: "Data Scientist" },
  { pattern: /\bdata\s+anal/i,                               canonical: "Data Analyst" },
  { pattern: /\bml\b|\bmachine\s+learn/i,                  canonical: "ML Researcher" },
  { pattern: /\bquant\b/i,                                   canonical: "Quantitative Analyst" },
  { pattern: /\bbusiness\s+intel/i,                          canonical: "Business Intelligence Analyst" },
  { pattern: /\banalytics\b.*\beng/i,                       canonical: "Analytics Engineer" },

  // ── Sales ──
  { pattern: /\baccount\s+exec/i,                            canonical: "Account Executive" },
  { pattern: /\baccount\s+man/i,                             canonical: "Account Manager" },
  { pattern: /\bsales\s+dev.*\brep|\bsdr\b/i,             canonical: "SDR" },
  { pattern: /\bbusiness\s+dev.*\brep|\bbdr\b/i,          canonical: "BDR" },
  { pattern: /\bcustomer\s+succ/i,                           canonical: "Customer Success Manager" },
  { pattern: /\bsales\s+eng/i,                               canonical: "Sales Engineer" },
  { pattern: /\bsolution.*\beng/i,                           canonical: "Solutions Engineer" },
  { pattern: /\bsales\b/i,                                   canonical: "Sales" },

  // ── Marketing ──
  { pattern: /\bgrowth\b.*\b(mark|eng|hack)/i,              canonical: "Growth" },
  { pattern: /\bperform.*\bmark/i,                           canonical: "Performance Marketing Manager" },
  { pattern: /\bcontent\b.*\bmark/i,                        canonical: "Content Marketer" },
  { pattern: /\bseo\b/i,                                     canonical: "SEO Specialist" },
  { pattern: /\bpaid\b.*\b(media|ads|social)/i,             canonical: "Paid Media Manager" },
  { pattern: /\bbrand\b.*\bmark/i,                          canonical: "Brand Marketer" },
  { pattern: /\bprod.*\bmark/i,                              canonical: "Product Marketing Manager" },
  { pattern: /\bdemand\s+gen/i,                              canonical: "Demand Generation Manager" },
  { pattern: /\bcomms\b|\bcommunications\b/i,              canonical: "Communications Manager" },
  { pattern: /\bpr\b|\bpublic\s+rel/i,                     canonical: "PR Manager" },
  { pattern: /\bmarket/i,                                     canonical: "Marketer" },

  // ── People / HR ──
  { pattern: /\bpeople\s+(ops|partner|lead)/i,               canonical: "People Operations" },
  { pattern: /\btalent\s+acq/i,                              canonical: "Talent Acquisition" },
  { pattern: /\brecruit/i,                                    canonical: "Recruiter" },
  { pattern: /\bhr\s+business\s+part/i,                     canonical: "HR Business Partner" },
  { pattern: /\bhris\b/i,                                    canonical: "HR Systems" },
  { pattern: /\bhuman\s+res|\bhr\b/i,                      canonical: "HR Manager" },

  // ── Finance & Legal ──
  { pattern: /\bfinancial\s+anal/i,                          canonical: "Financial Analyst" },
  { pattern: /\bfinancial\s+plan/i,                          canonical: "FP&A" },
  { pattern: /\bfp&a\b|\bfp\s*&\s*a\b/i,                canonical: "FP&A" },
  { pattern: /\bcontrol/i,                                    canonical: "Controller" },
  { pattern: /\baccountant\b|\baccounting\b/i,             canonical: "Accountant" },
  { pattern: /\bcounsel\b|\bgeneral\s+counsel/i,           canonical: "General Counsel" },
  { pattern: /\battorn/i,                                     canonical: "Attorney" },
  { pattern: /\bcompli/i,                                     canonical: "Compliance" },

  // ── Operations ──
  { pattern: /\bops\s+man|\boperations\s+man/i,            canonical: "Operations Manager" },
  { pattern: /\bprog.*\bman|\bprogram\s+man/i,             canonical: "Program Manager" },
  { pattern: /\bproj.*\bman|\bproject\s+man/i,             canonical: "Project Manager" },
  { pattern: /\bscrum\s+mas|\bagile\s+coach/i,             canonical: "Scrum Master" },
  { pattern: /\bchief\s+of\s+staff/i,                       canonical: "Chief of Staff" },
  { pattern: /\bstrategy\b/i,                                canonical: "Strategy" },
  { pattern: /\bconsult/i,                                    canonical: "Consultant" },

  // ── Early career / Other ──
  { pattern: /\bintern\b/i,                                  canonical: "Intern" },
  { pattern: /\bstudent\b/i,                                 canonical: "Student" },
  { pattern: /\bfreelance\b|\bself[\s-]?employ/i,          canonical: "Freelancer" },
  { pattern: /\badviso/i,                                     canonical: "Advisor" },
  { pattern: /\bboard\b.*\bmember/i,                        canonical: "Board Member" },
  { pattern: /\bventure\b|\b\bvc\b/i,                     canonical: "Venture Capitalist" },
  { pattern: /\bangel\b.*\binvest/i,                        canonical: "Angel Investor" },
  { pattern: /\binvest/i,                                     canonical: "Investor" },
];

function normalizeTitle(raw = "") {
  if (!raw.trim()) return { canonical: "", matched: false };
  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(raw)) {
      return { canonical: rule.canonical, matched: true };
    }
  }
  return { canonical: raw, matched: false }; // return raw if no match
}

function normalizeData(rows) {
  return rows.map(r => {
    const raw = r["Position"] || "";
    const { canonical, matched } = normalizeTitle(raw);
    return {
      ...r,
      "Position_raw": raw,
      "Position": canonical,
      "Position_matched": matched,
    };
  });
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function parseDate(str = "") {
  // LinkedIn uses "DD MMM YYYY" or "MMM DD, YYYY" or ISO
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// ── Sample data for demo ──────────────────────────────────────────────────────
function generateSample() {
  const companies = ["Google","Microsoft","Apple","Meta","Amazon","Stripe","OpenAI","Anthropic","Netflix","Uber","Airbnb","Spotify","Notion","Linear","Figma","Vercel","Cloudflare","Databricks","Snowflake","Palantir","Independent","Freelance"];
  const titles = ["Software Engineer","Senior Engineer","Staff Engineer","Engineering Manager","Product Manager","Senior PM","Director of Engineering","VP Engineering","CTO","CEO","Designer","UX Researcher","Data Scientist","ML Engineer","DevOps Engineer","Marketing Manager","Sales Director","Recruiter","Founder","COO","Chief of Staff","Analyst","Associate","Intern"];
  const firstNames = ["Alex","Jordan","Morgan","Casey","Riley","Quinn","Avery","Taylor","Sam","Drew","Blake","Reese","Skyler","Cameron","Dakota"];
  const lastNames = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White"];
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 150; i++) {
    const daysAgo = Math.floor(Math.random() ** 1.5 * 2500);
    const d = new Date(now - daysAgo * 86400000);
    rows.push({
      "First Name": firstNames[Math.floor(Math.random()*firstNames.length)],
      "Last Name": lastNames[Math.floor(Math.random()*lastNames.length)],
      "URL": `https://www.linkedin.com/in/user-${i}`,
      "Email Address": Math.random() > 0.75 ? `user${i}@example.com` : "",
      "Company": companies[Math.floor(Math.random()*companies.length)],
      "Position": titles[Math.floor(Math.random()*titles.length)],
      "Connected On": d.toISOString().split("T")[0],
    });
  }
  return rows;
}

// ── Heatmap component ─────────────────────────────────────────────────────────
function Heatmap({ data }) {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const grid = useMemo(() => {
    const map = {};
    let max = 0;
    data.forEach(r => {
      const d = parseDate(r["Connected On"]);
      if (!d) return;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      map[key] = (map[key] || 0) + 1;
      if (map[key] > max) max = map[key];
    });
    const years = [...new Set(Object.keys(map).map(k => +k.split("-")[0]))].sort();
    return { map, max, years };
  }, [data]);

  const [hovered, setHovered] = useState(null);

  if (!grid.years.length) return null;

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
          <thead>
            <tr>
              <th style={{ width: 48, color: C.textDim, fontSize: 11, fontWeight: 400, textAlign: "right", paddingRight: 8 }}></th>
              {MONTHS.map(m => (
                <th key={m} style={{ color: C.textDim, fontSize: 10, fontWeight: 400, textAlign: "center", width: 32 }}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.years.map(yr => (
              <tr key={yr}>
                <td style={{ color: C.textDim, fontSize: 11, textAlign: "right", paddingRight: 8, whiteSpace: "nowrap" }}>{yr}</td>
                {MONTHS.map((_, mi) => {
                  const key = `${yr}-${mi}`;
                  const count = grid.map[key] || 0;
                  const intensity = grid.max > 0 ? count / grid.max : 0;
                  const isHov = hovered === key;
                  const bg = count === 0
                    ? C.border
                    : `rgba(110,231,183,${0.1 + intensity * 0.9})`;
                  return (
                    <td key={mi}
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered(null)}
                      title={`${MONTHS[mi]} ${yr}: ${count} connections`}
                      style={{
                        width: 28, height: 22, borderRadius: 3,
                        background: bg,
                        border: isHov ? `1px solid ${C.accent}` : "1px solid transparent",
                        cursor: count > 0 ? "pointer" : "default",
                        transition: "border 0.15s",
                        position: "relative",
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
        <span style={{ color: C.textDim, fontSize: 11 }}>Less</span>
        {[0.05, 0.25, 0.5, 0.75, 1].map(v => (
          <div key={v} style={{ width: 16, height: 16, borderRadius: 3, background: `rgba(110,231,183,${v})` }} />
        ))}
        <span style={{ color: C.textDim, fontSize: 11 }}>More</span>
      </div>
    </div>
  );
}

// ── Seniority Pyramid ─────────────────────────────────────────────────────────
function SeniorityChart({ data }) {
  const chartData = useMemo(() => {
    const counts = {};
    SENIORITY.forEach(s => counts[s.label] = 0);
    data.forEach(r => {
      const s = classifySeniority(r["Position"]);
      counts[s] = (counts[s] || 0) + 1;
    });
    return SENIORITY.map(s => ({ name: s.label, count: counts[s.label], color: s.color }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const total = chartData.reduce((s, d) => s + d.count, 0);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 40, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={160}
          tick={{ fill: C.textDim, fontSize: 11, fontFamily: "inherit" }}
          axisLine={false} tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }}
          formatter={(v) => [`${v} (${((v/total)*100).toFixed(1)}%)`, "Connections"]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Top Companies ─────────────────────────────────────────────────────────────
function TopCompanies({ data }) {
  const chartData = useMemo(() => {
    const counts = {};
    data.forEach(r => {
      const c = (r["Company"] || "").trim();
      if (c) counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));
  }, [data]);

  // 36px per row guarantees every label has room — no skipping
  const height = chartData.length * 36;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={140}
          tick={{ fill: C.textDim, fontSize: 11, fontFamily: "inherit" }}
          axisLine={false} tickLine={false} interval={0}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }}
          formatter={(v) => [v, "Connections"]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} fill={C.accent2} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Filterable Table ──────────────────────────────────────────────────────────
function ConnectionsTable({ data }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return data;
    return data.filter(r => {
      // Search across display fields only (exclude internal _matched/_raw meta)
      const searchFields = ["First Name","Last Name","Company","Position","Position_raw","Email Address","Connected On"];
      return searchFields.some(k => String(r[k] || "").toLowerCase().includes(q));
    });
  }, [data, search]);

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const visible = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const handleSearch = (e) => { setSearch(e.target.value); setPage(0); };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={handleSearch}
          placeholder="Search name, company, title…"
          style={{
            flex: 1, minWidth: 200, padding: "8px 14px",
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.text, fontSize: 13,
            outline: "none", fontFamily: "inherit",
          }}
        />
        <span style={{ color: C.textDim, fontSize: 12, whiteSpace: "nowrap" }}>
          {filtered.length.toLocaleString()} results
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Name","Company","Position","Email","Connected On","Seniority"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: C.textDim, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const sen = classifySeniority(r["Position"]);
              const senColor = SENIORITY.find(s => s.label === sen)?.color || C.muted;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}22`, transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.card}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                    {r["URL"] ? (
                      <a href={r["URL"]} target="_blank" rel="noopener noreferrer"
                        style={{ color: C.accent, textDecoration: "none", fontWeight: 500 }}
                        onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                        onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
                      >
                        {r["First Name"]} {r["Last Name"]} ↗
                      </a>
                    ) : (
                      <span style={{ color: C.text }}>{r["First Name"]} {r["Last Name"]}</span>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", color: C.textDim, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r["Company"]}</td>
                  <td style={{ padding: "9px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={r["Position_raw"] !== r["Position"] ? `Raw: ${r["Position_raw"]}` : ""}>
                    <span style={{ color: C.textDim }}>{r["Position"]}</span>
                    {r["Position_raw"] && r["Position_raw"] !== r["Position"] && (
                      <span style={{ fontSize: 9, color: C.muted, marginLeft: 4 }}>~</span>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", color: r["Email Address"] ? C.accent : C.muted }}>
                    {r["Email Address"] ? "✓" : "–"}
                  </td>
                  <td style={{ padding: "9px 12px", color: C.textDim, whiteSpace: "nowrap" }}>{r["Connected On"]}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 99,
                      background: `${senColor}22`, color: senColor,
                      border: `1px solid ${senColor}44`, whiteSpace: "nowrap"
                    }}>{sen}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center", alignItems: "center" }}>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
            style={{ padding: "6px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 12 }}>←</button>
          <span style={{ color: C.textDim, fontSize: 12 }}>Page {page+1} of {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages-1, p+1))} disabled={page === pages-1}
            style={{ padding: "6px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 12 }}>→</button>
        </div>
      )}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "20px 24px", flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || C.accent, fontFamily: "'DM Mono', monospace", letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, color: C.textDim, textTransform: "uppercase", marginBottom: 20 }}>{title}</div>
      {children}
    </div>
  );
}


// ── Unmatched Titles panel ────────────────────────────────────────────────────
function UnmatchedTitles({ data }) {
  const [expanded, setExpanded] = useState(false);

  const unmatched = useMemo(() => {
    const counts = {};
    (data || []).forEach(r => {
      if (!r["Position_matched"] && r["Position_raw"]?.trim()) {
        const t = r["Position_raw"].trim();
        counts[t] = (counts[t] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [data]);

  if (!unmatched.length) return null;

  const pct = ((unmatched.reduce((s,[,n])=>s+n,0) / data.length) * 100).toFixed(1);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, color: C.textDim, textTransform: "uppercase" }}>
            Unmatched Titles
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {unmatched.length} unique titles ({pct}% of connections) didn't match any normalisation rule
          </div>
        </div>
        <span style={{ color: C.textDim, fontSize: 14 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
            These are returned as-is. Add rules to TITLE_RULES in the code to normalise them.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {unmatched.map(([title, count]) => (
              <span key={title} style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 99,
                background: C.surface, border: `1px solid ${C.border}`,
                color: C.textDim, display: "flex", alignItems: "center", gap: 6,
              }}>
                {title}
                <span style={{ color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("overview");
  const fileRef = useRef();

  const loadFile = useCallback((file) => {
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split("\n");
      const headerIdx = lines.findIndex(l => l.trimStart().startsWith("First Name"));
      const csv = headerIdx >= 0 ? lines.slice(headerIdx).join("\n") : text;
      Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          setData(normalizeData(result.data));
          setLoading(false);
        },
      });
    };
    reader.readAsText(file);
  }, []);

  const loadSample = () => setData(normalizeData(generateSample()));

  const stats = useMemo(() => {
    if (!data) return null;
    const withEmail = data.filter(r => r["Email Address"]?.trim()).length;
    const companies = new Set(data.map(r => r["Company"]?.trim()).filter(Boolean));
    const dates = data.map(r => parseDate(r["Connected On"])).filter(Boolean).sort((a,b)=>a-b);
    const newest = dates[dates.length-1];
    const oldest = dates[0];
    return { total: data.length, withEmail, companies: companies.size, newest, oldest };
  }, [data]);

  const TABS = ["overview", "activity", "companies", "connections", "job search"];

  const fontLink = `@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap');`;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Syne', sans-serif" }}>
      <style>{`
        ${fontLink}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${C.surface}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        input::placeholder { color: ${C.muted}; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "16px 32px", display: "flex", alignItems: "center", gap: 16, background: C.surface }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: C.accent }}>LN</span> Network Explorer
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>LinkedIn connections analyser</div>
        </div>
        <div style={{ flex: 1 }} />
        {data && (
          <span style={{ fontSize: 12, color: C.textDim, fontFamily: "'DM Mono', monospace" }}>
            {data.length.toLocaleString()} connections loaded
          </span>
        )}
        <button onClick={() => fileRef.current?.click()}
          style={{
            padding: "8px 18px", background: "transparent",
            border: `1px solid ${C.accent}`, borderRadius: 8,
            color: C.accent, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
          }}>
          Upload CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
          onChange={e => loadFile(e.target.files[0])} />
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {!data ? (
          /* Upload screen */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 24 }}>
            <div style={{
              border: `2px dashed ${C.border}`, borderRadius: 16,
              padding: "64px 80px", textAlign: "center", cursor: "pointer",
              transition: "border-color 0.2s",
            }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Drop your Connections.csv here</div>
              <div style={{ fontSize: 13, color: C.textDim, marginBottom: 24 }}>
                From LinkedIn → Settings → Data Privacy → Get a copy of your data
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                  style={{ padding: "10px 24px", background: C.accent, border: "none", borderRadius: 8, color: C.bg, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Choose file
                </button>
                <button onClick={e => { e.stopPropagation(); loadSample(); }}
                  style={{ padding: "10px 24px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.textDim, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Load sample data
                </button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>
              Your data never leaves your browser — all processing is local.
            </div>
          </div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: 80, color: C.textDim }}>Parsing…</div>
        ) : (
          <>
            {/* Stat row */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <StatCard label="Total connections" value={stats.total.toLocaleString()} accent={C.accent} />
              <StatCard label="With email" value={stats.withEmail.toLocaleString()}
                sub={`${((stats.withEmail/stats.total)*100).toFixed(1)}% of network`} accent={C.accent2} />
              <StatCard label="Companies" value={stats.companies.toLocaleString()} accent="#f472b6" />
              <StatCard label="Oldest connection"
                value={stats.oldest ? stats.oldest.getFullYear() : "—"}
                sub={stats.oldest?.toLocaleDateString()} accent={C.accent} />
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.surface, padding: 4, borderRadius: 10, width: "fit-content" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{
                    padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: tab === t ? C.card : "transparent",
                    color: tab === t ? C.text : C.textDim,
                    fontSize: 12, fontWeight: tab === t ? 600 : 400,
                    fontFamily: "inherit", textTransform: "capitalize",
                    transition: "all 0.15s",
                    boxShadow: tab === t ? `0 0 0 1px ${C.border}` : "none",
                  }}>
                  {t}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <>
                <Section title="Seniority Breakdown">
                  <SeniorityChart data={data} />
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                    Classified by keyword matching in job titles. "Unknown / Other" includes titles that don't match common patterns.
                  </div>
                </Section>
                <Section title="Top 12 Companies">
                  <TopCompanies data={data} />
                </Section>
                <UnmatchedTitles data={data} />
                <UnmatchedTitles data={data} />
              </>
            )}

            {tab === "activity" && (
              <Section title="Connections Over Time — Monthly Heatmap">
                <Heatmap data={data} />
                <div style={{ fontSize: 11, color: C.muted, marginTop: 16 }}>
                  Each cell = one month. Hover for exact count. Dark spikes often signal conferences, job changes, or active outreach campaigns.
                </div>
              </Section>
            )}

            {tab === "companies" && (
              <Section title="Top Companies (Extended — top 12)">
                <TopCompanies data={data} />
              </Section>
            )}

            {tab === "connections" && (
              <Section title="All Connections">
                <ConnectionsTable data={data} />
              </Section>
            )}

            {tab === "job search" && (
              <JobSearch data={data} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Job Search component ──────────────────────────────────────────────────────
function JobSearch({ data }) {
  // Derive sorted unique company list from connections
  const companies = useMemo(() => {
    const set = new Set(
      (data || []).map(r => (r["Company"] || "").trim()).filter(Boolean)
    );
    return ["", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [data]);

  const [company, setCompany]   = useState("");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [history, setHistory]   = useState([]);

  const topCompanies = useMemo(() => {
    const counts = {};
    (data || []).forEach(r => {
      const c = (r["Company"] || "").trim();
      if (c) counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 20);
  }, [data]);

  const canSearch = company.trim() || keywords.trim();

  function buildUrl() {
    const parts = [keywords.trim(), company.trim() ? `at ${company.trim()}` : "", location.trim()].filter(Boolean);
    const q = encodeURIComponent(parts.join(" "));
    return `https://www.google.com/search?q=${q}&ibp=htl;jobs`;
  }

  function handleSearch() {
    if (!canSearch) return;
    const url = buildUrl();
    const entry = {
      id: Date.now(),
      company: company || "Any company",
      keywords: keywords || "Any role",
      location: location || "Anywhere",
      url,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setHistory(h => [entry, ...h].slice(0, 10));
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSearch();
  }

  const inputStyle = {
    width: "100%", padding: "10px 14px",
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontSize: 13,
    outline: "none", fontFamily: "inherit",
    transition: "border-color 0.15s",
  };

  const labelStyle = {
    fontSize: 11, color: C.textDim, fontWeight: 600,
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, display: "block",
  };

  return (
    <div>
      {/* Search card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, color: C.textDim, textTransform: "uppercase", marginBottom: 24 }}>
          Google Jobs Search
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          {/* Company picker */}
          <div>
            <label style={labelStyle}>Company</label>
            <select
              value={company}
              onChange={e => setCompany(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">Any company</option>
              {companies.filter(Boolean).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {company && (
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                {(data || []).filter(r => r["Company"]?.trim() === company).length} connections here
              </div>
            )}
          </div>

          {/* Keywords */}
          <div>
            <label style={labelStyle}>Role / Keywords</label>
            <input
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Senior Product Manager"
              style={inputStyle}
            />
          </div>

          {/* Location */}
          <div>
            <label style={labelStyle}>Location (optional)</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. London, Remote"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Preview + button row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button
            onClick={handleSearch}
            disabled={!canSearch}
            style={{
              padding: "10px 28px", background: canSearch ? C.accent : C.muted,
              border: "none", borderRadius: 8, color: C.bg,
              fontSize: 13, fontWeight: 700, cursor: canSearch ? "pointer" : "not-allowed",
              fontFamily: "inherit", transition: "background 0.15s", whiteSpace: "nowrap",
            }}
          >
            Search Google Jobs ↗
          </button>

          {canSearch && (
            <div style={{
              flex: 1, fontSize: 11, color: C.textDim, fontFamily: "'DM Mono', monospace",
              background: C.surface, padding: "8px 12px", borderRadius: 6,
              border: `1px solid ${C.border}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {[keywords, company ? `at ${company}` : "", location].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: C.muted, marginTop: 16 }}>
          Opens Google Jobs in a new tab. Results are live — no API key required.
        </div>
      </div>

      {/* Quick searches from top companies */}
      {data && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, color: C.textDim, textTransform: "uppercase", marginBottom: 16 }}>
            Quick Search — Top Companies
          </div>
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>
            Click any company to pre-fill the search above, or shift-click to open Google Jobs directly.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {topCompanies.map(([co, count]) => (
              <button
                key={co}
                onClick={e => {
                  if (e.shiftKey) {
                    const q = encodeURIComponent(`${keywords || ""} at ${co}`.trim());
                    window.open(`https://www.google.com/search?q=${q}&ibp=htl;jobs`, "_blank", "noopener,noreferrer");
                  } else {
                    setCompany(co);
                  }
                }}
                title={`${count} connections · Click to select · Shift+click to search`}
                style={{
                  padding: "6px 14px", background: C.surface,
                  border: `1px solid ${C.border}`, borderRadius: 99,
                  color: C.text, fontSize: 12, cursor: "pointer",
                  fontFamily: "inherit", transition: "border-color 0.15s",
                  display: "flex", alignItems: "center", gap: 6,
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                {co}
                <span style={{ fontSize: 10, color: C.textDim, fontFamily: "'DM Mono', monospace" }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent searches */}
      {history.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, color: C.textDim, textTransform: "uppercase", marginBottom: 16 }}>
            Recent Searches
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map(h => (
              <div key={h.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", background: C.surface,
                border: `1px solid ${C.border}`, borderRadius: 8,
              }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>{h.time}</span>
                <span style={{ fontSize: 12, color: C.text, flex: 1 }}>
                  <span style={{ color: C.accent2 }}>{h.keywords}</span>
                  {h.company !== "Any company" && <span style={{ color: C.textDim }}> at {h.company}</span>}
                  {h.location !== "Anywhere" && <span style={{ color: C.textDim }}> · {h.location}</span>}
                </span>
                <a href={h.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: C.accent, textDecoration: "none", whiteSpace: "nowrap" }}>
                  Open again ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
