import { useState, useCallback, useMemo, useRef } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

// ── Palette & theme ──────────────────────────────────────────────────────────
const C = {
  bg: "#f8f9fb",
  surface: "#ffffff",
  card: "#ffffff",
  border: "#e2e6ed",
  accent: "#0a7c5c",       // deep teal
  accent2: "#4f46e5",      // indigo
  accent3: "#db2777",      // pink
  muted: "#9ca3af",
  text: "#111827",
  textDim: "#6b7280",
};

// ── Seniority classifier ────────────────────────────────────────────────────
const SENIORITY = [
  { label: "C-Suite / Founder", color: C.accent },
  { label: "VP / Director",     color: C.accent2 },
  { label: "Manager / Lead",    color: "#a78bfa" },
  { label: "Senior / Mid",      color: "#60a5fa" },
  { label: "Junior / Associate",color: "#34d399" },
  { label: "Unknown / Other",   color: C.muted },
];

// Word-boundary aware classifier — avoids "president" matching "vice president" etc.
function classifySeniority(title = "") {
  const t = title.toLowerCase();

  // C-Suite: exact word/phrase matches only
  if (/\bceo\b|\bcto\b|\bcoo\b|\bcfo\b|\bcpo\b|\bcmo\b|\bcro\b|\bcco\b|\bchief\b/.test(t)) return "C-Suite / Founder";
  if (/\bfounder\b|\bco-founder\b|\bcofounder\b/.test(t)) return "C-Suite / Founder";
  // "president" but NOT "vice president"
  if (/\bpresident\b/.test(t) && !/vice\s+president|vp/.test(t)) return "C-Suite / Founder";
  // "owner" but NOT "account owner" or similar
  if (/\bowner\b/.test(t) && !/account\s+owner/.test(t)) return "C-Suite / Founder";
  // "partner" only when standalone or as managing/founding partner — not "account partner" etc
  if (/^partner$|\bmanaging\s+partner|\bfounding\s+partner|\bgeneral\s+partner|\bsenior\s+partner|\boperating\s+partner/.test(t)) return "C-Suite / Founder";

  // VP / Director
  if (/\bvp\b|\bevp\b|\bsvp\b/.test(t)) return "VP / Director";
  if (/\bvice\s+president\b/.test(t)) return "VP / Director";
  if (/\bdirector\b/.test(t)) return "VP / Director";
  if (/\bhead\s+of\b/.test(t)) return "VP / Director";
  if (/\bgm\b|\bgeneral\s+manager\b/.test(t)) return "VP / Director";

  // Manager / Lead
  if (/\bmanager\b|\blead\b|\bprincipal\b|\bstaff\b|\bsupervisor\b|\btech\s+lead\b|\bteam\s+lead\b/.test(t)) return "Manager / Lead";

  // Senior / Mid
  if (/\bsenior\b|\bsr\.?\b|\bspecialist\b|\barchitect\b|\bconsultant\b|\badvisor\b/.test(t)) return "Senior / Mid";

  // Junior / Associate
  if (/\bjunior\b|\bjr\.?\b|\bassociate\b|\bassistant\b|\bcoordinator\b|\banalyst\b|\bintern\b|\bentry\b/.test(t)) return "Junior / Associate";

  return "Unknown / Other";
}


// ── Title normalizer ─────────────────────────────────────────────────────────
// Simple lookup map: lowercased input variant → canonical title.
// Add more variants as you discover unmatched titles in the panel below.

const TITLE_MAP = {
  // ── CEO ──
  "ceo":                          "CEO",
  "chief executive officer":      "CEO",
  "chief executive":              "CEO",

  // ── CTO ──
  "cto":                          "CTO",
  "chief technology officer":     "CTO",
  "chief technical officer":      "CTO",

  // ── COO ──
  "coo":                          "COO",
  "chief operating officer":      "COO",
  "chief operations officer":     "COO",

  // ── CFO ──
  "cfo":                          "CFO",
  "chief financial officer":      "CFO",

  // ── CPO ──
  "cpo":                          "CPO",
  "chief product officer":        "CPO",
  "chief people officer":         "CPO",

  // ── Founder ──
  "founder":                      "Founder",
  "co-founder":                   "Co-Founder",
  "cofounder":                    "Co-Founder",
  "co founder":                   "Co-Founder",
  "founder & ceo":                "Founder & CEO",
  "founder and ceo":              "Founder & CEO",

  // ── VP Engineering ──
  "vp engineering":               "VP Engineering",
  "vp of engineering":            "VP Engineering",
  "vice president engineering":   "VP Engineering",
  "vice president of engineering":"VP Engineering",

  // ── VP Product ──
  "vp product":                   "VP Product",
  "vp of product":                "VP Product",
  "vice president of product":    "VP Product",

  // ── Director of Engineering ──
  "director of engineering":      "Director of Engineering",
  "director, engineering":        "Director of Engineering",
  "engineering director":         "Director of Engineering",

  // ── Director of Product ──
  "director of product":          "Director of Product",
  "director, product":            "Director of Product",
  "product director":             "Director of Product",
  "director of product management":"Director of Product",

  // ── Engineering Manager ──
  "engineering manager":          "Engineering Manager",
  "eng manager":                  "Engineering Manager",
  "manager, engineering":         "Engineering Manager",
  "em":                           "Engineering Manager",

  // ── Software Engineer ──
  "software engineer":            "Software Engineer",
  "software developer":           "Software Engineer",
  "swe":                          "Software Engineer",
  "software engineering":         "Software Engineer",

  // ── Senior Software Engineer ──
  "senior software engineer":     "Senior Software Engineer",
  "sr. software engineer":        "Senior Software Engineer",
  "sr software engineer":         "Senior Software Engineer",
  "senior swe":                   "Senior Software Engineer",
  "sr. swe":                      "Senior Software Engineer",
  "senior software developer":    "Senior Software Engineer",

  // ── Staff Engineer ──
  "staff engineer":               "Staff Engineer",
  "staff software engineer":      "Staff Engineer",
  "staff swe":                    "Staff Engineer",

  // ── Principal Engineer ──
  "principal engineer":           "Principal Engineer",
  "principal software engineer":  "Principal Engineer",

  // ── Product Manager ──
  "product manager":              "Product Manager",
  "pm":                           "Product Manager",
  "product management":           "Product Manager",

  // ── Senior Product Manager ──
  "senior product manager":       "Senior Product Manager",
  "sr. product manager":          "Senior Product Manager",
  "sr product manager":           "Senior Product Manager",
  "senior pm":                    "Senior Product Manager",
  "sr. pm":                       "Senior Product Manager",

  // ── Product Designer ──
  "product designer":             "Product Designer",
  "ux designer":                  "Product Designer",
  "ui/ux designer":               "Product Designer",
  "ui ux designer":               "Product Designer",
  "ux/ui designer":               "Product Designer",

  // ── Senior Product Designer ──
  "senior product designer":      "Senior Product Designer",
  "sr. product designer":         "Senior Product Designer",
  "senior ux designer":           "Senior Product Designer",

  // ── Data Scientist ──
  "data scientist":               "Data Scientist",
  "data science":                 "Data Scientist",

  // ── Senior Data Scientist ──
  "senior data scientist":        "Senior Data Scientist",
  "sr. data scientist":           "Senior Data Scientist",
  "sr data scientist":            "Senior Data Scientist",

  // ── Data Engineer ──
  "data engineer":                "Data Engineer",
  "data engineering":             "Data Engineer",

  // ── ML Engineer ──
  "ml engineer":                  "ML Engineer",
  "machine learning engineer":    "ML Engineer",
  "ai/ml engineer":               "ML Engineer",
  "ml/ai engineer":               "ML Engineer",

  // ── DevOps Engineer ──
  "devops engineer":              "DevOps Engineer",
  "devops":                       "DevOps Engineer",
  "dev ops engineer":             "DevOps Engineer",

  // ── Account Executive ──
  "account executive":            "Account Executive",
  "ae":                           "Account Executive",
  "senior account executive":     "Senior Account Executive",
  "sr. account executive":        "Senior Account Executive",

  // ── Recruiter ──
  "recruiter":                    "Recruiter",
  "technical recruiter":          "Technical Recruiter",
  "tech recruiter":               "Technical Recruiter",
  "talent acquisition":           "Recruiter",
  "talent acquisition specialist":"Recruiter",

  // ── Marketing Manager ──
  "marketing manager":            "Marketing Manager",
  "digital marketing manager":    "Marketing Manager",
  "growth marketing manager":     "Marketing Manager",

  // ── Consultant ──
  "consultant":                   "Consultant",
  "senior consultant":            "Senior Consultant",
  "associate consultant":         "Associate Consultant",

  // ── Analyst ──
  "analyst":                      "Analyst",
  "business analyst":             "Business Analyst",
  "financial analyst":            "Financial Analyst",
  "data analyst":                 "Data Analyst",
  "senior analyst":               "Senior Analyst",
  "sr. analyst":                  "Senior Analyst",

  // ── Intern ──
  "intern":                       "Intern",
  "software engineering intern":  "Engineering Intern",
  "swe intern":                   "Engineering Intern",
  "product management intern":    "Product Intern",
  "pm intern":                    "Product Intern",

  // ── From real data: high-frequency unmatched titles ──
  "general manager":                  "General Manager",
  "president":                        "President",
  "owner":                            "Owner",
  "managing director":                "Managing Director",
  "partner":                          "Partner",
  "managing partner":                 "Managing Partner",
  "executive director":               "Executive Director",
  "board member":                     "Board Member",
  "operating partner":                "Operating Partner",
  "founding partner":                 "Founding Partner",
  "general partner":                  "General Partner",
  "senior partner":                   "Senior Partner",
  "project manager":                  "Project Manager",
  "senior project manager":           "Senior Project Manager",
  "sr. project manager":              "Senior Project Manager",
  "project director":                 "Project Director",
  "senior project director":          "Senior Project Director",
  "project controls manager":         "Project Controls Manager",
  "senior program manager":           "Senior Program Manager",
  "program manager":                  "Program Manager",
  "technical program manager":        "Technical Program Manager",
  "project management consultant":    "Project Management Consultant",
  "director":                         "Director",
  "senior director":                  "Senior Director",
  "director of operations":           "Director of Operations",
  "director of finance":              "Director of Finance",
  "director of business development": "Director of Business Development",
  "sales director":                   "Sales Director",
  "regional sales director":          "Regional Sales Director",
  "enterprise sales director":        "Enterprise Sales Director",
  "chief marketing officer":          "CMO",
  "vice president":                   "VP",
  "vice president operations":        "VP Operations",
  "vice president of product management": "VP Product",
  "senior vice president":            "SVP",
  "svp":                              "SVP",
  "executive vice president":         "EVP",
  "sales manager":                    "Sales Manager",
  "general sales manager":            "General Sales Manager",
  "regional sales manager":           "Regional Sales Manager",
  "enterprise account executive":     "Enterprise Account Executive",
  "business development manager":     "Business Development Manager",
  "account manager":                  "Account Manager",
  "senior account manager":           "Senior Account Manager",
  "principal":                        "Principal",
  "principal consultant":             "Principal Consultant",
  "independent consultant":           "Independent Consultant",
  "management consultant":            "Management Consultant",
  "business owner":                   "Business Owner",
  "small business owner":             "Business Owner",
  "company owner":                    "Business Owner",
  "owner & ceo":                      "Founder & CEO",
  "principal owner":                  "Owner",
  "co-founder & ceo":                 "Co-Founder & CEO",
  "ceo and founder":                  "Founder & CEO",
  "founder/ceo":                      "Founder & CEO",
  "founder, ceo":                     "Founder & CEO",
  "founder ceo":                      "Founder & CEO",
  "ceo/founder":                      "Founder & CEO",
  "ceo / founder":                    "Founder & CEO",
  "ceo & co-founder":                 "Co-Founder & CEO",
  "ceo and co-founder":               "Co-Founder & CEO",
  "co-founder and ceo":               "Co-Founder & CEO",
  "ceo + founder":                    "Founder & CEO",
  "president & ceo":                  "President & CEO",
  "president and ceo":                "President & CEO",
  "president/ceo":                    "President & CEO",
  "president & owner":                "President & Owner",
  "chief revenue officer":            "CRO",
  "chief revenue officer (cro)":      "CRO",
  "chief commercial officer (cco)":   "CCO",
  "chief commercial officer":         "CCO",
  "operations manager":               "Operations Manager",
  "senior recruiter":                 "Senior Recruiter",
  "senior technical recruiter":       "Senior Technical Recruiter",
  "senior talent acquisition specialist": "Senior Recruiter",
  "talent acquisition partner":       "Talent Acquisition Partner",
  "sr. recruiter":                    "Senior Recruiter",
  "professor":                        "Professor",
  "assistant professor":              "Assistant Professor",
  "associate professor":              "Associate Professor",
  "adjunct professor":                "Adjunct Professor",
  "postdoctoral researcher":          "Postdoctoral Researcher",
  "attorney":                         "Attorney",
  "general counsel":                  "General Counsel",
  "retired":                          "Retired",
  "semi retired":                     "Retired",
  "self employed":                    "Freelancer",
  "technical lead":                   "Tech Lead",
  "head of product":                  "Head of Product",
  "head of sales":                    "Head of Sales",
  "head of growth":                   "Head of Growth",
  "head of ai":                       "Head of AI",
  "head of operations":               "Head of Operations",
  "head of marketing":                "Head of Marketing",
  "head of people":                   "Head of People",
  "head of talent":                   "Head of Talent",

  // ── Second pass: count >= 2 from real data ──
  "senior process engineer":          "Senior Process Engineer",
  "real estate broker":               "Real Estate Broker",
  "licensed realtor":                 "Realtor",
  "realtor":                          "Realtor",
  "realtor associate":                "Realtor",
  "real estate agent":                "Real Estate Agent",
  "senior director of engineering":   "Senior Director of Engineering",
  "director of software engineering": "Director of Engineering",
  "construction manager":             "Construction Manager",
  "talent acquisition manager":       "Talent Acquisition Manager",
  "director of talent acquisition":   "Director of Talent Acquisition",
  "director, talent acquisition":     "Director of Talent Acquisition",
  "director of recruiting":           "Director of Recruiting",
  "director of sales":                "Director of Sales",
  "director of marketing":            "Director of Marketing",
  "director of sales development":    "Director of Sales Development",
  "director of corporate sales":      "Director of Sales",
  "principal recruiter":              "Principal Recruiter",
  "recruiting manager":               "Recruiting Manager",
  "finance manager":                  "Finance Manager",
  "regional director":                "Regional Director",
  "executive assistant":              "Executive Assistant",
  "research assistant":               "Research Assistant",
  "advisor":                          "Advisor",
  "strategic advisor":                "Strategic Advisor",
  "sr. solutions engineer":           "Senior Solutions Engineer",
  "senior solutions architect":       "Senior Solutions Architect",
  "principal solutions architect":    "Principal Solutions Architect",
  "solutions architect":              "Solutions Architect",
  "vice president of business development": "VP Business Development",
  "vice president marketing":         "VP Marketing",
  "vice president strategic partnerships": "VP Strategic Partnerships",
  "vp of sales":                      "VP Sales",
  "sr. vice president":               "SVP",
  "managing attorney":                "Managing Attorney",
  "of counsel":                       "Of Counsel",
  "geologist":                        "Geologist",
  "engineer":                         "Engineer",
  "process engineer":                 "Process Engineer",
  "senior project engineer":          "Senior Project Engineer",
  "commercial director":              "Commercial Director",
  "contract manager":                 "Contract Manager",
  "plant manager":                    "Plant Manager",
  "member board of directors":        "Board Member",
  "technical manager":                "Technical Manager",
  "sales coach":                      "Sales Coach",
  "executive coach":                  "Executive Coach",
  "co-founder & coo":                 "Co-Founder & COO",
  "co-founder and coo":               "Co-Founder & COO",
  "co-founder & president":           "Co-Founder & President",
  "co-founder & managing partner":    "Co-Founder & Managing Partner",
  "co-founder & cto":                 "Co-Founder & CTO",
  "ceo & founder":                    "Founder & CEO",
  "senior technical product manager": "Senior Product Manager",
  "manager":                          "Manager",
  "software engineering manager":     "Engineering Manager",
  "sr. engineering manager":          "Senior Engineering Manager",
  "senior engineering manager":       "Senior Engineering Manager",
  "principal engineering manager":    "Principal Engineering Manager",
  "lead software engineer":           "Lead Software Engineer",
  "software engineer ii":             "Software Engineer",
  "research engineer":                "Research Engineer",
  "senior machine learning engineer": "Senior ML Engineer",
  "head of ai engineering":           "Head of AI Engineering",
  "digital sales manager":            "Sales Manager",
  "senior marketing manager":         "Senior Marketing Manager",
  "marketing director":               "Director of Marketing",
  "brand ambassador":                 "Brand Ambassador",
  "marketing specialist":             "Marketing Specialist",
  "digital strategist":               "Digital Strategist",
  "f&i manager":                      "Finance & Insurance Manager",
  "business development specialist":  "Business Development Specialist",
  "business development executive":   "Business Development Executive",
  "business manager":                 "Business Manager",
  "financial services professional":  "Financial Services",
  "ai researcher":                    "AI Researcher",
  "business intelligence manager":    "Business Intelligence Manager",
  "senior economist":                 "Senior Economist",
  "investor":                         "Investor",
  "global key account manager":       "Key Account Manager",
  "procurement manager":              "Procurement Manager",
  "phd student":                      "PhD Student",
  "graduate research and teaching assistant": "Graduate Research Assistant",
  "chief digital officer":            "Chief Digital Officer",
  "chief ai officer":                 "Chief AI Officer",
  "chief product & technology officer": "CPO/CTO",
  "senior principal":                 "Senior Principal",
  "senior research scientist":        "Senior Research Scientist",
  "customer success manager":         "Customer Success Manager",
  "president & founder":              "Founder & President",
  "president and founder":            "Founder & President",
  "founder, president":               "Founder & President",
  "sales representative":             "Sales Representative",
  "sales professional":               "Sales",
  "sales":                            "Sales",
  "sales and marketing":              "Sales & Marketing",
  "sales specialist":                 "Sales Specialist",
  "executive sales consultant":       "Sales Consultant",
  "new car sales manager":            "Sales Manager",
  "sr. sales leader":                 "Senior Sales Leader",
  "strategic account executive":      "Strategic Account Executive",
  "senior it project manager":        "Senior Project Manager",
  "engineering project manager":      "Project Manager",
  "project development manager":      "Project Manager",
  "project coordinator":              "Project Coordinator",
  "project leader":                   "Project Manager",
  "principal data scientist":         "Principal Data Scientist",
  "staff product manager":            "Staff Product Manager",
  "account director":                 "Account Director",
  "associate director":               "Associate Director",
  "software development manager":     "Engineering Manager",
  "operating director":               "Operations Director",
  "president and chief operating officer": "President & COO",
  "president & coo":                  "President & COO",
  "principal engineering advisor":    "Principal Engineer",
  "estimator":                        "Estimator",
  "project engineering manager":      "Project Manager",
  "senior manager":                   "Senior Manager",
  "office manager":                   "Office Manager",
  "management consulting manager":    "Management Consultant",
  "senior talent acquisition consultant": "Senior Recruiter",
  "senior manager, talent acquisition": "Talent Acquisition Manager",
  "head of enablement":               "Head of Enablement",

  // ── Third pass: final count >= 2 stragglers ──
  "author":                           "Author",
  "technical recruiter, product management": "Technical Recruiter",
  "senior solutions consultant":      "Senior Solutions Consultant",
  "dealer consultant":                "Consultant",
  "student":                          "Student",
  "vice president, ticket sales & service": "VP Sales",
  "director of recruiting":           "Director of Recruiting",
};

function normalizeTitle(raw = "") {
  if (!raw.trim()) return { canonical: "", matched: false };
  const key = raw.trim().toLowerCase();
  if (TITLE_MAP[key]) {
    return { canonical: TITLE_MAP[key], matched: true };
  }
  return { canonical: raw, matched: false };
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
const COLUMNS = [
  { key: "name",         label: "Name",         sort: r => `${r["First Name"]} ${r["Last Name"]}`.toLowerCase() },
  { key: "company",      label: "Company",       sort: r => (r["Company"] || "").toLowerCase() },
  { key: "position",     label: "Position",      sort: r => (r["Position"] || "").toLowerCase() },
  { key: "email",        label: "Email",         sort: r => r["Email Address"] ? 0 : 1 },
  { key: "connectedOn",  label: "Connected On",  sort: r => r["Connected On"] || "" },
  { key: "seniority",    label: "Seniority",     sort: r => classifySeniority(r["Position"]) },
];

function SortIcon({ dir }) {
  if (!dir) return <span style={{ color: C.muted, marginLeft: 4, fontSize: 10 }}>⇅</span>;
  return <span style={{ color: C.accent, marginLeft: 4, fontSize: 10 }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

function ConnectionsTable({ data }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const PER_PAGE = 200;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let rows = !q ? data : data.filter(r => {
      const searchFields = ["First Name","Last Name","Company","Position","Position_raw","Email Address","Connected On"];
      return searchFields.some(k => String(r[k] || "").toLowerCase().includes(q));
    });
    if (sortKey) {
      const col = COLUMNS.find(c => c.key === sortKey);
      if (col) {
        rows = [...rows].sort((a, b) => {
          const av = col.sort(a), bv = col.sort(b);
          if (av < bv) return sortDir === "asc" ? -1 : 1;
          if (av > bv) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
      }
    }
    return rows;
  }, [data, search, sortKey, sortDir]);

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
              {COLUMNS.map(col => (
                <th key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: "8px 12px", textAlign: "left", fontWeight: 500,
                    whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
                    color: sortKey === col.key ? C.accent : C.textDim,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = C.text}
                  onMouseLeave={e => e.currentTarget.style.color = sortKey === col.key ? C.accent : C.textDim}
                >
                  {col.label}
                  <SortIcon dir={sortKey === col.key ? sortDir : null} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const sen = classifySeniority(r["Position"]);
              const senColor = SENIORITY.find(s => s.label === sen)?.color || C.muted;
              const isNormalized = r["Position_raw"] && r["Position_raw"] !== r["Position"];
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}22`, transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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
                  <td style={{ padding: "9px 12px", color: C.textDim, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r["Company"]}
                  </td>
                  <td style={{ padding: "9px 12px", maxWidth: 220 }}>
                    <div style={{ color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r["Position"]}
                    </div>
                    {isNormalized && (
                      <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                        {r["Position_raw"]}
                      </div>
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

  function downloadCSV() {
    const rows = [["Title","Count"], ...unmatched];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '\"')}"` ).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unmatched_titles.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, color: C.textDim, textTransform: "uppercase" }}>
            Unmatched Titles
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {unmatched.length} unique titles ({pct}% of connections) didn't match any normalisation rule
          </div>
        </div>
        <button onClick={downloadCSV} style={{
          padding: "6px 14px", background: "transparent",
          border: `1px solid ${C.border}`, borderRadius: 7,
          color: C.textDim, fontSize: 11, cursor: "pointer",
          fontFamily: "inherit", whiteSpace: "nowrap",
          transition: "border-color 0.15s, color 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
        >
          Download CSV ↓
        </button>
        <span style={{ color: C.textDim, fontSize: 14, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
            These are returned as-is. Download the CSV and share it to improve the normalisation map.
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
          const clean = result.data.filter(r => (r["First Name"] || r["Last Name"] || "").trim());
          setData(normalizeData(clean));
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

  const fontLink = ``; // fonts loaded via index.html

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Syne', sans-serif" }}>
      <style>{`
        ${fontLink}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
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
                  style={{ padding: "10px 24px", background: C.accent, border: "none", borderRadius: 8, color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
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
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: '#eef2f7', padding: 4, borderRadius: 10, width: "fit-content" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{
                    padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: tab === t ? C.card : "transparent",
                    color: tab === t ? C.text : C.textDim,
                    fontSize: 12, fontWeight: tab === t ? 600 : 400,
                    fontFamily: "inherit", textTransform: "capitalize",
                    transition: "all 0.15s",
                    boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
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
              border: "none", borderRadius: 8, color: '#ffffff',
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