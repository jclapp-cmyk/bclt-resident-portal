import { useState, useCallback, useEffect, useRef } from "react";
import { fetchProperties, fetchResidents, fetchResidentsExtended, fetchLeaseDocsByResident, fetchRentLedger, fetchRentPayments, recordPayment, fetchMaintenanceRequests, insertMaintenanceRequest, updateMaintenanceRequest, fetchVendors, insertVendor, updateVendor, fetchUnitInspections, insertUnitInspection, updateUnitInspection, fetchRegInspections, fetchThreads, fetchMessages, insertThread, insertMessage, updateThread as updateThreadDb, fetchCommTemplates, fetchComplianceDocs, fetchOnboardingWorkflows, insertOnboardingWorkflow, updateOnboardingWorkflow, insertResident, insertLease, uploadLeaseFile, getLeaseFileUrl, deleteLeaseFile, insertLeaseDocument, deleteLeaseDocument, fetchAuditLog, insertProperty, insertUnit, fetchUnits, updateProperty, updateUnit, deleteUnit, updateResident, updateLease, fetchResidentLease, fetchHouseholdMembers, insertHouseholdMember, deleteHouseholdMember, fetchStaffMembers, insertStaffMember, updateStaffMember, deleteStaffMember, deleteProperty, deleteThread as deleteThreadFromDb, fetchAllUnits, fetchInspectionChecklists, insertInspectionChecklist, updateInspectionChecklist, fetchIncomeCertifications, insertIncomeCertification, updateIncomeCertification, fetchTICMembers, insertTICMember, deleteTICMember, fetchTICIncome, insertTICIncome, updateTICIncome, deleteTICIncome, fetchTICAssets, insertTICAsset, updateTICAsset, deleteTICAsset, fetchAMIReference, fetchRentLimits, uploadTICDocument, getTICDocumentUrl, fetchAdminNotes, insertAdminNote, deleteAdminNote } from "./lib/data";
import { signInWithMagicLink, signOut, onAuthStateChange, getCurrentSession, fetchProfile, fetchUserProfiles, inviteUser, updateUserProfile, deleteUserProfile } from "./lib/auth";
import { sendNotification, sendSMS, sendBoth } from "./lib/notify";
import { supabase } from "./lib/supabase";

/* ═══════════════════════════════════════════════════════════
   BCLT RESIDENT PORTAL — Affordable Housing / Section 8
   Full interactive prototype with mock data
   Roles: Resident, Admin/Management, Maintenance Staff
   ═══════════════════════════════════════════════════════════ */

// ── DATA DEFAULTS (empty — all real data comes from Supabase) ──

const MOCK_PROPERTIES = [];
const MOCK_PROPERTY = {};
const getProperty = (id) => LIVE_PROPERTIES.find(p => p.id === id || p._uuid === id) || LIVE_PROPERTIES[0] || {};
const MOCK_UNIT = {};
const MOCK_MAINTENANCE = [];
const MOCK_PAYMENTS = [];
const MOCK_RESIDENTS = [];
const MOCK_THREADS = [];
const MOCK_MESSAGES = [];
const MOCK_COMM_TEMPLATES = [];
const MOCK_RECERT = { status: 'not-started', deadline: '', anniversaryDate: '', stepsCompleted: {}, householdMembers: [], income: { total: 0 }, documents: [] };
const MOCK_REG_INSPECTIONS = [];
const MOCK_UNIT_INSPECTION_CATEGORIES = [
  { id: 'cat-1', name: 'Move-In', description: 'Document unit condition at lease start', frequency: 'At move-in', scoring: 'pass-fail', active: true, checklist: ['Walls & paint condition', 'Flooring condition', 'Windows & screens', 'Doors & locks', 'Kitchen appliances', 'Bathroom fixtures', 'Plumbing', 'Electrical', 'Smoke/CO detectors', 'HVAC operation', 'Cleanliness', 'Exterior/patio'] },
  { id: 'cat-2', name: 'Move-Out', description: 'Assess unit condition at lease end', frequency: 'At move-out', scoring: 'pass-fail', active: true, checklist: ['Walls & paint condition', 'Flooring condition', 'Windows & screens', 'Doors & locks', 'Kitchen appliances', 'Bathroom fixtures', 'Plumbing', 'Electrical', 'Smoke/CO detectors', 'HVAC', 'Cleanliness', 'Damage beyond normal wear'] },
  { id: 'cat-3', name: 'Annual / Routine', description: 'Proactive check on unit condition and safety', frequency: 'Annually', scoring: 'pass-fail', active: true, checklist: ['Smoke detectors', 'CO detectors', 'Fire extinguisher', 'HVAC filter', 'Water heater', 'Plumbing leaks', 'Window locks', 'Door locks', 'Electrical panels', 'Pest evidence', 'Mold/moisture', 'General condition'] },
  { id: 'cat-4', name: 'Pre-HQS / Pre-REAC', description: 'Internal walkthrough before official inspection', frequency: 'Before scheduled inspection', scoring: 'scored', active: true, checklist: ['Smoke detectors', 'Electrical hazards', 'Plumbing leaks', 'HVAC operational', 'Hot water', 'Windows', 'Doors', 'Handrails', 'Trip hazards', 'Paint condition', 'Kitchen ventilation', 'Bathroom ventilation', 'GFCIs', 'Pest evidence', 'Egress paths'] },
  { id: 'cat-5', name: 'Housekeeping', description: 'Sanitation and cleanliness per lease terms', frequency: 'As needed', scoring: 'pass-fail', active: true, checklist: ['Kitchen cleanliness', 'Bathroom cleanliness', 'Trash/debris', 'Pest attractants', 'Clutter/fire hazards', 'Odors'] },
  { id: 'cat-6', name: 'Safety / Smoke Detector', description: 'Verify life safety devices', frequency: 'Semi-annual', scoring: 'pass-fail', active: true, checklist: ['Smoke detectors', 'CO detector', 'Fire extinguisher present', 'Fire extinguisher charge'] },
  { id: 'cat-7', name: 'Pest', description: 'Check for pest activity', frequency: 'Quarterly', scoring: 'pass-fail', active: true, checklist: ['Roach evidence', 'Bed bug evidence', 'Rodent evidence', 'Ant activity', 'Entry points sealed', 'Moisture issues'] },
  { id: 'cat-8', name: 'Seasonal / Preventive', description: 'HVAC, weatherization, plumbing', frequency: 'Seasonal', scoring: 'pass-fail', active: true, checklist: ['HVAC filter', 'HVAC operation', 'Weather stripping', 'Caulking', 'Pipe insulation', 'Gutter/drainage'] },
];
const MOCK_UNIT_INSPECTIONS = [];
const MOCK_VENDORS = [];
const MOCK_COMM_PREFS = { preferredChannel: 'email', phone: '', email: '', quietHoursStart: '21:00', quietHoursEnd: '08:00', language: 'en' };
const MOCK_EMERGENCY_CONTACTS = {};
const MOCK_ADMIN_NOTES = {};
const MOCK_RESIDENTS_EXTENDED = {};
const MOCK_LEASE_DOCS = {};
const MOCK_COMPLIANCE_DOCS = [];
const MOCK_ONBOARDING = [];
const MOCK_RENT_LEDGER = [];
const MOCK_MONTHLY_REVENUE = [];

const DEFAULT_SETTINGS = {
  property: { manager: "Sarah Chen", managerPhone: "(415) 555-0100", managerEmail: "sarah@bclt.org", officeHours: "Mon-Fri 9am-5pm" },
  notifications: {
    maintenanceAlerts: true, inspectionReminders: true, vendorComplianceAlerts: true,
    rentPaymentUpdates: true, communityAnnouncements: false,
    quietHoursStart: "21:00", quietHoursEnd: "08:00",
  },
  rent: { dueDay: "1", gracePeriodDays: "5", lateFeeAmount: "50", leaseTermDefault: "12", autoRenewal: true },
  maint: { categories: ["Plumbing", "Electrical", "HVAC", "Appliance", "Structural", "Pest", "Other"], defaultPriority: "routine", autoAssign: false, emergencyPhone: "(415) 555-0199" },
  rvFields: [
    { key: "rvMake", label: "RV Make", type: "text", placeholder: "e.g. Winnebago" },
    { key: "rvModel", label: "RV Model", type: "text", placeholder: "e.g. Vista 31BE" },
    { key: "rvYear", label: "RV Year", type: "text", placeholder: "e.g. 2020" },
    { key: "rvLength", label: "RV Length (ft)", type: "text", placeholder: "e.g. 32" },
    { key: "rvLicensePlate", label: "License Plate", type: "text", placeholder: "e.g. 8ABC123" },
    { key: "rvSlideOuts", label: "Slide-Outs", type: "text", placeholder: "e.g. 2" },
    { key: "rvHookups", label: "Hookup Type", type: "select", options: ["Full (Water/Electric/Sewer)", "Partial (Water/Electric)", "Electric Only", "None"] },
    { key: "rvCondition", label: "Condition", type: "select", options: ["Excellent", "Good", "Fair", "Needs Repair"] },
  ],
};

// Live data bindings — start as mock, updated by Supabase fetch in App
let LIVE_PROPERTIES = [];
let LIVE_RESIDENTS = [];
let LIVE_RESIDENTS_EXTENDED = {};
let LIVE_RENT_LEDGER = [];
let LIVE_REG_INSPECTIONS = [];
let LIVE_COMPLIANCE_DOCS = [];

// ── DESIGN TOKENS (Light Theme) ──────────────────────────────

const THEMES = {
  light: {
    bg: "#F8F6F3", surface: "#FFFFFF", surfaceHover: "#F0ECE6", card: "#FFFFFF",
    border: "#E8E4DE", borderLight: "#F0ECE6", accent: "#2E5090", accentDim: "rgba(46,80,144,0.08)",
    accentLight: "#E3F2FD",
    success: "#2E7D32", successDim: "rgba(46,125,50,0.08)", successLight: "#E8F5E9",
    warn: "#F57F17", warnDim: "rgba(245,127,23,0.08)", warnLight: "#FFF8E1",
    danger: "#C62828", dangerDim: "rgba(198,40,40,0.06)", dangerLight: "#FFEBEE",
    info: "#1565C0", infoDim: "rgba(21,101,192,0.08)", infoLight: "#E3F2FD",
    text: "#1A1A1A", muted: "#888888", dim: "#AAAAAA", dimLight: "rgba(170,170,170,0.13)",
    white: "#FFFFFF", successBorder: "rgba(46,125,50,0.20)",
    shadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  dark: {
    bg: "#121212", surface: "#1E1E1E", surfaceHover: "#2A2A2A", card: "#1E1E1E",
    border: "#333333", borderLight: "#2A2A2A", accent: "#5B8DEF", accentDim: "rgba(91,141,239,0.12)",
    accentLight: "#1A2744",
    success: "#4CAF50", successDim: "rgba(76,175,80,0.12)", successLight: "#1B3A1D",
    warn: "#FFB74D", warnDim: "rgba(255,183,77,0.12)", warnLight: "#3A2E1B",
    danger: "#EF5350", dangerDim: "rgba(239,83,80,0.10)", dangerLight: "#3A1B1B",
    info: "#42A5F5", infoDim: "rgba(66,165,245,0.12)", infoLight: "#1A2744",
    text: "#E8E8E8", muted: "#999999", dim: "#666666", dimLight: "rgba(102,102,102,0.20)",
    white: "#FFFFFF", successBorder: "rgba(76,175,80,0.20)",
    shadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
};

const T = Object.fromEntries(Object.keys(THEMES.light).map(k => [k, `var(--t-${k})`]));
T.radius = 12;
T.radiusSm = 8;

const STATUS_COLORS = {
  submitted: { bg: T.infoDim, text: T.info, label: "Submitted" },
  "in-progress": { bg: T.warnDim, text: T.warn, label: "In Progress" },
  completed: { bg: T.successDim, text: T.success, label: "Completed" },
};

const PRIORITY_COLORS = {
  critical: { bg: T.dangerDim, text: T.danger }, urgent: { bg: T.warnDim, text: T.warn },
  routine: { bg: T.infoDim, text: T.info }, low: { bg: T.dimLight, text: T.muted },
};

// ── RESPONSIVE HOOK ──────────────────────────────────────

const useIsMobile = (breakpoint = 768) => {
  const [mobile, setMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return mobile;
};

// ── REUSABLE COMPONENTS ────────────────────────────────────

const s = {
  page: { minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', 'Inter', -apple-system, system-ui, sans-serif", fontSize: 14 },
  sidebar: { width: 240, background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", position: "sticky", top: 0 },
  main: { flex: 1, padding: 28, overflowY: "auto", maxHeight: "100vh" },
  card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 20, marginBottom: 16, boxShadow: T.shadow },
  badge: (bg, color) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: bg, color, whiteSpace: "nowrap" }),
  btn: (variant = "primary") => ({
    padding: "8px 18px", borderRadius: T.radiusSm, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "all 0.15s",
    ...(variant === "primary" ? { background: T.accent, color: T.white } :
      variant === "danger" ? { background: T.danger, color: T.white } :
      { background: T.surfaceHover, color: T.muted, border: `1px solid ${T.border}` }),
  }),
  input: { width: "100%", padding: "9px 12px", borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 14, outline: "none", boxSizing: "border-box" },
  select: { padding: "9px 12px", borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 14, outline: "none" },
  th: { padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${T.border}`, background: T.bg },
  td: { padding: "12px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13 },
  table: { width: "100%", borderCollapse: "collapse" },
  sectionTitle: { fontSize: 22, fontWeight: 700, marginBottom: 6, color: T.text },
  sectionSub: { fontSize: 14, color: T.muted, marginBottom: 24 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.3px" },
  statCard: (accent, mobile) => ({ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: mobile ? 14 : 18, flex: mobile ? "1 1 100%" : 1, minWidth: mobile ? undefined : 140, borderLeft: `3px solid ${accent}`, boxShadow: T.shadow }),
  grid: (cols, mobile) => ({ display: "grid", gridTemplateColumns: mobile ? "1fr" : cols, gap: mobile ? 10 : 14 }),
  mBtn: (variant, mobile) => {
    const base = s.btn(variant);
    return mobile ? { ...base, minHeight: 44, padding: "12px 20px", fontSize: 14 } : base;
  },
  mInput: (mobile) => mobile ? { ...s.input, minHeight: 44, padding: "12px", fontSize: 15 } : s.input,
  mSelect: (mobile) => mobile ? { ...s.select, minHeight: 44, padding: "12px", fontSize: 15 } : s.select,
};

const Badge = ({ status, type = "status" }) => {
  const map = type === "status" ? STATUS_COLORS : PRIORITY_COLORS;
  const c = map[status] || { bg: T.dimLight, text: T.muted, label: status };
  return <span style={s.badge(c.bg, c.text)}>{c.label || status}</span>;
};

const StatCard = ({ label, value, accent = T.accent, mobile }) => (
  <div style={s.statCard(accent, mobile)}>
    <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: mobile ? 22 : 26, fontWeight: 700 }}>{value}</div>
  </div>
);

const TabBar = ({ tabs, active, onChange, mobile }) => (
  <div style={{ display: "flex", gap: mobile ? 0 : 4, marginBottom: 24, borderBottom: `1px solid ${T.border}`, paddingBottom: 0, overflowX: mobile ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
    {tabs.map(t => (
      <button key={t} onClick={() => onChange(t)} style={{
        padding: mobile ? "12px 14px" : "10px 18px", background: "none", border: "none", color: active === t ? T.accent : T.muted,
        fontWeight: active === t ? 700 : 500, fontSize: mobile ? 13 : 14, cursor: "pointer", whiteSpace: "nowrap",
        borderBottom: active === t ? `2px solid ${T.accent}` : "2px solid transparent", marginBottom: -1,
        minHeight: mobile ? 44 : undefined, flexShrink: 0,
      }}>{t}</button>
    ))}
  </div>
);

const DetailRow = ({ label, value, accent }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.borderLight}` }}>
    <span style={{ color: T.muted, fontSize: 13 }}>{label}</span>
    <span style={{ fontWeight: 500, color: accent || T.text, fontSize: 13 }}>{value}</span>
  </div>
);

const EmptyState = ({ icon, text }) => (
  <div style={{ textAlign: "center", padding: 48, color: T.dim }}>
    <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
    <div>{text}</div>
  </div>
);

const Toggle = ({ label, checked, onChange, description }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.borderLight}` }}>
    <div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
      {description && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{description}</div>}
    </div>
    <div onClick={onChange} style={{ width: 44, height: 24, borderRadius: 12, background: checked ? T.accent : T.border, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: T.white, position: "absolute", top: 3, left: checked ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  </div>
);

const SuccessMessage = ({ message }) => message ? (
  <div style={{ padding: "10px 16px", background: T.successDim, color: T.success, borderRadius: T.radiusSm, marginBottom: 14, fontWeight: 600, fontSize: 13 }}>
    ✓ {message}
  </div>
) : null;

const useSuccess = () => {
  const [msg, setMsg] = useState(null);
  const show = (text) => { setMsg(text); setTimeout(() => setMsg(null), 3000); };
  return [msg, show];
};

// ── NOTIFICATION HELPERS ──────────────────────────────────

const timeAgo = (ts) => {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
};

const NotificationBell = ({ count, onClick, mobile }) => (
  <button onClick={onClick} style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: mobile ? 20 : 17, lineHeight: 1, minHeight: mobile ? 44 : undefined, minWidth: mobile ? 44 : undefined, display: "flex", alignItems: "center", justifyContent: "center" }}>
    🔔
    {count > 0 && (
      <span style={{ position: "absolute", top: mobile ? 4 : -2, right: mobile ? 4 : -6, minWidth: 18, height: 18, borderRadius: 9, background: T.danger, color: T.white, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
        {count > 9 ? "9+" : count}
      </span>
    )}
  </button>
);

const ActivityFeed = ({ items, mobile }) => (
  <div style={s.card}>
    <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Recent Activity</div>
    {items.length === 0 ? (
      <div style={{ textAlign: "center", padding: 20, color: T.dim, fontSize: 13 }}>No recent activity</div>
    ) : items.slice(0, 5).map(n => (
      <div key={n.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.borderLight}` }}>
        <span style={{ fontSize: 15, width: 24, textAlign: "center", flexShrink: 0, marginTop: 1 }}>{n.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13 }}>{n.message}</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{timeAgo(n.timestamp)}</div>
        </div>
      </div>
    ))}
  </div>
);

// ── CHART COMPONENTS ─────────────────────────────────────

const DonutChart = ({ segments, size = 120, thickness = 20, centerValue, centerLabel, mobile }) => {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  if (total === 0) return null;
  let cum = 0;
  const stops = segments.flatMap(seg => {
    const start = cum;
    cum += (seg.value / total) * 100;
    return [`${seg.color} ${start}%`, `${seg.color} ${cum}%`];
  });
  const sz = mobile ? Math.min(size, 100) : size;
  const inner = sz - thickness * 2;
  return (
    <div style={{ display: "flex", alignItems: mobile ? "center" : "flex-start", gap: mobile ? 14 : 20, flexDirection: mobile ? "column" : "row" }}>
      <div style={{ width: sz, height: sz, borderRadius: "50%", background: `conic-gradient(${stops.join(", ")})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{ width: inner, height: inner, borderRadius: "50%", background: T.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {centerValue && <div style={{ fontSize: mobile ? 18 : 22, fontWeight: 700 }}>{centerValue}</div>}
          {centerLabel && <div style={{ fontSize: 11, color: T.muted }}>{centerLabel}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: T.muted }}>{seg.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, marginLeft: "auto" }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MiniBarChart = ({ bars, mobile }) => {
  const max = Math.max(...bars.map(b => b.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bars.map((bar, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: mobile ? 70 : 90, fontSize: 12, color: T.muted, textAlign: "right", flexShrink: 0 }}>{bar.label}</div>
          <div style={{ flex: 1, maxWidth: mobile ? 140 : 200, height: 18, background: T.borderLight, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(bar.value / max) * 100}%`, height: "100%", background: bar.color, borderRadius: 4, minWidth: bar.value > 0 ? 4 : 0 }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, width: 24, flexShrink: 0 }}>{bar.value}</div>
        </div>
      ))}
    </div>
  );
};

const SparkLine = ({ points, color = T.accent, width = 200, height = 48, mobile }) => {
  if (!points || points.length < 2) return null;
  const w = mobile ? Math.min(width, 160) : width;
  const h = height;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => [
    pad + (i / (points.length - 1)) * (w - pad * 2),
    pad + (1 - (p - min) / range) * (h - pad * 2),
  ]);
  const polyline = coords.map(c => c.join(",")).join(" ");
  const area = `M${coords.map(c => c.join(",")).join(" L")} L${w - pad},${h - pad} L${pad},${h - pad} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={area} style={{ fill: color, opacity: 0.08 }} />
      <polyline points={polyline} style={{ fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }} />
    </svg>
  );
};

const ProgressRing = ({ value, max = 100, color = T.accent, size = 90, strokeWidth = 8, label, mobile }) => {
  const sz = mobile ? Math.min(size, 70) : size;
  const r = (sz - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circ * (1 - pct);
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: sz, height: sz }}>
        <svg width={sz} height={sz} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={sz / 2} cy={sz / 2} r={r} style={{ fill: "none", stroke: T.borderLight, strokeWidth }} />
          <circle cx={sz / 2} cy={sz / 2} r={r} style={{ fill: "none", stroke: color, strokeWidth, strokeDasharray: circ, strokeDashoffset: offset, strokeLinecap: "round" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: mobile ? 14 : 16, fontWeight: 700 }}>
          {Math.round(pct * 100)}%
        </div>
      </div>
      {label && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{label}</div>}
    </div>
  );
};

// ── SORTABLE TABLE ────────────────────────────────────────

const SortableTable = ({ columns, data, keyField = "id", rowStyle, mobile, onRowClick }) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [filters, setFilters] = useState({});

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(prev => !prev);
    else { setSortKey(key); setSortAsc(true); }
  };
  const updateFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

  let rows = data.filter(row =>
    columns.every(col => {
      const f = filters[col.key];
      if (!f) return true;
      const val = col.filterValue ? col.filterValue(row) : String(row[col.key] ?? "");
      return val.toLowerCase().includes(f.toLowerCase());
    })
  );

  if (sortKey) {
    const col = columns.find(c => c.key === sortKey);
    rows = [...rows].sort((a, b) => {
      const av = col && col.sortValue ? col.sortValue(a) : (a[sortKey] ?? "");
      const bv = col && col.sortValue ? col.sortValue(b) : (b[sortKey] ?? "");
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
  }

  const hasAnyFilter = columns.some(c => c.filterable !== false);
  const thStyle = mobile ? { ...s.th, padding: "8px 10px", fontSize: 11 } : s.th;
  const tdStyle = mobile ? { ...s.td, padding: "10px" } : s.td;

  return (
    <div style={{ overflowX: mobile ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
    <table style={{ ...s.table, minWidth: mobile ? 600 : undefined }}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.key} onClick={() => col.sortable !== false && toggleSort(col.key)} style={{ ...thStyle, cursor: col.sortable !== false ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
              {col.label}{sortKey === col.key ? <span style={{ marginLeft: 4, fontSize: 10 }}>{sortAsc ? "▲" : "▼"}</span> : ""}
            </th>
          ))}
        </tr>
        {hasAnyFilter && (
          <tr>
            {columns.map(col => (
              <td key={col.key} style={{ padding: "4px 6px", background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                {col.filterable !== false ? (
                  col.filterOptions ? (
                    <select style={{ ...s.select, padding: "3px 4px", fontSize: 11, width: "100%" }} value={filters[col.key] || ""} onChange={e => updateFilter(col.key, e.target.value)}>
                      <option value="">All</option>
                      {col.filterOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input style={{ ...s.input, padding: "3px 6px", fontSize: 11 }} placeholder="Filter..." value={filters[col.key] || ""} onChange={e => updateFilter(col.key, e.target.value)} />
                  )
                ) : null}
              </td>
            ))}
          </tr>
        )}
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length} style={{ ...tdStyle, textAlign: "center", color: T.dim, padding: 24 }}>No matching records</td></tr>
        ) : rows.map((row, idx) => (
          <tr key={row[keyField] ?? idx} style={{ ...(rowStyle ? rowStyle(row) : {}), ...(onRowClick ? { cursor: "pointer" } : {}) }} onClick={() => onRowClick && onRowClick(row)}>
            {columns.map(col => (
              <td key={col.key} style={{ ...tdStyle, ...(col.tdStyle ? col.tdStyle(row) : {}) }}>
                {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
};

// ── NAV CONFIG ─────────────────────────────────────────────

// ── GLOBAL SEARCH ─────────────────────────────────────────

const buildSearchResults = (query, role, maintenance, threads, vendors, unitInspections) => {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase();
  const groups = [];

  // Maintenance / Work Orders
  const maint = maintenance.filter(m =>
    m.description.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.unit.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
  ).slice(0, 5);
  if (maint.length) groups.push({ cat: "Maintenance", icon: "🔧", items: maint.map(m => ({ id: m.id, label: `${m.id} — ${m.description}`, sub: `${m.unit} · ${m.status}`, page: role === "maintenance" ? "work-orders" : "maintenance" })) });

  // Messages / Threads
  const msgs = threads.filter(t => t.subject.toLowerCase().includes(q)).slice(0, 5);
  if (msgs.length) groups.push({ cat: "Messages", icon: "💬", items: msgs.map(t => ({ id: t.id, label: t.subject, sub: `${t.lastDate.slice(0, 10)} · ${t.channel}`, page: role === "admin" ? "communications" : "messages" })) });

  // Residents (admin only)
  if (role === "admin") {
    const res = LIVE_RESIDENTS.filter(r => r.name.toLowerCase().includes(q) || r.unit.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)).slice(0, 5);
    if (res.length) groups.push({ cat: "Residents", icon: "👥", items: res.map(r => ({ id: r.id, label: r.name, sub: `${r.unit} · ${r.email}`, page: "residents" })) });
  }

  // Vendors (admin + maintenance)
  if (role !== "resident") {
    const vend = vendors.filter(v => v.company.toLowerCase().includes(q) || v.trade.toLowerCase().includes(q) || v.contact.toLowerCase().includes(q)).slice(0, 5);
    if (vend.length) groups.push({ cat: "Vendors", icon: "📇", items: vend.map(v => ({ id: v.id, label: v.company, sub: `${v.trade} · ${v.contact}`, page: "vendors" })) });
  }

  // Inspections
  const insp = unitInspections.filter(i => i.unit.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.result.toLowerCase().includes(q)).slice(0, 5);
  if (insp.length) groups.push({ cat: "Inspections", icon: "🔍", items: insp.map(i => ({ id: i.id, label: `${i.category} — ${i.unit}`, sub: `${i.date} · ${i.result}`, page: "inspections" })) });

  return groups;
};

const SearchResults = ({ groups, onSelect, mobile }) => {
  if (!groups.length) return (
    <div style={{ padding: 20, textAlign: "center", color: T.dim, fontSize: 13 }}>No results found</div>
  );
  return (
    <div style={{ maxHeight: mobile ? "60vh" : 400, overflowY: "auto" }}>
      {groups.map(g => (
        <div key={g.cat}>
          <div style={{ padding: "8px 14px", fontSize: 10, fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: "0.5px", background: T.bg }}>
            {g.icon} {g.cat}
          </div>
          {g.items.map(item => (
            <div key={item.id} onClick={() => onSelect(item.page)} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${T.borderLight}`, transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = T.surfaceHover}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text, lineHeight: 1.3 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ── DATA EXPORT ───────────────────────────────────────────

const generateCSV = (columns, data, filename = "export") => {
  const header = columns.map(c => `"${c.label}"`).join(",");
  const rows = data.map(row =>
    columns.map(c => {
      const val = c.exportValue ? c.exportValue(row) : (row[c.key] ?? "");
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const ExportButton = ({ onClick, label = "Export CSV", mobile }) => (
  <button onClick={onClick} style={{
    ...s.btn("ghost"), fontSize: 12, padding: mobile ? "10px 14px" : "6px 12px",
    display: "inline-flex", alignItems: "center", gap: 6, minHeight: mobile ? 44 : undefined,
  }}>{"📥"} {label}</button>
);

const NAV = {
  resident: [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "maintenance", label: "Maintenance", icon: "🔧" },
    { id: "rent", label: "Rent & Payments", icon: "💳" },
    { id: "recert", label: "Recertification", icon: "📋" },
    { id: "unit", label: "My Unit", icon: "🏠" },
    { id: "inspections", label: "Inspections", icon: "🔍" },
    { id: "profile", label: "My Profile", icon: "👤" },
    { id: "messages", label: "Messages", icon: "💬" },
  ],
  admin: [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "property", label: "Properties", icon: "🏢" },
    { id: "residents", label: "Residents", icon: "👥" },
    { id: "maintenance", label: "Maintenance Requests", icon: "🔧" },
    { id: "financial", label: "Finance", icon: "💰" },
    { id: "recert", label: "Income Certification", icon: "📋" },
    { id: "inspections", label: "Inspections", icon: "🔍" },
    { id: "communications", label: "Communications", icon: "💬" },
    { id: "reports", label: "Reports", icon: "📊" },
    { id: "calendar", label: "Calendar", icon: "📅" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ],
  maintenance: [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "work-orders", label: "Work Orders", icon: "🔧" },
    { id: "inspections", label: "Inspections", icon: "🔍" },
    { id: "vendors", label: "Vendors", icon: "📇" },
    { id: "messages", label: "Messages", icon: "💬" },
    { id: "schedule", label: "Schedule", icon: "📅" },
    { id: "profile", label: "My Profile", icon: "👤" },
  ],
};

const BOTTOM_TABS = {
  resident: [
    { id: "dashboard", label: "Home", icon: "◉" },
    { id: "rent", label: "Rent", icon: "💳" },
    { id: "maintenance", label: "Repairs", icon: "🔧" },
    { id: "messages", label: "Messages", icon: "💬" },
  ],
  admin: [
    { id: "dashboard", label: "Home", icon: "◉" },
    { id: "residents", label: "Residents", icon: "👥" },
    { id: "maintenance", label: "Work", icon: "🔧" },
    { id: "financial", label: "Finance", icon: "💰" },
  ],
  maintenance: [
    { id: "dashboard", label: "Home", icon: "◉" },
    { id: "work-orders", label: "Orders", icon: "🔧" },
    { id: "inspections", label: "Inspect", icon: "🔍" },
    { id: "messages", label: "Messages", icon: "💬" },
  ],
};

// ── PAGE COMPONENTS ────────────────────────────────────────

// --- RESIDENT DASHBOARD ---
const ResidentDashboard = ({ mobile, maintenance, threads, notifications, rc, onNavigate }) => {
  const ext = LIVE_RESIDENTS_EXTENDED[rc?.id] || {};
  const certStatus = getCertStatus(ext.moveIn || ext.leaseStart, null);
  const openRequests = maintenance.filter(m => m.unit === rc?.unit && m.status !== "completed").length;
  const propName = LIVE_PROPERTIES.find(p => p.id === rc?.propertyId)?.name || "BCLT";
  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Welcome back, {rc?.firstName || "Resident"}</h1>
      <p style={s.sectionSub}>Unit {rc?.unit || "—"} — {propName}</p>
      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Rent Balance" value="$0.00" accent={T.success} mobile={mobile} />
        <StatCard label="Open Requests" value={openRequests} accent={openRequests > 0 ? T.warn : T.success} mobile={mobile} />
        <StatCard label="Income Cert" value={certStatus.label} accent={certStatus.color === "danger" ? T.danger : certStatus.color === "warn" ? T.warn : T.success} mobile={mobile} />
        <StatCard label="Lease Status" value={ext.leaseEnd ? (new Date(ext.leaseEnd) < new Date() ? "Expired" : "Active") : (ext.leaseType === "month-to-month" ? "M-to-M" : "Active")} accent={ext.leaseEnd && new Date(ext.leaseEnd) < new Date() ? T.danger : T.success} mobile={mobile} />
      </div>
      {(() => {
        const myRes = LIVE_RESIDENTS.find(r => r.id === rc?.id) || {};
        return (
        <div style={{ ...s.card, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>My Contact Info</div>
            <button onClick={() => onNavigate && onNavigate("profile")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.accent, fontWeight: 600, padding: 0 }}>Edit in My Profile →</button>
          </div>
          <div style={{ display: "flex", gap: mobile ? 12 : 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Phone</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{myRes.phone || "Not set"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Email</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{myRes.email || "Not set"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Preferred Contact</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{(myRes.preferredChannel || "email").toUpperCase()}</div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>SMS Consent</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: myRes.smsConsent ? T.success : T.warn }}>{myRes.smsConsent ? "✓ Opted In" : "Not opted in"}</div>
            </div>
          </div>
        </div>
        );
      })()}
      <div style={{ ...s.card, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Payment History</div>
            <div style={{ fontSize: 12, color: T.muted }}>Last 6 months — balance at month end</div>
          </div>
          <span style={{ fontSize: 12, color: T.success, fontWeight: 600 }}>On Track</span>
        </div>
        <SparkLine points={[0, 0, 150, 0, 0, 0]} color={T.success} width={mobile ? 260 : 400} height={48} mobile={mobile} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.dim, marginTop: 6, maxWidth: mobile ? 160 : 400 }}>
          <span>Oct</span><span>Nov</span><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span>
        </div>
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Recent Messages</div>
        {threads.filter(t => t.type === "broadcast" || t.participants.includes(rc?.id || "")).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate)).slice(0, 3).map(t => (
          <div key={t.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.borderLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t.subject}</span>
              {t.priority === "high" && <span style={s.badge(T.dangerDim, T.danger)}>Important</span>}
              {t.unread > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />}
            </div>
            <div style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>{new Date(t.lastDate).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Active Maintenance</div>
        {maintenance.filter(m => m.unit === (rc?.unit || "") && m.status !== "completed").map(m => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.borderLight}` }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{m.category}</span>
              <span style={{ color: T.muted, fontSize: 13, marginLeft: 10 }}>{m.description}</span>
            </div>
            <Badge status={m.status} />
          </div>
        ))}
      </div>
      <ActivityFeed items={notifications} mobile={mobile} />
    </div>
  );
};

// --- ADMIN DASHBOARD ---
const AdminDashboard = ({ mobile, maintenance, vendors: vendorData, notifications, selectedProperty, onSelectProperty }) => {
  const [dashCerts, setDashCerts] = useState([]);
  useEffect(() => { fetchIncomeCertifications().then(c => setDashCerts(c || [])).catch(() => {}); }, []);
  const regInsp = filterByProperty(LIVE_REG_INSPECTIONS, selectedProperty);
  const propLabel = selectedProperty === "all" ? "All Properties" : getProperty(selectedProperty).name;
  const totalUnits = selectedProperty === "all" ? LIVE_PROPERTIES.reduce((s, p) => s + p.totalUnits, 0) : getProperty(selectedProperty).totalUnits;
  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Admin Dashboard</h1>
      <p style={s.sectionSub}>{propLabel} — {totalUnits} Units</p>

      {/* Per-property performance cards — portfolio view */}
      {selectedProperty === "all" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Property Performance</div>
          <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap" }}>
            {LIVE_PROPERTIES.map(p => {
              const pMaint = MOCK_MAINTENANCE.filter(m => m.propertyId === p.id);
              const pOpen = pMaint.filter(m => m.status !== "completed").length;
              const pCrit = pMaint.filter(m => m.priority === "critical" && m.status !== "completed").length;
              const pRes = LIVE_RESIDENTS.filter(r => r.propertyId === p.id);
              const pLedger = LIVE_RENT_LEDGER.filter(r => r.propertyId === p.id);
              const pRent = pLedger.reduce((s, r) => s + r.rentDue, 0);
              const pColl = pLedger.reduce((s, r) => s + r.tenantPaid + r.hapReceived, 0);
              const pRate = pRent ? Math.round((pColl / pRent) * 100) : 0;
              return (
                <div key={p.id} onClick={() => onSelectProperty?.(p.id, "property")} style={{ ...s.card, flex: 1, minWidth: mobile ? "100%" : 280, cursor: "pointer" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.name} <span style={{ fontSize: 11, color: T.accent }}>→</span></div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>{p.totalUnits} units · {pRes.length} residents</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { label: "Open W/O", value: pOpen, color: pOpen > 0 ? T.warn : T.success },
                      { label: "Critical", value: pCrit, color: pCrit > 0 ? T.danger : T.success },
                      { label: "Collection", value: `${pRate}%`, color: pRate >= 95 ? T.success : pRate >= 80 ? T.warn : T.danger },
                    ].map(st => (
                      <div key={st.label} style={{ flex: 1, minWidth: 60, padding: "6px 8px", background: T.bg, borderRadius: T.radiusSm, textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: st.color }}>{st.value}</div>
                        <div style={{ fontSize: 9, color: T.muted }}>{st.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 24 }}>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Work Order Status</div>
          <DonutChart segments={[
            { value: maintenance.filter(m => m.status === "submitted").length, color: T.info, label: "Submitted" },
            { value: maintenance.filter(m => m.status === "in-progress").length, color: T.warn, label: "In Progress" },
            { value: maintenance.filter(m => m.status === "completed").length, color: T.success, label: "Completed" },
          ]} size={120} centerValue={String(maintenance.length)} centerLabel="Total" mobile={mobile} />
        </div>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Orders by Category</div>
          <MiniBarChart bars={Object.entries(maintenance.reduce((acc, m) => ({ ...acc, [m.category]: (acc[m.category] || 0) + 1 }), {})).map(([label, value]) => ({ label, value, color: T.accent }))} mobile={mobile} />
        </div>
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Recent Work Orders</div>
        <table style={s.table}>
          <thead><tr>{["ID", "Unit", "Category", "Priority", "Status", "Assigned"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {maintenance.filter(m => m.status !== "completed").map(m => (
              <tr key={m.id}>
                <td style={s.td}><span style={{ fontWeight: 600 }}>{m.id}</span></td>
                <td style={s.td}>{m.unit}</td>
                <td style={s.td}>{m.category}</td>
                <td style={s.td}><Badge status={m.priority} type="priority" /></td>
                <td style={s.td}><Badge status={m.status} /></td>
                <td style={s.td}>{m.assignedTo || <span style={{ color: T.dim }}>Unassigned</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Recertifications</div>
        {(() => {
          const residents = filterByProperty(LIVE_RESIDENTS, selectedProperty);
          const certRows = residents.map(r => {
            const ext = LIVE_RESIDENTS_EXTENDED[r.id] || {};
            const approved = dashCerts.find(c => (c.residentId === r._uuid || c.residentName === r.name) && c.status === "approved");
            const pending = dashCerts.find(c => (c.residentId === r._uuid || c.residentName === r.name) && c.status === "pending_review");
            const cs = getCertStatus(ext.moveIn || ext.leaseStart, approved ? (approved.updatedAt || approved.createdAt) : null);
            return { ...r, ext, cs, approved, pending };
          }).sort((a, b) => (a.cs.daysUntil || 999) - (b.cs.daysUntil || 999));
          const needsAction = certRows.filter(r => !r.approved && ["overdue", "urgent", "due-soon", "upcoming"].includes(r.cs.status));
          const current = certRows.filter(r => r.approved || r.cs.status === "ok" || r.cs.status === "current");
          return (
            <>
              {needsAction.length === 0 && current.length === certRows.length && (
                <div style={{ padding: "12px 0", color: T.success, fontSize: 13, fontWeight: 600 }}>✓ All certifications are current</div>
              )}
              {needsAction.length > 0 && (
                <table style={s.table}>
                  <thead><tr>{["Resident", "Unit", "Status", "Due", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {needsAction.map(r => (
                      <tr key={r.id}>
                        <td style={s.td}><span style={{ fontWeight: 600 }}>{r.name}</span></td>
                        <td style={s.td}>{r.unit}</td>
                        <td style={s.td}>
                          {r.pending ? <span style={{ ...s.badge(T.warnDim || "#fff3cd", T.warn), fontSize: 11 }}>Pending Review</span>
                            : <span style={{ ...s.badge(r.cs.color === "danger" ? (T.dangerDim || "#fde8e8") : r.cs.color === "warn" ? (T.warnDim || "#fff3cd") : (T.infoDim || "#e8f0fe"), r.cs.color === "danger" ? T.danger : r.cs.color === "warn" ? T.warn : T.info), fontSize: 11 }}>{r.cs.label}</span>}
                        </td>
                        <td style={s.td}><span style={{ fontSize: 13, color: r.cs.color === "danger" ? T.danger : T.muted }}>{r.cs.daysUntil != null ? (r.cs.daysUntil < 0 ? `${Math.abs(r.cs.daysUntil)}d overdue` : `${r.cs.daysUntil}d`) : "—"}</span></td>
                        <td style={s.td}>{r.pending && <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>Review →</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {needsAction.length === 0 && current.length < certRows.length && (
                <div style={{ padding: "12px 0", color: T.muted, fontSize: 13 }}>No certifications currently need attention</div>
              )}
              <div style={{ marginTop: 8, fontSize: 12, color: T.dim }}>{current.length} of {certRows.length} residents current</div>
            </>
          );
        })()}
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Upcoming Inspections</div>
        {regInsp.filter(i => new Date(i.nextDue) < new Date("2027-01-01")).slice(0, 3).map(i => (
          <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.borderLight}` }}>
            <div>
              <span style={{ fontWeight: 600 }}>{i.type}</span>
              <span style={{ color: T.muted, fontSize: 13, marginLeft: 10 }}>{i.authority}</span>
            </div>
            <span style={{ color: T.muted, fontSize: 13 }}>Due: {i.nextDue}</span>
          </div>
        ))}
      </div>
      <ActivityFeed items={notifications} mobile={mobile} />
    </div>
  );
};

// --- MAINTENANCE DASHBOARD (Staff) ---
const MaintenanceDashboard = ({ mobile, maintenance, notifications }) => {
  const myOrders = maintenance.filter(m => m.assignedTo === "Mike R." && m.status !== "completed");
  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>My Dashboard</h1>
      <p style={s.sectionSub}>Mike R. — Maintenance Staff</p>
      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="My Open Orders" value={myOrders.length} accent={T.warn} mobile={mobile} />
        <StatCard label="Unassigned" value={maintenance.filter(m => !m.assignedTo).length} accent={T.danger} mobile={mobile} />
        <StatCard label="Completed (Month)" value={maintenance.filter(m => m.status === "completed").length} accent={T.success} mobile={mobile} />
      </div>
      <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 24 }}>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Completion Rate</div>
          <div style={{ display: "flex", alignItems: "center", gap: mobile ? 16 : 24 }}>
            <ProgressRing value={maintenance.filter(m => m.status === "completed").length} max={maintenance.length} color={T.success} size={90} label="Complete" mobile={mobile} />
            <div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>{maintenance.filter(m => m.status === "completed").length} of {maintenance.length} completed</div>
              <div style={{ fontSize: 13, color: T.muted }}>{maintenance.filter(m => m.status === "in-progress").length} in progress</div>
              <div style={{ fontSize: 13, color: T.muted }}>{maintenance.filter(m => m.status === "submitted").length} awaiting action</div>
            </div>
          </div>
        </div>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Open by Priority</div>
          <MiniBarChart bars={[
            { label: "Critical", value: maintenance.filter(m => m.priority === "critical" && m.status !== "completed").length, color: T.danger },
            { label: "Urgent", value: maintenance.filter(m => m.priority === "urgent" && m.status !== "completed").length, color: T.warn },
            { label: "Routine", value: maintenance.filter(m => m.priority === "routine" && m.status !== "completed").length, color: T.info },
          ]} mobile={mobile} />
        </div>
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>My Work Orders</div>
        {myOrders.map(m => (
          <div key={m.id} style={{ ...s.card, marginBottom: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>{m.id} — {m.category}</span>
              <Badge status={m.priority} type="priority" />
            </div>
            <div style={{ color: T.muted, fontSize: 13 }}>Unit {m.unit} · {m.description}</div>
            {m.projectedComplete && <div style={{ color: T.dim, fontSize: 12, marginTop: 6 }}>Est. complete: {m.projectedComplete}</div>}
          </div>
        ))}
      </div>
      <ActivityFeed items={notifications} mobile={mobile} />
    </div>
  );
};

// --- MAINTENANCE PAGE (Resident) ---
const ResidentMaintenance = ({ mobile, maintenance, onSubmit, rc }) => {
  const [showForm, setShowForm] = useState(false);
  const [success, showSuccess] = useSuccess();
  const [formData, setFormData] = useState({ category: "Plumbing", urgency: "routine", description: "", permission: "Yes, enter anytime" });
  const myRequests = maintenance.filter(m => m.unit === (rc?.unit || ""));

  const handleSubmit = () => {
    if (!formData.description.trim()) return;
    const newReq = {
      id: `MR-${2406 + maintenance.length}`,
      unit: rc?.unit || "",
      category: formData.category,
      priority: formData.urgency,
      status: "submitted",
      description: formData.description.trim(),
      submitted: new Date().toISOString().slice(0, 10),
      assignedTo: null,
      queuePos: maintenance.filter(m => m.status !== "completed").length + 1,
      projectedComplete: null,
      notes: [],
    };
    onSubmit(newReq);
    setFormData({ category: "Plumbing", urgency: "routine", description: "", permission: "Yes, enter anytime" });
    setShowForm(false);
    showSuccess("Request submitted! You'll receive updates as it progresses.");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
        <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Maintenance Requests</h1>
        <button style={s.btn()} onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ New Request"}</button>
      </div>
      <p style={s.sectionSub}>Submit and track maintenance issues for your unit</p>
      <SuccessMessage message={success} />
      {showForm && (
        <div style={{ ...s.card, borderColor: T.accent, borderWidth: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>New Maintenance Request</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
            <div><label style={s.label}>Category</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}><option>Plumbing</option><option>Electrical</option><option>HVAC</option><option>Appliance</option><option>Structural</option><option>Pest</option><option>Other</option></select></div>
            <div><label style={s.label}>Urgency</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={formData.urgency} onChange={e => setFormData(p => ({ ...p, urgency: e.target.value }))}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="critical">Critical / Emergency</option></select></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={s.label}>Description</label><textarea style={{ ...s.input, minHeight: 80, resize: "vertical" }} placeholder="Describe the issue..." value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} /></div>
          <div style={{ marginBottom: 14 }}><label style={s.label}>Permission to Enter</label><select style={{ ...s.select, width: "100%" }} value={formData.permission} onChange={e => setFormData(p => ({ ...p, permission: e.target.value }))}><option>Yes, enter anytime</option><option>Contact me first</option><option>Only when I'm home</option></select></div>
          <div style={{ marginBottom: 14 }}><label style={s.label}>Photos (optional)</label><div style={{ border: `2px dashed ${T.border}`, borderRadius: T.radiusSm, padding: 24, textAlign: "center", color: T.dim, cursor: "pointer" }}>Click or drag to upload photos</div></div>
          <button style={s.btn()} onClick={handleSubmit}>Submit Request</button>
        </div>
      )}
      {myRequests.map(m => (
        <div key={m.id} style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div><span style={{ fontWeight: 700, marginRight: 10 }}>{m.id}</span><span style={{ color: T.muted }}>{m.category}</span></div>
            <div style={{ display: "flex", gap: 8 }}><Badge status={m.priority} type="priority" /><Badge status={m.status} /></div>
          </div>
          <div style={{ color: T.text, fontSize: 14, marginBottom: 10 }}>{m.description}</div>
          <div style={{ display: "flex", gap: 20, fontSize: 13, color: T.muted }}>
            <span>Submitted: {m.submitted}</span>
            {m.assignedTo && <span>Assigned: {m.assignedTo}</span>}
            {m.queuePos && m.status !== "completed" && <span style={{ color: T.accent }}>Queue position: #{m.queuePos}</span>}
            {m.projectedComplete && <span>Est. complete: {m.projectedComplete}</span>}
          </div>
          {(Array.isArray(m.notes) ? m.notes : []).length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: T.bg, borderRadius: T.radiusSm }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Updates</div>
              {(Array.isArray(m.notes) ? m.notes : []).map((n, i) => <div key={i} style={{ fontSize: 13, color: T.text, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{n.by}</span> <span style={{ color: T.dim }}>({n.date})</span>: {n.text}</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// --- WORK ORDERS (Maintenance Staff) ---
const WorkOrders = ({ mobile, maintenance, onUpdate }) => {
  const [filter, setFilter] = useState("mine");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ status: "", notes: "" });
  const [success, showSuccess] = useSuccess();
  const orders = filter === "mine" ? maintenance.filter(m => m.assignedTo === "Mike R.") : maintenance;

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditData({ status: row.status, notes: "" });
  };
  const saveEdit = () => {
    const changes = { status: editData.status };
    if (editData.notes.trim()) {
      const existing = maintenance.find(m => m.id === editingId);
      changes.notes = [...(existing?.notes || []), { by: "Mike R.", date: new Date().toISOString().slice(0, 10), text: editData.notes.trim() }];
    }
    onUpdate(editingId, changes);
    setEditingId(null);
    showSuccess("Work order updated!");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div><h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Work Orders</h1><p style={s.sectionSub}>Manage and update assigned maintenance requests</p></div>
        <ExportButton mobile={mobile} onClick={() => generateCSV([{ label: "ID", key: "id" }, { label: "Unit", key: "unit" }, { label: "Category", key: "category" }, { label: "Priority", key: "priority" }, { label: "Status", key: "status" }, { label: "Assigned To", key: "assignedTo", exportValue: r => r.assignedTo || "Unassigned" }, { label: "Description", key: "description" }], maintenance, "work_orders")} />
      </div>
      <SuccessMessage message={success} />
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["mine", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...s.btn(filter === f ? "primary" : "ghost"), textTransform: "capitalize" }}>{f === "mine" ? "My Orders" : "All Orders"}</button>
        ))}
      </div>
      <SortableTable
        mobile={mobile}
        columns={[
          { key: "id", label: "ID", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: "unit", label: "Unit" },
          { key: "category", label: "Category", filterOptions: [...new Set(maintenance.map(m => m.category))] },
          { key: "priority", label: "Priority", render: v => <Badge status={v} type="priority" />, filterOptions: ["critical", "urgent", "routine", "low"], filterValue: row => row.priority },
          { key: "status", label: "Status", render: v => <Badge status={v} />, filterOptions: ["submitted", "in-progress", "completed"], filterValue: row => row.status },
          { key: "projectedComplete", label: "Projected", render: v => v || "—", filterable: false },
          { key: "_actions", label: "", sortable: false, filterable: false, render: (_, row) => <button style={s.btn("ghost")} onClick={() => startEdit(row)}>Update</button> },
        ]}
        data={orders}
      />
      {editingId && (
        <div style={{ ...s.card, borderColor: T.accent, marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Update {editingId}</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
            <div>
              <label style={s.label}>Status</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={editData.status} onChange={e => setEditData(p => ({ ...p, status: e.target.value }))}>
                <option value="submitted">Submitted</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Add Note</label>
            <textarea style={{ ...s.input, minHeight: 60, resize: "vertical" }} placeholder="Add a note about the work..." value={editData.notes} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={s.btn()} onClick={saveEdit}>Save</button>
            <button style={s.btn("ghost")} onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- RENT & PAYMENTS ---
const RentPayments = ({ mobile, rc }) => {
  const _ext = LIVE_RESIDENTS_EXTENDED[rc?.id] || {};
  const ledgerEntry = LIVE_RENT_LEDGER.find(l => l.residentId === rc?.id) || {};
  const balance = ledgerEntry.balance || 0;
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", method: "ach", payType: "rent" });
  const [payHistory, setPayHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, showSuccess] = useSuccess();
  const [autopay, setAutopay] = useState(false);

  useEffect(() => {
    setLoadingHistory(true);
    fetchRentPayments().then(all => {
      const mine = all.filter(p => p.residentId === rc?.id).sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""));
      setPayHistory(mine);
      setLoadingHistory(false);
    }).catch(() => setLoadingHistory(false));
  }, [rc?.id]);

  const FEE_INFO = { ach: { label: "ACH / Bank Transfer", fee: 0, feeLabel: "Free" }, debit: { label: "Debit Card", fee: 1.50, feeLabel: "$1.50 fee" }, credit: { label: "Credit Card", fee: 0.0275, feeLabel: "2.75% fee", pct: true } };
  const calcFee = () => {
    const amt = parseFloat(payForm.amount) || 0;
    const info = FEE_INFO[payForm.method] || FEE_INFO.ach;
    return info.pct ? Math.round(amt * info.fee * 100) / 100 : info.fee;
  };
  const calcTotal = () => (parseFloat(payForm.amount) || 0) + (payForm.method === "ach" ? 0 : calcFee());

  const PAY_TYPES = [
    { value: "rent", label: "Rent" },
    { value: "late_fee", label: "Late Fee" },
    { value: "deposit", label: "Security Deposit" },
    { value: "utility", label: "Utility" },
    { value: "other", label: "Other" },
  ];

  const handleSubmit = async () => {
    if (!payForm.amount || submitting) return;
    setSubmitting(true);
    try {
      await recordPayment({
        residentSlug: rc?.id,
        amount: parseFloat(payForm.amount),
        method: payForm.method,
        paymentDate: new Date().toISOString().slice(0, 10),
        month: new Date().toISOString().slice(0, 7),
        note: `${PAY_TYPES.find(t => t.value === payForm.payType)?.label || "Rent"} — online payment`,
      });
      const fresh = await fetchRentLedger();
      if (fresh?.length) LIVE_RENT_LEDGER.splice(0, LIVE_RENT_LEDGER.length, ...fresh);
      const allPay = await fetchRentPayments();
      setPayHistory(allPay.filter(p => p.residentId === rc?.id).sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || "")));
      showSuccess(`Payment of $${parseFloat(payForm.amount).toFixed(2)} submitted successfully`);
      setPayForm({ amount: "", method: "ach", payType: "rent" });
      setShowPay(false);
    } catch (err) {
      showSuccess("Error: " + (err.message || "Payment failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Rent & Payments</h1>
      <p style={s.sectionSub}>View your balance, make payments, and manage autopay</p>
      <SuccessMessage message={success} />

      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Current Balance" value={balance > 0 ? `$${balance.toLocaleString()}` : "$0.00"} accent={balance > 0 ? T.danger : T.success} mobile={mobile} />
        <StatCard label="Monthly Rent" value={`$${(_ext.rentAmount || 0).toLocaleString()}`} accent={T.accent} mobile={mobile} />
        <StatCard label="Your Portion" value={`$${(_ext.tenantPortion || 0).toLocaleString()}`} accent={T.accent} mobile={mobile} />
        <StatCard label="HAP Payment" value={`$${(_ext.hapPayment || 0).toLocaleString()}`} accent={T.info} mobile={mobile} />
      </div>

      {/* Autopay Card */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Autopay</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {autopay
                ? `$${(_ext.tenantPortion || 0).toLocaleString()} via ACH on the 1st of each month`
                : "Automatically pay your rent each month — never miss a payment"}
            </div>
          </div>
          <Toggle label="" checked={autopay} onChange={() => {
            setAutopay(!autopay);
            showSuccess(autopay ? "Autopay disabled" : "Autopay enabled — payment will process on the 1st of each month");
          }} />
        </div>
        {autopay && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: T.successDim, borderRadius: 8, fontSize: 12, color: T.success, fontWeight: 600 }}>
            Autopay is active. Your tenant portion of ${(_ext.tenantPortion || 0).toLocaleString()} will be drafted via ACH on the 1st. A payment processor must be connected to process payments.
          </div>
        )}
      </div>

      {/* Make Payment */}
      <button style={{ ...s.btn(), marginBottom: 20 }} onClick={() => { setShowPay(!showPay); if (!showPay) setPayForm(f => ({ ...f, amount: String(_ext.tenantPortion || "") })); }}>
        {showPay ? "Cancel" : "Make a Payment"}
      </button>
      {showPay && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Make a Payment</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div>
              <label style={s.label}>Payment Type</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={payForm.payType} onChange={e => setPayForm(p => ({ ...p, payType: e.target.value }))}>
                {PAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Amount ($)</label>
              <input style={{ ...s.mInput(mobile), width: "100%" }} type="number" min="0" step="0.01" placeholder="0.00" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Payment Method</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                {Object.entries(FEE_INFO).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.feeLabel})</option>)}
              </select>
            </div>
          </div>
          {payForm.amount && payForm.method !== "ach" && (
            <div style={{ padding: "10px 14px", background: T.warnDim, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
              <span style={{ fontWeight: 600 }}>Processing fee:</span> ${calcFee().toFixed(2)} · <span style={{ fontWeight: 600 }}>Total:</span> ${calcTotal().toFixed(2)}
            </div>
          )}
          <div style={{ padding: "10px 14px", background: T.infoDim, borderRadius: 8, fontSize: 12, color: T.info, marginBottom: 14 }}>
            Online payments require a payment processor (Stripe). Contact your property manager to enable online payments. Manual payments (check, money order) can be recorded by your admin.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button disabled={!payForm.amount || submitting} style={s.btn()} onClick={handleSubmit}>{submitting ? "Processing..." : `Pay $${calcTotal().toFixed(2)}`}</button>
            <button style={s.btn("ghost")} onClick={() => setShowPay(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Payment History</div>
          <ExportButton onClick={() => generateCSV([
            { label: "Date", key: "paymentDate" },
            { label: "Method", key: "method" },
            { label: "Amount", key: "amount", exportValue: r => r.amount.toFixed(2) },
            { label: "Note", key: "note" },
          ], payHistory, "payment_history")} />
        </div>
        {loadingHistory ? (
          <div style={{ padding: 20, textAlign: "center", color: T.muted }}>Loading...</div>
        ) : payHistory.length === 0 ? (
          <EmptyState icon="💳" text="No payment history yet." />
        ) : (
          <table style={s.table}>
            <thead><tr>{["Date", "Type", "Method", "Amount", "Note"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {payHistory.map((p, i) => (
                <tr key={p.id || i}>
                  <td style={s.td}>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}</td>
                  <td style={s.td}><span style={s.badge(T.accentDim, T.accent)}>{(p.note || "Rent").split(" — ")[0]}</span></td>
                  <td style={s.td}><span style={{ textTransform: "capitalize" }}>{(p.method || "").replace("_", " ")}</span></td>
                  <td style={{ ...s.td, fontWeight: 600, color: T.success }}>${p.amount.toFixed(2)}</td>
                  <td style={s.td}><span style={{ fontSize: 12, color: T.muted }}>{p.note || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// --- RECERTIFICATION ---
// ── AMI HELPERS ──
const AMI_FALLBACK = { 1: { 30: 31470, 50: 52450, 60: 62940, 80: 83920, 100: 104900 }, 2: { 30: 35970, 50: 59950, 60: 71940, 80: 95920, 100: 119900 }, 3: { 30: 40455, 50: 67425, 60: 80910, 80: 107880, 100: 134850 }, 4: { 30: 44940, 50: 74900, 60: 89880, 80: 119840, 100: 149800 }, 5: { 30: 48540, 50: 80900, 60: 97080, 80: 129440, 100: 161800 }, 6: { 30: 52140, 50: 86900, 60: 104280, 80: 139040, 100: 173800 }, 7: { 30: 55740, 50: 92900, 60: 111480, 80: 148640, 100: 185800 }, 8: { 30: 59340, 50: 98900, 60: 118680, 80: 158240, 100: 197800 } };
const determineTICEligibility = (totalIncome, hhSize, amiLookup) => {
  const lim = (amiLookup || AMI_FALLBACK)[Math.min(Math.max(hhSize || 1, 1), 8)] || AMI_FALLBACK[1];
  if (totalIncome <= lim[30]) return { pct: Math.round((totalIncome / lim[30]) * 100), category: "Extremely Low (≤30%)", tier: 30, eligible: true };
  if (totalIncome <= lim[50]) return { pct: Math.round((totalIncome / lim[50]) * 100), category: "Very Low (≤50%)", tier: 50, eligible: true };
  if (totalIncome <= lim[60]) return { pct: Math.round((totalIncome / lim[60]) * 100), category: "Low (≤60%)", tier: 60, eligible: true };
  if (totalIncome <= lim[80]) return { pct: Math.round((totalIncome / lim[80]) * 100), category: "Moderate (≤80%)", tier: 80, eligible: true };
  return { pct: Math.round((totalIncome / lim[100]) * 100), category: "Over Income (>80%)", tier: 0, eligible: false };
};
const calcImputed = (totalAssetValue) => totalAssetValue > 5000 ? totalAssetValue * 0.06 : 0;

// ── TYPED SIGNATURE ──
const SignaturePad = ({ value, onChange, label, mobile }) => {
  // Typed name signature — type your full legal name
  const typedName = (typeof value === "string" && !value.startsWith("data:")) ? value : "";
  return (
    <div>
      <label style={s.label}>{label}</label>
      <input
        style={{ ...s.mInput(mobile), width: "100%", fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: mobile ? 18 : 22, fontStyle: "italic", padding: "14px 16px", borderColor: typedName ? T.accent : T.border }}
        value={typedName}
        onChange={e => onChange(e.target.value)}
        placeholder="Type your full legal name"
      />
      {typedName && (
        <div style={{ marginTop: 8, padding: "12px 16px", background: T.bg, borderRadius: T.radiusSm, fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: mobile ? 22 : 26, fontStyle: "italic", color: T.accent, borderBottom: `2px solid ${T.accent}`, letterSpacing: "0.5px" }}>
          {typedName}
        </div>
      )}
      {typedName && <button onClick={() => onChange("")} style={{ ...s.btn("ghost"), fontSize: 11, padding: "2px 8px", marginTop: 4 }}>Clear</button>}
    </div>
  );
};

// ── CERT DUE DATE HELPER ──
const getCertDueDate = (moveInDate) => {
  if (!moveInDate) return null;
  const now = new Date();
  const mi = new Date(moveInDate);
  // Next anniversary of move-in date
  let due = new Date(now.getFullYear(), mi.getMonth(), mi.getDate());
  if (due < now) due = new Date(now.getFullYear() + 1, mi.getMonth(), mi.getDate());
  return due;
};
const getCertStatus = (moveInDate, lastCertDate) => {
  const due = getCertDueDate(moveInDate);
  if (!due) return { status: "unknown", daysUntil: null, label: "No Move-In Date", color: "muted" };
  const now = new Date();
  const days = Math.ceil((due - now) / 86400000);
  if (lastCertDate) {
    const lastCert = new Date(lastCertDate);
    const certYear = lastCert.getFullYear();
    const dueYear = due.getFullYear();
    // If cert was done this year, they're good
    if (certYear >= dueYear || (dueYear - certYear === 1 && due > now)) {
      return { status: "current", daysUntil: days, label: "Current", color: "success" };
    }
  }
  if (days < 0) return { status: "overdue", daysUntil: days, label: `Overdue (${Math.abs(days)}d)`, color: "danger" };
  if (days <= 30) return { status: "urgent", daysUntil: days, label: `Due in ${days}d`, color: "danger" };
  if (days <= 60) return { status: "due-soon", daysUntil: days, label: `Due in ${days}d`, color: "warn" };
  if (days <= 90) return { status: "upcoming", daysUntil: days, label: `Due in ${days}d`, color: "info" };
  return { status: "ok", daysUntil: days, label: `Due in ${days}d`, color: "success" };
};

// ── INCOME CERTIFICATION ──
const IncomeCertification = ({ role, mobile, selectedProperty, rc, pushNotif }) => {
  const isAdmin = role === "admin";
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCert, setActiveCert] = useState(null); // full cert being edited
  const [step, setStep] = useState(0);
  const [success, showSuccess] = useSuccess();
  const [amiLookup, setAmiLookup] = useState(AMI_FALLBACK);
  const [rentLimits, setRentLimits] = useState({});
  // Wizard sub-state
  const [hhMembers, setHhMembers] = useState([]);
  const [incomeEntries, setIncomeEntries] = useState([]);
  const [assetEntries, setAssetEntries] = useState([]);
  const [newMemberForm, setNewMemberForm] = useState({ name: "", relationship: "Head of Household", dob: "", ssn4: "", ftStudent: false });
  const [showNewMember, setShowNewMember] = useState(false);
  const [newResidentId, setNewResidentId] = useState("");

  const stepLabels = ["Household", "Income", "Assets", "Eligibility", "Rent & Program", "Review & Sign"];

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchIncomeCertifications(), fetchAMIReference(2026, "Marin"), fetchRentLimits(2026, "Marin")])
      .then(([c, ami, rents]) => { setCerts(c || []); if (ami && Object.keys(ami).length) setAmiLookup(ami); setRentLimits(rents || {}); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadCertData = async (cert) => {
    try {
      const [members, income, assets] = await Promise.all([fetchTICMembers(cert.id), fetchTICIncome(cert.id), fetchTICAssets(cert.id)]);
      setHhMembers(members || []); setIncomeEntries(income || []); setAssetEntries(assets || []);
    } catch { setHhMembers([]); setIncomeEntries([]); setAssetEntries([]); }
  };

  const startNewCert = async () => {
    if (!newResidentId) return;
    const res = LIVE_RESIDENTS.find(r => r._uuid === newResidentId);
    if (!res) return;
    try {
      const cert = await insertIncomeCertification({ residentId: res._uuid, certType: "annual", effectiveDate: new Date().toISOString().slice(0, 10) });
      // Pre-fill household from existing household_members
      const existing = await fetchHouseholdMembers(res._uuid);
      const headMember = await insertTICMember({ certId: cert.id, name: res.name, relationship: "Head of Household", order: 0 });
      const otherMembers = [];
      for (let i = 0; i < (existing || []).length; i++) {
        const m = existing[i];
        const tm = await insertTICMember({ certId: cert.id, name: m.name, relationship: m.relationship, dob: m.date_of_birth, order: i + 1 });
        otherMembers.push(tm);
      }
      setHhMembers([{ ...headMember, id: headMember.id, name: res.name, relationship: "Head of Household", order: 0 }, ...otherMembers.map((tm, i) => ({ ...tm, id: tm.id, name: existing[i].name, relationship: existing[i].relationship, order: i + 1 }))]);
      setIncomeEntries([]); setAssetEntries([]);
      setActiveCert({ ...cert, id: cert.id, residentName: res.name, unit: res.unit, status: "draft" });
      setStep(0);
      showSuccess("Certification started for " + res.name);
      setNewResidentId("");
    } catch (err) { showSuccess("Error: " + err.message); }
  };

  // Totals calculation
  const totalAnnualIncome = incomeEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalAssetValue = assetEntries.reduce((s, e) => s + (e.cashValue || 0), 0);
  const totalAssetIncome = assetEntries.reduce((s, e) => s + (e.annualIncome || 0), 0);
  const imputedIncome = calcImputed(totalAssetValue);
  const applicableAssetIncome = Math.max(totalAssetIncome, imputedIncome);
  const incomeForDetermination = totalAnnualIncome + applicableAssetIncome;
  const eligibility = determineTICEligibility(incomeForDetermination, hhMembers.length, amiLookup);

  const saveCertTotals = async () => {
    if (!activeCert) return;
    try {
      await updateIncomeCertification(activeCert.id, {
        householdSize: hhMembers.length, totalAnnualIncome, totalAssetValue, totalAssetIncome,
        imputedAssetIncome: imputedIncome, incomeForDetermination,
        amiPercentage: eligibility.pct, amiCategory: eligibility.category, incomeEligible: eligibility.eligible,
      });
    } catch (err) { console.warn("Save totals failed:", err); }
  };

  const printCertification = () => {
    const ext = LIVE_RESIDENTS_EXTENDED[LIVE_RESIDENTS.find(r => r._uuid === activeCert.residentId || r.name === activeCert.residentName)?.id] || {};
    const tenantRent = activeCert.tenantRent || ext.tenantPortion || 0;
    const ua = activeCert.utilityAllowance || 0;
    const grossRent = tenantRent + ua;
    const hapPayment = activeCert.hapPayment || ext.hapPayment || 0;
    const memberRows = hhMembers.map((m, i) => {
      const mIncome = incomeEntries.filter(e => e.memberId === m.id);
      const mAssets = assetEntries.filter(e => e.memberId === m.id);
      const mIncomeTotal = mIncome.reduce((s, e) => s + (e.amount || 0), 0);
      const mAssetValue = mAssets.reduce((s, e) => s + (e.cashValue || 0), 0);
      const mAssetIncome = mAssets.reduce((s, e) => s + (e.annualIncome || 0), 0);
      return `<tr>
        <td style="padding:3px 6px;border:1px solid #ccc;font-size:10px">${i + 1}. ${m.name}</td>
        <td style="padding:3px 6px;border:1px solid #ccc;font-size:10px">${m.relationship || ""}</td>
        <td style="padding:3px 6px;border:1px solid #ccc;font-size:10px">${m.dob || ""}</td>
        <td style="padding:3px 6px;border:1px solid #ccc;font-size:10px;text-align:right">$${mIncomeTotal.toLocaleString()}</td>
        <td style="padding:3px 6px;border:1px solid #ccc;font-size:10px;text-align:right">$${mAssetValue.toLocaleString()}</td>
        <td style="padding:3px 6px;border:1px solid #ccc;font-size:10px;text-align:right">$${mAssetIncome.toLocaleString()}</td>
      </tr>`;
    }).join("");
    const incomeRows = incomeEntries.map(e => {
      const member = hhMembers.find(m => m.id === e.memberId);
      return `<tr>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px">${member?.name || ""}</td>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px">${(e.category || "").replace("_", " ")}</td>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px">${e.source || ""}</td>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:right">$${(e.amount || 0).toLocaleString()}</td>
      </tr>`;
    }).join("");
    const assetRows = assetEntries.map(e => {
      const member = hhMembers.find(m => m.id === e.memberId);
      return `<tr>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px">${member?.name || ""}</td>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px">${(e.assetType || "").replace("_", " ")}</td>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px">${e.description || ""}</td>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:right">$${(e.cashValue || 0).toLocaleString()}</td>
        <td style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:right">$${(e.annualIncome || 0).toLocaleString()}</td>
      </tr>`;
    }).join("");
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>Income Certification — ${activeCert.residentName}</title>
    <style>
      @page { size: letter; margin: 0.4in; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.3; }
      .header { text-align: center; border-bottom: 2px solid #1a3a5c; padding-bottom: 6px; margin-bottom: 8px; }
      .header h1 { font-size: 15px; color: #1a3a5c; margin-bottom: 2px; }
      .header p { font-size: 10px; color: #555; }
      .section { margin-bottom: 8px; }
      .section-title { font-size: 11px; font-weight: 700; color: #1a3a5c; border-bottom: 1px solid #1a3a5c; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
      table { width: 100%; border-collapse: collapse; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 16px; font-size: 11px; margin-bottom: 6px; }
      .info-grid .label { color: #666; font-size: 9px; text-transform: uppercase; }
      .info-grid .value { font-weight: 600; }
      .totals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 24px; font-size: 11px; }
      .totals-grid .row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dotted #ddd; }
      .totals-grid .row.highlight { font-weight: 700; color: #1a3a5c; border-bottom: 1px solid #1a3a5c; }
      .sig-line { border-bottom: 1px solid #333; min-width: 200px; padding: 2px 4px; font-family: Georgia, serif; font-style: italic; font-size: 13px; color: #1a3a5c; display: inline-block; min-height: 18px; }
      .sig-row { display: flex; justify-content: space-between; gap: 24px; margin-top: 8px; }
      .sig-block { flex: 1; }
      .sig-label { font-size: 9px; color: #666; text-transform: uppercase; margin-top: 2px; }
      .badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
      .eligible { background: #e6f4ea; color: #1e7e34; }
      .ineligible { background: #fde8e8; color: #c62828; }
    </style></head><body>
    <div class="header">
      <h1>Tenant Income Certification</h1>
      <p>Bolinas Community Land Trust &middot; HUD Form 50059 / LIHTC Compliance</p>
    </div>

    <div class="section">
      <div class="info-grid">
        <div><span class="label">Resident</span><br/><span class="value">${activeCert.residentName}</span></div>
        <div><span class="label">Unit</span><br/><span class="value">${activeCert.unit}</span></div>
        <div><span class="label">Effective Date</span><br/><span class="value">${activeCert.effectiveDate || ""}</span></div>
        <div><span class="label">Certification Type</span><br/><span class="value">${activeCert.certType === "annual" ? "Annual Recertification" : activeCert.certType || ""}</span></div>
        <div><span class="label">Program</span><br/><span class="value">${activeCert.programType || "9% LIHTC"}</span></div>
        <div><span class="label">Status</span><br/><span class="value">${(activeCert.status || "").replace("_", " ")}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Part I — Household Composition</div>
      <table>
        <thead><tr style="background:#f0f4f8">
          <th style="padding:3px 6px;border:1px solid #ccc;font-size:9px;text-align:left">Member</th>
          <th style="padding:3px 6px;border:1px solid #ccc;font-size:9px;text-align:left">Relationship</th>
          <th style="padding:3px 6px;border:1px solid #ccc;font-size:9px;text-align:left">DOB</th>
          <th style="padding:3px 6px;border:1px solid #ccc;font-size:9px;text-align:right">Annual Income</th>
          <th style="padding:3px 6px;border:1px solid #ccc;font-size:9px;text-align:right">Asset Value</th>
          <th style="padding:3px 6px;border:1px solid #ccc;font-size:9px;text-align:right">Asset Income</th>
        </tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>

    ${incomeEntries.length > 0 ? `<div class="section">
      <div class="section-title">Part II — Income Detail</div>
      <table>
        <thead><tr style="background:#f0f4f8">
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:left">Member</th>
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:left">Category</th>
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:left">Source</th>
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:right">Annual Amount</th>
        </tr></thead>
        <tbody>${incomeRows}</tbody>
      </table>
    </div>` : ""}

    ${assetEntries.length > 0 ? `<div class="section">
      <div class="section-title">Part III — Asset Detail</div>
      <table>
        <thead><tr style="background:#f0f4f8">
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:left">Member</th>
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:left">Type</th>
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:left">Description</th>
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:right">Cash Value</th>
          <th style="padding:2px 6px;border:1px solid #ccc;font-size:9px;text-align:right">Annual Income</th>
        </tr></thead>
        <tbody>${assetRows}</tbody>
      </table>
    </div>` : ""}

    <div class="section">
      <div class="section-title">Part IV — Income Determination & Eligibility</div>
      <div class="totals-grid">
        <div>
          <div class="row"><span>Total Annual Income (E)</span><span>$${totalAnnualIncome.toLocaleString()}</span></div>
          <div class="row"><span>Total Asset Value</span><span>$${totalAssetValue.toLocaleString()}</span></div>
          <div class="row"><span>Actual Asset Income (K)</span><span>$${totalAssetIncome.toLocaleString()}</span></div>
          <div class="row"><span>Imputed Asset Income (6%)</span><span>$${imputedIncome.toLocaleString()}</span></div>
          <div class="row"><span>Applicable Asset Income</span><span>$${applicableAssetIncome.toLocaleString()}</span></div>
          <div class="row highlight"><span>Total Household Income (L)</span><span>$${incomeForDetermination.toLocaleString()}</span></div>
        </div>
        <div>
          <div class="row"><span>Household Size</span><span>${hhMembers.length}</span></div>
          <div class="row"><span>AMI Category</span><span>${eligibility.category}</span></div>
          <div class="row"><span>AMI Percentage</span><span>${eligibility.pct}%</span></div>
          <div class="row highlight"><span>Income Eligible</span><span class="badge ${eligibility.eligible ? "eligible" : "ineligible"}">${eligibility.eligible ? "YES" : "NO"}</span></div>
          <div class="row"><span>Tenant Paid Rent</span><span>$${tenantRent.toLocaleString()}</span></div>
          <div class="row"><span>Utility Allowance</span><span>$${ua.toLocaleString()}</span></div>
          <div class="row"><span>Gross Rent</span><span>$${grossRent.toLocaleString()}</span></div>
          ${hapPayment ? `<div class="row"><span>HAP / Rent Assistance</span><span>$${hapPayment.toLocaleString()}</span></div>` : ""}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Part V — Certification & Signatures</div>
      <p style="font-size:9px;color:#555;margin-bottom:8px;line-height:1.4">Under penalties of perjury, I/we certify that the information presented in this certification is true and accurate to the best of my/our knowledge and belief. The owner/management agent has reviewed the documentation and determined the household qualifies.</p>
      <div class="sig-row">
        <div class="sig-block">
          <div class="sig-line">${activeCert.residentSignature || ""}</div>
          <div class="sig-label">Resident Signature</div>
          <div style="font-size:9px;color:#888;margin-top:1px">${activeCert.residentSignedAt ? new Date(activeCert.residentSignedAt).toLocaleDateString() : ""}</div>
        </div>
        <div class="sig-block">
          <div class="sig-line">${activeCert.adminSignature || ""}</div>
          <div class="sig-label">Owner/Representative Signature${activeCert.adminSignerName ? " — " + activeCert.adminSignerName : ""}</div>
          <div style="font-size:9px;color:#888;margin-top:1px">${activeCert.adminSignedAt ? new Date(activeCert.adminSignedAt).toLocaleDateString() : ""}</div>
        </div>
      </div>
    </div>

    <div style="text-align:center;font-size:8px;color:#999;margin-top:8px;border-top:1px solid #ddd;padding-top:4px">
      Generated ${new Date().toLocaleDateString()} &middot; Bolinas Community Land Trust Resident Portal
    </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // If editing a cert, show wizard
  if (activeCert) {
    const ext = LIVE_RESIDENTS_EXTENDED[LIVE_RESIDENTS.find(r => r._uuid === activeCert.residentId || r.name === activeCert.residentName)?.id] || {};
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={() => { saveCertTotals(); setActiveCert(null); }} style={s.btn("ghost")}>&larr; Back to Certifications</button>
          <button onClick={printCertification} style={{ ...s.btn("ghost"), fontSize: 13 }}>🖨️ Print</button>
        </div>
        <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Income Certification — {activeCert.residentName}</h1>
        <p style={s.sectionSub}>Unit {activeCert.unit} · {activeCert.certType === "annual" ? "Annual Recertification" : activeCert.certType} · {activeCert.status}</p>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {stepLabels.map((lbl, i) => (
            <button key={i} onClick={() => setStep(i)} style={{
              flex: 1, minWidth: mobile ? 80 : 100, padding: "8px 4px", border: `1px solid ${i === step ? T.accent : T.border}`,
              borderRadius: T.radiusSm, background: i === step ? T.accentDim : i < step ? T.successDim : T.bg,
              color: i === step ? T.accent : i < step ? T.success : T.muted, fontWeight: i === step ? 700 : 500,
              fontSize: 11, cursor: "pointer", textAlign: "center",
            }}>{i < step ? "✓ " : ""}{lbl}</button>
          ))}
        </div>
        <SuccessMessage message={success} />

        {/* STEP 0: HOUSEHOLD */}
        {step === 0 && (
          <div>
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Household Members ({hhMembers.length})</div>
                <button onClick={() => setShowNewMember(v => !v)} style={s.btn(showNewMember ? "ghost" : "primary")}>{showNewMember ? "Cancel" : "➕ Add Member"}</button>
              </div>
              {showNewMember && (
                <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 10, marginBottom: 14, padding: 12, background: T.bg, borderRadius: T.radiusSm }}>
                  <div><label style={s.label}>Name *</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={newMemberForm.name} onChange={e => setNewMemberForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><label style={s.label}>Relationship</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={newMemberForm.relationship} onChange={e => setNewMemberForm(f => ({ ...f, relationship: e.target.value }))}><option>Head of Household</option><option>Spouse</option><option>Co-Head</option><option>Child</option><option>Other Adult</option><option>Foster Child</option><option>Live-in Aide</option></select></div>
                  <div><label style={s.label}>Date of Birth</label><input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={newMemberForm.dob} onChange={e => setNewMemberForm(f => ({ ...f, dob: e.target.value }))} /></div>
                  <div><label style={s.label}>SSN Last 4</label><input maxLength={4} style={{ ...s.mInput(mobile), width: "100%" }} placeholder="0000" value={newMemberForm.ssn4} onChange={e => setNewMemberForm(f => ({ ...f, ssn4: e.target.value.replace(/\D/g, "").slice(0, 4) }))} /></div>
                  <div><label style={s.label}>Full-Time Student</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={newMemberForm.ftStudent ? "yes" : "no"} onChange={e => setNewMemberForm(f => ({ ...f, ftStudent: e.target.value === "yes" }))}><option value="no">No</option><option value="yes">Yes</option></select></div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}><button disabled={!newMemberForm.name.trim()} onClick={async () => {
                    try {
                      const m = await insertTICMember({ certId: activeCert.id, name: newMemberForm.name.trim(), relationship: newMemberForm.relationship, dob: newMemberForm.dob || null, ssn4: newMemberForm.ssn4 || null, ftStudent: newMemberForm.ftStudent, order: hhMembers.length });
                      setHhMembers(prev => [...prev, { id: m.id, name: newMemberForm.name.trim(), relationship: newMemberForm.relationship, dob: newMemberForm.dob, ssn4: newMemberForm.ssn4, ftStudent: newMemberForm.ftStudent, order: hhMembers.length }]);
                      setNewMemberForm({ name: "", relationship: "Spouse", dob: "", ssn4: "", ftStudent: false });
                      setShowNewMember(false);
                      showSuccess("Member added");
                    } catch (err) { showSuccess("Error: " + err.message); }
                  }} style={s.mBtn("primary", mobile)}>Add</button></div>
                </div>
              )}
              <table style={s.table}>
                <thead><tr>{["#", "Name", "Relationship", "DOB", "SSN-4", "Student", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>{hhMembers.map((m, i) => (
                  <tr key={m.id || i}>
                    <td style={s.td}>{i + 1}</td>
                    <td style={s.td}><span style={{ fontWeight: 600 }}>{m.name}</span></td>
                    <td style={s.td}>{m.relationship}</td>
                    <td style={s.td}>{m.dob || "—"}</td>
                    <td style={s.td}>{m.ssn4 ? `***-**-${m.ssn4}` : "—"}</td>
                    <td style={s.td}>{m.ftStudent ? "FT" : "N/A"}</td>
                    <td style={s.td}>{i > 0 && <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 11, padding: "2px 8px" }} onClick={async () => { try { await deleteTICMember(m.id); setHhMembers(prev => prev.filter(x => x.id !== m.id)); } catch {} }}>Remove</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => { saveCertTotals(); setStep(1); }} style={s.mBtn("primary", mobile)}>Next: Income →</button>
            </div>
          </div>
        )}

        {/* STEP 1: INCOME */}
        {step === 1 && (
          <div>
            {hhMembers.map((m, mi) => {
              const memberIncome = incomeEntries.filter(e => e.memberId === m.id);
              const memberTotal = memberIncome.reduce((s, e) => s + (e.amount || 0), 0);
              return (
                <div key={m.id} style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 700 }}>{m.name} <span style={{ color: T.muted, fontWeight: 400 }}>({m.relationship})</span></span>
                    <span style={{ fontWeight: 600, color: T.accent }}>${memberTotal.toLocaleString()}/yr</span>
                  </div>
                  {["employment", "social_security", "public_assistance", "other"].map(cat => {
                    const catEntries = memberIncome.filter(e => e.category === cat);
                    const catLabel = cat === "employment" ? "Employment/Wages" : cat === "social_security" ? "Social Security/Pensions" : cat === "public_assistance" ? "Public Assistance" : "Other Income";
                    return (
                      <div key={cat} style={{ marginBottom: 10, padding: "8px 10px", background: T.bg, borderRadius: T.radiusSm }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: catEntries.length ? 8 : 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>{catLabel}</span>
                          <button onClick={async () => {
                            try {
                              const e = await insertTICIncome({ certId: activeCert.id, memberId: m.id, category: cat, source: "", amount: 0 });
                              setIncomeEntries(prev => [...prev, { id: e.id, certId: activeCert.id, memberId: m.id, category: cat, source: "", amount: 0 }]);
                            } catch {}
                          }} style={{ ...s.btn("ghost"), fontSize: 10, padding: "2px 8px" }}>+ Add</button>
                        </div>
                        {catEntries.map(entry => (
                          <div key={entry.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                            <input placeholder="Source" value={entry.source || ""} onChange={e => { setIncomeEntries(prev => prev.map(x => x.id === entry.id ? { ...x, source: e.target.value } : x)); }} onBlur={() => updateTICIncome(entry.id, { source: entry.source }).catch(() => {})} style={{ ...s.input, flex: 2, fontSize: 12, padding: "4px 8px" }} />
                            <input type="number" placeholder="$/yr" value={entry.amount || ""} onChange={e => { setIncomeEntries(prev => prev.map(x => x.id === entry.id ? { ...x, amount: parseFloat(e.target.value) || 0 } : x)); }} onBlur={() => updateTICIncome(entry.id, { amount: entry.amount }).catch(() => {})} style={{ ...s.input, flex: 1, fontSize: 12, padding: "4px 8px" }} />
                            <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                              <input type="file" accept=".pdf,.jpg,.png" style={{ display: "none" }} onChange={async (ev) => {
                                const file = ev.target.files?.[0]; if (!file) return;
                                try { const path = await uploadTICDocument(file, activeCert.id); await updateTICIncome(entry.id, { docPath: path }); setIncomeEntries(prev => prev.map(x => x.id === entry.id ? { ...x, docPath: path, verified: true } : x)); showSuccess("Doc uploaded"); } catch (err) { showSuccess("Upload failed"); }
                              }} />📎 {entry.docPath ? "✓" : "Doc"}
                            </label>
                            <button onClick={async () => { try { await deleteTICIncome(entry.id); setIncomeEntries(prev => prev.filter(x => x.id !== entry.id)); } catch {} }} style={{ ...s.btn("ghost"), color: T.danger, fontSize: 10, padding: "2px 6px" }}>✕</button>
                          </div>
                        ))}
                        {catEntries.length === 0 && <div style={{ fontSize: 11, color: T.dim, padding: "4px 0" }}>No {catLabel.toLowerCase()} reported</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div style={{ ...s.card, background: T.accentDim }}>
              <DetailRow label="Total Annual Income (E)" value={`$${totalAnnualIncome.toLocaleString()}`} accent={T.accent} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button onClick={() => setStep(0)} style={s.btn("ghost")}>← Household</button>
              <button onClick={() => { saveCertTotals(); setStep(2); }} style={s.mBtn("primary", mobile)}>Next: Assets →</button>
            </div>
          </div>
        )}

        {/* STEP 2: ASSETS */}
        {step === 2 && (
          <div>
            {hhMembers.map(m => {
              const memberAssets = assetEntries.filter(e => e.memberId === m.id);
              return (
                <div key={m.id} style={{ ...s.card, borderLeft: `3px solid ${T.info}`, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 700 }}>{m.name}</span>
                    <button onClick={async () => {
                      try {
                        const e = await insertTICAsset({ certId: activeCert.id, memberId: m.id, assetType: "savings", cashValue: 0, annualIncome: 0 });
                        setAssetEntries(prev => [...prev, { id: e.id, certId: activeCert.id, memberId: m.id, assetType: "savings", cashValue: 0, annualIncome: 0 }]);
                      } catch {}
                    }} style={{ ...s.btn("ghost"), fontSize: 11 }}>+ Add Asset</button>
                  </div>
                  {memberAssets.length === 0 ? <div style={{ fontSize: 12, color: T.dim }}>No assets reported</div> : memberAssets.map(a => (
                    <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <select value={a.assetType} onChange={e => { setAssetEntries(prev => prev.map(x => x.id === a.id ? { ...x, assetType: e.target.value } : x)); updateTICAsset(a.id, { assetType: e.target.value }).catch(() => {}); }} style={{ ...s.select, flex: 1, fontSize: 12, padding: "4px 6px" }}>
                        <option value="savings">Savings</option><option value="checking">Checking</option><option value="cd">CD</option><option value="stocks">Stocks/Bonds</option><option value="real_estate">Real Estate</option><option value="retirement">Retirement</option><option value="life_insurance">Life Insurance</option><option value="other">Other</option>
                      </select>
                      <input type="number" placeholder="Cash Value" value={a.cashValue || ""} onChange={e => setAssetEntries(prev => prev.map(x => x.id === a.id ? { ...x, cashValue: parseFloat(e.target.value) || 0 } : x))} onBlur={() => updateTICAsset(a.id, { cashValue: a.cashValue }).catch(() => {})} style={{ ...s.input, flex: 1, fontSize: 12, padding: "4px 8px" }} />
                      <input type="number" placeholder="Annual Income" value={a.annualIncome || ""} onChange={e => setAssetEntries(prev => prev.map(x => x.id === a.id ? { ...x, annualIncome: parseFloat(e.target.value) || 0 } : x))} onBlur={() => updateTICAsset(a.id, { annualIncome: a.annualIncome }).catch(() => {})} style={{ ...s.input, flex: 1, fontSize: 12, padding: "4px 8px" }} />
                      <button onClick={async () => { try { await deleteTICAsset(a.id); setAssetEntries(prev => prev.filter(x => x.id !== a.id)); } catch {} }} style={{ ...s.btn("ghost"), color: T.danger, fontSize: 10, padding: "2px 6px" }}>✕</button>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={s.card}>
              <DetailRow label="Total Cash Value of Assets (H)" value={`$${totalAssetValue.toLocaleString()}`} />
              <DetailRow label="Total Annual Income from Assets (I)" value={`$${totalAssetIncome.toLocaleString()}`} />
              {totalAssetValue > 5000 && <DetailRow label={`Imputed Income (J) — $${totalAssetValue.toLocaleString()} × 6%`} value={`$${imputedIncome.toLocaleString()}`} accent={T.warn} />}
              <DetailRow label="Total Income from Assets (K)" value={`$${applicableAssetIncome.toLocaleString()}`} accent={T.info} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button onClick={() => setStep(1)} style={s.btn("ghost")}>← Income</button>
              <button onClick={() => { saveCertTotals(); setStep(3); }} style={s.mBtn("primary", mobile)}>Next: Eligibility →</button>
            </div>
          </div>
        )}

        {/* STEP 3: ELIGIBILITY DETERMINATION */}
        {step === 3 && (
          <div>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Income Eligibility Determination</div>
              <DetailRow label="Total Annual Income (E)" value={`$${totalAnnualIncome.toLocaleString()}`} />
              <DetailRow label="Total Income from Assets (K)" value={`$${applicableAssetIncome.toLocaleString()}`} />
              <div style={{ height: 1, background: T.border, margin: "10px 0" }} />
              <DetailRow label="Total Annual Household Income (L)" value={`$${incomeForDetermination.toLocaleString()}`} accent={T.accent} />
              <div style={{ height: 1, background: T.border, margin: "10px 0" }} />
              <DetailRow label="Household Size" value={hhMembers.length} />
              <DetailRow label="AMI Category" value={eligibility.category} accent={eligibility.eligible ? T.success : T.danger} />
              <DetailRow label="Income Eligible" value={eligibility.eligible ? "Yes ✓" : "No ✕"} accent={eligibility.eligible ? T.success : T.danger} />
              <div style={{ marginTop: 14, padding: 12, background: eligibility.eligible ? T.successDim : T.dangerDim, borderRadius: T.radiusSm }}>
                <div style={{ fontWeight: 700, color: eligibility.eligible ? T.success : T.danger, marginBottom: 6 }}>{eligibility.eligible ? "✓ Household is income eligible" : "✕ Household exceeds income limits"}</div>
                <div style={{ fontSize: 12, color: T.muted }}>
                  {[30, 50, 60, 80].map(pct => {
                    const lim = (amiLookup[hhMembers.length] || {})[pct];
                    return lim ? <div key={pct}>{pct}% AMI limit: ${lim.toLocaleString()} {incomeForDetermination <= lim ? "✓" : ""}</div> : null;
                  })}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button onClick={() => setStep(2)} style={s.btn("ghost")}>← Assets</button>
              <button onClick={() => { saveCertTotals(); setStep(4); }} style={s.mBtn("primary", mobile)}>Next: Rent →</button>
            </div>
          </div>
        )}

        {/* STEP 4: RENT & PROGRAM */}
        {step === 4 && (() => {
          const tenantRent = activeCert.tenantRent || ext.tenantPortion || 0;
          const ua = activeCert.utilityAllowance || 0;
          const grossRent = tenantRent + ua;
          const bedrooms = ext.bedrooms || 1;
          const tierLimits = rentLimits[eligibility.tier] || {};
          const rentLim = tierLimits[bedrooms] || 0;
          return (
          <div>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Rent Details</div>
              <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
                <div><label style={s.label}>Tenant Paid Monthly Rent</label><input type="number" value={activeCert.tenantRent || ext.tenantPortion || ""} onChange={e => setActiveCert(c => ({ ...c, tenantRent: parseFloat(e.target.value) || 0 }))} style={{ ...s.mInput(mobile), width: "100%" }} /></div>
                <div><label style={s.label}>Monthly Utility Allowance</label><input type="number" value={activeCert.utilityAllowance || ""} onChange={e => setActiveCert(c => ({ ...c, utilityAllowance: parseFloat(e.target.value) || 0 }))} style={{ ...s.mInput(mobile), width: "100%" }} /></div>
                <div><label style={s.label}>Federal Rent Assistance (HAP)</label><input type="number" value={activeCert.hapPayment || ext.hapPayment || ""} onChange={e => setActiveCert(c => ({ ...c, hapPayment: parseFloat(e.target.value) || 0 }))} style={{ ...s.mInput(mobile), width: "100%" }} /></div>
              </div>
              <DetailRow label="Gross Monthly Rent" value={`$${grossRent.toLocaleString()}`} accent={T.accent} />
              {rentLim > 0 && <DetailRow label={`Max LIHTC Rent Limit (${eligibility.tier}% AMI, ${bedrooms}BR)`} value={`$${rentLim.toLocaleString()}`} />}
              {rentLim > 0 && <DetailRow label="Rent Compliant" value={grossRent <= rentLim ? "Yes ✓" : "No — Over limit"} accent={grossRent <= rentLim ? T.success : T.danger} />}
            </div>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Program Type</div>
              <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14 }}>
                <div><label style={s.label}>Primary Program</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={activeCert.programType || "9% LIHTC"} onChange={e => setActiveCert(c => ({ ...c, programType: e.target.value }))}><option>9% LIHTC</option><option>4% LIHTC</option><option>Tax-Exempt Bond</option><option>HOME</option><option>Section 8</option></select></div>
                <div><label style={s.label}>Federal Assistance Source</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={activeCert.federalAssistanceSource || ""} onChange={e => setActiveCert(c => ({ ...c, federalAssistanceSource: e.target.value }))}><option value="">None/Missing</option><option value="1">HUD PBRA</option><option value="2">Section 8 Mod Rehab</option><option value="3">Public Housing</option><option value="4">HOME Rental Assistance</option><option value="5">HUD HCV (tenant-based)</option><option value="6">HUD PBV</option><option value="7">USDA 521</option><option value="8">Other Federal</option></select></div>
              </div>
            </div>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Student Status</div>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Toggle label="All occupants are full-time students" checked={activeCert.allStudentHousehold || false} onChange={() => setActiveCert(c => ({ ...c, allStudentHousehold: !c.allStudentHousehold }))} />
              </div>
              {activeCert.allStudentHousehold && (
                <div style={{ marginTop: 10 }}><label style={s.label}>Student Exemption</label><select style={{ ...s.mSelect(mobile), width: mobile ? "100%" : 300 }} value={activeCert.studentExemption || ""} onChange={e => setActiveCert(c => ({ ...c, studentExemption: e.target.value }))}><option value="">Select exemption...</option><option value="1">AFDC/TANF Assistance</option><option value="2">Job Training Program</option><option value="3">Single Parent/Dependent Child</option><option value="4">Married/Joint Return</option><option value="5">Former Foster Care</option></select></div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button onClick={() => setStep(3)} style={s.btn("ghost")}>← Eligibility</button>
              <button onClick={() => { saveCertTotals(); setStep(5); }} style={s.mBtn("primary", mobile)}>Next: Review & Sign →</button>
            </div>
          </div>
          ); })()}

        {/* STEP 5: REVIEW & SIGNATURE */}
        {step === 5 && (
          <div>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Certification Summary</div>
              <DetailRow label="Household Size" value={hhMembers.length} />
              <DetailRow label="Total Annual Income" value={`$${incomeForDetermination.toLocaleString()}`} accent={T.accent} />
              <DetailRow label="AMI Category" value={eligibility.category} accent={eligibility.eligible ? T.success : T.danger} />
              <DetailRow label="Income Eligible" value={eligibility.eligible ? "Yes" : "No"} accent={eligibility.eligible ? T.success : T.danger} />
              <DetailRow label="Program" value={activeCert.programType || "9% LIHTC"} />
            </div>

            {/* Supporting Documents */}
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>Supporting Documents</div>
              <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Upload pay stubs, tax returns, Social Security award letters, bank statements, or other documents verifying income and assets.</p>

              {(activeCert.supportingDocs || []).map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.bg, borderRadius: T.radiusSm, marginBottom: 6, border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 16 }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{formatFileSize(d.size)}</div>
                  </div>
                  <button onClick={() => setActiveCert(c => ({ ...c, supportingDocs: (c.supportingDocs || []).filter(doc => doc.id !== d.id) }))} style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ))}

              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: mobile ? "16px 20px" : "14px 20px", background: T.bg, border: `2px dashed ${T.border}`, borderRadius: T.radiusSm, cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.accent, marginTop: 8, minHeight: mobile ? 52 : undefined }}>
                📎 Upload Documents
                <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  const newDocs = [];
                  for (const file of files) {
                    try {
                      const path = await uploadTICDocument(file, activeCert.id);
                      newDocs.push({ id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, size: file.size, path, uploaded_at: new Date().toISOString() });
                    } catch {
                      newDocs.push({ id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, size: file.size, path: null, uploaded_at: new Date().toISOString() });
                    }
                  }
                  setActiveCert(c => ({ ...c, supportingDocs: [...(c.supportingDocs || []), ...newDocs] }));
                  e.target.value = "";
                  if (newDocs.length) showSuccess(`${newDocs.length} document${newDocs.length > 1 ? "s" : ""} uploaded`);
                }} style={{ display: "none" }} />
              </label>
              <p style={{ fontSize: 11, color: T.dim, marginTop: 6, textAlign: "center" }}>PDF, JPG, PNG, DOC accepted</p>
            </div>

            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Household Certification & Signatures</div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
                Under penalties of perjury, I/we certify that the information presented in this Certification is true and accurate to the best of my/our knowledge and belief.
              </div>
              <SignaturePad label="Resident Signature" value={activeCert.residentSignature} onChange={v => setActiveCert(c => ({ ...c, residentSignature: v }))} mobile={mobile} />
              {isAdmin && (
                <div style={{ marginTop: 16 }}>
                  <SignaturePad label="Owner/Representative Signature" value={activeCert.adminSignature} onChange={v => setActiveCert(c => ({ ...c, adminSignature: v }))} mobile={mobile} />
                  <div style={{ marginTop: 8 }}><label style={s.label}>Signer Name</label><input style={{ ...s.mInput(mobile), width: mobile ? "100%" : 300 }} value={activeCert.adminSignerName || ""} onChange={e => setActiveCert(c => ({ ...c, adminSignerName: e.target.value }))} /></div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, flexWrap: "wrap", gap: 8 }}>
              <button onClick={() => setStep(4)} style={s.btn("ghost")}>← Rent & Program</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={async () => {
                  try {
                    await saveCertTotals();
                    await updateIncomeCertification(activeCert.id, { status: "draft", stepsCompleted: { household: true, income: true, assets: true, rent: true, eligibility: true, signature: false } });
                    showSuccess("Saved as draft");
                  } catch (err) { showSuccess("Error: " + err.message); }
                }} style={s.btn("ghost")}>💾 Save Draft</button>
                <button onClick={async () => {
                  try {
                    await saveCertTotals();
                    const tenantRent = activeCert.tenantRent || 0;
                    const ua = activeCert.utilityAllowance || 0;
                    await updateIncomeCertification(activeCert.id, {
                      status: isAdmin ? "approved" : "pending_review",
                      stepsCompleted: { household: true, income: true, assets: true, rent: true, eligibility: true, signature: true },
                      tenantRent, utilityAllowance: ua, grossRent: tenantRent + ua,
                      hapPayment: activeCert.hapPayment || 0, programType: activeCert.programType || "9% LIHTC",
                      allStudentHousehold: activeCert.allStudentHousehold || false,
                      residentSignature: activeCert.residentSignature, residentSignedAt: activeCert.residentSignature ? new Date().toISOString() : null,
                      adminSignature: activeCert.adminSignature, adminSignedAt: activeCert.adminSignature ? new Date().toISOString() : null,
                      adminSignerName: activeCert.adminSignerName,
                    });
                    showSuccess(isAdmin ? "Certification approved!" : "Submitted for review!");
                    // Notify admin when resident submits
                    if (!isAdmin && pushNotif) {
                      pushNotif({
                        id: `N-${Date.now()}`,
                        type: "recert",
                        icon: "📋",
                        message: `Income certification submitted by ${activeCert.residentName} (${activeCert.unit}) — $${incomeForDetermination.toLocaleString()}/yr. Review required.`,
                        timestamp: new Date().toISOString(),
                        roles: ["admin"],
                      });
                      // Email all admins
                      fetchUserProfiles().then(profiles => {
                        const admins = (profiles || []).filter(p => p.role === "admin" && p.email);
                        admins.forEach(admin => {
                          sendNotification("custom", {
                            to: admin.email,
                            subject: `Income Certification Submitted — ${activeCert.residentName} (${activeCert.unit})`,
                            body: `${activeCert.residentName} in Unit ${activeCert.unit} has submitted their income certification for review.\n\nTotal Annual Household Income: $${incomeForDetermination.toLocaleString()}\nAMI Category: ${eligibility.category}\n\nPlease log in to the Resident Portal to review and approve.`,
                          }).catch(() => {});
                        });
                      }).catch(() => {});
                    }
                    // Refresh certs before clearing active cert to avoid stale list
                    const refreshed = await fetchIncomeCertifications();
                    setCerts(refreshed || []);
                    setActiveCert(null);
                  } catch (err) { showSuccess("Error: " + err.message); }
                }} style={s.mBtn("primary", mobile)}>{isAdmin ? "✓ Approve & Complete" : "Submit for Review"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // LIST VIEW
  const filteredCerts = selectedProperty === "all" ? certs : certs.filter(c => c.propertySlug === selectedProperty);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div>
          <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Income Certification</h1>
          <p style={s.sectionSub}>LIHTC / Section 8 tenant income certifications</p>
        </div>
      </div>
      <SuccessMessage message={success} />

      {isAdmin ? (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Start New Certification</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}><label style={s.label}>Resident</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={newResidentId} onChange={e => setNewResidentId(e.target.value)}>
                <option value="">Select resident...</option>
                {filterByProperty(LIVE_RESIDENTS, selectedProperty).map(r => <option key={r._uuid} value={r._uuid}>{r.name} — {r.unit}</option>)}
              </select>
            </div>
            <button disabled={!newResidentId} onClick={startNewCert} style={s.mBtn("primary", mobile)}>📋 Start Certification</button>
          </div>
        </div>
      ) : (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Annual Income Certification</div>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Complete your income recertification for housing compliance.</div>
            </div>
            <button onClick={async () => {
              const me = rc ? LIVE_RESIDENTS.find(r => r.id === rc.id || r.name === rc.name) : LIVE_RESIDENTS[0];
              if (!me) return;
              try {
                const cert = await insertIncomeCertification({ residentId: me._uuid, certType: "annual", effectiveDate: new Date().toISOString().slice(0, 10) });
                const existing = await fetchHouseholdMembers(me._uuid);
                const headMember = await insertTICMember({ certId: cert.id, name: me.name, relationship: "Head of Household", order: 0 });
                const otherMembers = [];
                for (let i = 0; i < (existing || []).length; i++) {
                  const m = existing[i];
                  const tm = await insertTICMember({ certId: cert.id, name: m.name, relationship: m.relationship, dob: m.date_of_birth, order: i + 1 });
                  otherMembers.push(tm);
                }
                setHhMembers([{ ...headMember, name: me.name, relationship: "Head of Household", order: 0 }, ...otherMembers.map((tm, i) => ({ ...tm, name: existing[i].name, relationship: existing[i].relationship, order: i + 1 }))]);
                setIncomeEntries([]); setAssetEntries([]);
                setActiveCert({ ...cert, residentName: me.name, unit: me.unit, status: "draft" });
                setStep(0);
                showSuccess("Certification started!");
              } catch (err) { showSuccess("Error: " + err.message); }
            }} style={s.mBtn("primary", mobile)}>📋 Start My Certification</button>
          </div>
        </div>
      )}

      {/* Due Soon / Overdue Summary */}
      {isAdmin && (() => {
        const residents = filterByProperty(LIVE_RESIDENTS, selectedProperty);
        const certsByResident = {};
        certs.forEach(c => {
          if (c.status === "approved" && (!certsByResident[c.residentId] || new Date(c.effectiveDate) > new Date(certsByResident[c.residentId])))
            certsByResident[c.residentId] = c.effectiveDate;
        });
        const resWithStatus = residents.map(r => {
          const ext = LIVE_RESIDENTS_EXTENDED[r.id] || {};
          const lastCert = certsByResident[r._uuid] || null;
          const certStatus = getCertStatus(ext.moveIn || ext.leaseStart, lastCert);
          return { ...r, moveIn: ext.moveIn || ext.leaseStart, lastCert, ...certStatus };
        }).filter(r => r.moveIn);
        const overdue = resWithStatus.filter(r => r.status === "overdue").length;
        const urgent = resWithStatus.filter(r => r.status === "urgent").length;
        const dueSoon = resWithStatus.filter(r => r.status === "due-soon").length;
        const upcoming = resWithStatus.filter(r => r.status === "upcoming").length;
        const current = resWithStatus.filter(r => r.status === "current" || r.status === "ok").length;
        const needsAction = resWithStatus.filter(r => ["overdue", "urgent", "due-soon"].includes(r.status));
        return (<>
          <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard label="Overdue" value={overdue} accent={overdue > 0 ? T.danger : T.success} mobile={mobile} />
            <StatCard label="Due ≤30 Days" value={urgent} accent={urgent > 0 ? T.danger : T.success} mobile={mobile} />
            <StatCard label="Due ≤60 Days" value={dueSoon} accent={dueSoon > 0 ? T.warn : T.success} mobile={mobile} />
            <StatCard label="Current" value={current} accent={T.success} mobile={mobile} />
          </div>
          {needsAction.length > 0 && (
            <div style={{ ...s.card, borderLeft: `3px solid ${T.danger}`, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15, color: T.danger }}>⚠️ Action Required ({needsAction.length})</div>
              {needsAction.sort((a, b) => (a.daysUntil || 0) - (b.daysUntil || 0)).map(r => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.borderLight}` }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span style={{ color: T.muted, fontSize: 13, marginLeft: 10 }}>Unit {r.unit}</span>
                    {r.lastCert && <span style={{ color: T.dim, fontSize: 12, marginLeft: 10 }}>Last cert: {r.lastCert}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={s.badge(r.color === "danger" ? T.dangerDim : T.warnDim, r.color === "danger" ? T.danger : T.warn)}>{r.label}</span>
                    <button style={s.btn("primary")} onClick={() => { setNewResidentId(r._uuid); }}>Start Cert</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>);
      })()}

      {/* Existing Certifications */}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Certification History</div>
      {loading ? <div style={{ padding: 40, textAlign: "center", color: T.muted }}>Loading certifications...</div> :
        filteredCerts.length === 0 ? <EmptyState icon="📋" text="No income certifications yet. Start one for a resident above." /> : (
        <SortableTable mobile={mobile} keyField="id" onRowClick={(row) => { setActiveCert(row); loadCertData(row); setStep(0); }} columns={[
          { key: "residentName", label: "Resident", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: "propertySlug", label: "Property", render: v => { const p = LIVE_PROPERTIES.find(pr => pr.id === v); return <span style={{ fontWeight: 600 }}>{p?.name || v || "—"}</span>; }, filterOptions: [...new Set(filteredCerts.map(c => c.propertySlug).filter(Boolean))], filterValue: row => row.propertySlug },
          { key: "unit", label: "Unit" },
          { key: "certType", label: "Type", render: v => <span style={s.badge(T.infoDim, T.info)}>{v}</span> },
          { key: "effectiveDate", label: "Effective Date" },
          { key: "status", label: "Status", render: v => {
            const colors = { draft: [T.dimLight, T.muted], in_progress: [T.warnDim, T.warn], pending_review: [T.infoDim, T.info], approved: [T.successDim, T.success], rejected: [T.dangerDim, T.danger] };
            const [bg, fg] = colors[v] || colors.draft;
            return <span style={s.badge(bg, fg)}>{v.replace("_", " ")}</span>;
          }, filterOptions: ["draft", "in_progress", "pending_review", "approved", "rejected"] },
          { key: "amiCategory", label: "AMI", render: v => v || "—" },
          { key: "incomeForDetermination", label: "Income", render: v => v ? `$${Number(v).toLocaleString()}` : "—" },
          ...(isAdmin ? [{ key: "id", label: "", render: (v, row) => row.status === "pending_review" ? (
            <button onClick={async (e) => {
              e.stopPropagation();
              try {
                await updateIncomeCertification(v, { status: "approved" });
                showSuccess("Certification approved!");
                const refreshed = await fetchIncomeCertifications();
                setCerts(refreshed || []);
              } catch (err) { showSuccess("Error: " + err.message); }
            }} style={{ ...s.btn("primary"), fontSize: 11, padding: "4px 10px", whiteSpace: "nowrap" }}>✓ Approve</button>
          ) : null }] : []),
        ]} data={filteredCerts} />
      )}
    </div>
  );
};

// --- LEASE DOCUMENTS PANEL ---
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
};

const LeaseDocumentsPanel = ({ docs, onUpload, onDelete, canUpload = true, canDelete = false, residentSlug }) => {
  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState("lease");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      let storagePath = null;
      if (residentSlug) {
        storagePath = await uploadLeaseFile(selectedFile, residentSlug);
      }
      onUpload({
        id: `LD-${Date.now()}`, name: selectedFile.name, type: docType,
        size: selectedFile.size, uploadedAt: new Date().toISOString(),
        uploadedBy: canDelete ? "Admin" : "Resident", storagePath,
      });
    } catch (err) {
      console.warn("File upload failed:", err);
      // Still add the record even if storage fails
      onUpload({
        id: `LD-${Date.now()}`, name: selectedFile.name, type: docType,
        size: selectedFile.size, uploadedAt: new Date().toISOString(),
        uploadedBy: canDelete ? "Admin" : "Resident",
      });
    } finally {
      setSelectedFile(null);
      setDocType("lease");
      setShowUpload(false);
      setUploading(false);
    }
  };

  const sorted = [...docs].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  return (
    <div style={s.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Lease Documents</div>
        {canUpload && <button style={s.btn()} onClick={() => setShowUpload(!showUpload)}>{showUpload ? "Cancel" : "+ Upload"}</button>}
      </div>
      {showUpload && (
        <div style={{ padding: 14, background: T.bg, borderRadius: T.radiusSm, marginBottom: 14 }}>
          <div style={{ ...s.grid("2fr 1fr", false), gap: 10, marginBottom: 10 }}>
            <div>
              <label style={s.label}>Choose File</label>
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                style={{ fontSize: 13, color: T.text }} />
              {selectedFile && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</div>}
            </div>
            <div><label style={s.label}>Type</label><select style={{ ...s.select, width: "100%" }} value={docType} onChange={e => setDocType(e.target.value)}>{Object.entries(LEASE_DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <button style={s.btn()} disabled={!selectedFile || uploading} onClick={handleUpload}>{uploading ? "Uploading..." : "Upload Document"}</button>
        </div>
      )}
      {sorted.length === 0 ? (
        <EmptyState icon="📄" text="No documents uploaded yet" />
      ) : (
        sorted.map(doc => (
          <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.borderLight}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{"📄"}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.name}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{LEASE_DOC_TYPES[doc.type] || doc.type} · {formatFileSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString()}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={s.btn("ghost")} onClick={async () => {
                if (doc.storagePath) {
                  try { const url = await getLeaseFileUrl(doc.storagePath); if (url) window.open(url, "_blank"); else alert("File not found"); } catch { alert("Error opening file"); }
                } else { alert("No file stored — metadata only"); }
              }}>View</button>
              {canDelete && onDelete && <button style={{ ...s.btn("danger"), padding: "4px 10px", fontSize: 12 }} onClick={() => onDelete(doc.id)}>Delete</button>}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// --- UNIT DETAILS (Resident) ---
const UnitDetails = ({ leaseDocs, setLeaseDocs, mobile, rc }) => {
  if (!rc || !rc.id) return <div><h1 style={s.sectionTitle}>My Unit</h1><EmptyState icon="🏠" text="Unit information not available. Your profile may not be linked to a unit yet." /></div>;
  const ext = LIVE_RESIDENTS_EXTENDED[rc.id] || {};
  const u = { number: rc.unit || "—", bedrooms: ext.bedrooms || 0, bathrooms: 1, sqft: 0, floorPlan: `${ext.bedrooms || 0}BR`, leaseStart: ext.leaseStart || "—", leaseEnd: ext.leaseEnd || "—", rentAmount: ext.rentAmount || 0, tenantPortion: ext.tenantPortion || 0, hapPayment: ext.hapPayment || 0, utilityResponsibility: {}, appliances: [], lastInspection: null };
  const rid = rc?.id || "";
  const residentDocs = leaseDocs[rid] || [];

  const handleUpload = (doc) => {
    setLeaseDocs(prev => ({ ...prev, [rid]: [...(prev[rid] || []), doc] }));
  };

  return (
    <div>
      <h1 style={s.sectionTitle}>My Unit — {u.number}</h1>
      <p style={s.sectionSub}>{u.bedrooms}BR / {u.bathrooms}BA · {u.sqft} sq ft · {u.floorPlan}</p>
      <div style={s.grid("1fr 1fr", mobile)}>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Lease Details</div>
          <DetailRow label="Lease Start" value={u.leaseStart} />
          <DetailRow label="Lease End" value={u.leaseEnd} />
          <DetailRow label="Monthly Rent" value={`$${u.rentAmount}`} />
          <DetailRow label="Tenant Portion" value={`$${u.tenantPortion}`} accent={T.accent} />
          <DetailRow label="HAP (PHA Pays)" value={`$${u.hapPayment}`} accent={T.info} />
        </div>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Utility Responsibility</div>
          {Object.entries(u.utilityResponsibility).map(([k, v]) => (
            <DetailRow key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={v} accent={v === "Tenant" ? T.warn : T.success} />
          ))}
        </div>
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Appliance Inventory</div>
        <table style={s.table}>
          <thead><tr>{["Appliance", "Make", "Model", "Age", "Warranty"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {u.appliances.map((a, i) => (
              <tr key={i}><td style={s.td}>{a.name}</td><td style={s.td}>{a.make}</td><td style={s.td}>{a.model}</td><td style={s.td}>{a.age}</td><td style={s.td}><span style={s.badge(a.warranty === "Active" ? T.successDim : T.dangerDim, a.warranty === "Active" ? T.success : T.danger)}>{a.warranty}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Last Inspection</div>
        <DetailRow label="Date" value={u.lastInspection?.date || "—"} />
        <DetailRow label="Type" value={u.lastInspection?.type || "—"} />
        <DetailRow label="Result" value={u.lastInspection?.result || "—"} accent={u.lastInspection?.result === "Pass" ? T.success : T.danger} />
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Property Management</div>
        <DetailRow label="Manager" value={LIVE_PROPERTIES[0]?.manager || "—"} />
        <DetailRow label="Phone" value={LIVE_PROPERTIES[0]?.managerPhone || "—"} />
        <DetailRow label="Email" value={LIVE_PROPERTIES[0]?.managerEmail || "—"} />
        <DetailRow label="Office Hours" value={LIVE_PROPERTIES[0]?.officeHours || "—"} />
      </div>
      <LeaseDocumentsPanel docs={residentDocs} onUpload={handleUpload} canUpload={true} canDelete={false} residentSlug={rc?.id} />
    </div>
  );
};


// --- RESIDENT PROFILE ---
const ResidentProfile = ({ mobile, commPrefs, setCommPrefs, emergencyContacts, onUpdateEmergencyContacts, rc }) => {
  const tabs = ["Contact", "Emergency Contacts", "Household", "Lease Summary", "Preferences"];
  const [tab, setTab] = useState(tabs[0]);
  const [editingContact, setEditingContact] = useState(false);
  const myRes = LIVE_RESIDENTS.find(r => r.id === rc?.id) || { phone: "", email: "", name: rc?.name || "Resident", preferredChannel: "email" };
  const [contactForm, setContactForm] = useState({ phone: myRes.phone || "", email: myRes.email || "" });
  const [editingEC, setEditingEC] = useState(null);
  const [ecForm, setEcForm] = useState({ name: "", relationship: "", phone: "", email: "" });
  const [success, showSuccess] = useSuccess();
  const myContacts = emergencyContacts[rc?.id || ""] || [];

  const saveContact = () => {
    setEditingContact(false);
    showSuccess("Contact information updated!");
  };

  const startEditEC = (ec) => {
    setEditingEC(ec.id);
    setEcForm({ name: ec.name, relationship: ec.relationship, phone: ec.phone, email: ec.email });
  };
  const startAddEC = () => {
    setEditingEC("new");
    setEcForm({ name: "", relationship: "", phone: "", email: "" });
  };
  const saveEC = () => {
    if (!ecForm.name.trim() || !ecForm.phone.trim()) return;
    let updated;
    if (editingEC === "new") {
      updated = [...myContacts, { id: `EC-${Date.now()}`, ...ecForm }];
    } else {
      updated = myContacts.map(ec => ec.id === editingEC ? { ...ec, ...ecForm } : ec);
    }
    onUpdateEmergencyContacts(rc?.id || "", updated);
    setEditingEC(null);
    showSuccess(editingEC === "new" ? "Emergency contact added!" : "Emergency contact updated!");
  };
  const deleteEC = (id) => {
    onUpdateEmergencyContacts(rc?.id || "", myContacts.filter(ec => ec.id !== id));
    showSuccess("Emergency contact removed.");
  };

  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>My Profile</h1>
      <p style={s.sectionSub}>{rc?.name || "Resident"} — Unit {rc?.unit || "—"}</p>
      <SuccessMessage message={success} />
      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {tab === "Contact" && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Contact Information</div>
            <button style={s.btn(editingContact ? "ghost" : "primary")} onClick={() => setEditingContact(!editingContact)}>{editingContact ? "Cancel" : "Edit"}</button>
          </div>
          {editingContact ? (
            <div>
              <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
                <div><label style={s.label}>Phone</label><input style={s.mInput(mobile)} value={contactForm.phone} onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))} /></div>
                <div><label style={s.label}>Email</label><input style={s.mInput(mobile)} type="email" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={s.label}>Preferred Contact Method</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["email", "sms", "both", "phone"].map(ch => (
                    <button key={ch} onClick={() => setCommPrefs(prev => ({ ...prev, preferredChannel: ch }))} style={{ ...s.btn(commPrefs.preferredChannel === ch ? "primary" : "ghost"), flex: 1, fontSize: 12, textTransform: "uppercase" }}>{ch === "both" ? "Email+SMS" : ch}</button>
                  ))}
                </div>
              </div>
              {(commPrefs.preferredChannel === "sms" || commPrefs.preferredChannel === "both") && (
                <div style={{ marginBottom: 14, padding: "12px 14px", background: T.bg, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={myRes.smsConsent || false} onChange={async (e) => {
                      const consent = e.target.checked;
                      try {
                        await updateResident(myRes._uuid, { smsConsent: consent });
                        myRes.smsConsent = consent;
                        showSuccess(consent ? "SMS consent recorded." : "SMS consent removed.");
                      } catch (err) { showSuccess("Error: " + err.message); }
                    }} style={{ marginTop: 3, width: 18, height: 18 }} />
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>I agree to receive text messages from Bolinas Community Land Trust. Msg & data rates may apply. Reply STOP to cancel.</span>
                  </label>
                </div>
              )}
              <button style={s.btn()} onClick={saveContact}>Save Changes</button>
            </div>
          ) : (
            <div>
              <DetailRow label="Name" value={rc?.name || "—"} />
              <DetailRow label="Unit" value={rc?.unit || "—"} />
              <DetailRow label="Phone" value={contactForm.phone} />
              <DetailRow label="Email" value={contactForm.email} />
              <DetailRow label="Preferred Channel" value={(commPrefs.preferredChannel || "email").toUpperCase()} accent={T.accent} />
              <DetailRow label="SMS Consent" value={myRes.smsConsent ? "✓ Opted In" : "Not opted in"} accent={myRes.smsConsent ? T.success : T.warn} />
            </div>
          )}
        </div>
      )}

      {tab === "Emergency Contacts" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: T.muted }}>People to contact in case of emergency</div>
            <button style={s.btn()} onClick={startAddEC}>+ Add Contact</button>
          </div>
          {editingEC && (
            <div style={{ ...s.card, borderColor: T.accent }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>{editingEC === "new" ? "Add Emergency Contact" : "Edit Emergency Contact"}</div>
              <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
                <div><label style={s.label}>Name</label><input style={s.mInput(mobile)} value={ecForm.name} onChange={e => setEcForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" /></div>
                <div><label style={s.label}>Relationship</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={ecForm.relationship} onChange={e => setEcForm(p => ({ ...p, relationship: e.target.value }))}><option value="">Select...</option><option>Spouse</option><option>Parent</option><option>Mother</option><option>Father</option><option>Sibling</option><option>Sister</option><option>Brother</option><option>Child</option><option>Friend</option><option>Other</option></select></div>
                <div><label style={s.label}>Phone</label><input style={s.mInput(mobile)} value={ecForm.phone} onChange={e => setEcForm(p => ({ ...p, phone: e.target.value }))} placeholder="(415) 555-0000" /></div>
                <div><label style={s.label}>Email (optional)</label><input style={s.mInput(mobile)} type="email" value={ecForm.email} onChange={e => setEcForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" /></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={s.btn()} onClick={saveEC}>Save</button>
                <button style={s.btn("ghost")} onClick={() => setEditingEC(null)}>Cancel</button>
              </div>
            </div>
          )}
          {myContacts.map(ec => (
            <div key={ec.id} style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>{ec.name}</span>
                <span style={s.badge(T.accentDim, T.accent)}>{ec.relationship}</span>
              </div>
              <DetailRow label="Phone" value={ec.phone} />
              {ec.email && <DetailRow label="Email" value={ec.email} />}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={s.btn("ghost")} onClick={() => startEditEC(ec)}>Edit</button>
                <button style={s.btn("ghost")} onClick={() => deleteEC(ec.id)}>Remove</button>
              </div>
            </div>
          ))}
          {myContacts.length === 0 && !editingEC && <EmptyState icon="📋" text="No emergency contacts yet. Add one above." />}
        </div>
      )}

      {tab === "Household" && (
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Household Members</div>
          <table style={s.table}>
            <thead><tr>{["Name", "Relationship", "Date of Birth"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {(MOCK_RECERT.householdMembers || []).map((m, i) => (
                <tr key={i}>
                  <td style={s.td}><span style={{ fontWeight: 600 }}>{m.name}</span></td>
                  <td style={s.td}>{m.relationship}</td>
                  <td style={s.td}>{m.dob}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 14, padding: 12, background: T.bg, borderRadius: T.radiusSm, fontSize: 12, color: T.muted }}>
            Household composition changes require a recertification. Contact management for assistance.
          </div>
        </div>
      )}

      {tab === "Lease Summary" && (() => {
        const ext = LIVE_RESIDENTS_EXTENDED[rc?.id] || {};
        return (
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Lease & Unit Details</div>
          <DetailRow label="Unit" value={rc?.unit || "—"} />
          <DetailRow label="Bedrooms" value={ext.bedrooms || "—"} />
          <DetailRow label="Lease Type" value={ext.leaseType === "month-to-month" ? "Month-to-Month" : "Fixed Term"} />
          <DetailRow label="Lease Start" value={ext.leaseStart || "—"} />
          {ext.leaseType !== "month-to-month" && <DetailRow label="Lease End" value={ext.leaseEnd || "—"} />}
          <div style={{ marginTop: 14, fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Rent Breakdown</div>
          <DetailRow label="Total Rent" value={ext.rentAmount ? `$${ext.rentAmount}` : "—"} />
          <DetailRow label="Your Portion" value={ext.tenantPortion ? `$${ext.tenantPortion}` : "—"} accent={T.accent} />
          <DetailRow label="HAP Payment (PHA)" value={ext.hapPayment ? `$${ext.hapPayment}` : "—"} accent={T.success} />
        </div>
        );
      })()}

      {tab === "Preferences" && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Contact Preferences</div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Preferred Channel</label>
              <div style={{ display: "flex", gap: 10 }}>
                {["sms", "email", "phone"].map(ch => (
                  <button key={ch} onClick={() => setCommPrefs(prev => ({ ...prev, preferredChannel: ch }))}
                    style={{ ...s.btn(commPrefs.preferredChannel === ch ? "primary" : "ghost"), flex: 1, textTransform: "uppercase", fontSize: 12 }}>
                    {ch === "sms" ? "SMS" : ch === "email" ? "Email" : "Phone"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14, padding: "12px 14px", background: T.bg, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>SMS Text Message Consent</div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={myRes.smsConsent || false} onChange={async (e) => {
                  const consent = e.target.checked;
                  try {
                    await updateResident(myRes._uuid, { smsConsent: consent });
                    myRes.smsConsent = consent;
                    showSuccess(consent ? "SMS consent recorded. You will receive text messages from BCLT." : "SMS consent removed. You will no longer receive text messages.");
                  } catch (err) { showSuccess("Error: " + err.message); }
                }} style={{ marginTop: 3, width: 18, height: 18 }} />
                <span style={{ fontSize: 13, lineHeight: 1.5, color: T.text }}>
                  I agree to receive text messages from Bolinas Community Land Trust at the phone number on file. Message frequency varies. Message and data rates may apply. Reply STOP to cancel at any time. Reply HELP for help.
                </span>
              </label>
            </div>
            <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Quiet Hours Start</label><input style={s.mInput(mobile)} type="time" value={commPrefs.quietHoursStart} onChange={e => setCommPrefs(prev => ({ ...prev, quietHoursStart: e.target.value }))} /></div>
              <div><label style={s.label}>Quiet Hours End</label><input style={s.mInput(mobile)} type="time" value={commPrefs.quietHoursEnd} onChange={e => setCommPrefs(prev => ({ ...prev, quietHoursEnd: e.target.value }))} /></div>
            </div>
            <div>
              <label style={s.label}>Language</label>
              <select style={{ ...s.select, width: "100%" }} value={commPrefs.language} onChange={e => setCommPrefs(prev => ({ ...prev, language: e.target.value }))}>
                <option value="en">English</option>
                <option value="es">Espanol</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- ADMIN RESIDENTS ---
const AdminResidents = ({ mobile, maintenance, threads, emergencyContacts, adminNotes, onAddAdminNote, selectedProperty, onResidentAdded, onDataChanged, leaseDocs: leaseDocsFromApp, sbRentLedger, pendingResidentView, onClearPendingResident, onAddThread, onAddMessage }) => {
  const [selectedResident, setSelectedResident] = useState(null);
  const [tab, setTab] = useState("Overview");

  // Auto-open resident detail when navigating from property units
  useEffect(() => {
    if (pendingResidentView) {
      const res = LIVE_RESIDENTS.find(r => r.id === pendingResidentView || r._uuid === pendingResidentView);
      if (res) { setSelectedResident(res); setTab("Overview"); }
      if (onClearPendingResident) onClearPendingResident();
    }
  }, [pendingResidentView]);
  const [noteText, setNoteText] = useState("");
  const [success, showSuccess] = useSuccess();
  const [showAddForm, setShowAddForm] = useState(false);
  const defaultPropId = selectedProperty === "all" ? (LIVE_PROPERTIES[0]?.id || "") : selectedProperty;
  const [addForm, setAddForm] = useState({ name: "", unit: "", unitId: "", phone: "", email: "", propertyId: defaultPropId, bedrooms: "1", rentAmount: "", tenantPortion: "", hapPayment: "", leaseStart: "", leaseEnd: "" });
  const [adding, setAdding] = useState(false);
  const [addFormUnits, setAddFormUnits] = useState([]);
  const [editingResident, setEditingResident] = useState(false);
  const [editResForm, setEditResForm] = useState({});
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgChannel, setMsgChannel] = useState("email");
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", date: new Date().toISOString().slice(0, 10), note: "" });
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [hhForm, setHhForm] = useState({ name: "", relationship: "Spouse", phone: "", email: "" });
  const [residentDocs, setResidentDocs] = useState([]);
  const [residentPayments, setResidentPayments] = useState([]);

  // Load units when property changes or form opens
  useEffect(() => {
    const prop = LIVE_PROPERTIES.find(p => p.id === addForm.propertyId);
    if (prop?._uuid) fetchUnits(prop._uuid).then(u => setAddFormUnits(u || [])).catch(() => {});
  }, [addForm.propertyId]);

  const detailTabs = ["Overview", "Household", "Lease & Docs", "Maintenance", "Payments", "Communications", "Notes"];

  // Load household members, docs, and payments when resident selected (hooks before conditional returns)
  const selectedResUuid = selectedResident?._uuid || null;
  const loadResidentExtra = useCallback(async () => {
    if (!selectedResUuid) { setHouseholdMembers([]); setResidentDocs([]); setResidentPayments([]); return; }
    fetchHouseholdMembers(selectedResUuid).then(setHouseholdMembers).catch(() => setHouseholdMembers([]));
    try {
      const { data: docs } = await supabase.from('lease_documents').select('*').eq('resident_id', selectedResUuid).order('uploaded_at', { ascending: false });
      setResidentDocs((docs || []).map(d => ({ id: d.id, name: d.name, type: d.type, size: d.size, uploadedAt: d.uploaded_at, uploadedBy: d.uploaded_by, storagePath: d.storage_path })));
    } catch (e) { setResidentDocs([]); }
    try {
      const { data: pays } = await supabase.from('rent_payments').select('*').eq('resident_id', selectedResUuid).order('payment_date', { ascending: false });
      setResidentPayments(pays || []);
    } catch (e) { setResidentPayments([]); }
  }, [selectedResUuid]);
  useEffect(() => { loadResidentExtra(); }, [loadResidentExtra]);

  if (selectedResident) {
    const ext = LIVE_RESIDENTS_EXTENDED[selectedResident.id] || {};
    const resMaintenance = maintenance.filter(m => m.unit === selectedResident.unit);
    const resThreads = threads.filter(t => t.participants.includes(selectedResident.id) || t.type === "broadcast");
    const resNotes = adminNotes[selectedResident.id] || [];
    const resEC = emergencyContacts[selectedResident.id] || [];

    const addNote = () => {
      if (!noteText.trim()) return;
      onAddAdminNote(selectedResident.id, { id: `AN-${Date.now()}`, date: new Date().toISOString().slice(0, 10), by: "Admin", text: noteText.trim() });
      setNoteText("");
      showSuccess("Note added!");
    };

    return (
      <div>
        <button onClick={() => { setSelectedResident(null); setTab("Overview"); }} style={{ ...s.btn("ghost"), marginBottom: 16 }}>&larr; Back to Directory</button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: T.white }}>
            {selectedResident.name.split(" ").map(n => n[0]).join("")}
          </div>
          <div>
            <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22, marginBottom: 2 }}>{selectedResident.name}</h1>
            <p style={{ ...s.sectionSub, marginBottom: 0 }}>Unit {selectedResident.unit} — {ext.status === "active" ? "Active Resident" : "Inactive"}</p>
          </div>
        </div>
        <SuccessMessage message={success} />
        <TabBar tabs={detailTabs} active={tab} onChange={setTab} mobile={mobile} />

        {tab === "Overview" && (() => {
          const [editing, setEditing] = [editingResident, setEditingResident];
          const ef = editResForm;
          return (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
              <button style={s.btn(editing ? "ghost" : "primary")} onClick={() => {
                if (!editing) {
                  setEditResForm({ name: selectedResident.name, phone: selectedResident.phone || "", email: selectedResident.email || "", preferredChannel: selectedResident.preferredChannel || "email", smsConsent: selectedResident.smsConsent || false, mailingStreet: selectedResident.mailingStreet || "", mailingCity: selectedResident.mailingCity || "", mailingState: selectedResident.mailingState || "CA", mailingZip: selectedResident.mailingZip || "", rentAmount: String(ext.rentAmount || ""), tenantPortion: String(ext.tenantPortion || ""), hapPayment: String(ext.hapPayment || ""), leaseStart: ext.leaseStart || "", leaseEnd: ext.leaseEnd || "", leaseType: ext.leaseType || "fixed" });
                }
                setEditing(!editing);
              }}>{editing ? "Cancel" : "✏️ Edit Resident"}</button>
              <button style={{ ...s.btn("ghost"), color: ext.status === "active" ? T.danger : T.success }} onClick={() => {
                const newStatus = ext.status === "active" ? "inactive" : "active";
                updateResident(selectedResident._uuid, { status: newStatus }).then(() => reloadData()).catch(err => console.warn(err));
                ext.status = newStatus;
                showSuccess(`Resident ${newStatus === "active" ? "reactivated" : "deactivated"}`);
              }}>{ext.status === "active" ? "🚫 Deactivate" : "✅ Reactivate"}</button>
              {selectedResident.email && (
                <button style={s.btn("ghost")} onClick={async () => {
                  if (!selectedResident.email) { showSuccess("No email address on file"); return; }
                  const resUuid = selectedResident._uuid || LIVE_RESIDENTS.find(r => r.id === selectedResident.id || r.name === selectedResident.name)?._uuid;
                  if (!resUuid) { showSuccess("Error: Could not find resident UUID. Try refreshing the page."); return; }
                  if (!confirm(`Invite ${selectedResident.name} (${selectedResident.email}) to log in to the portal?`)) return;
                  try {
                    await inviteUser(selectedResident.email, "resident", resUuid, selectedResident.name);
                    showSuccess(`Portal invite sent to ${selectedResident.email}! They can now sign in with a magic link.`);
                  } catch (err) {
                    if (err.message?.includes("duplicate") || err.message?.includes("unique")) showSuccess("This resident already has a portal account.");
                    else showSuccess("Error: " + (err.message || "Failed to create account"));
                  }
                }}>📧 Invite to Portal</button>
              )}
            </div>
            <div style={s.grid("1fr 1fr", mobile)}>
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Contact Information</div>
                {editing ? (<>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Name</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={ef.name || ""} onChange={e => setEditResForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Phone</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={ef.phone || ""} onChange={e => setEditResForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Email</label><input type="email" style={{ ...s.mInput(mobile), width: "100%" }} value={ef.email || ""} onChange={e => setEditResForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Preferred Channel</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={ef.preferredChannel || "email"} onChange={e => setEditResForm(f => ({ ...f, preferredChannel: e.target.value }))}><option value="email">Email</option><option value="sms">SMS</option><option value="both">Email + SMS</option><option value="phone">Phone</option></select></div>
                  <div style={{ marginBottom: 10, padding: "8px 12px", background: selectedResident.smsConsent ? T.successDim : T.warnDim, borderRadius: T.radiusSm, fontSize: 12, color: selectedResident.smsConsent ? T.success : T.warn }}>
                    {selectedResident.smsConsent ? "✓ SMS consent recorded by resident" : "⚠ SMS consent not yet provided by resident — resident must opt in from their portal"}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 12, marginBottom: 6, color: T.muted }}>Mailing Address</div>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Street / PO Box</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={ef.mailingStreet || ""} onChange={e => setEditResForm(f => ({ ...f, mailingStreet: e.target.value }))} placeholder="123 Main St or PO Box 456" /></div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 2 }}><label style={s.label}>City</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={ef.mailingCity || ""} onChange={e => setEditResForm(f => ({ ...f, mailingCity: e.target.value }))} /></div>
                    <div style={{ flex: 1 }}><label style={s.label}>State</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={ef.mailingState || "CA"} onChange={e => setEditResForm(f => ({ ...f, mailingState: e.target.value }))} maxLength={2} /></div>
                    <div style={{ flex: 1 }}><label style={s.label}>Zip</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={ef.mailingZip || ""} onChange={e => setEditResForm(f => ({ ...f, mailingZip: e.target.value }))} maxLength={10} /></div>
                  </div>
                </>) : (<>
                  <DetailRow label="Phone" value={selectedResident.phone} />
                  <DetailRow label="Email" value={selectedResident.email} />
                  <DetailRow label="Preferred Channel" value={(selectedResident.preferredChannel || "email").toUpperCase()} accent={T.accent} />
                  {selectedResident.mailingAddress && <DetailRow label="Mailing Address" value={selectedResident.mailingAddress} />}
                </>)}
              </div>
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Lease Details</div>
                {editing ? (<>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Monthly Rent</label><input type="number" step="0.01" style={{ ...s.mInput(mobile), width: "100%" }} value={ef.rentAmount || ""} onChange={e => setEditResForm(f => ({ ...f, rentAmount: e.target.value }))} /></div>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Tenant Portion</label><input type="number" step="0.01" style={{ ...s.mInput(mobile), width: "100%" }} value={ef.tenantPortion || ""} onChange={e => setEditResForm(f => ({ ...f, tenantPortion: e.target.value }))} /></div>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>HAP Payment</label><input type="number" step="0.01" style={{ ...s.mInput(mobile), width: "100%" }} value={ef.hapPayment || ""} onChange={e => setEditResForm(f => ({ ...f, hapPayment: e.target.value }))} /></div>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Lease Start</label><input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={ef.leaseStart || ""} onChange={e => setEditResForm(f => ({ ...f, leaseStart: e.target.value }))} /></div>
                  <div style={{ marginBottom: 10 }}><label style={s.label}>Lease Type</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={ef.leaseType || "fixed"} onChange={e => setEditResForm(f => ({ ...f, leaseType: e.target.value }))}><option value="fixed">Fixed Term</option><option value="month-to-month">Month-to-Month</option></select></div>
                  {(ef.leaseType || "fixed") === "fixed" && <div style={{ marginBottom: 10 }}><label style={s.label}>Lease End</label><input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={ef.leaseEnd || ""} onChange={e => setEditResForm(f => ({ ...f, leaseEnd: e.target.value }))} /></div>}
                  <button style={{ ...s.mBtn("primary", mobile), marginTop: 8 }} onClick={async () => {
                    try {
                      await updateResident(selectedResident._uuid, { name: ef.name, phone: ef.phone, email: ef.email, preferredChannel: ef.preferredChannel, smsConsent: ef.smsConsent, mailingStreet: ef.mailingStreet, mailingCity: ef.mailingCity, mailingState: ef.mailingState, mailingZip: ef.mailingZip });
                      let lease = null;
                      try { lease = await fetchResidentLease(selectedResident._uuid); } catch {}
                      if (lease) {
                        await updateLease(lease.id, { rentAmount: parseFloat(ef.rentAmount) || 0, tenantPortion: parseFloat(ef.tenantPortion) || 0, hapPayment: parseFloat(ef.hapPayment) || 0, startDate: ef.leaseStart || null, endDate: ef.leaseType === "month-to-month" ? null : (ef.leaseEnd || null), leaseType: ef.leaseType || "fixed" });
                      } else if (ef.rentAmount || ef.leaseStart) {
                        // No lease exists — create one, need unit UUID
                        const resRecord = LIVE_RESIDENTS.find(r => r._uuid === selectedResident._uuid) || selectedResident;
                        const unitUuid = resRecord?.unitId || selectedResident?.unitId || null;
                        // If no unit UUID, look it up from the resident's unit_id in Supabase
                        await insertLease({ residentId: selectedResident._uuid, unitId: unitUuid, rentAmount: parseFloat(ef.rentAmount) || 0, tenantPortion: parseFloat(ef.tenantPortion) || 0, hapPayment: parseFloat(ef.hapPayment) || 0, startDate: ef.leaseStart || new Date().toISOString().slice(0, 10), endDate: ef.leaseType === "month-to-month" ? null : (ef.leaseEnd || null), leaseType: ef.leaseType || "fixed" });
                      }
                      showSuccess("Resident updated!");
                      setEditing(false);
                      if (onResidentAdded) onResidentAdded();
                    } catch (err) { showSuccess("Error: " + err.message); }
                  }}>Save Changes</button>
                </>) : (<>
                  <DetailRow label="Unit" value={ext.unit || selectedResident.unit} />
                  <DetailRow label="Bedrooms" value={ext.bedrooms || "—"} />
                  <DetailRow label="Lease Type" value={ext.leaseType === "month-to-month" ? "Month-to-Month" : "Fixed Term"} />
                  <DetailRow label="Lease Start" value={ext.leaseStart || "—"} />
                  {ext.leaseType !== "month-to-month" && <DetailRow label="Lease End" value={ext.leaseEnd || "—"} />}
                  <DetailRow label="Rent" value={ext.rentAmount ? `$${ext.rentAmount}` : "—"} />
                  <DetailRow label="Tenant Portion" value={ext.tenantPortion ? `$${ext.tenantPortion}` : "—"} accent={T.accent} />
                  <DetailRow label="HAP" value={ext.hapPayment ? `$${ext.hapPayment}` : "—"} accent={T.success} />
                </>)}
              </div>
            </div>
            {(() => {
              const ledgerEntry = LIVE_RENT_LEDGER.find(l => l.residentId === selectedResident.id);
              return ledgerEntry ? (
                <div style={s.card}>
                  <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Payment Status</div>
                  <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 10 }}>
                    <StatCard label="Rent Due" value={`$${ledgerEntry.rentDue?.toLocaleString() || 0}`} mobile={mobile} />
                    <StatCard label="Tenant Paid" value={`$${ledgerEntry.tenantPaid?.toLocaleString() || 0}`} accent={T.success} mobile={mobile} />
                    <StatCard label="HAP Received" value={`$${ledgerEntry.hapReceived?.toLocaleString() || 0}`} accent={T.info} mobile={mobile} />
                    <StatCard label="Balance" value={`$${ledgerEntry.balance || 0}`} accent={ledgerEntry.balance > 0 ? T.danger : T.success} mobile={mobile} />
                  </div>
                  <span style={s.badge(
                    ledgerEntry.status === "paid" ? T.successDim : ledgerEntry.status === "partial" ? T.warnDim : T.dangerDim,
                    ledgerEntry.status === "paid" ? T.success : ledgerEntry.status === "partial" ? T.warn : T.danger
                  )}>{ledgerEntry.status === "paid" ? "Paid" : ledgerEntry.status === "partial" ? "Partial" : "Outstanding"}</span>
                </div>
              ) : null;
            })()}
            {resEC.length > 0 && (
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Emergency Contacts</div>
                {resEC.map(ec => (
                  <div key={ec.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.borderLight}` }}>
                    <div>
                      <span style={{ fontWeight: 600, marginRight: 10 }}>{ec.name}</span>
                      <span style={s.badge(T.accentDim, T.accent)}>{ec.relationship}</span>
                    </div>
                    <span style={{ color: T.muted, fontSize: 13 }}>{ec.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          ); })()}

        {tab === "Household" && (
          <div>
            <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}` }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Add Household Member</div>
              <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
                <div><label style={s.label}>Full Name *</label><input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="e.g. Luis Santos" value={hhForm.name} onChange={e => setHhForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label style={s.label}>Relationship</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={hhForm.relationship} onChange={e => setHhForm(f => ({ ...f, relationship: e.target.value }))}><option>Spouse</option><option>Partner</option><option>Roommate</option><option>Child</option><option>Parent</option><option>Sibling</option><option>Other</option></select></div>
                <div><label style={s.label}>Phone</label><input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="(415) 555-0000" value={hhForm.phone} onChange={e => setHhForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><label style={s.label}>Email</label><input type="email" style={{ ...s.mInput(mobile), width: "100%" }} placeholder="email@example.com" value={hhForm.email} onChange={e => setHhForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <button disabled={!hhForm.name.trim()} onClick={async () => {
                try {
                  await insertHouseholdMember({ residentId: selectedResident._uuid, name: hhForm.name.trim(), relationship: hhForm.relationship, phone: hhForm.phone, email: hhForm.email });
                  showSuccess(`Added ${hhForm.name}`);
                  setHhForm({ name: "", relationship: "Spouse", phone: "", email: "" });
                  fetchHouseholdMembers(selectedResident._uuid).then(setHouseholdMembers).catch(() => {});
                } catch (err) { showSuccess("Error: " + err.message); }
              }} style={{ ...s.mBtn("primary", mobile) }}>Add Member</button>
            </div>
            {householdMembers.length === 0 ? <EmptyState icon="👥" text="No household members on file. Add a spouse, partner, or roommate above." /> : (
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Household ({householdMembers.length + 1} total)</div>
                <div style={{ padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><span style={{ fontWeight: 600 }}>{selectedResident.name}</span><span style={{ color: T.muted, fontSize: 13, marginLeft: 10 }}>Head of Household</span></div>
                </div>
                {householdMembers.map(m => (
                  <div key={m.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>
                      <span style={{ color: T.muted, fontSize: 13, marginLeft: 10 }}>{m.relationship}</span>
                      {m.phone && <span style={{ color: T.dim, fontSize: 12, marginLeft: 14 }}>{m.phone}</span>}
                      {m.email && <span style={{ color: T.dim, fontSize: 12, marginLeft: 14 }}>{m.email}</span>}
                    </div>
                    <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 11, padding: "2px 8px" }} onClick={async () => {
                      try {
                        await deleteHouseholdMember(m.id);
                        setHouseholdMembers(prev => prev.filter(x => x.id !== m.id));
                        showSuccess(`Removed ${m.name}`);
                      } catch (err) { showSuccess("Error: " + err.message); }
                    }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Lease & Docs" && (
          <div>
            <div style={s.grid("1fr 1fr", mobile)}>
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Lease Details</div>
                <DetailRow label="Unit" value={ext.unit || selectedResident.unit} />
                <DetailRow label="Bedrooms" value={ext.bedrooms || "—"} />
                <DetailRow label="Move-In Date" value={ext.moveIn || "—"} />
                <DetailRow label="Lease Start" value={ext.leaseStart || "—"} />
                <DetailRow label="Lease End" value={ext.leaseEnd || "—"} />
                {ext.leaseEnd && new Date(ext.leaseEnd) < new Date() && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: T.dangerDim, borderRadius: T.radiusSm, fontSize: 12, color: T.danger, fontWeight: 600 }}>Lease expired — renewal needed</div>
                )}
              </div>
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Rent & HAP</div>
                <DetailRow label="Total Rent" value={ext.rentAmount ? `$${ext.rentAmount}/mo` : "—"} />
                <DetailRow label="Tenant Portion" value={ext.tenantPortion ? `$${ext.tenantPortion}/mo` : "—"} accent={T.accent} />
                <DetailRow label="HAP Payment" value={ext.hapPayment ? `$${ext.hapPayment}/mo` : "—"} accent={T.success} />
                {ext.rentAmount && (
                  <div style={{ marginTop: 12, padding: 10, background: T.bg, borderRadius: T.radiusSm }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <div style={{ width: `${((ext.hapPayment || 0) / ext.rentAmount) * 100}%`, height: 20, background: THEMES.light.success, borderRadius: "4px 0 0 4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.white, fontWeight: 600 }}>HAP</div>
                      <div style={{ width: `${((ext.tenantPortion || 0) / ext.rentAmount) * 100}%`, height: 20, background: THEMES.light.accent, borderRadius: "0 4px 4px 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.white, fontWeight: 600 }}>Tenant</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Documents</div>
                <label style={{ ...s.btn("primary"), fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  📎 Upload Document
                  <input type="file" accept=".pdf,.doc,.docx,.jpg,.png" style={{ display: "none" }} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedResident._uuid) return;
                    try {
                      const storagePath = await uploadLeaseFile(file, selectedResident.slug || selectedResident.id);
                      const url = storagePath ? getLeaseFileUrl(storagePath) : null;
                      await insertLeaseDocument({ name: file.name, type: "other", size: file.size, storagePath: storagePath }, selectedResident._uuid);
                      showSuccess(`Uploaded ${file.name}`);
                      await loadResidentExtra(); // refresh docs locally
                    } catch (err) { showSuccess("Error: " + err.message); }
                    e.target.value = "";
                  }} />
                </label>
              </div>
              {(() => {
                const docs = residentDocs;
                if (docs.length === 0) return <EmptyState icon="📄" text="No documents on file. Upload a document above." />;
                return (
                  <table style={s.table}>
                    <thead><tr>{["Document", "Type", "Uploaded", "Size", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {docs.map(d => (
                        <tr key={d.id}>
                          <td style={s.td}><span style={{ fontWeight: 600 }}>{d.name}</span></td>
                          <td style={s.td}><span style={s.badge(T.infoDim, T.info)}>{LEASE_DOC_TYPES[d.type] || d.type}</span></td>
                          <td style={s.td}>{new Date(d.uploadedAt).toLocaleDateString()}</td>
                          <td style={s.td}>{d.size ? `${Math.round(d.size / 1024)} KB` : "—"}</td>
                          <td style={s.td}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button style={s.btn("ghost")} onClick={async () => {
                                if (d.storagePath) {
                                  try {
                                    const url = await getLeaseFileUrl(d.storagePath);
                                    if (url) window.open(url, "_blank");
                                    else showSuccess("File not found in storage");
                                  } catch (err) { showSuccess("Error opening file"); }
                                } else { showSuccess("No file stored — metadata only"); }
                              }}>View</button>
                              <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 11 }} onClick={async () => {
                                try { await deleteLeaseDocument(d.id); showSuccess("Deleted"); await loadResidentExtra(); } catch (err) { showSuccess("Error: " + err.message); }
                              }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        )}

        {tab === "Maintenance" && (
          <div>
            {resMaintenance.length === 0 ? <EmptyState icon="🔧" text="No maintenance requests for this unit" /> : resMaintenance.map(m => (
              <div key={m.id} style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div><span style={{ fontWeight: 700, marginRight: 10 }}>{m.id}</span><span style={{ color: T.muted }}>{m.category}</span></div>
                  <div style={{ display: "flex", gap: 8 }}><Badge status={m.priority} type="priority" /><Badge status={m.status} /></div>
                </div>
                <div style={{ fontSize: 14, marginBottom: 6 }}>{m.description}</div>
                <div style={{ display: "flex", gap: 20, fontSize: 13, color: T.muted }}>
                  <span>Submitted: {m.submitted}</span>
                  {m.assignedTo && <span>Assigned: {m.assignedTo}</span>}
                </div>
                {(Array.isArray(m.notes) ? m.notes : []).length > 0 && (
                  <div style={{ marginTop: 10, padding: 10, background: T.bg, borderRadius: T.radiusSm }}>
                    {(Array.isArray(m.notes) ? m.notes : []).map((n, i) => <div key={i} style={{ fontSize: 12, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{n.by}</span> ({n.date}): {n.text}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "Payments" && (() => {
          const ledgerEntry = (sbRentLedger || LIVE_RENT_LEDGER).find(l => l.residentId === selectedResident.id);
          return (
          <div>
            {ledgerEntry && (
              <div style={{ ...s.card, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Current Balance</div>
                <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap" }}>
                  <StatCard label="Rent Due" value={`$${ledgerEntry.rentDue?.toLocaleString() || 0}`} mobile={mobile} />
                  <StatCard label="Tenant Paid" value={`$${ledgerEntry.tenantPaid?.toLocaleString() || 0}`} accent={T.success} mobile={mobile} />
                  <StatCard label="HAP Received" value={`$${ledgerEntry.hapReceived?.toLocaleString() || 0}`} accent={T.info} mobile={mobile} />
                  <StatCard label="Balance" value={`$${ledgerEntry.balance || 0}`} accent={ledgerEntry.balance > 0 ? T.danger : T.success} mobile={mobile} />
                </div>
              </div>
            )}
            <div style={{ ...s.card, borderLeft: `3px solid ${T.success}` }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Record Payment</div>
              {(() => {
                const [pAmt, setPAmt] = [payForm?.amount || "", (v) => setPayForm(f => ({ ...f, amount: v }))];
                return (
                <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
                  <div><label style={s.label}>Amount ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} style={{ ...s.mInput(mobile), width: "100%" }} /></div>
                  <div><label style={s.label}>Method</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}><option value="cash">Cash</option><option value="check">Check</option><option value="money_order">Money Order</option></select></div>
                  <div><label style={s.label}>Date</label><input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} style={{ ...s.mInput(mobile), width: "100%" }} /></div>
                </div>
                );
              })()}
              <div style={{ marginBottom: 14 }}><label style={s.label}>Note</label><input type="text" placeholder="e.g. Check #1234" value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} style={{ ...s.mInput(mobile), width: "100%" }} /></div>
              <button disabled={!payForm.amount} onClick={async () => {
                const amt = parseFloat(payForm.amount);
                if (!amt || !selectedResident._uuid) return;
                try {
                  await recordPayment({ residentSlug: selectedResident.id, amount: amt, method: payForm.method, paymentDate: payForm.date, note: payForm.note });
                  showSuccess(`Recorded $${amt.toFixed(2)} ${payForm.method} payment`);
                  setPayForm({ residentId: "", amount: "", method: "cash", payType: "rent", date: new Date().toISOString().slice(0, 10), note: "" });
                  loadResidentExtra(); // refresh payments locally
                  if (onDataChanged) onDataChanged();
                } catch (err) { showSuccess("Error: " + err.message); }
              }} style={{ ...s.mBtn("primary", mobile) }}>Record Payment</button>
            </div>
            {residentPayments.length > 0 && (
              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Payment History ({residentPayments.length})</div>
                <SortableTable mobile={mobile} keyField="id" columns={[
                  { key: "payment_date", label: "Date", render: v => v || "—" },
                  { key: "amount", label: "Amount", render: v => <span style={{ fontWeight: 600, color: T.success }}>${parseFloat(v).toFixed(2)}</span>, sortValue: r => parseFloat(r.amount) },
                  { key: "method", label: "Method", render: v => <span style={s.badge(T.accentDim, T.accent)}>{(v || "").replace("_", " ")}</span>, filterOptions: ["cash", "check", "money_order", "hap"] },
                  { key: "month", label: "Period", render: v => v || "—" },
                  { key: "note", label: "Note", render: v => v || "—", filterable: false },
                  { key: "recorded_by", label: "Recorded By", filterable: false },
                ]} data={residentPayments} />
              </div>
            )}
          </div>
          );
        })()}

        {tab === "Communications" && (
          <div>
            <div style={{ ...s.card, borderLeft: `3px solid ${T.info}`, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Send Message to {selectedResident.name.split(" ")[0]}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[{ id: "email", label: "📧 Email" }, { id: "sms", label: "📱 SMS" }, { id: "both", label: "📧+📱 Both" }].map(ch => (
                  <button key={ch.id} onClick={() => setMsgChannel(ch.id)} style={{ ...s.btn(msgChannel === ch.id ? "primary" : "ghost"), fontSize: 12 }}>{ch.label}</button>
                ))}
              </div>
              {(msgChannel) !== "sms" && (
                <div style={{ marginBottom: 14 }}><label style={s.label}>Subject</label><input type="text" placeholder="e.g. Lease renewal reminder" value={msgSubject} onChange={e => setMsgSubject(e.target.value)} style={{ ...s.mInput(mobile), width: "100%" }} /></div>
              )}
              <div style={{ marginBottom: 14 }}><label style={s.label}>{(msgChannel) === "sms" ? "SMS Message (160 chars)" : "Message"}</label><textarea placeholder="Type your message..." value={msgBody} onChange={e => setMsgBody(e.target.value)} style={{ ...s.mInput(mobile), width: "100%", minHeight: (msgChannel) === "sms" ? 60 : 80, resize: "vertical" }} />
                {(msgChannel) === "sms" && <div style={{ fontSize: 11, color: msgBody.length > 160 ? T.danger : T.dim, marginTop: 4 }}>{msgBody.length}/160</div>}
              </div>
              <button disabled={!msgBody.trim() || ((msgChannel) !== "sms" && !msgSubject.trim())} onClick={async () => {
                const channel = msgChannel;
                try {
                  if (channel === "email" && selectedResident.email) {
                    await sendNotification("custom", { to: selectedResident.email, subject: msgSubject, body: msgBody });
                  } else if (channel === "sms" && selectedResident.phone) {
                    const result = await sendSMS(selectedResident.phone, msgBody);
                    if (!result?.success) throw new Error(result?.error || "SMS failed");
                  } else if (channel === "both") {
                    await sendBoth({ email: selectedResident.email, phone: selectedResident.phone, subject: msgSubject, emailBody: msgBody, smsBody: msgBody });
                  } else {
                    throw new Error(channel === "sms" ? "No phone number on file" : "No email on file");
                  }
                  // Log the communication as a thread
                  const threadId = `THR-${Date.now()}`;
                  const now = new Date().toISOString();
                  if (onAddThread) onAddThread({
                    id: threadId, participants: [selectedResident.id], subject: msgSubject || `${channel.toUpperCase()} to ${selectedResident.name}`,
                    lastMessage: msgBody.slice(0, 100), lastDate: now, unread: 0, channel: channel === "both" ? "multi" : channel, type: "direct",
                  });
                  if (onAddMessage) onAddMessage({
                    id: `MSG-${Date.now()}`, threadId, from: "admin", body: msgBody, date: now, status: "delivered",
                  });
                  showSuccess(`${channel === "both" ? "Email + SMS" : channel === "sms" ? "SMS" : "Email"} sent to ${selectedResident.name}`);
                  setMsgSubject(""); setMsgBody("");
                } catch (err) { showSuccess("Error: " + err.message); }
              }} style={{ ...s.mBtn("primary", mobile) }}>Send {(msgChannel) === "both" ? "Email + SMS" : (msgChannel) === "sms" ? "SMS" : "Email"}</button>
              {msgChannel !== "email" && !selectedResident.phone && <div style={{ color: T.warn, fontSize: 12, marginTop: 8 }}>⚠ No phone number on file for this resident</div>}
              {msgChannel !== "email" && selectedResident.phone && !selectedResident.smsConsent && <div style={{ color: T.warn, fontSize: 12, marginTop: 8 }}>⚠ SMS consent not recorded. Go to Edit Resident → Preferred Channel to record opt-in.</div>}
              {(msgChannel) !== "sms" && !selectedResident.email && <div style={{ color: T.warn, fontSize: 12, marginTop: 8 }}>⚠ No email on file for this resident</div>}
            </div>
            {resThreads.length === 0 ? <EmptyState icon="💬" text="No communication threads yet" /> : resThreads.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate)).map(t => (
              <div key={t.id} style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{t.subject}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={s.badge(T.accentDim, T.accent)}>{t.channel}</span>
                    {t.type === "broadcast" && <span style={s.badge(T.infoDim, T.info)}>Broadcast</span>}
                    {t.unread > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>{t.lastMessage}</div>
                <div style={{ fontSize: 12, color: T.dim }}>{new Date(t.lastDate).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "Notes" && (
          <div>
            <div style={{ ...s.card, borderColor: T.accent }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Add Note</div>
              <textarea style={{ ...s.mInput(mobile), minHeight: 80, resize: "vertical", marginBottom: 14 }} placeholder="Add an internal note about this resident..." value={noteText} onChange={e => setNoteText(e.target.value)} />
              <button style={s.btn()} onClick={addNote}>Add Note</button>
            </div>
            {resNotes.length === 0 ? <EmptyState icon="📝" text="No notes for this resident" /> : resNotes.slice().reverse().map(n => (
              <div key={n.id} style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{n.by}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: T.dim, fontSize: 12 }}>{n.date}</span>
                    <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "2px 8px", color: T.danger }} onClick={() => {
                      onAddAdminNote(selectedResident.id, resNotes.filter(x => x.id !== n.id), true);
                      showSuccess("Note deleted");
                    }}>Delete</button>
                  </div>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>{n.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22, marginBottom: 0 }}>Residents</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowAddForm(v => !v)} style={{ ...s.btn(showAddForm ? "ghost" : "primary"), fontSize: 13 }}>
            {showAddForm ? "Cancel" : "➕ Add Resident"}
          </button>
          <ExportButton mobile={mobile} onClick={() => generateCSV(
          [{ label: "Name", key: "name" }, { label: "Unit", key: "unit" }, { label: "BR", key: "bedrooms" }, { label: "Rent", key: "rentAmount" }, { label: "Lease Start", key: "leaseStart" }, { label: "Lease End", key: "leaseEnd" }, { label: "Phone", key: "phone" }, { label: "Email", key: "email" }],
          filterByProperty(LIVE_RESIDENTS, selectedProperty).map(r => ({ ...r, ...(LIVE_RESIDENTS_EXTENDED[r.id] || {}) })), "residents"
        )} />
        </div>
      </div>
      {showAddForm && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>New Resident</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>First Name *</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.firstName || ""} onChange={e => setAddForm(p => ({ ...p, firstName: e.target.value, name: e.target.value + " " + (p.lastName || "") }))} placeholder="First" /></div>
            <div><label style={s.label}>Last Name *</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.lastName || ""} onChange={e => setAddForm(p => ({ ...p, lastName: e.target.value, name: (p.firstName || "") + " " + e.target.value }))} placeholder="Last" /></div>
            <div><label style={s.label}>Property *</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={addForm.propertyId} onChange={e => { setAddForm(p => ({ ...p, propertyId: e.target.value, unitId: "" })); const pr = LIVE_PROPERTIES.find(x => x.id === e.target.value); if (pr?._uuid) fetchUnits(pr._uuid).then(u => setAddFormUnits(u || [])).catch(() => {}); }}>
                {LIVE_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Unit *</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={addForm.unitId || ""} onChange={e => setAddForm(p => ({ ...p, unitId: e.target.value, unit: addFormUnits.find(u => u.id === e.target.value)?.number || "" }))}>
                <option value="">Select unit...</option>
                {addFormUnits.map(u => <option key={u.id} value={u.id}>{u.number} ({u.bedrooms}BR)</option>)}
              </select>
            </div>
            <div><label style={s.label}>Phone</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} placeholder="(415) 555-0000" /></div>
            <div><label style={s.label}>Email</label><input type="email" style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder="name@email.com" /></div>
            <div><label style={s.label}>Bedrooms</label><input type="number" min="0" max="5" style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.bedrooms} onChange={e => setAddForm(p => ({ ...p, bedrooms: e.target.value }))} /></div>
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: T.muted }}>Lease Details</div>
          <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>Monthly Rent</label><input type="number" step="0.01" style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.rentAmount} onChange={e => setAddForm(p => ({ ...p, rentAmount: e.target.value }))} placeholder="0.00" /></div>
            <div><label style={s.label}>Tenant Portion</label><input type="number" step="0.01" style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.tenantPortion} onChange={e => setAddForm(p => ({ ...p, tenantPortion: e.target.value }))} placeholder="0.00" /></div>
            <div><label style={s.label}>HAP Payment</label><input type="number" step="0.01" style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.hapPayment} onChange={e => setAddForm(p => ({ ...p, hapPayment: e.target.value }))} placeholder="0.00" /></div>
            <div><label style={s.label}>Lease Start</label><input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.leaseStart} onChange={e => setAddForm(p => ({ ...p, leaseStart: e.target.value }))} /></div>
            <div><label style={s.label}>Lease Type</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={addForm.leaseType || "fixed"} onChange={e => setAddForm(p => ({ ...p, leaseType: e.target.value }))}><option value="fixed">Fixed Term</option><option value="month-to-month">Month-to-Month</option></select></div>
            {(addForm.leaseType || "fixed") === "fixed" && <div><label style={s.label}>Lease End</label><input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.leaseEnd} onChange={e => setAddForm(p => ({ ...p, leaseEnd: e.target.value }))} /></div>}
          </div>
          <button disabled={!addForm.name || !addForm.unit || adding} onClick={async () => {
            setAdding(true);
            try {
              const prop = LIVE_PROPERTIES.find(p => p.id === addForm.propertyId);
              if (!prop?._uuid) throw new Error("Select a property");
              if (!addForm.unitId) throw new Error("Select a unit");
              const resData = await insertResident({
                name: addForm.name, phone: addForm.phone, email: addForm.email,
                preferredChannel: "email", status: "active", moveInDate: addForm.leaseStart || null,
              }, prop._uuid, addForm.unitId);
              // Create lease
              if (addForm.rentAmount && addForm.leaseStart) {
                await insertLease({
                  startDate: addForm.leaseStart, endDate: addForm.leaseEnd || null, leaseType: addForm.leaseType || "fixed",
                  rentAmount: parseFloat(addForm.rentAmount) || 0,
                  tenantPortion: parseFloat(addForm.tenantPortion) || 0,
                  hapPayment: parseFloat(addForm.hapPayment) || 0,
                }, resData.id, addForm.unitId);
              }
              showSuccess(`Added ${addForm.name}`);
              setShowAddForm(false);
              setAddForm({ name: "", unit: "", unitId: "", phone: "", email: "", propertyId: defaultPropId, bedrooms: "1", rentAmount: "", tenantPortion: "", hapPayment: "", leaseStart: "", leaseEnd: "" });
              if (onResidentAdded) onResidentAdded();
            } catch (err) {
              showSuccess("Error: " + (err.message || "Failed to add resident"));
            } finally { setAdding(false); }
          }} disabled={adding || !addForm.name.trim()} style={{ ...s.mBtn("primary", mobile), opacity: adding ? 0.6 : 1 }}>{adding ? "Adding..." : "Add Resident"}</button>
        </div>
      )}
      {(() => {
        const fr = filterByProperty(LIVE_RESIDENTS, selectedProperty).map(r => ({ ...r, ...(LIVE_RESIDENTS_EXTENDED[r.id] || {}) }));
        const propLabel = selectedProperty === "all" ? "All Properties" : getProperty(selectedProperty).name;
        return (<>
      <p style={s.sectionSub}>{propLabel} — {fr.length} Residents</p>
      <SuccessMessage message={success} />
      <SortableTable
        mobile={mobile}
        columns={[
          { key: "name", label: "Name", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: "unit", label: "Unit" },
          ...(selectedProperty === "all" ? [{ key: "propertyId", label: "Property", render: v => getProperty(v)?.name?.split(" ")[0] || v }] : []),
          { key: "bedrooms", label: "BR", render: v => v ? `${v}BR` : "—" },
          { key: "rentAmount", label: "Rent", render: v => v ? `$${v.toLocaleString()}` : "—" },
          { key: "leaseEnd", label: "Lease End", render: v => {
            if (!v) return "—";
            const exp = new Date(v) < new Date();
            const soon = !exp && new Date(v) < new Date(Date.now() + 90 * 86400000);
            return <span style={{ fontWeight: exp || soon ? 600 : 400, color: exp ? T.danger : soon ? T.warn : T.text }}>{v}{exp ? " !" : ""}</span>;
          }},
          { key: "_status", label: "Status", sortable: false, filterable: false, render: (_, row) => {
            const s2 = row.status || "active";
            return <span style={s.badge(s2 === "active" ? T.successDim : T.dimLight, s2 === "active" ? T.success : T.muted)}>{s2.charAt(0).toUpperCase() + s2.slice(1)}</span>;
          }},
        ]}
        data={fr}
        keyField="id"
        onRowClick={(row) => { setSelectedResident(row); setTab("Overview"); }}
      />
      </>); })()}
    </div>
  );
};

// --- PROPERTY DETAILS (Admin) ---
const PropertyCard = ({ p, mobile, onSelect }) => {
  const residents = LIVE_RESIDENTS.filter(r => r.propertyId === p.id);
  const maint = MOCK_MAINTENANCE.filter(m => m.propertyId === p.id);
  const openMaint = maint.filter(m => m.status !== "completed").length;
  const ledger = LIVE_RENT_LEDGER.filter(r => r.propertyId === p.id);
  const rentRoll = ledger.reduce((s, r) => s + r.rentDue, 0);
  const collected = ledger.reduce((s, r) => s + r.tenantPaid + r.hapReceived, 0);
  const collRate = rentRoll ? Math.round((collected / rentRoll) * 100) : 0;
  const occupancy = p.totalUnits > 0 ? Math.round((residents.length / p.totalUnits) * 100) : 0;
  return (
    <div style={{ ...s.card, cursor: onSelect ? "pointer" : undefined }} onClick={onSelect}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{p.address}</div>
        </div>
        <span style={s.badge(T.accentDim, T.accent)}>{p.type}</span>
      </div>
      <div style={{ display: "flex", gap: mobile ? 8 : 12, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          { label: "Units", value: p.totalUnits, color: T.accent },
          { label: "Residents", value: residents.length, color: T.info },
          { label: "Occupancy", value: `${occupancy}%`, color: occupancy >= 90 ? T.success : T.warn },
          { label: "Open W/O", value: openMaint, color: openMaint > 0 ? T.warn : T.success },
        ].map(stat => (
          <div key={stat.label} style={{ flex: 1, minWidth: 70, padding: "8px 10px", background: T.bg, borderRadius: T.radiusSm, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: T.muted }}>{stat.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${T.borderLight}` }}>
        <div style={{ fontSize: 12, color: T.muted }}>Rent Roll: <span style={{ fontWeight: 600, color: T.text }}>${rentRoll.toLocaleString()}/mo</span></div>
        <div style={{ fontSize: 12, color: T.muted }}>Collection: <span style={{ fontWeight: 600, color: collRate >= 95 ? T.success : collRate >= 80 ? T.warn : T.danger }}>{collRate}%</span></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ fontSize: 12, color: T.dim }}>Manager: {p.manager}</div>
        {onSelect && <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>View Details →</span>}
      </div>
    </div>
  );
};

const PropertySingleView = ({ p, mobile }) => (
  <>
    <div style={s.grid("1fr 1fr", mobile)}>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Physical Data</div>
        <DetailRow label="Building Type" value={p.type} />
        <DetailRow label="Year Built" value={p.yearBuilt} />
        <DetailRow label="Last Renovation" value={p.lastRenovation || "—"} />
        <DetailRow label="Total Units" value={p.totalUnits} />
        <DetailRow label="Total Building SF" value={`${p.totalSF.toLocaleString()} sq ft`} />
        <DetailRow label="Common Area SF" value={`${p.commonAreaSF.toLocaleString()} sq ft`} />
        <DetailRow label="Lot Size" value={p.lotSize} />
        <DetailRow label="ADA-Accessible Units" value={p.adaUnits} />
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Unit Breakdown</div>
        {Object.entries(p.unitBreakdown).map(([type, count]) => (
          <DetailRow key={type} label={type} value={`${count} units`} />
        ))}
        <div style={{ marginTop: 16, padding: 12, background: T.bg, borderRadius: T.radiusSm, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 8 }}>
            {Object.entries(p.unitBreakdown).map(([type, count]) => (
              <div key={type} style={{ width: `${(count / p.totalUnits) * 200}px`, height: 24, background: type === "1BR" ? T.accent : type === "2BR" ? T.success : type === "3BR" ? T.warn : T.info, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: T.white }}>{count}</div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.dim }}>Unit distribution</div>
        </div>
      </div>
    </div>
    <div style={s.card}>
      <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Property Management</div>
      <DetailRow label="Manager" value={p.manager} />
      <DetailRow label="Phone" value={p.managerPhone} />
      <DetailRow label="Email" value={p.managerEmail} />
      <DetailRow label="Office Hours" value={p.officeHours} />
    </div>
    <div style={s.card}>
      <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Property Documents & Plans</div>
      <table style={s.table}>
        <thead><tr>{["Document", "Type", "Uploaded", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {(p.documents || []).map((d, i) => (
            <tr key={i}>
              <td style={s.td}><span style={{ fontWeight: 600 }}>{d.name}</span></td>
              <td style={s.td}><span style={s.badge(T.infoDim, T.info)}>{d.type}</span></td>
              <td style={s.td}>{d.uploaded}</td>
              <td style={s.td}><button style={s.btn("ghost")}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

const PropertyDetails = ({ leaseDocs, setLeaseDocs, mobile, selectedProperty, onSelectProperty, onDataRefresh, settings }) => {
  const isAll = !selectedProperty || selectedProperty === "all";
  const totalUnits = LIVE_PROPERTIES.reduce((s, p) => s + p.totalUnits, 0);
  const totalResidents = LIVE_RESIDENTS.length;
  const totalSF = LIVE_PROPERTIES.reduce((s, p) => s + p.totalSF, 0);
  const [showAddProp, setShowAddProp] = useState(false);
  const [propForm, setPropForm] = useState({ name: "", address: "", type: "", totalUnits: "", totalSF: "" });
  const [propSuccess, showPropSuccess] = useSuccess();
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ number: "", bedrooms: "1", bathrooms: "1", sqft: "", isRv: false, rvInfo: {} });
  const [unitSuccess, showUnitSuccess] = useSuccess();
  const [unitList, setUnitList] = useState([]);
  const [editingUnit, setEditingUnit] = useState(null);
  const [editUnitForm, setEditUnitForm] = useState({});
  const [showEditProp, setShowEditProp] = useState(false);
  const [editPropForm, setEditPropForm] = useState({});

  // Load units for selected property (must be before early return to satisfy hooks rules)
  const p = !isAll ? getProperty(selectedProperty) : null;
  useEffect(() => {
    if (p?._uuid) fetchUnits(p._uuid).then(setUnitList).catch(() => {});
  }, [p?._uuid]);

  if (isAll) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <div>
            <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Property Portfolio</h1>
            <p style={s.sectionSub}>BCLT — {LIVE_PROPERTIES.length} Properties · {totalUnits} Units · {totalSF.toLocaleString()} SF</p>
          </div>
          <button onClick={() => setShowAddProp(v => !v)} style={{ ...s.btn(showAddProp ? "ghost" : "primary"), fontSize: 13 }}>
            {showAddProp ? "Cancel" : "➕ Add Property"}
          </button>
        </div>
        {showAddProp && (
          <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>New Property</div>
            <SuccessMessage message={propSuccess} />
            <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
              <div><label style={s.label}>Property Name *</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.name} onChange={e => setPropForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Wharf Road Apartments" /></div>
              <div><label style={s.label}>Street Address</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.street || ""} onChange={e => setPropForm(p => ({ ...p, street: e.target.value }))} placeholder="123 Main St" /></div>
              <div><label style={s.label}>City</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.city || ""} onChange={e => setPropForm(p => ({ ...p, city: e.target.value }))} placeholder="Bolinas" /></div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}><label style={s.label}>State</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.state || "CA"} onChange={e => setPropForm(p => ({ ...p, state: e.target.value }))} placeholder="CA" maxLength={2} /></div>
                <div style={{ flex: 1 }}><label style={s.label}>Zip</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.zip || ""} onChange={e => setPropForm(p => ({ ...p, zip: e.target.value }))} placeholder="94924" maxLength={10} /></div>
              </div>
              <div><label style={s.label}>Type</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.type} onChange={e => setPropForm(p => ({ ...p, type: e.target.value }))} placeholder="e.g. Garden-Style Apartments" /></div>
              <div><label style={s.label}>Total Units</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.totalUnits} onChange={e => setPropForm(p => ({ ...p, totalUnits: e.target.value }))} /></div>
              <div><label style={s.label}>Total SF</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.totalSF} onChange={e => setPropForm(p => ({ ...p, totalSF: e.target.value }))} /></div>
            </div>
            <button disabled={!propForm.name.trim()} onClick={async () => {
              try {
                await insertProperty({ ...propForm, totalUnits: parseInt(propForm.totalUnits) || 0, totalSF: parseInt(propForm.totalSF) || 0 });
                showPropSuccess(`Property "${propForm.name}" created!`);
                setPropForm({ name: "", street: "", city: "", state: "CA", zip: "", type: "", totalUnits: "", totalSF: "" });
                if (onDataRefresh) onDataRefresh();
                setTimeout(() => setShowAddProp(false), 1500);
              } catch (err) { showPropSuccess("Error: " + err.message); }
            }} style={{ ...s.mBtn("primary", mobile) }}>Create Property</button>
          </div>
        )}
        <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 20 }}>
          <StatCard label="Properties" value={LIVE_PROPERTIES.length} mobile={mobile} />
          <StatCard label="Total Units" value={totalUnits} accent={T.accent} mobile={mobile} />
          <StatCard label="Total Residents" value={totalResidents} accent={T.info} mobile={mobile} />
          <StatCard label="Total SF" value={totalSF.toLocaleString()} accent={T.success} mobile={mobile} />
        </div>
        {LIVE_PROPERTIES.length === 0 && <EmptyState icon="🏘️" text="No properties yet. Click Add Property above to get started." />}
        {LIVE_PROPERTIES.map(p => <PropertyCard key={p.id} p={p} mobile={mobile} onSelect={() => onSelectProperty?.(p.id, "property")} />)}
      </div>
    );
  }

  if (!p) return <EmptyState icon="🏘️" text="Property not found" />;
  const propResidents = LIVE_RESIDENTS.filter(r => r.propertyId === selectedProperty);

  return (
    <div>
      {onSelectProperty && <button onClick={() => onSelectProperty("all", "property")} style={{ ...s.btn("ghost"), marginBottom: 12, fontSize: 13 }}>← All Properties</button>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <div>
          <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>{p.name}</h1>
          <p style={s.sectionSub}>{p.address}</p>
        </div>
        {onSelectProperty && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={s.btn()} onClick={() => onSelectProperty(selectedProperty, "residents")}>👥 Residents ({propResidents.length})</button>
            <button style={s.btn("ghost")} onClick={() => onSelectProperty(selectedProperty, "financial")}>💰 Financials</button>
            <button style={s.btn("ghost")} onClick={() => setShowAddUnit(v => !v)}>{showAddUnit ? "Cancel" : "🏠 Add Unit"}</button>
            <button style={s.btn("ghost")} onClick={() => { setShowAddProp(v => !v); }}>{showAddProp ? "Cancel" : "➕ Add Property"}</button>
            <button style={{ ...s.btn("ghost"), color: T.danger }} onClick={async () => {
              if (!confirm(`Delete "${p.name}" and all its units? This cannot be undone.`)) return;
              try {
                await deleteProperty(p._uuid);
                if (onDataRefresh) await onDataRefresh();
                if (onSelectProperty) onSelectProperty("all", "property");
              } catch (err) { alert("Error: " + err.message); }
            }}>🗑️ Delete Property</button>
          </div>
        )}
      </div>
      {showAddProp && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>New Property</div>
          <SuccessMessage message={propSuccess} />
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>Property Name *</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.name} onChange={e => setPropForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mesa Road Townhomes" /></div>
            <div><label style={s.label}>Address</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.address} onChange={e => setPropForm(f => ({ ...f, address: e.target.value }))} placeholder="456 Mesa Rd, Bolinas, CA" /></div>
            <div><label style={s.label}>Type</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.type} onChange={e => setPropForm(f => ({ ...f, type: e.target.value }))} placeholder="e.g. Townhomes" /></div>
            <div><label style={s.label}>Total Units</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.totalUnits} onChange={e => setPropForm(f => ({ ...f, totalUnits: e.target.value }))} /></div>
            <div><label style={s.label}>Total SF</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={propForm.totalSF} onChange={e => setPropForm(f => ({ ...f, totalSF: e.target.value }))} /></div>
          </div>
          <button disabled={!propForm.name.trim()} onClick={async () => {
            try {
              await insertProperty({ ...propForm, totalUnits: parseInt(propForm.totalUnits) || 0, totalSF: parseInt(propForm.totalSF) || 0 });
              showPropSuccess(`Property "${propForm.name}" created!`);
              setPropForm({ name: "", address: "", type: "", totalUnits: "", totalSF: "" });
              setShowAddProp(false);
              if (onDataRefresh) onDataRefresh();
            } catch (err) { showPropSuccess("Error: " + err.message); }
          }} style={{ ...s.mBtn("primary", mobile) }}>Create Property</button>
        </div>
      )}
      {showAddUnit && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.info}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Add Unit to {p.name}</div>
          <SuccessMessage message={unitSuccess} />
          <div style={{ ...s.grid("1fr 1fr 1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>Unit Number *</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={unitForm.number} onChange={e => setUnitForm(u => ({ ...u, number: e.target.value }))} placeholder="e.g. A-101" /></div>
            <div><label style={s.label}>Bedrooms</label><input type="number" min="0" style={{ ...s.mInput(mobile), width: "100%" }} value={unitForm.bedrooms} onChange={e => setUnitForm(u => ({ ...u, bedrooms: e.target.value }))} /></div>
            <div><label style={s.label}>Bathrooms</label><input type="number" min="0" style={{ ...s.mInput(mobile), width: "100%" }} value={unitForm.bathrooms} onChange={e => setUnitForm(u => ({ ...u, bathrooms: e.target.value }))} /></div>
            <div><label style={s.label}>Sqft</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={unitForm.sqft} onChange={e => setUnitForm(u => ({ ...u, sqft: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              <input type="checkbox" checked={unitForm.isRv} onChange={e => setUnitForm(u => ({ ...u, isRv: e.target.checked, rvInfo: e.target.checked ? u.rvInfo : {} }))} />
              Is RV Unit
            </label>
          </div>
          {unitForm.isRv && (
            <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, color: T.accent }}>RV Information</div>
              <div style={{ ...s.grid("1fr 1fr 1fr 1fr", mobile), gap: 14 }}>
                {(settings.rvFields || []).map(f => (
                  <div key={f.key}>
                    <label style={s.label}>{f.label}</label>
                    {f.type === "select" ? (
                      <select style={{ ...s.mSelect(mobile), width: "100%" }} value={unitForm.rvInfo[f.key] || ""} onChange={e => setUnitForm(u => ({ ...u, rvInfo: { ...u.rvInfo, [f.key]: e.target.value } }))}>
                        <option value="">Select...</option>
                        {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder={f.placeholder || ""} value={unitForm.rvInfo[f.key] || ""} onChange={e => setUnitForm(u => ({ ...u, rvInfo: { ...u.rvInfo, [f.key]: e.target.value } }))} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button disabled={!unitForm.number.trim()} onClick={async () => {
            try {
              const newUnit = await insertUnit({ ...unitForm, bedrooms: parseInt(unitForm.bedrooms) || 1, bathrooms: parseInt(unitForm.bathrooms) || 1, sqft: parseInt(unitForm.sqft) || 0, is_rv: unitForm.isRv, rv_info: unitForm.isRv ? unitForm.rvInfo : null }, p._uuid);
              showUnitSuccess(`Unit ${unitForm.number} added!`);
              setUnitList(prev => [...prev, newUnit]);
              setUnitForm({ number: "", bedrooms: "1", bathrooms: "1", sqft: "", isRv: false, rvInfo: {} });
            } catch (err) { showUnitSuccess("Error: " + err.message); }
          }} style={{ ...s.mBtn("primary", mobile) }}>Add Unit</button>
        </div>
      )}
      {unitList.length > 0 && (
        <div style={{ ...s.card, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Units ({unitList.length})</div>
          <SuccessMessage message={unitSuccess} />
          <table style={s.table}>
            <thead><tr>{["Unit", "Resident", "BR", "BA", "Sqft", "Type", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {unitList.map(u => {
                const uid = u._uuid || u.id;
                if (editingUnit === uid) {
                  return ([
                    <tr key={uid}>
                      <td style={s.td}><input style={{ ...s.input, width: 80, padding: "4px 6px", fontSize: 13 }} value={editUnitForm.number || ""} onChange={e => setEditUnitForm(f => ({ ...f, number: e.target.value }))} /></td>
                      <td style={s.td}><span style={{ color: T.dim, fontSize: 12 }}>—</span></td>
                      <td style={s.td}><input type="number" style={{ ...s.input, width: 50, padding: "4px 6px", fontSize: 13 }} value={editUnitForm.bedrooms || ""} onChange={e => setEditUnitForm(f => ({ ...f, bedrooms: e.target.value }))} /></td>
                      <td style={s.td}><input type="number" style={{ ...s.input, width: 50, padding: "4px 6px", fontSize: 13 }} value={editUnitForm.bathrooms || ""} onChange={e => setEditUnitForm(f => ({ ...f, bathrooms: e.target.value }))} /></td>
                      <td style={s.td}><input type="number" style={{ ...s.input, width: 70, padding: "4px 6px", fontSize: 13 }} value={editUnitForm.sqft || ""} onChange={e => setEditUnitForm(f => ({ ...f, sqft: e.target.value }))} /></td>
                      <td style={s.td}>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
                          <input type="checkbox" checked={editUnitForm.isRv || false} onChange={e => setEditUnitForm(f => ({ ...f, isRv: e.target.checked, rvInfo: e.target.checked ? (f.rvInfo || {}) : {} }))} />
                          RV
                        </label>
                      </td>
                      <td style={s.td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={{ ...s.btn("primary"), fontSize: 11, padding: "4px 8px" }} onClick={async () => {
                            try {
                              await updateUnit(uid, { number: editUnitForm.number, bedrooms: parseInt(editUnitForm.bedrooms) || 1, bathrooms: parseInt(editUnitForm.bathrooms) || 1, sqft: parseInt(editUnitForm.sqft) || 0, is_rv: editUnitForm.isRv || false, rv_info: editUnitForm.isRv ? (editUnitForm.rvInfo || {}) : null });
                              setUnitList(prev => prev.map(x => (x._uuid || x.id) === uid ? { ...x, number: editUnitForm.number, bedrooms: parseInt(editUnitForm.bedrooms) || 1, bathrooms: parseInt(editUnitForm.bathrooms) || 1, sqft: parseInt(editUnitForm.sqft) || 0, is_rv: editUnitForm.isRv || false, rv_info: editUnitForm.isRv ? (editUnitForm.rvInfo || {}) : null } : x));
                              setEditingUnit(null);
                              showUnitSuccess("Unit updated");
                            } catch (err) { showUnitSuccess("Error: " + err.message); }
                          }}>Save</button>
                          <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 8px" }} onClick={() => setEditingUnit(null)}>Cancel</button>
                        </div>
                      </td>
                    </tr>,
                    editUnitForm.isRv && (
                      <tr key={`${uid}-rv`}>
                        <td colSpan={7} style={{ ...s.td, padding: 0 }}>
                          <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 14, margin: "4px 8px 8px" }}>
                            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, color: T.accent }}>RV Information</div>
                            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 10 }}>
                              {(settings.rvFields || []).map(f => (
                                <div key={f.key}>
                                  <label style={{ ...s.label, fontSize: 11 }}>{f.label}</label>
                                  {f.type === "select" ? (
                                    <select style={{ ...s.select, fontSize: 12, padding: "4px 6px", width: "100%" }} value={(editUnitForm.rvInfo || {})[f.key] || ""} onChange={e => setEditUnitForm(prev => ({ ...prev, rvInfo: { ...(prev.rvInfo || {}), [f.key]: e.target.value } }))}>
                                      <option value="">Select...</option>
                                      {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                  ) : (
                                    <input style={{ ...s.input, fontSize: 12, padding: "4px 6px", width: "100%" }} placeholder={f.placeholder || ""} value={(editUnitForm.rvInfo || {})[f.key] || ""} onChange={e => setEditUnitForm(prev => ({ ...prev, rvInfo: { ...(prev.rvInfo || {}), [f.key]: e.target.value } }))} />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ]);
                }
                const unitResident = propResidents.find(r => r.unit === u.number);
                return (
                  <tr key={uid}>
                    <td style={s.td}><span style={{ fontWeight: 600 }}>{u.number}</span></td>
                    <td style={s.td}>{unitResident ? (
                      <button style={{ ...s.btn("ghost"), fontWeight: 600, padding: "2px 6px", fontSize: 13 }} onClick={() => {
                        if (onSelectProperty) onSelectProperty(selectedProperty, "residents", unitResident.id);
                      }}>{unitResident.name}</button>
                    ) : <span style={{ color: T.dim, fontSize: 12 }}>Vacant</span>}</td>
                    <td style={s.td}>{u.bedrooms}</td>
                    <td style={s.td}>{u.bathrooms}</td>
                    <td style={s.td}>{u.sqft || "—"}</td>
                    <td style={s.td}>{u.is_rv ? <span style={s.badge(T.warnDim, T.warn)}>RV</span> : <span style={{ color: T.dim, fontSize: 12 }}>Standard</span>}</td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 8px" }} onClick={() => { setEditingUnit(uid); setEditUnitForm({ number: u.number, bedrooms: String(u.bedrooms), bathrooms: String(u.bathrooms), sqft: String(u.sqft || ""), isRv: u.is_rv || false, rvInfo: u.rv_info || {} }); }}>Edit</button>
                        <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 8px", color: T.danger }} onClick={async () => {
                          if (!confirm(`Delete unit ${u.number}?`)) return;
                          try { await deleteUnit(uid); setUnitList(prev => prev.filter(x => (x._uuid || x.id) !== uid)); showUnitSuccess(`Unit ${u.number} deleted`); } catch (err) { showUnitSuccess("Error: " + err.message); }
                        }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Edit Property */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Property Details</div>
          <button style={s.btn("ghost")} onClick={() => { setShowEditProp(v => !v); if (!showEditProp) setEditPropForm({ name: p.name, address: p.address, type: p.type, totalUnits: String(p.totalUnits || ""), totalSF: String(p.totalSF || ""), lotSize: p.lotSize || "", yearBuilt: String(p.yearBuilt || ""), adaUnits: String(p.adaUnits || "") }); }}>
            {showEditProp ? "Cancel" : "✏️ Edit"}
          </button>
        </div>
        {showEditProp ? (
          <div>
            <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
              <div><label style={s.label}>Name</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.name || ""} onChange={e => setEditPropForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label style={s.label}>Address</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.address || ""} onChange={e => setEditPropForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div><label style={s.label}>Type</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.type || ""} onChange={e => setEditPropForm(f => ({ ...f, type: e.target.value }))} /></div>
              <div><label style={s.label}>Total Units</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.totalUnits || ""} onChange={e => setEditPropForm(f => ({ ...f, totalUnits: e.target.value }))} /></div>
              <div><label style={s.label}>Total SF</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.totalSF || ""} onChange={e => setEditPropForm(f => ({ ...f, totalSF: e.target.value }))} /></div>
              <div><label style={s.label}>Year Built</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.yearBuilt || ""} onChange={e => setEditPropForm(f => ({ ...f, yearBuilt: e.target.value }))} /></div>
              <div><label style={s.label}>Lot Size</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.lotSize || ""} onChange={e => setEditPropForm(f => ({ ...f, lotSize: e.target.value }))} /></div>
              <div><label style={s.label}>ADA Units</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.adaUnits || ""} onChange={e => setEditPropForm(f => ({ ...f, adaUnits: e.target.value }))} /></div>
            </div>
            <button style={{ ...s.mBtn("primary", mobile) }} onClick={async () => {
              try {
                await updateProperty(p._uuid, { ...editPropForm, totalUnits: parseInt(editPropForm.totalUnits) || 0, totalSF: parseInt(editPropForm.totalSF) || 0, yearBuilt: parseInt(editPropForm.yearBuilt) || null, adaUnits: parseInt(editPropForm.adaUnits) || 0 });
                showUnitSuccess("Property updated!");
                setShowEditProp(false);
                if (onDataRefresh) onDataRefresh();
              } catch (err) { showUnitSuccess("Error: " + err.message); }
            }}>Save Changes</button>
          </div>
        ) : (
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 8 }}>
            <DetailRow label="Name" value={p.name} />
            <DetailRow label="Address" value={p.address} />
            <DetailRow label="Type" value={p.type} />
            <DetailRow label="Total Units" value={p.totalUnits} />
            <DetailRow label="Total SF" value={p.totalSF?.toLocaleString()} />
            <DetailRow label="Year Built" value={p.yearBuilt} />
            <DetailRow label="Lot Size" value={p.lotSize} />
            <DetailRow label="ADA Units" value={p.adaUnits} />
          </div>
        )}
      </div>
    </div>
  );
};

// --- ADMIN DOCUMENTS (Centralized Hub) ---
const COMPLIANCE_STATUS = { current: { bg: T.successDim, text: T.success }, expired: { bg: T.dangerDim, text: T.danger }, missing: { bg: T.dimLight, text: T.muted } };
const PAYMENT_STATUS = { paid: { bg: T.successDim, text: T.success, label: "Paid" }, partial: { bg: T.warnDim, text: T.warn, label: "Partial" }, outstanding: { bg: T.dangerDim, text: T.danger, label: "Outstanding" } };

const ONBOARDING_STATUS = {
  "not-started": { bg: T.dimLight, text: T.muted, label: "Not Started" },
  "in-progress": { bg: T.warnDim, text: T.warn, label: "In Progress" },
  completed: { bg: T.successDim, text: T.success, label: "Completed" },
};

const AdminDocuments = ({ leaseDocs, setLeaseDocs, mobile, selectedProperty }) => {
  const tabs = ["All Documents", "By Resident", "Property"];
  const [tab, setTab] = useState(tabs[0]);
  const filteredResidents = filterByProperty(LIVE_RESIDENTS, selectedProperty);
  const [selectedResident, setSelectedResident] = useState(filteredResidents[0]?.id || LIVE_RESIDENTS[0].id);
  const [success, showSuccess] = useSuccess();

  const resIds = new Set(filteredResidents.map(r => r.id));
  const allDocs = Object.entries(leaseDocs).filter(([resId]) => resIds.has(resId)).flatMap(([resId, docs]) => {
    const res = LIVE_RESIDENTS.find(r => r.id === resId);
    return docs.map(d => ({ ...d, residentName: res?.name || resId, unit: res?.unit || "—", residentId: resId }));
  });
  const propObj = selectedProperty === "all" ? LIVE_PROPERTIES[0] : getProperty(selectedProperty);
  const propertyDocs = (propObj.documents || []).map((d, i) => ({
    id: `PD-${i}`, name: d.name, type: d.type, residentName: "Property", unit: "—",
    size: null, uploadedAt: d.uploaded + "T00:00:00Z", uploadedBy: "Admin",
  }));
  const combined = [...allDocs, ...propertyDocs].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  const refreshDocs = async () => {
    try { const fresh = await fetchLeaseDocsByResident(); setLeaseDocs(fresh || {}); } catch (e) { console.warn(e); }
  };
  const handleUpload = async (doc) => {
    // Find the resident UUID from slug
    const res = LIVE_RESIDENTS.find(r => r.id === selectedResident);
    if (res?._uuid) {
      try {
        await insertLeaseDocument({ name: doc.name, type: doc.type, size: doc.size, uploadedBy: doc.uploadedBy, storagePath: doc.storagePath }, res._uuid);
      } catch (e) { console.warn("DB insert failed:", e); }
    }
    await refreshDocs();
    showSuccess("Document uploaded");
  };
  const handleDelete = async (docId) => {
    try {
      await deleteLeaseDocument(docId);
      await refreshDocs();
      showSuccess("Document removed");
    } catch (err) {
      showSuccess("Error deleting: " + err.message);
    }
  };

  const compDocsF = filterByProperty(LIVE_COMPLIANCE_DOCS, selectedProperty);
  const compCurrent = compDocsF.filter(d => d.status === "current").length;
  const compExpired = compDocsF.filter(d => d.status === "expired").length;
  const compMissing = compDocsF.filter(d => d.status === "missing").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
        <div>
          <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Document Center</h1>
          <p style={s.sectionSub}>Manage all property and resident documents</p>
        </div>
      </div>
      <SuccessMessage message={success} />
      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {tab === "All Documents" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <ExportButton mobile={mobile} onClick={() => generateCSV(
              [{ label: "Name", key: "name" }, { label: "Type", key: "type" }, { label: "Owner", key: "residentName" }, { label: "Date", key: "uploadedAt", exportValue: r => new Date(r.uploadedAt).toLocaleDateString() }, { label: "Size", key: "size", exportValue: r => r.size ? formatFileSize(r.size) : "—" }],
              combined, "all_documents"
            )} />
          </div>
          <SortableTable mobile={mobile} keyField="id" columns={[
            { key: "name", label: "Name", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
            { key: "type", label: "Type", render: v => <span style={s.badge(T.infoDim, T.info)}>{LEASE_DOC_TYPES[v] || v}</span>, filterOptions: [...new Set(combined.map(d => d.type))] },
            { key: "residentName", label: "Owner", filterOptions: [...new Set(combined.map(d => d.residentName))] },
            { key: "uploadedAt", label: "Date", render: v => new Date(v).toLocaleDateString(), sortValue: r => new Date(r.uploadedAt).getTime() },
            { key: "size", label: "Size", render: v => v ? formatFileSize(v) : "—", sortable: false, filterable: false },
            { key: "_actions", label: "", sortable: false, filterable: false, render: (_, row) => <button style={s.btn("ghost")} onClick={async () => {
              if (row.storagePath) { try { const url = await getLeaseFileUrl(row.storagePath); if (url) window.open(url, "_blank"); } catch {} } else { alert("No file stored"); }
            }}>View</button> },
          ]} data={combined} />
        </div>
      )}

      {tab === "By Resident" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>Select Resident</label>
            <select style={{ ...s.mSelect(mobile), width: mobile ? "100%" : 300 }} value={selectedResident} onChange={e => setSelectedResident(e.target.value)}>
              {filteredResidents.map(r => <option key={r.id} value={r.id}>{r.name} — {r.unit}</option>)}
            </select>
          </div>
          <LeaseDocumentsPanel docs={leaseDocs[selectedResident] || []} onUpload={handleUpload} onDelete={handleDelete} canUpload={true} canDelete={true} residentSlug={selectedResident} />
        </div>
      )}

      {tab === "Property" && (
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Property Documents & Plans</div>
          <table style={s.table}>
            <thead><tr>{["Document", "Type", "Uploaded", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {(propObj.documents || []).map((d, i) => (
                <tr key={i}>
                  <td style={s.td}><span style={{ fontWeight: 600 }}>{d.name}</span></td>
                  <td style={s.td}><span style={s.badge(T.infoDim, T.info)}>{d.type}</span></td>
                  <td style={s.td}>{d.uploaded}</td>
                  <td style={s.td}><button style={s.btn("ghost")}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

// --- ADMIN REPORTS (Analytics Dashboard) ---
const AdminReports = ({ mobile, maintenance, vendors, unitInspections, selectedProperty }) => {
  const tabs = ["Maintenance", "Financial"];
  const [tab, setTab] = useState(tabs[0]);
  const [dateRange, setDateRange] = useState({ preset: "all", from: null, to: null });

  // Apply date filter to maintenance
  const dMaint = filterByDateRange(maintenance, "submitted", dateRange);
  // Maintenance aggregations
  const total = dMaint.length;
  const completed = dMaint.filter(m => m.status === "completed").length;
  const open = total - completed;
  const avgResolution = (() => {
    const resolved = dMaint.filter(m => m.completedDate && m.submitted);
    if (!resolved.length) return "—";
    const avg = resolved.reduce((sum, m) => sum + (new Date(m.completedDate) - new Date(m.submitted)) / 86400000, 0) / resolved.length;
    return avg.toFixed(1) + "d";
  })();
  const cats = dMaint.reduce((acc, m) => { acc[m.category] = (acc[m.category] || 0) + 1; return acc; }, {});
  const topCategory = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const statusCounts = { submitted: dMaint.filter(m => m.status === "submitted").length, "in-progress": dMaint.filter(m => m.status === "in-progress").length, completed };
  const priCounts = { critical: dMaint.filter(m => m.priority === "critical" && m.status !== "completed").length, urgent: dMaint.filter(m => m.priority === "urgent" && m.status !== "completed").length, routine: dMaint.filter(m => m.priority === "routine" && m.status !== "completed").length };

  // Financial aggregations
  const residents = filterByProperty(LIVE_RESIDENTS, selectedProperty).map(r => ({ ...r, ...(LIVE_RESIDENTS_EXTENDED[r.id] || {}) }));
  const monthlyRentRoll = residents.reduce((sum, r) => sum + (r.rentAmount || 0), 0);
  const totalHAP = residents.reduce((sum, r) => sum + (r.hapPayment || 0), 0);
  const totalTenant = residents.reduce((sum, r) => sum + (r.tenantPortion || 0), 0);

  // Compliance aggregations
  const regInsp = filterByProperty(LIVE_REG_INSPECTIONS, selectedProperty);
  const uniqueUnitsInspected = [...new Set(unitInspections.map(i => i.unit))].length;
  const passRate = unitInspections.length ? Math.round(unitInspections.filter(i => i.result === "Pass").length / unitInspections.length * 100) : 0;
  const overdueInsp = regInsp.filter(i => new Date(i.nextDue) < new Date()).length;
  const activeVendors = vendors.filter(v => v.active).length;
  const propLabel = selectedProperty === "all" ? "All Properties" : getProperty(selectedProperty).name;
  const revenueData = filterByProperty(MOCK_MONTHLY_REVENUE, selectedProperty);
  const monthLabels = [...new Set(revenueData.map(r => r.month))].sort();
  const trendPoints = monthLabels.map(m => revenueData.filter(r => r.month === m).reduce((s, r) => s + r.collected, 0));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <div><h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Reports & Analytics</h1><p style={s.sectionSub}>{propLabel} — reporting and data exports</p></div>
        <PrintButton mobile={mobile} />
      </div>
      <div style={{ marginBottom: 14 }}><DateRangeFilter value={dateRange} onChange={setDateRange} mobile={mobile} /></div>
      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {tab === "Maintenance" && (
        <div>
          <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label="Total Requests" value={total} mobile={mobile} />
            <StatCard label="Avg Resolution" value={avgResolution} accent={T.success} mobile={mobile} />
            <StatCard label="Open / Closed" value={`${open} / ${completed}`} accent={T.warn} mobile={mobile} />
            <StatCard label="Top Category" value={topCategory} accent={T.info} mobile={mobile} />
          </div>
          <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 20 }}>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Status Breakdown</div>
              <DonutChart segments={[
                { label: "Submitted", value: statusCounts.submitted, color: THEMES.light.info },
                { label: "In Progress", value: statusCounts["in-progress"], color: THEMES.light.warn },
                { label: "Completed", value: statusCounts.completed, color: THEMES.light.success },
              ]} centerValue={total} centerLabel="Total" size={mobile ? 100 : 120} mobile={mobile} />
            </div>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>By Category</div>
              <MiniBarChart bars={Object.entries(cats).map(([label, value]) => ({ label, value, color: T.accent }))} mobile={mobile} />
            </div>
          </div>
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>By Priority (Open)</div>
              <ExportButton mobile={mobile} onClick={() => generateCSV(
                [{ label: "ID", key: "id" }, { label: "Unit", key: "unit" }, { label: "Category", key: "category" }, { label: "Priority", key: "priority" }, { label: "Status", key: "status" }, { label: "Submitted", key: "submitted" }, { label: "Assigned To", key: "assignedTo", exportValue: r => r.assignedTo || "Unassigned" }, { label: "Description", key: "description" }],
                dMaint, "maintenance_report"
              )} />
            </div>
            <MiniBarChart bars={[
              { label: "Critical", value: priCounts.critical, color: T.danger },
              { label: "Urgent", value: priCounts.urgent, color: T.warn },
              { label: "Routine", value: priCounts.routine, color: T.accent },
            ]} mobile={mobile} />
          </div>
        </div>
      )}

      {tab === "Financial" && (
        <div>
          <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label="Monthly Rent Roll" value={`$${monthlyRentRoll.toLocaleString()}`} mobile={mobile} />
            <StatCard label="Total HAP" value={`$${totalHAP.toLocaleString()}`} accent={T.info} mobile={mobile} />
            <StatCard label="Tenant Portions" value={`$${totalTenant.toLocaleString()}`} accent={T.success} mobile={mobile} />
            <StatCard label="Collection Rate" value={`${monthlyRentRoll ? Math.round(((totalHAP + totalTenant) / monthlyRentRoll) * 100) : 0}%`} accent={T.success} mobile={mobile} />
          </div>

          {/* Per-property financial comparison */}
          {selectedProperty === "all" && (
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Financial by Property</div>
              <MiniBarChart bars={LIVE_PROPERTIES.map((p, i) => {
                const pRent = LIVE_RESIDENTS.filter(r => r.propertyId === p.id).map(r => ({ ...r, ...(LIVE_RESIDENTS_EXTENDED[r.id] || {}) })).reduce((s, r) => s + (r.rentAmount || 0), 0);
                return { label: p.name.split(" ")[0], value: pRent, color: [T.accent, T.success, T.warn][i] };
              })} mobile={mobile} />
            </div>
          )}

          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14 }}>Monthly Trend</div>
            <SparkLine points={trendPoints.length ? trendPoints : [0]} color={T.success} width={mobile ? 280 : 500} height={48} mobile={mobile} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, marginTop: 6, maxWidth: mobile ? 280 : 500 }}>
              {monthLabels.map(m => <span key={m}>{new Date(m + "-15").toLocaleDateString("en", { month: "short" })}</span>)}
            </div>
          </div>
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Rent Roll by Unit</div>
              <ExportButton mobile={mobile} onClick={() => generateCSV(
                [{ label: "Resident", key: "name" }, { label: "Unit", key: "unit" }, ...(selectedProperty === "all" ? [{ label: "Property", key: "_prop" }] : []), { label: "Rent", key: "rentAmount", exportValue: r => r.rentAmount || 0 }, { label: "Tenant Portion", key: "tenantPortion", exportValue: r => r.tenantPortion || 0 }, { label: "HAP", key: "hapPayment", exportValue: r => r.hapPayment || 0 }],
                residents.map(r => ({ ...r, _prop: getProperty(r.propertyId)?.name || "" })), "rent_roll"
              )} />
            </div>
            <SortableTable mobile={mobile} columns={[
              { key: "name", label: "Resident", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
              { key: "unit", label: "Unit" },
              ...(selectedProperty === "all" ? [{ key: "propertyId", label: "Property", render: v => getProperty(v)?.name?.split(" ")[0] || v }] : []),
              { key: "rentAmount", label: "Rent", render: v => v ? `$${v.toLocaleString()}` : "—" },
              { key: "tenantPortion", label: "Tenant", render: v => v ? `$${v}` : "—" },
              { key: "hapPayment", label: "HAP", render: v => v ? `$${v}` : "—" },
            ]} data={residents} keyField="id" />
          </div>
        </div>
      )}

    </div>
  );
};

// --- INSPECTIONS (All Roles — Unified) ---
const Inspections = ({ role, mobile, unitInspections, onSchedule, onUpdate, rc, selectedProperty, allUnits = [], savedChecklists = [], onSaveChecklist, onUpdateChecklist }) => {
  const isResident = role === "resident";
  const isAdmin = role === "admin";
  const tabs = isResident ? null : isAdmin ? ["Schedule", "Unit History", "Procedures", "Regulatory", "Categories"] : ["Unit History", "Procedures", "Categories", "My Assigned"];
  const [tab, setTab] = useState(isResident ? null : tabs[0]);
  const [success, showSuccess] = useSuccess();
  const [schedForm, setSchedForm] = useState({ category: "", unit: "", date: "", inspector: "Mike R.", notify: "Yes — 48hr notice" });
  const [selectedInsp, setSelectedInsp] = useState(null);
  const [updateForm, setUpdateForm] = useState({ result: "", score: "", failedItems: "", notes: "" });
  const [activeChecklist, setActiveChecklist] = useState(null);
  const [viewingChecklist, setViewingChecklist] = useState(null);
  const [editingChecklist, setEditingChecklist] = useState(false); // true when editing a completed checklist

  const unitData = isResident ? unitInspections.filter(i => i.unit === (rc?.unit || "")) : unitInspections;
  const regInsp = selectedProperty && selectedProperty !== "all"
    ? LIVE_REG_INSPECTIONS.filter(i => i.propertyId === selectedProperty)
    : LIVE_REG_INSPECTIONS;
  const regDueSoon = regInsp.filter(i => new Date(i.nextDue) < new Date("2026-09-01")).length;
  const catNames = [...new Set(MOCK_UNIT_INSPECTION_CATEGORIES.filter(c => c.active).map(c => c.name))];
  const scheduled = unitInspections.filter(i => i.result === "Scheduled");
  const availableResidents = selectedProperty && selectedProperty !== "all"
    ? LIVE_RESIDENTS.filter(r => r.propertyId === selectedProperty)
    : LIVE_RESIDENTS;
  // Build unit options from allUnits (includes vacant) + residents
  const filteredUnits = selectedProperty && selectedProperty !== "all"
    ? allUnits.filter(u => u.propertyId === selectedProperty)
    : allUnits;
  const unitOptions = filteredUnits.map(u => {
    const resident = LIVE_RESIDENTS.find(r => r.unit === u.number);
    return { value: u.number, label: `${u.number}${u.propertyName ? ` (${u.propertyName})` : ""}${resident ? ` — ${resident.name}` : " — Vacant"}` };
  });
  // Also add any resident units not in allUnits
  availableResidents.forEach(r => {
    if (!unitOptions.find(o => o.value === r.unit)) {
      unitOptions.push({ value: r.unit, label: `${r.unit} — ${r.name}` });
    }
  });

  return (
    <div>
      <h1 style={s.sectionTitle}>{isResident ? "My Inspections" : "Inspections"}</h1>
      <p style={s.sectionSub}>
        {isResident ? "Inspection history for your unit" : isAdmin ? "Schedule and manage unit inspections" : "View assigned inspections and complete checklists"}
      </p>

      {isAdmin && (
        <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
          <StatCard label="Scheduled" value={scheduled.length} accent={scheduled.length > 0 ? T.info : T.muted} mobile={mobile} />
          <StatCard label="Unit Inspections" value={unitInspections.length} accent={T.accent} mobile={mobile} />
          <StatCard label="Regulatory" value={regInsp.length} accent={T.info} mobile={mobile} />
          <StatCard label="Due Within 6mo" value={regDueSoon} accent={regDueSoon > 0 ? T.warn : T.success} mobile={mobile} />
        </div>
      )}

      {tabs && <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />}
      <SuccessMessage message={success} />

      {/* Schedule — admin only (now first tab) */}
      {tab === "Schedule" && isAdmin && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Schedule New Inspection</div>
            <div style={{ ...s.grid("1fr 1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Category</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={schedForm.category} onChange={e => setSchedForm(p => ({ ...p, category: e.target.value }))}><option value="">Select...</option>{MOCK_UNIT_INSPECTION_CATEGORIES.filter(c => c.active).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
              <div><label style={s.label}>Unit</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={schedForm.unit} onChange={e => setSchedForm(p => ({ ...p, unit: e.target.value }))}><option value="">Select unit...</option>{unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              <div><label style={s.label}>Date</label><input style={s.mInput(mobile)} type="date" value={schedForm.date} onChange={e => setSchedForm(p => ({ ...p, date: e.target.value }))} /></div>
            </div>
            <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Inspector</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={schedForm.inspector} onChange={e => setSchedForm(p => ({ ...p, inspector: e.target.value }))}><option>Mike R.</option><option>External Vendor</option></select></div>
              <div><label style={s.label}>Notify Resident</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={schedForm.notify} onChange={e => setSchedForm(p => ({ ...p, notify: e.target.value }))}><option>Yes — 48hr notice</option><option>Yes — 24hr notice</option><option>No notification</option></select></div>
            </div>
            <button style={s.btn()} onClick={() => {
              if (!schedForm.category || !schedForm.date || !schedForm.unit) { showSuccess("Please select a category, unit, and date"); return; }
              const schedResident = LIVE_RESIDENTS.find(r => r.unit === schedForm.unit);
              onSchedule({
                id: `UI-${Date.now()}`,
                unit: schedForm.unit,
                propertyId: schedResident?.propertyId || LIVE_PROPERTIES[0]?.id || "wharf",
                category: schedForm.category,
                date: schedForm.date,
                inspector: schedForm.inspector,
                result: "Scheduled",
                score: null,
                failedItems: [],
                notes: `Notification: ${schedForm.notify}`,
              });
              setSchedForm({ category: "", unit: "", date: "", inspector: "Mike R.", notify: "Yes — 48hr notice" });
              showSuccess("Inspection scheduled!");
            }}>Schedule Inspection</button>
          </div>

          {scheduled.length > 0 && (
            <div style={{ ...s.card, marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Upcoming Scheduled</div>
              <SortableTable
                mobile={mobile}
                columns={[
                  { key: "date", label: "Date" },
                  { key: "propertyId", label: "Property", render: v => { const p = LIVE_PROPERTIES.find(pr => pr.id === v); return <span style={{ fontWeight: 600 }}>{p?.name || v || "—"}</span>; } },
                  { key: "unit", label: "Unit", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
                  { key: "category", label: "Category", render: v => <span style={s.badge(T.infoDim, T.info)}>{v}</span> },
                  { key: "inspector", label: "Inspector" },
                  { key: "notes", label: "Notification", render: v => <span style={{ fontSize: 12, color: T.muted }}>{v}</span>, filterable: false, sortable: false },
                ]}
                data={scheduled}
                onRowClick={row => {
                  setSelectedInsp(row);
                  setUpdateForm({ result: "Pass", score: "", failedItems: "", notes: "" });
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Unit History — admin/maintenance, or resident (default view) */}
      {(tab === "Unit History" || isResident) && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{isResident ? `Inspection History — Unit ${rc?.unit || ""}` : "Unit Inspection History"}</div>
            <ExportButton mobile={mobile} onClick={() => generateCSV(
              [{ label: "Date", key: "date" }, { label: "Unit", key: "unit" }, { label: "Category", key: "category" }, { label: "Inspector", key: "inspector" }, { label: "Result", key: "result" }, { label: "Score", key: "score" }, { label: "Failed Items", key: "failedItems", exportValue: r => (r.failedItems || []).join("; ") }],
              unitData, "unit_inspections"
            )} />
          </div>
          <SortableTable
            mobile={mobile}
            columns={[
              { key: "date", label: "Date" },
              ...(isResident ? [] : [
                { key: "propertyId", label: "Property", render: v => { const p = LIVE_PROPERTIES.find(pr => pr.id === v); return <span style={{ fontWeight: 600 }}>{p?.name || v || "—"}</span>; }, filterOptions: [...new Set(unitData.map(i => i.propertyId).filter(Boolean))], filterValue: row => row.propertyId },
                { key: "unit", label: "Unit", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
              ]),
              { key: "category", label: "Category", render: v => <span style={s.badge(T.infoDim, T.info)}>{v}</span>, filterOptions: catNames, filterValue: row => row.category },
              { key: "inspector", label: "Inspector" },
              { key: "result", label: "Result", render: (v, row) => {
                const color = v === "Pass" ? T.success : v === "Scheduled" ? T.accent : T.danger;
                const bg = v === "Pass" ? T.successDim : v === "Scheduled" ? (T.accentDim || "rgba(99,102,241,0.12)") : T.dangerDim;
                return <span style={s.badge(bg, color)}>{v}{row.score ? ` (${row.score})` : ""}</span>;
              }, filterOptions: ["Pass", "Fail", "Scheduled"], filterValue: row => row.result },
              { key: "failedItems", label: isResident ? "Notes" : "Failed Items", render: (v, row) => { const items = Array.isArray(v) ? v : []; return <span style={{ fontSize: 13, color: items.length ? T.danger : T.dim }}>{items.length ? items.join("; ") : (isResident ? row.notes : "None")}</span>; }, filterable: false, sortable: false },
            ]}
            data={unitData}
            onRowClick={row => {
              setSelectedInsp(row);
              setUpdateForm(row.result === "Scheduled"
                ? { result: "Pass", score: "", failedItems: "", notes: "" }
                : { result: row.result, score: row.score || "", failedItems: (Array.isArray(row.failedItems) ? row.failedItems : []).join(", "), notes: row.notes || "" });
            }}
          />
        </div>
      )}

      {/* Inspection detail / update modal */}
      {selectedInsp && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setSelectedInsp(null)}>
          <div style={{ ...s.card, maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                {selectedInsp.result === "Scheduled" ? "Update Inspection" : "Inspection Details"}
              </h2>
              <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.text }} onClick={() => setSelectedInsp(null)}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, fontSize: 14 }}>
              <div><span style={{ color: T.dim }}>Unit:</span> <strong>{selectedInsp.unit}</strong></div>
              <div><span style={{ color: T.dim }}>Category:</span> <strong>{selectedInsp.category}</strong></div>
              <div><span style={{ color: T.dim }}>Date:</span> <strong>{selectedInsp.date}</strong></div>
              <div><span style={{ color: T.dim }}>Inspector:</span> <strong>{selectedInsp.inspector}</strong></div>
              <div><span style={{ color: T.dim }}>Current Status:</span> <span style={s.badge(
                selectedInsp.result === "Pass" ? T.successDim : selectedInsp.result === "Scheduled" ? (T.accentDim || "rgba(99,102,241,0.12)") : T.dangerDim,
                selectedInsp.result === "Pass" ? T.success : selectedInsp.result === "Scheduled" ? T.accent : T.danger
              )}>{selectedInsp.result}</span></div>
            </div>

            {(selectedInsp.result === "Scheduled" || isAdmin) && onUpdate && (
              <>
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>
                    {selectedInsp.result === "Scheduled" ? "Complete This Inspection" : "Update Inspection"}
                  </div>
                  <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 12 }}>
                    <div>
                      <label style={s.label}>Result</label>
                      <select style={{ ...s.mSelect(mobile), width: "100%" }} value={updateForm.result} onChange={e => setUpdateForm(p => ({ ...p, result: e.target.value }))}>
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>Score (optional)</label>
                      <input style={s.mInput(mobile)} placeholder="e.g. 14/15" value={updateForm.score} onChange={e => setUpdateForm(p => ({ ...p, score: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={s.label}>Failed Items (comma-separated)</label>
                    <input style={{ ...s.mInput(mobile), width: "100%", boxSizing: "border-box" }} placeholder="e.g. Smoke detector - dead battery, Paint peeling" value={updateForm.failedItems} onChange={e => setUpdateForm(p => ({ ...p, failedItems: e.target.value }))} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={s.label}>Notes</label>
                    <textarea style={{ ...s.mInput(mobile), width: "100%", boxSizing: "border-box", minHeight: 60, fontFamily: "inherit", resize: "vertical" }} placeholder="Inspection notes..." value={updateForm.notes} onChange={e => setUpdateForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={s.btn()} onClick={() => {
                      onUpdate(selectedInsp.id, {
                        result: updateForm.result,
                        score: updateForm.score || null,
                        failedItems: updateForm.failedItems ? updateForm.failedItems.split(",").map(s => s.trim()).filter(Boolean) : [],
                        notes: updateForm.notes,
                        date: selectedInsp.result === "Scheduled" ? new Date().toISOString().split("T")[0] : selectedInsp.date,
                      });
                      setSelectedInsp(null);
                      showSuccess(selectedInsp.result === "Scheduled" ? "Inspection completed!" : "Inspection updated!");
                    }}>
                      {selectedInsp.result === "Scheduled" ? "Mark Complete" : "Save Changes"}
                    </button>
                    <button style={s.btn("ghost")} onClick={() => setSelectedInsp(null)}>Cancel</button>
                  </div>
                </div>
              </>
            )}

            {selectedInsp.result !== "Scheduled" && !isAdmin && (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                {Array.isArray(selectedInsp.failedItems) && selectedInsp.failedItems.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: T.danger, marginBottom: 6 }}>Failed Items</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                      {selectedInsp.failedItems.map((item, i) => <li key={i} style={{ marginBottom: 4 }}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {selectedInsp.notes && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: T.dim, marginBottom: 6 }}>Notes</div>
                    <div style={{ fontSize: 13 }}>{selectedInsp.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Procedures tab */}
      {tab === "Procedures" && (() => {
        const RV_PROCEDURE = {
          id: "PROC-RV-2025",
          name: "Annual RV Inspection Form",
          nameSp: "Inspección de RVS",
          year: 2025,
          sections: [
            { name: "Exterior", items: [
              { text: "Exterior door closes correctly", type: "yesNoNa" },
              { text: "General Appearance - Detail Issues", type: "text" },
              { text: "Images: Front, Sides, Back, Note issues", type: "photo" },
              { text: "Appearance of Logos, Decals & Panels", type: "text" },
              { text: "No structural problems apparent", type: "yesNoNa" },
              { text: "Bumpers Ok", type: "yesNoNa" },
              { text: "Door, screen door and latches work", type: "yesNoNa" },
              { text: "Door Images", type: "photo" },
              { text: "Compartments close and seal", type: "text" },
              { text: "Compartment Images", type: "photo" },
              { text: "Rubber roofing condition", type: "text" },
              { text: "Roof condition Details", type: "text" },
              { text: "Roof + joint sealants ok, skylight cover", type: "yesNoNa" },
              { text: "Antenna and AC cover Ok", type: "yesNoNa" },
              { text: "Stair, bumpers, caps", type: "text" },
              { text: "Status of Stair up and down", type: "photo" },
              { text: "Slide-out leak test", type: "text" },
            ]},
            { name: "Chassis", items: [
              { text: "Lights, blinkers, plate lights", type: "text" },
              { text: "Tire condition & Side Wall", type: "text" },
              { text: "Tire pressure adjusted to (psi)", type: "text" },
              { text: "Visual Inspection Axle", type: "text" },
              { text: "Bolts tightened to spec", type: "yesNoNa" },
              { text: "Spare tire condition", type: "text" },
              { text: "Stabilizer Jack Condition", type: "text" },
              { text: "Underbelly in good shape, no missing parts", type: "yesNoNa" },
              { text: "Tow plug", type: "text" },
            ]},
            { name: "Gas", items: [
              { text: "Complete gas line leak test", type: "text" },
              { text: "Gas Regulator checked & adjusted", type: "yesNoNa" },
              { text: "Purged tanks", type: "yesNoNa" },
              { text: "Pilots work correctly", type: "yesNoNa" },
              { text: "Gas leak detector works correctly", type: "yesNoNa" },
              { text: "Heat, Fan & Thermostat working condition", type: "text" },
              { text: "Water heater, stove, oven, refrigerator working on gas mode", type: "text" },
              { text: "Exterior grill works, hose in place", type: "yesNoNa" },
            ]},
            { name: "12V Systems", items: [
              { text: "Batteries present, clean & tight connections", type: "yesNoNa" },
              { text: "Battery charge test passed", type: "text" },
              { text: "Interior & Exterior Light Condition", type: "text" },
              { text: "Stove overhead fan working properly", type: "yesNoNa" },
              { text: "Interior fan working properly", type: "yesNoNa" },
              { text: "Refrigerator works on 12V", type: "yesNoNa" },
              { text: "Inverter, Fuses, Breakers working properly", type: "text" },
              { text: "Monitor panel working correctly", type: "text" },
            ]},
            { name: "110V Systems", items: [
              { text: "Inverter, Fuses, Breakers in good condition", type: "text" },
              { text: "Powers AC, TV, Fridge, Microwave, Outlets correctly", type: "text" },
              { text: "Interior & Exterior Lights", type: "text" },
              { text: "Connector & Adaptor", type: "yesNoNa" },
              { text: "Power Inverter", type: "yesNoNa" },
            ]},
            { name: "Entertainment", items: [
              { text: "TVs working, remote present & working", type: "text" },
              { text: "DVD/Stereo & Speakers working correctly", type: "text" },
              { text: "Radio/CD player", type: "yesNoNa" },
              { text: "Exterior: stereo, satellite port ok", type: "yesNoNa" },
              { text: "Antenna works correctly", type: "yesNoNa" },
              { text: "Awning in correct working order", type: "yesNoNa" },
            ]},
            { name: "Plumbing", items: [
              { text: "Pressurize fresh water system, check valve", type: "yesNoNa" },
              { text: "Black and Grey Water tanks clean and empty", type: "text" },
              { text: "Freshwater Tank full", type: "yesNoNa" },
              { text: "Black & Greywater tank valves in working order", type: "yesNoNa" },
              { text: "Water pump working correctly", type: "yesNoNa" },
              { text: "Shower, Sink, shower pan - no leaks", type: "yesNoNa" },
              { text: "Faucets, showers, sinks working", type: "text" },
              { text: "Low-point drain works", type: "yesNoNa" },
              { text: "Toilet works properly, no leaks", type: "text" },
              { text: "P-trap and plumbing vent ok", type: "yesNoNa" },
              { text: "Water filter ok", type: "yesNoNa" },
            ]},
            { name: "Interior", items: [
              { text: "Condition in walls, flooring, ceiling", type: "text" },
              { text: "No leaks in slide-out, windows, or bedroom", type: "text" },
              { text: "Key set complete", type: "yesNoNa" },
              { text: "Manual in unit", type: "yesNoNa" },
              { text: "Kitchen counter condition", type: "text" },
              { text: "Curtains work properly", type: "yesNoNa" },
              { text: "Bedroom closet doors, panels work properly", type: "text" },
              { text: "Cabinets and closets close well", type: "text" },
              { text: "Slide-out works and seals room correctly", type: "text" },
              { text: "Windows and screens work correctly", type: "text" },
              { text: "All vents work correctly", type: "yesNoNa" },
              { text: "Emergency Exit works correctly", type: "yesNoNa" },
              { text: "Smoke detector, CO detector, gas leak detector work properly", type: "text" },
              { text: "Extinguisher ok", type: "text" },
              { text: "Bunks, beds and sofas in working order", type: "text" },
              { text: "Beds structurally sound", type: "text" },
              { text: "Drawers (alignment and latches work)", type: "text" },
              { text: "Bed and Table kit works", type: "text" },
              { text: "Bed supports", type: "yesNoNa" },
              { text: "Wall condensation", type: "text" },
              { text: "Under mattress humidity ok", type: "text" },
              { text: "Mold inspection", type: "text" },
              { text: "Screws in windows and outlets", type: "yesNoNa" },
              { text: "Outlets in good condition", type: "yesNoNa" },
            ]},
          ],
        };

        const QUARTERLY_PROCEDURE = {
          id: "PROC-QPM-2025",
          name: "Quarterly Preventive Maintenance",
          nameSp: "Mantenimiento Preventivo - Quarterly",
          year: 2025,
          sections: [
            { name: "RV Leveling", items: [
              { text: "Level the RV for proper operation", type: "passFlagFail" },
            ]},
            { name: "Roof & Seals Inspection", items: [
              { text: "Check roof for water leaks", type: "passFlagFail" },
              { text: "Check slide-out for water leaks", type: "passFlagFail" },
              { text: "Check windows for water leaks", type: "passFlagFail" },
              { text: "Inspect seals and gaskets for water leaks", type: "passFlagFail" },
              { text: "Check storage compartment for water leaks", type: "passFlagFail" },
            ]},
            { name: "Lubrication", items: [
              { text: "Door lubrication", type: "passFlagFail" },
              { text: "Lock lubrication", type: "passFlagFail" },
            ]},
            { name: "LP Gas System", items: [
              { text: "Propane tank check and leak inspection", type: "passFlagFail" },
              { text: "Gas regulator checked and adjusted", type: "passFlagFail" },
              { text: "Stove/oven - pilots work correctly", type: "passFlagFail" },
              { text: "Heating works correctly", type: "passFlagFail" },
              { text: "Water heater works correctly", type: "passFlagFail" },
              { text: "Refrigerator works on gas, 110V, 12V", type: "passFlagFail" },
            ]},
            { name: "Water System", items: [
              { text: "Check city water pressure", type: "passFlagFail" },
              { text: "Check cold water lines", type: "passFlagFail" },
              { text: "Check hot water lines", type: "passFlagFail" },
              { text: "Sink works properly", type: "passFlagFail" },
              { text: "Shower works properly", type: "passFlagFail" },
              { text: "Toilet works properly", type: "passFlagFail" },
            ]},
            { name: "Plumbing", items: [
              { text: "Clean black tank", type: "passFlagFail" },
              { text: "Grey and black water outlet valves work properly", type: "passFlagFail" },
              { text: "Sink drain works properly", type: "passFlagFail" },
              { text: "Bathtub drain works properly", type: "passFlagFail" },
              { text: "Kitchen sink drain works properly", type: "passFlagFail" },
            ]},
            { name: "Safety & First Aid", items: [
              { text: "Smoke detector works properly", type: "passFlagFail" },
              { text: "Fire extinguisher is in good condition", type: "passFlagFail" },
              { text: "Carbon monoxide detector works properly", type: "passFlagFail" },
              { text: "Check walls for mold", type: "passFlagFail" },
            ]},
            { name: "Electrical Systems", items: [
              { text: "110V systems work correctly: microwave, TV, AC, outlets", type: "passFlagFail" },
              { text: "Check converter, fuses, breakers", type: "passFlagFail" },
              { text: "110V connector and adapter", type: "passFlagFail" },
            ]},
          ],
        };

        const ALL_PROCEDURES = [RV_PROCEDURE, QUARTERLY_PROCEDURE];
        const lookupId = activeChecklist?.procedureId || viewingChecklist?.procedureId;
        const currentProc = lookupId
          ? ALL_PROCEDURES.find(p => p.id === lookupId) || RV_PROCEDURE
          : RV_PROCEDURE;

        const totalItems = currentProc.sections.reduce((sum, sec) => sum + sec.items.length, 0);
        const resp = activeChecklist?.responses || {};
        const answeredCount = Object.keys(resp).filter(k => resp[k]?.value).length;
        const failedCount = Object.values(resp).filter(r => r.value === "No" || r.value === "Fail").length;
        const progressPct = totalItems > 0 ? Math.round((answeredCount / totalItems) * 100) : 0;

        const setResp = (key, field, val) => {
          setActiveChecklist(prev => ({
            ...prev,
            responses: { ...prev.responses, [key]: { ...(prev.responses[key] || {}), [field]: val } }
          }));
        };

        return (
          <div>
            {/* Start new checklist or show active */}
            {!activeChecklist && !viewingChecklist && (
              <div>
                {isAdmin && (
                  <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Start New Inspection Checklist</div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <label style={s.label}>Procedure</label>
                        <select id="proc-type" style={{ ...s.mSelect(mobile), width: "100%" }}>
                          {ALL_PROCEDURES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <label style={s.label}>Unit</label>
                        <select id="proc-unit" style={{ ...s.mSelect(mobile), width: "100%" }}>
                          <option value="">Select unit...</option>
                          {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <label style={s.label}>Inspector</label>
                        <select id="proc-inspector" style={{ ...s.mSelect(mobile), width: "100%" }}>
                          <option>Mike R.</option>
                          <option>External Vendor</option>
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <label style={s.label}>Date</label>
                        <input id="proc-date" type="date" defaultValue={new Date().toISOString().split("T")[0]} style={{ ...s.mInput(mobile), width: "100%" }} />
                      </div>
                    </div>
                    <button style={s.btn()} onClick={() => {
                      const procedureId = document.getElementById("proc-type").value;
                      const unit = document.getElementById("proc-unit").value;
                      const inspector = document.getElementById("proc-inspector").value;
                      const date = document.getElementById("proc-date").value;
                      if (!unit) { showSuccess("Please select a unit"); return; }
                      const proc = ALL_PROCEDURES.find(p => p.id === procedureId) || ALL_PROCEDURES[0];
                      setActiveChecklist({ id: `CL-${Date.now()}`, unit, inspector, date, procedure: proc.name, procedureId: proc.id, responses: {} });
                    }}>Start Checklist</button>
                  </div>
                )}

                {/* Procedure overview cards */}
                {ALL_PROCEDURES.map(proc => {
                  const procItems = proc.sections.reduce((sum, sec) => sum + sec.items.length, 0);
                  return (
                    <div key={proc.id} style={{ ...s.card, marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 17 }}>{proc.name}</div>
                          <div style={{ color: T.muted, fontSize: 13, fontStyle: "italic" }}>{proc.nameSp}</div>
                        </div>
                        <span style={s.badge(T.successDim, T.success)}>Active</span>
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8, fontSize: 13 }}>
                        <span style={{ color: T.dim }}>Sections: <strong style={{ color: T.text }}>{proc.sections.length}</strong></span>
                        <span style={{ color: T.dim }}>Total Items: <strong style={{ color: T.text }}>{procItems}</strong></span>
                        <span style={{ color: T.dim }}>Frequency: <strong style={{ color: T.text }}>{proc.id.includes("QPM") ? "Quarterly" : "Annual"}</strong></span>
                      </div>
                    </div>
                  );
                })}

                {/* Completed checklists history */}
                {savedChecklists.length > 0 && (
                  <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Completed Checklists ({savedChecklists.length})</div>
                    <table style={s.table}>
                      <thead><tr>{["Date", "Unit", "Procedure", "Inspector", "Result", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {savedChecklists.map(cl => {
                          const resultColor = cl.overallResult === "Pass" ? T.success : cl.overallResult === "Fail" ? T.danger : T.warn;
                          const resultBg = cl.overallResult === "Pass" ? T.successDim : cl.overallResult === "Fail" ? T.dangerDim : T.warnDim;
                          return (
                            <tr key={cl.id || cl._uuid} style={{ cursor: "pointer" }} onClick={() => setViewingChecklist(cl)}>
                              <td style={s.td}>{cl.date}</td>
                              <td style={s.td}><strong>{cl.unit}</strong></td>
                              <td style={s.td}><span style={{ fontSize: 12 }}>{cl.procedure}</span></td>
                              <td style={s.td}>{cl.inspector}</td>
                              <td style={s.td}><span style={s.badge(resultBg, resultColor)}>{cl.overallResult || "Complete"}</span></td>
                              <td style={s.td}><button style={s.btn("ghost")}>View</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* View completed checklist */}
            {viewingChecklist && (
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  <button style={s.btn("ghost")} onClick={() => setViewingChecklist(null)}>&larr; Back to Procedures</button>
                  {isAdmin && !editingChecklist && (
                    <button style={s.btn()} onClick={() => {
                      setActiveChecklist({ ...viewingChecklist, procedureId: viewingChecklist.procedureId });
                      setEditingChecklist(true);
                      setViewingChecklist(null);
                    }}>Edit Checklist</button>
                  )}
                </div>
                <div style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 17 }}>{viewingChecklist.procedure}</div>
                      <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Unit {viewingChecklist.unit} &middot; {viewingChecklist.inspector} &middot; {viewingChecklist.date}</div>
                    </div>
                    <span style={s.badge(T.successDim, T.success)}>{viewingChecklist.overallResult || "Complete"}</span>
                  </div>
                  {currentProc.sections.map((sec, si) => {
                    const secItems = sec.items.map((item, ii) => ({ ...item, key: `${si}-${ii}`, response: viewingChecklist.responses[`${si}-${ii}`] }));
                    const secFailed = secItems.filter(i => i.response?.value === "No" || i.response?.value === "Fail").length;
                    return (
                      <details key={si} open={secFailed > 0} style={{ marginBottom: 8, borderRadius: T.radiusSm, border: `1px solid ${secFailed > 0 ? T.danger : T.border}`, overflow: "hidden" }}>
                        <summary style={{ padding: "10px 14px", cursor: "pointer", fontWeight: 600, fontSize: 14, background: T.cardBg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{sec.name}</span>
                          <span style={{ fontSize: 12 }}>
                            {secFailed > 0 && <span style={{ ...s.badge(T.dangerDim, T.danger), marginRight: 8 }}>{secFailed} failed</span>}
                            <span style={{ color: T.muted }}>{sec.items.length} items</span>
                          </span>
                        </summary>
                        <div style={{ padding: "8px 0" }}>
                          {secItems.map(item => (
                            <div key={item.key} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, background: item.response?.value === "No" || item.response?.value === "Fail" ? T.dangerDim : "transparent" }}>
                              <div style={{ flex: 1, fontSize: 13 }}>{item.text}</div>
                              <div style={{ textAlign: "right", minWidth: 80 }}>
                                {item.response?.value ? (
                                  <span style={s.badge(
                                    item.response.value === "Yes" || item.response.value === "Ok" || item.response.value === "Pass" ? T.successDim : item.response.value === "N/A" || item.response.value === "Flag" ? T.warnDim : T.dangerDim,
                                    item.response.value === "Yes" || item.response.value === "Ok" || item.response.value === "Pass" ? T.success : item.response.value === "N/A" || item.response.value === "Flag" ? T.warn : T.danger
                                  )}>{item.response.value}</span>
                                ) : <span style={{ fontSize: 12, color: T.dim }}>--</span>}
                                {item.response?.notes && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{item.response.notes}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active checklist — fill it out */}
            {activeChecklist && (
              <div>
                {/* Progress header */}
                <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{currentProc.name}</div>
                      <div style={{ fontSize: 13, color: T.muted }}>Unit {activeChecklist.unit} &middot; {activeChecklist.inspector} &middot; {activeChecklist.date}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: 20, color: progressPct === 100 ? T.success : T.accent }}>{progressPct}%</div>
                      <div style={{ fontSize: 12, color: T.muted }}>{answeredCount}/{totalItems} items</div>
                    </div>
                  </div>
                  <div style={{ background: T.border, borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ background: progressPct === 100 ? T.success : T.accent, height: "100%", width: `${progressPct}%`, transition: "width 0.3s", borderRadius: 4 }} />
                  </div>
                  {failedCount > 0 && <div style={{ fontSize: 12, color: T.danger, marginTop: 6, fontWeight: 600 }}>{failedCount} item{failedCount !== 1 ? "s" : ""} failed</div>}
                </div>

                {/* Sections */}
                {currentProc.sections.map((sec, si) => {
                  const secAnswered = sec.items.filter((_, ii) => resp[`${si}-${ii}`]?.value).length;
                  const secFailed = sec.items.filter((_, ii) => resp[`${si}-${ii}`]?.value === "No" || resp[`${si}-${ii}`]?.value === "Fail").length;
                  return (
                    <details key={si} style={{ marginBottom: 8, borderRadius: T.radiusSm, border: `1px solid ${secFailed > 0 ? T.danger : secAnswered === sec.items.length ? T.success : T.border}`, overflow: "hidden" }}>
                      <summary style={{ padding: "12px 14px", cursor: "pointer", fontWeight: 600, fontSize: 14, background: T.cardBg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{sec.name}</span>
                        <span style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                          {secFailed > 0 && <span style={s.badge(T.dangerDim, T.danger)}>{secFailed} failed</span>}
                          <span style={{ color: secAnswered === sec.items.length ? T.success : T.muted, fontWeight: secAnswered === sec.items.length ? 700 : 400 }}>
                            {secAnswered}/{sec.items.length}
                          </span>
                        </span>
                      </summary>
                      <div style={{ padding: 0 }}>
                        {sec.items.map((item, ii) => {
                          const key = `${si}-${ii}`;
                          const r = resp[key] || {};
                          const isFailed = r.value === "No" || r.value === "Fail" || r.value === "Flag";
                          return (
                            <div key={ii} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, background: isFailed ? T.dangerDim : r.value ? "transparent" : "transparent" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: r.value || item.type === "text" || item.type === "photo" ? 8 : 0 }}>
                                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                                  <span style={{ color: T.dim, marginRight: 6 }}>{ii + 1}.</span>
                                  {item.text}
                                  <span style={{ marginLeft: 6, fontSize: 11, color: T.muted }}>
                                    ({item.type === "yesNoNa" ? "Yes/No/N/A" : item.type === "passFlagFail" ? "Pass/Flag/Fail" : item.type === "photo" ? "Photo" : "Detail"})
                                  </span>
                                </div>
                                {(item.type === "yesNoNa" || item.type === "passFlagFail") && (
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {(item.type === "passFlagFail" ? ["Pass", "Flag", "Fail"] : ["Yes", "No", "N/A"]).map(opt => (
                                      <button key={opt} onClick={() => setResp(key, "value", opt)} style={{
                                        padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 4, border: `1px solid ${T.border}`, cursor: "pointer",
                                        background: r.value === opt ? (opt === "Yes" || opt === "Pass" ? T.success : opt === "No" || opt === "Fail" ? T.danger : T.warn) : T.cardBg,
                                        color: r.value === opt ? "#fff" : T.text,
                                      }}>{opt}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {item.type === "text" && (
                                <input style={{ ...s.mInput(mobile), width: "100%", boxSizing: "border-box", fontSize: 12 }}
                                  placeholder="Enter details..."
                                  value={r.value || ""}
                                  onChange={e => setResp(key, "value", e.target.value)}
                                />
                              )}
                              {item.type === "photo" && (
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <select style={{ ...s.mSelect(mobile), fontSize: 12 }} value={r.value || ""} onChange={e => setResp(key, "value", e.target.value)}>
                                    <option value="">Photo status...</option>
                                    <option value="Ok">Photo captured - Ok</option>
                                    <option value="Issues noted">Photo captured - Issues noted</option>
                                    <option value="N/A">N/A</option>
                                  </select>
                                </div>
                              )}
                              {/* Notes field for every item */}
                              <input style={{ ...s.mInput(mobile), width: "100%", boxSizing: "border-box", fontSize: 11, marginTop: 6, color: T.muted }}
                                placeholder="Add notes (optional)..."
                                value={r.notes || ""}
                                onChange={e => setResp(key, "notes", e.target.value)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button style={s.btn()} onClick={async () => {
                    const result = failedCount > 0 ? "Fail" : "Pass";
                    try {
                      if (editingChecklist && activeChecklist._uuid && onUpdateChecklist) {
                        // Update existing checklist in Supabase
                        await onUpdateChecklist(activeChecklist._uuid, {
                          responses: activeChecklist.responses,
                          overallResult: result,
                        });
                        showSuccess("Checklist updated!");
                      } else if (onSaveChecklist) {
                        // Save new checklist to Supabase
                        await onSaveChecklist({
                          ...activeChecklist,
                          procedureId: activeChecklist.procedureId || currentProc.id,
                          procedure: currentProc.name,
                          overallResult: result,
                        });
                        // Also create an inspection record
                        if (onSchedule) {
                          const resident = LIVE_RESIDENTS.find(r => r.unit === activeChecklist.unit);
                          onSchedule({
                            id: `UI-${Date.now()}`,
                            unit: activeChecklist.unit,
                            propertyId: resident?.propertyId || LIVE_PROPERTIES[0]?.id || "wharf",
                            category: currentProc.name,
                            date: activeChecklist.date,
                            inspector: activeChecklist.inspector,
                            result,
                            score: `${answeredCount}/${totalItems}`,
                            failedItems: Object.entries(resp).filter(([, r]) => r.value === "No" || r.value === "Fail" || r.value === "Flag").map(([k]) => {
                              const [si2, ii2] = k.split("-").map(Number);
                              return currentProc.sections[si2]?.items[ii2]?.text || k;
                            }),
                            notes: `Checklist ${activeChecklist.id}: ${answeredCount}/${totalItems} items completed, ${failedCount} failed`,
                          });
                        }
                        showSuccess(`Inspection checklist completed — ${result}`);
                      }
                    } catch (err) { showSuccess("Error: " + err.message); }
                    setActiveChecklist(null);
                    setEditingChecklist(false);
                  }}>{editingChecklist ? "Update Checklist" : `Complete & Save (${progressPct}% done)`}</button>
                  <button style={s.btn("ghost")} onClick={() => {
                    if (editingChecklist) { setActiveChecklist(null); setEditingChecklist(false); }
                    else if (confirm("Discard this checklist? All responses will be lost.")) setActiveChecklist(null);
                  }}>{editingChecklist ? "Cancel" : "Discard"}</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Regulatory — admin only */}
      {tab === "Regulatory" && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Regulatory Inspection Log</div>
            <ExportButton mobile={mobile} onClick={() => generateCSV(
              [{ label: "Type", key: "type" }, { label: "Authority", key: "authority" }, { label: "Last Date", key: "date" }, { label: "Result", key: "result" }, { label: "Score", key: "score" }, { label: "Next Due", key: "nextDue" }, { label: "Deficiencies", key: "deficiencies" }],
              regInsp, "regulatory_inspections"
            )} />
          </div>
          <SortableTable
            mobile={mobile}
            columns={[
              { key: "type", label: "Type", render: v => <span style={{ fontWeight: 600 }}>{v}</span>, filterOptions: [...new Set(regInsp.map(i => i.type))] },
              { key: "authority", label: "Authority" },
              { key: "date", label: "Last Date" },
              { key: "result", label: "Result", render: v => <span style={s.badge(v === "Pass" ? T.successDim : T.dangerDim, v === "Pass" ? T.success : T.danger)}>{v}</span>, filterOptions: ["Pass", "Fail"], filterValue: row => row.result },
              { key: "score", label: "Score", render: v => v || "—", filterable: false },
              { key: "nextDue", label: "Next Due", tdStyle: row => ({ color: new Date(row.nextDue) < new Date("2026-06-01") ? T.warn : T.text, fontWeight: new Date(row.nextDue) < new Date("2026-06-01") ? 600 : 400 }) },
              { key: "deficiencies", label: "Deficiencies", render: v => v > 0 ? <span style={s.badge(T.dangerDim, T.danger)}>{v}</span> : <span style={{ color: T.dim }}>0</span>, sortValue: row => row.deficiencies, filterable: false },
            ]}
            data={regInsp}
          />
        </div>
      )}

      {/* Categories tab */}
      {tab === "Categories" && (
        <div>
          {isAdmin && <button style={{ ...s.btn(), marginBottom: 16 }}>+ Add Category</button>}
          <div style={s.grid("1fr 1fr", mobile)}>
            {MOCK_UNIT_INSPECTION_CATEGORIES.map(cat => (
              <div key={cat.id} style={{ ...s.card, opacity: cat.active ? 1 : 0.5, borderLeft: `3px solid ${cat.active ? T.accent : T.dim}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{cat.name}</span>
                  <span style={s.badge(cat.active ? T.successDim : T.dangerDim, cat.active ? T.success : T.danger)}>{cat.active ? "Active" : "Inactive"}</span>
                </div>
                <div style={{ color: T.muted, fontSize: 13, marginBottom: 8 }}>{cat.description}</div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: T.dim }}>
                  <span>Frequency: {cat.frequency}</span>
                  <span>Scoring: {cat.scoring}</span>
                  <span>Checklist: {cat.checklist.length} items</span>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button style={s.btn("ghost")} onClick={() => { const idx = MOCK_UNIT_INSPECTION_CATEGORIES.findIndex(c => c.id === cat.id); if (idx >= 0) MOCK_UNIT_INSPECTION_CATEGORIES[idx].active = !cat.active; showSuccess(cat.active ? `${cat.name} deactivated` : `${cat.name} activated`); }}>{cat.active ? "Deactivate" : "Activate"}</button>
                    <button style={s.btn("ghost")} onClick={() => alert(`Checklist for ${cat.name}:\n\n${cat.checklist.map((c, i) => `${i + 1}. ${c}`).join("\n")}`)}> View Checklist</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Assigned — maintenance only */}
      {tab === "My Assigned" && role === "maintenance" && (
        <EmptyState icon="📋" text="No inspections currently assigned. Check back soon!" />
      )}
    </div>
  );
};

// --- VENDORS (Admin & Maintenance) ---
const Vendors = ({ role, mobile, vendors: vendorData, onAddVendor, onUpdateVendor }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("active");
  const [success, showSuccess] = useSuccess();
  const [vForm, setVForm] = useState({ company: "", contact: "", trade: "Plumbing", phone: "", email: "", license: "", licenseExp: "", insured: "Yes", coiExp: "", notes: "" });
  const [editingVendor, setEditingVendor] = useState(null);
  const [evForm, setEvForm] = useState({});
  const vendors = filter === "active" ? vendorData.filter(v => v.active) : filter === "inactive" ? vendorData.filter(v => !v.active) : vendorData;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <h1 style={s.sectionTitle}>Vendor Directory</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ExportButton mobile={mobile} onClick={() => generateCSV(
            [{ label: "Company", key: "company" }, { label: "Contact", key: "contact" }, { label: "Trade", key: "trade" }, { label: "Phone", key: "phone" }, { label: "Email", key: "email" }, { label: "License #", key: "license" }, { label: "Active", key: "active", exportValue: r => r.active ? "Yes" : "No" }],
            vendorData, "vendors"
          )} />
          <button style={s.btn()} onClick={() => setShowAdd(!showAdd)}>{showAdd ? "Cancel" : "+ Add Vendor"}</button>
        </div>
      </div>
      <p style={s.sectionSub}>Manage external contractors and service providers</p>
      <SuccessMessage message={success} />
      {showAdd && (
        <div style={{ ...s.card, borderColor: T.accent }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Add New Vendor</div>
          <div style={{ ...s.grid("1fr 1fr 1fr", mobile), marginBottom: 14 }}>
            <div><label style={s.label}>Company Name</label><input style={s.mInput(mobile)} value={vForm.company} onChange={e => setVForm(p => ({ ...p, company: e.target.value }))} /></div>
            <div><label style={s.label}>Primary Contact</label><input style={s.mInput(mobile)} value={vForm.contact} onChange={e => setVForm(p => ({ ...p, contact: e.target.value }))} /></div>
            <div><label style={s.label}>Trade / Specialty</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={vForm.trade} onChange={e => setVForm(p => ({ ...p, trade: e.target.value }))}><option>Plumbing</option><option>HVAC</option><option>Electrical</option><option>Pest Control</option><option>Roofing</option><option>General Contractor</option><option>Fire Systems</option><option>Elevator</option><option>Other</option></select></div>
          </div>
          <div style={{ ...s.grid("1fr 1fr 1fr", mobile), marginBottom: 14 }}>
            <div><label style={s.label}>Phone</label><input style={s.mInput(mobile)} value={vForm.phone} onChange={e => setVForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div><label style={s.label}>Email</label><input style={s.mInput(mobile)} type="email" value={vForm.email} onChange={e => setVForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><label style={s.label}>License Number</label><input style={s.mInput(mobile)} value={vForm.license} onChange={e => setVForm(p => ({ ...p, license: e.target.value }))} /></div>
          </div>
          <div style={{ ...s.grid("1fr 1fr 1fr", mobile), marginBottom: 14 }}>
            <div><label style={s.label}>License Expiration</label><input style={s.mInput(mobile)} type="date" value={vForm.licenseExp} onChange={e => setVForm(p => ({ ...p, licenseExp: e.target.value }))} /></div>
            <div><label style={s.label}>Insurance on File</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={vForm.insured} onChange={e => setVForm(p => ({ ...p, insured: e.target.value }))}><option>Yes</option><option>No</option></select></div>
            <div><label style={s.label}>COI Expiration</label><input style={s.mInput(mobile)} type="date" value={vForm.coiExp} onChange={e => setVForm(p => ({ ...p, coiExp: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={s.label}>Notes</label><textarea style={{ ...s.input, minHeight: 60 }} value={vForm.notes} onChange={e => setVForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <button style={s.btn()} onClick={() => {
            if (!vForm.company.trim()) return;
            onAddVendor({
              id: `V-${100 + vendorData.length}`,
              company: vForm.company.trim(),
              contact: vForm.contact.trim(),
              trade: vForm.trade,
              phone: vForm.phone.trim(),
              email: vForm.email.trim(),
              license: vForm.license.trim(),
              licenseExp: vForm.licenseExp || "2027-01-01",
              insured: vForm.insured === "Yes",
              coiExp: vForm.coiExp || "2027-01-01",
              active: true,
              notes: vForm.notes.trim(),
            });
            setVForm({ company: "", contact: "", trade: "Plumbing", phone: "", email: "", license: "", licenseExp: "", insured: "Yes", coiExp: "", notes: "" });
            setShowAdd(false);
            showSuccess("Vendor added!");
          }}>Save Vendor</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["active", "inactive", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...s.btn(filter === f ? "primary" : "ghost"), textTransform: "capitalize" }}>{f}</button>
        ))}
      </div>
      <div style={s.card}>
        <SortableTable
          mobile={mobile}
          columns={[
            { key: "company", label: "Company", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
            { key: "contact", label: "Contact" },
            { key: "trade", label: "Trade", render: v => <span style={s.badge(T.infoDim, T.info)}>{v}</span>, filterOptions: [...new Set(vendorData.map(v => v.trade))], filterValue: row => row.trade },
            { key: "phone", label: "Phone", sortable: false, filterable: false },
            { key: "license", label: "License", render: v => <span style={{ fontSize: 12 }}>{v}</span>, filterable: false },
            { key: "licenseExp", label: "Lic. Exp", render: (v) => `${v}${new Date(v) < new Date("2026-06-01") ? " ⚠" : ""}`, tdStyle: row => ({ color: new Date(row.licenseExp) < new Date("2026-06-01") ? T.danger : T.text, fontWeight: new Date(row.licenseExp) < new Date("2026-06-01") ? 600 : 400 }), filterable: false },
            { key: "insured", label: "Insured", render: (_, row) => <span style={s.badge(row.insured ? T.successDim : T.dangerDim, row.insured ? T.success : T.danger)}>{row.insured ? "Yes" : "No"}</span>, filterOptions: ["Yes", "No"], filterValue: row => row.insured ? "Yes" : "No" },
            { key: "coiExp", label: "COI Exp", render: (v) => `${v}${new Date(v) < new Date("2026-06-01") ? " ⚠" : ""}`, tdStyle: row => ({ color: new Date(row.coiExp) < new Date("2026-06-01") ? T.danger : T.text, fontWeight: new Date(row.coiExp) < new Date("2026-06-01") ? 600 : 400 }), filterable: false },
            ...(role === "admin" ? [{ key: "_actions", label: "", sortable: false, filterable: false, render: (_, row) => <button style={s.btn("ghost")} onClick={() => { setEditingVendor(row); setEvForm({ company: row.company, contact: row.contact, trade: row.trade, phone: row.phone, email: row.email, license: row.license, licenseExp: row.licenseExp, insured: row.insured ? "Yes" : "No", coiExp: row.coiExp, notes: row.notes || "", active: row.active }); }}>Edit</button> }] : []),
          ]}
          data={vendors}
          rowStyle={row => ({ opacity: row.active ? 1 : 0.55 })}
        />
      </div>
      {editingVendor && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.info}`, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Edit Vendor: {editingVendor.company}</div>
            <button style={s.btn("ghost")} onClick={() => setEditingVendor(null)}>Cancel</button>
          </div>
          <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>Company</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={evForm.company || ""} onChange={e => setEvForm(f => ({ ...f, company: e.target.value }))} /></div>
            <div><label style={s.label}>Contact</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={evForm.contact || ""} onChange={e => setEvForm(f => ({ ...f, contact: e.target.value }))} /></div>
            <div><label style={s.label}>Trade</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={evForm.trade} onChange={e => setEvForm(f => ({ ...f, trade: e.target.value }))}><option>Plumbing</option><option>HVAC</option><option>Electrical</option><option>Pest Control</option><option>Roofing</option><option>General Contractor</option><option>Other</option></select></div>
            <div><label style={s.label}>Phone</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={evForm.phone || ""} onChange={e => setEvForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label style={s.label}>Email</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={evForm.email || ""} onChange={e => setEvForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><label style={s.label}>License</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={evForm.license || ""} onChange={e => setEvForm(f => ({ ...f, license: e.target.value }))} /></div>
            <div><label style={s.label}>License Exp</label><input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={evForm.licenseExp || ""} onChange={e => setEvForm(f => ({ ...f, licenseExp: e.target.value }))} /></div>
            <div><label style={s.label}>Insured</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={evForm.insured} onChange={e => setEvForm(f => ({ ...f, insured: e.target.value }))}><option>Yes</option><option>No</option></select></div>
            <div><label style={s.label}>COI Exp</label><input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={evForm.coiExp || ""} onChange={e => setEvForm(f => ({ ...f, coiExp: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Toggle label="Active" checked={evForm.active !== false} onChange={() => setEvForm(f => ({ ...f, active: !f.active }))} />
          </div>
          <button style={{ ...s.mBtn("primary", mobile), marginTop: 14 }} onClick={() => {
            if (onUpdateVendor) onUpdateVendor(editingVendor.id, { ...evForm, insured: evForm.insured === "Yes" });
            setEditingVendor(null);
            showSuccess("Vendor updated!");
          }}>Save Changes</button>
        </div>
      )}
      {vendorData.some(v => !v.active || new Date(v.licenseExp) < new Date("2026-06-01")) && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.danger}`, background: T.dangerDim }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: T.danger }}>Vendor Alerts</div>
          {vendorData.filter(v => !v.active || new Date(v.licenseExp) < new Date("2026-06-01")).map(v => (
            <div key={v.id} style={{ fontSize: 13, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{v.company}</span> — {v.notes || "License/insurance needs attention"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- COMMUNICATIONS (Unified — All Roles) ---
const CHANNEL_BADGES = { sms: { bg: T.successDim, text: T.success, label: "SMS" }, email: { bg: T.infoDim, text: T.info, label: "Email" }, phone: { bg: T.warnDim, text: T.warn, label: "Phone" }, multi: { bg: T.accentDim, text: T.accent, label: "All" }, portal: { bg: T.dimLight, text: T.muted, label: "Portal" } };

const ThreadView = ({ thread, onBack, mobile, messages: allMessages, onAddMessage, onUpdateThread }) => {
  const [reply, setReply] = useState("");
  const messages = allMessages.filter(m => m.threadId === thread.id);
  const resident = LIVE_RESIDENTS.find(r => thread.participants.includes(r.id));
  const isBroadcast = thread.type === "broadcast";

  return (
    <div>
      <button onClick={onBack} style={{ ...s.btn("ghost"), marginBottom: 16, minHeight: mobile ? 44 : undefined }}>← Back</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: mobile ? "flex-start" : "center", marginBottom: 16, flexDirection: mobile ? "column" : "row", gap: mobile ? 8 : 0 }}>
        <div>
          <h2 style={{ fontSize: mobile ? 16 : 18, fontWeight: 700, marginBottom: 4 }}>{thread.subject}</h2>
          <div style={{ fontSize: 13, color: T.muted }}>
            {isBroadcast ? "Broadcast to all residents" : `${resident?.name || "Unknown"} — Unit ${resident?.unit || "?"}`}
            <span style={{ ...s.badge(CHANNEL_BADGES[thread.channel].bg, CHANNEL_BADGES[thread.channel].text), marginLeft: 10 }}>{CHANNEL_BADGES[thread.channel].label}</span>
          </div>
        </div>
        {isBroadcast && <span style={s.badge(T.successDim, T.success)}>{LIVE_RESIDENTS.length} delivered</span>}
      </div>
      <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: mobile ? 12 : 20, maxHeight: mobile ? "60vh" : 400, overflowY: "auto" }}>
          {messages.map(msg => {
            const isAdmin = msg.from === "admin";
            const sender = isAdmin ? "Management" : (LIVE_RESIDENTS.find(r => r.id === msg.from)?.name || msg.from);
            return (
              <div key={msg.id} style={{ display: "flex", justifyContent: isAdmin ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: mobile ? "85%" : "70%", padding: "10px 14px", borderRadius: 12, background: isAdmin ? T.accent : T.bg, color: isAdmin ? T.white : T.text, borderBottomRightRadius: isAdmin ? 4 : 12, borderBottomLeftRadius: isAdmin ? 12 : 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>{sender}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{msg.body}</div>
                  <div style={{ fontSize: 10, marginTop: 6, opacity: 0.6, textAlign: "right" }}>{new Date(msg.date).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
        {!isBroadcast && (
          <div style={{ padding: mobile ? "10px 12px" : "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: mobile ? "column" : "row", gap: 10 }}>
            <input style={{ ...s.mInput(mobile), flex: 1 }} placeholder="Type a reply..." value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && reply.trim()) { onAddMessage({ id: `MSG-${Date.now()}`, threadId: thread.id, from: "admin", body: reply.trim(), date: new Date().toISOString() }); onUpdateThread(thread.id, { lastMessage: reply.trim(), lastDate: new Date().toISOString() }); setReply(""); } }} />
            <button style={s.mBtn(undefined, mobile)} onClick={() => { if (!reply.trim()) return; onAddMessage({ id: `MSG-${Date.now()}`, threadId: thread.id, from: "admin", body: reply.trim(), date: new Date().toISOString() }); onUpdateThread(thread.id, { lastMessage: reply.trim(), lastDate: new Date().toISOString() }); setReply(""); }}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
};

const Communications = ({ role, commPrefs, setCommPrefs, mobile, threads: threadData, messages: messageData, onAddThread, onAddMessage, onUpdateThread, onDeleteThread, rc }) => {
  const isAdmin = role === "admin";
  const isMaint = role === "maintenance";
  const tabs = isAdmin ? ["Inbox", "Compose", "Templates"] : isMaint ? ["Messages"] : ["Messages", "Preferences"];
  const [tab, setTab] = useState(tabs[0]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [composeData, setComposeData] = useState({ to: "", broadcast: false, channel: "auto", subject: "", body: "", priority: "normal", template: "" });
  const [sending, setSending] = useState(false);
  const [success, showSuccess] = useSuccess();

  const getInitials = (name) => name.split(" ").map(w => w[0]).join("").slice(0, 2);
  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // Filter threads by role
  const threads = isAdmin ? threadData
    : isMaint ? threadData.filter(t => t.type === "broadcast" || t.subject.toLowerCase().includes("maintenance"))
    : threadData.filter(t => t.type === "broadcast" || t.participants.includes(rc?.id || ""));
  const sortedThreads = [...threads].sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
  const unreadCount = sortedThreads.filter(t => t.unread > 0).length;

  // If viewing a thread
  if (selectedThread) {
    return (
      <div>
        <h1 style={s.sectionTitle}>{isAdmin ? "Communications" : "Messages"}</h1>
        <p style={s.sectionSub}>{isAdmin ? "Manage resident communications" : isMaint ? "Maintenance-related messages" : "Your messages"}</p>
        <ThreadView thread={selectedThread} onBack={() => setSelectedThread(null)} mobile={mobile} messages={messageData} onAddMessage={onAddMessage} onUpdateThread={onUpdateThread} />
      </div>
    );
  }

  const handleTemplateSelect = (tplId) => {
    const tpl = MOCK_COMM_TEMPLATES.find(t => t.id === tplId);
    if (tpl) setComposeData(prev => ({ ...prev, body: tpl.body, subject: tpl.subject || prev.subject, channel: tpl.channel === "multi" ? "auto" : tpl.channel, template: tplId }));
  };

  // Thread list item renderer
  const ThreadItem = ({ thread: t }) => {
    const isBroadcast = t.type === "broadcast";
    const resident = !isBroadcast ? LIVE_RESIDENTS.find(r => t.participants.includes(r.id)) : null;
    const name = isBroadcast ? "All Residents" : (resident?.name || "Unknown");
    const chBadge = CHANNEL_BADGES[t.channel];
    return (
      <div onClick={() => setSelectedThread(t)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${T.borderLight}`, background: t.unread > 0 ? T.accentDim : "transparent", transition: "background 0.15s" }}
        onMouseEnter={e => { if (!t.unread) e.currentTarget.style.background = T.surfaceHover; }}
        onMouseLeave={e => { if (!t.unread) e.currentTarget.style.background = "transparent"; }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: isBroadcast ? T.warnDim : T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: isBroadcast ? T.warn : T.accent, flexShrink: 0 }}>
          {isBroadcast ? "📢" : getInitials(name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontWeight: t.unread > 0 ? 700 : 600, fontSize: 14 }}>{name}</span>
            <span style={{ fontSize: 11, color: T.dim, flexShrink: 0, marginLeft: 8 }}>{formatTime(t.lastDate)}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: t.unread > 0 ? 600 : 400, color: t.unread > 0 ? T.text : T.muted, marginBottom: 3 }}>{t.subject}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{t.lastMessage}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <span style={s.badge(chBadge.bg, chBadge.text)}>{chBadge.label}</span>
              {t.priority === "high" && <span style={s.badge(T.dangerDim, T.danger)}>!</span>}
              {t.unread > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />}
              {isAdmin && onDeleteThread && <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this thread?")) onDeleteThread(t.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.dim, fontSize: 14, padding: "2px 4px", marginLeft: 4 }} title="Delete thread">🗑</button>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={s.sectionTitle}>{isAdmin ? "Communications" : "Messages"}</h1>
        {unreadCount > 0 && <span style={s.badge(T.accentDim, T.accent)}>{unreadCount} unread</span>}
      </div>
      <p style={s.sectionSub}>{isAdmin ? "Send, receive, and manage all resident communications" : isMaint ? "Maintenance-related messages and broadcasts" : "View messages and manage your contact preferences"}</p>
      <SuccessMessage message={success} />

      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {/* INBOX / MESSAGES TAB */}
      {(tab === "Inbox" || tab === "Messages") && (
        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          {sortedThreads.length === 0 ? (
            <EmptyState icon="💬" text="No messages yet" />
          ) : sortedThreads.map(t => <ThreadItem key={t.id} thread={t} />)}
        </div>
      )}

      {/* COMPOSE TAB (Admin) */}
      {tab === "Compose" && isAdmin && (
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>New Message</div>
          <div style={{ marginBottom: 14 }}>
            <Toggle label="Broadcast to all residents" checked={composeData.broadcast} onChange={() => setComposeData(prev => ({ ...prev, broadcast: !prev.broadcast, to: "" }))} />
          </div>
          {!composeData.broadcast && (
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>To</label>
              <select style={{ ...s.select, width: "100%" }} value={composeData.to} onChange={e => setComposeData(prev => ({ ...prev, to: e.target.value }))}>
                <option value="">Select resident...</option>
                {LIVE_RESIDENTS.map(r => (
                  <option key={r.id} value={r.id}>{r.name} — Unit {r.unit} ({r.preferredChannel})</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ ...s.grid("1fr 1fr 1fr", mobile), marginBottom: 14 }}>
            <div>
              <label style={s.label}>Channel</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={composeData.channel} onChange={e => setComposeData(prev => ({ ...prev, channel: e.target.value }))}>
                <option value="auto">Auto (resident preference)</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Priority</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={composeData.priority} onChange={e => setComposeData(prev => ({ ...prev, priority: e.target.value }))}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Use Template</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={composeData.template} onChange={e => handleTemplateSelect(e.target.value)}>
                <option value="">None</option>
                {MOCK_COMM_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Subject</label>
            <input style={s.input} value={composeData.subject} onChange={e => setComposeData(prev => ({ ...prev, subject: e.target.value }))} placeholder="Message subject..." />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Message</label>
            <textarea style={{ ...s.input, minHeight: 120, resize: "vertical" }} value={composeData.body} onChange={e => setComposeData(prev => ({ ...prev, body: e.target.value }))} placeholder="Type your message..." />
          </div>
          {composeData.broadcast && (
            <div style={{ padding: 12, background: T.warnDim, borderRadius: T.radiusSm, marginBottom: 14, fontSize: 13, color: T.warn }}>
              This message will be sent to all {LIVE_RESIDENTS.length} residents via their preferred channel.
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button disabled={sending} style={s.btn()} onClick={async () => {
              if (!composeData.subject.trim() || !composeData.body.trim() || sending) return;
              setSending(true);
              const threadId = `THR-${Date.now()}`;
              const ch = composeData.channel === "auto" ? "email" : composeData.channel;
              // Save thread + message to database
              onAddThread({
                id: threadId,
                participants: composeData.broadcast ? ["all"] : [composeData.to],
                subject: composeData.subject.trim(),
                lastMessage: composeData.body.trim().slice(0, 80),
                lastDate: new Date().toISOString(),
                unread: 0,
                channel: composeData.broadcast ? "multi" : ch,
                type: composeData.broadcast ? "broadcast" : "direct",
                priority: composeData.priority,
              });
              onAddMessage({
                id: `MSG-${Date.now()}`,
                threadId,
                from: "admin",
                body: composeData.body.trim(),
                date: new Date().toISOString(),
              });
              // Actually send the message via SMS/email
              try {
                if (composeData.broadcast) {
                  for (const r of LIVE_RESIDENTS) {
                    if (ch === "sms" && r.phone) await sendSMS(r.phone, composeData.body.trim());
                    else if (ch === "email" && r.email) await sendNotification("custom", { to: r.email, subject: composeData.subject.trim(), body: composeData.body.trim() });
                    else {
                      if (r.phone) await sendSMS(r.phone, composeData.body.trim());
                      if (r.email) await sendNotification("custom", { to: r.email, subject: composeData.subject.trim(), body: composeData.body.trim() });
                    }
                  }
                } else {
                  const r = LIVE_RESIDENTS.find(res => res.id === composeData.to);
                  if (r) {
                    if (ch === "sms" && r.phone) await sendSMS(r.phone, composeData.body.trim());
                    else if (ch === "email" && r.email) await sendNotification("custom", { to: r.email, subject: composeData.subject.trim(), body: composeData.body.trim() });
                    else {
                      if (r.phone) await sendSMS(r.phone, composeData.body.trim());
                      if (r.email) await sendNotification("custom", { to: r.email, subject: composeData.subject.trim(), body: composeData.body.trim() });
                    }
                  }
                }
              } catch (err) { console.warn("Send delivery failed:", err); }
              setComposeData({ to: "", broadcast: false, channel: "auto", subject: "", body: "", priority: "normal", template: "" });
              setSending(false);
              setTab("Inbox");
              showSuccess("Message sent!");
            }}>{sending ? "Sending..." : "Send Message"}</button>
            <button style={s.btn("ghost")} onClick={() => setComposeData({ to: "", broadcast: false, channel: "auto", subject: "", body: "", priority: "normal", template: "" })}>Clear</button>
          </div>
        </div>
      )}

      {/* TEMPLATES TAB (Admin) */}
      {tab === "Templates" && isAdmin && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div />
            <button style={s.btn()}>+ New Template</button>
          </div>
          {MOCK_COMM_TEMPLATES.map(tpl => {
            const chBadge = CHANNEL_BADGES[tpl.channel] || CHANNEL_BADGES.portal;
            return (
              <div key={tpl.id} style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{tpl.name}</span>
                  <span style={s.badge(chBadge.bg, chBadge.text)}>{chBadge.label}</span>
                </div>
                {tpl.subject && <div style={{ fontSize: 13, color: T.muted, marginBottom: 6 }}>Subject: {tpl.subject}</div>}
                <div style={{ fontSize: 14, color: T.text, lineHeight: 1.5, padding: 12, background: T.bg, borderRadius: T.radiusSm, marginBottom: 10 }}>{tpl.body}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={s.btn("ghost")}>Edit</button>
                  <button style={s.btn("ghost")} onClick={() => { setTab("Compose"); handleTemplateSelect(tpl.id); }}>Use</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PREFERENCES TAB (Resident) */}
      {tab === "Preferences" && !isAdmin && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Contact Preferences</div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Preferred Channel</label>
              <div style={{ display: "flex", gap: 10 }}>
                {["sms", "email", "phone"].map(ch => (
                  <button key={ch} onClick={() => setCommPrefs(prev => ({ ...prev, preferredChannel: ch }))}
                    style={{ ...s.btn(commPrefs.preferredChannel === ch ? "primary" : "ghost"), flex: 1, textTransform: "uppercase", fontSize: 12 }}>
                    {ch === "sms" ? "📱 SMS" : ch === "email" ? "📧 Email" : "📞 Phone"}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
                {commPrefs.preferredChannel === "sms" && "You'll receive messages via text. Standard rates may apply."}
                {commPrefs.preferredChannel === "email" && "You'll receive messages at your email address."}
                {commPrefs.preferredChannel === "phone" && "Management will call you for important communications."}
              </div>
            </div>
            <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Phone Number</label><input style={s.mInput(mobile)} value={commPrefs.phone} onChange={e => setCommPrefs(prev => ({ ...prev, phone: e.target.value }))} /></div>
              <div><label style={s.label}>Email Address</label><input style={s.mInput(mobile)} type="email" value={commPrefs.email} onChange={e => setCommPrefs(prev => ({ ...prev, email: e.target.value }))} /></div>
            </div>
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Delivery Settings</div>
            <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Quiet Hours Start</label><input style={s.mInput(mobile)} type="time" value={commPrefs.quietHoursStart} onChange={e => setCommPrefs(prev => ({ ...prev, quietHoursStart: e.target.value }))} /></div>
              <div><label style={s.label}>Quiet Hours End</label><input style={s.mInput(mobile)} type="time" value={commPrefs.quietHoursEnd} onChange={e => setCommPrefs(prev => ({ ...prev, quietHoursEnd: e.target.value }))} /></div>
            </div>
            <div>
              <label style={s.label}>Language</label>
              <select style={{ ...s.select, width: "100%" }} value={commPrefs.language} onChange={e => setCommPrefs(prev => ({ ...prev, language: e.target.value }))}>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: T.bg, borderRadius: T.radiusSm, fontSize: 12, color: T.muted }}>
              Reply STOP to any SMS to unsubscribe. Msg & data rates may apply.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── ADMIN MAINTENANCE (with assignment) ────────────────────
const AdminMaintenance = ({ mobile, maintenance, onUpdate, onAdd, staffMembers = [] }) => {
  const maintStaff = staffMembers.filter(s => s.active && (s.role === "maintenance" || s.role === "admin" || s.role === "property_manager")).filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ status: "", assignedTo: "", notes: "" });
  const [success, showSuccess] = useSuccess();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ unit: "", category: "Plumbing", priority: "routine", description: "" });

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditData({ status: row.status, assignedTo: row.assignedTo || "", notes: "" });
  };
  const saveEdit = () => {
    const changes = { status: editData.status, assignedTo: editData.assignedTo || null };
    if (editData.notes.trim()) {
      const existing = maintenance.find(m => m.id === editingId);
      changes.notes = [...(existing?.notes || []), { by: "Admin", date: new Date().toISOString().slice(0, 10), text: editData.notes.trim() }];
    }
    onUpdate(editingId, changes);
    setEditingId(null);
    showSuccess("Work order updated!");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div><h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Maintenance Management</h1><p style={s.sectionSub}>Manage all work orders across the property</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowCreate(v => !v)} style={{ ...s.btn(showCreate ? "ghost" : "primary"), fontSize: 13 }}>{showCreate ? "Cancel" : "➕ New Work Order"}</button>
          <ExportButton mobile={mobile} onClick={() => generateCSV([{ label: "ID", key: "id" }, { label: "Unit", key: "unit" }, { label: "Category", key: "category" }, { label: "Priority", key: "priority" }, { label: "Status", key: "status" }, { label: "Submitted", key: "submitted" }, { label: "Assigned To", key: "assignedTo", exportValue: r => r.assignedTo || "Unassigned" }, { label: "Description", key: "description" }], maintenance, "maintenance_orders")} />
        </div>
      </div>
      <SuccessMessage message={success} />
      {showCreate && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.warn}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Create Work Order</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>Unit *</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.unit} onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))}>
                <option value="">Select unit...</option>
                {LIVE_RESIDENTS.map(r => <option key={r.id} value={r.unit}>{r.unit} — {r.name}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Category</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}>
                {["Plumbing", "Electrical", "HVAC", "Appliance", "Structural", "Pest", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Priority</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value }))}>
                {["routine", "urgent", "critical"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={s.label}>Description *</label><textarea style={{ ...s.mInput(mobile), width: "100%", minHeight: 60, resize: "vertical" }} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue..." /></div>
          <button disabled={!createForm.unit || !createForm.description.trim()} onClick={() => {
            const res = LIVE_RESIDENTS.find(r => r.unit === createForm.unit);
            const req = {
              id: `MR-${Date.now().toString().slice(-4)}`,
              propertyId: res?.propertyId || "",
              unit: createForm.unit,
              category: createForm.category,
              priority: createForm.priority,
              status: "submitted",
              description: createForm.description.trim(),
              submitted: new Date().toISOString().slice(0, 10),
              assignedTo: null,
              notes: [],
            };
            if (onAdd) onAdd(req);
            showSuccess(`Work order created for unit ${createForm.unit}`);
            setCreateForm({ unit: "", category: "Plumbing", priority: "routine", description: "" });
            setShowCreate(false);
          }} style={{ ...s.mBtn("primary", mobile) }}>Create Work Order</button>
        </div>
      )}
      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Open" value={maintenance.filter(m => m.status !== "completed").length} accent={T.warn} mobile={mobile} />
        <StatCard label="Unassigned" value={maintenance.filter(m => !m.assignedTo).length} accent={T.danger} mobile={mobile} />
        <StatCard label="In Progress" value={maintenance.filter(m => m.status === "in-progress").length} accent={T.info} mobile={mobile} />
        <StatCard label="Completed" value={maintenance.filter(m => m.status === "completed").length} accent={T.success} mobile={mobile} />
      </div>
      <div style={s.card}>
        <SortableTable
          mobile={mobile}
          columns={[
            { key: "id", label: "ID", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
            { key: "unit", label: "Unit" },
            { key: "category", label: "Category", filterOptions: [...new Set(maintenance.map(m => m.category))] },
            { key: "priority", label: "Priority", render: v => <Badge status={v} type="priority" />, filterOptions: ["critical", "urgent", "routine", "low"], filterValue: row => row.priority },
            { key: "status", label: "Status", render: v => <Badge status={v} />, filterOptions: ["submitted", "in-progress", "completed"], filterValue: row => row.status },
            { key: "submitted", label: "Submitted" },
            { key: "assignedTo", label: "Assigned", render: v => v || <span style={{ color: T.danger }}>Unassigned</span>, filterValue: row => row.assignedTo || "Unassigned" },
            { key: "_actions", label: "", sortable: false, filterable: false, render: (_, row) => <button style={s.btn("ghost")} onClick={() => startEdit(row)}>Update</button> },
          ]}
          data={maintenance}
        />
      </div>
      {editingId && (() => {
        const editRow = maintenance.find(m => m.id === editingId);
        const existingNotes = Array.isArray(editRow?.notes) ? editRow.notes : [];
        return (
        <div style={{ ...s.card, borderColor: T.accent, marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Update {editingId}</div>
          {editRow && (
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, padding: 10, background: T.bg, borderRadius: T.radiusSm }}>
              <span style={{ fontWeight: 600, color: T.text }}>{editRow.unit}</span> — {editRow.category} — {editRow.description}
            </div>
          )}
          <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
            <div>
              <label style={s.label}>Status</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={editData.status} onChange={e => setEditData(p => ({ ...p, status: e.target.value }))}>
                <option value="submitted">Submitted</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Assign To</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={editData.assignedTo} onChange={e => setEditData(p => ({ ...p, assignedTo: e.target.value }))}>
                <option value="">Unassigned</option>
                {maintStaff.map(s => <option key={s.id} value={s.name}>{s.name}{s.role === "property_manager" ? " (PM)" : ""}</option>)}
                <option value="External Vendor">External Vendor</option>
              </select>
            </div>
          </div>
          {existingNotes.length > 0 && (
            <div style={{ marginBottom: 14, padding: 12, background: T.bg, borderRadius: T.radiusSm }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>Notes History</div>
              {existingNotes.map((n, i) => (
                <div key={i} style={{ fontSize: 13, color: T.text, marginBottom: 6, paddingBottom: 6, borderBottom: i < existingNotes.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontWeight: 600 }}>{n.by}</span> <span style={{ color: T.dim }}>({n.date})</span>: {n.text}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Add Note</label>
            <textarea style={{ ...s.input, minHeight: 60, resize: "vertical" }} placeholder="Add a note..." value={editData.notes} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={s.btn()} onClick={saveEdit}>Save</button>
            <button style={s.btn("ghost")} onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

// --- ADMIN SETTINGS ---
const AdminSettings = ({ mobile, settings, setSettings, darkMode, setDarkMode, maintenance, vendors, unitInspections, onReset }) => {
  const tabs = ["Users", "Property", "Notifications", "Rent & Lease", "Maintenance", "Audit Log", "System"];
  const [tab, setTab] = useState(tabs[0]);
  const [success, showSuccess] = useSuccess();
  const [newCat, setNewCat] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [userProfiles, setUserProfiles] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "resident", residentId: "", firstName: "", lastName: "", phone: "", propertyId: "" });
  const [inviting, setInviting] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ firstName: "", lastName: "", role: "maintenance", email: "", phone: "", propertyId: "" });
  const [editingStaff, setEditingStaff] = useState(null);
  const [editStaffForm, setEditStaffForm] = useState({});

  useEffect(() => {
    if (tab === "Audit Log") {
      setLoadingAudit(true);
      fetchAuditLog(100).then(data => { setAuditEntries(data); setLoadingAudit(false); }).catch(() => setLoadingAudit(false));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "Users") {
      setLoadingUsers(true);
      fetchUserProfiles().then(data => { setUserProfiles(data || []); setLoadingUsers(false); }).catch(() => setLoadingUsers(false));
    }
    if (tab === "Staff") {
      setLoadingStaff(true);
      fetchStaffMembers().then(data => { setStaffList(data || []); setLoadingStaff(false); }).catch(() => setLoadingStaff(false));
    }
  }, [tab]);

  const handleInvite = async () => {
    if (!inviteForm.email) return;
    setInviting(true);
    try {
      const displayName = [inviteForm.firstName, inviteForm.lastName].filter(Boolean).join(" ") || null;
      const userRole = inviteForm.role === "property_manager" ? "admin" : inviteForm.role;
      await inviteUser(inviteForm.email, userRole, inviteForm.residentId || null, displayName);
      // Also create staff record for non-resident roles
      if (inviteForm.role !== "resident" && displayName) {
        try {
          await insertStaffMember({ name: displayName, role: inviteForm.role, email: inviteForm.email, phone: inviteForm.phone || "", propertyId: inviteForm.propertyId || "" });
        } catch (staffErr) { /* staff record is supplementary, don't block */ }
      }
      showSuccess(`${displayName || inviteForm.email} added and invite sent`);
      setInviteForm({ email: "", role: "resident", residentId: "", firstName: "", lastName: "", phone: "", propertyId: "" });
      // Refresh user list
      const data = await fetchUserProfiles();
      setUserProfiles(data || []);
    } catch (err) {
      showSuccess("Error: " + (err.message || "Failed to add user"));
    } finally {
      setInviting(false);
    }
  };
  const upd = (section, key, val) => setSettings(p => ({ ...p, [section]: { ...p[section], [key]: val } }));

  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Settings & Configuration</h1>
      <p style={s.sectionSub}>Manage property, notifications, and system preferences</p>
      <SuccessMessage message={success} />
      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {tab === "Users" && (
        <div>
          <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}` }}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Add New User</div>
            <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
              <div>
                <label style={s.label}>First Name *</label>
                <input type="text" placeholder="First" value={inviteForm.firstName} onChange={e => setInviteForm(p => ({ ...p, firstName: e.target.value }))}
                  style={{ ...s.mInput(mobile), width: "100%" }} />
              </div>
              <div>
                <label style={s.label}>Last Name *</label>
                <input type="text" placeholder="Last" value={inviteForm.lastName} onChange={e => setInviteForm(p => ({ ...p, lastName: e.target.value }))}
                  style={{ ...s.mInput(mobile), width: "100%" }} />
              </div>
              <div>
                <label style={s.label}>Email *</label>
                <input type="email" placeholder="user@example.com" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                  style={{ ...s.mInput(mobile), width: "100%" }} />
              </div>
              <div>
                <label style={s.label}>Role</label>
                <select style={{ ...s.mSelect(mobile), width: "100%" }} value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="resident">Resident</option>
                  <option value="admin">Admin</option>
                  <option value="maintenance">Maintenance Staff</option>
                  <option value="property_manager">Property Manager</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Phone</label>
                <input type="tel" placeholder="(415) 555-0000" value={inviteForm.phone} onChange={e => setInviteForm(p => ({ ...p, phone: e.target.value }))}
                  style={{ ...s.mInput(mobile), width: "100%" }} />
              </div>
              <div>
                <label style={s.label}>Property</label>
                <select style={{ ...s.mSelect(mobile), width: "100%" }} value={inviteForm.propertyId} onChange={e => setInviteForm(p => ({ ...p, propertyId: e.target.value }))}>
                  <option value="">All Properties</option>
                  {LIVE_PROPERTIES.map(p => <option key={p._uuid || p.id} value={p._uuid || p.id}>{p.name}</option>)}
                </select>
              </div>
              {inviteForm.role === "resident" && (
                <div>
                  <label style={s.label}>Link to Resident</label>
                  <select style={{ ...s.mSelect(mobile), width: "100%" }} value={inviteForm.residentId} onChange={e => setInviteForm(p => ({ ...p, residentId: e.target.value }))}>
                    <option value="">Select resident (optional)...</option>
                    {LIVE_RESIDENTS.map(r => <option key={r._uuid || r.id} value={r._uuid || r.id}>{r.name} — {r.unit}</option>)}
                  </select>
                </div>
              )}
            </div>
            <button disabled={!inviteForm.email || !inviteForm.firstName.trim() || !inviteForm.lastName.trim() || inviting} onClick={handleInvite}
              style={{ ...s.mBtn("primary", mobile) }}>
              {inviting ? "Adding..." : "Add User & Send Invite"}
            </button>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>A magic link will be sent to their email so they can sign in.</div>
          </div>

          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>All Users ({userProfiles.length})</div>
            {loadingUsers ? (
              <div style={{ color: T.muted, padding: 20, textAlign: "center" }}>Loading...</div>
            ) : userProfiles.length === 0 ? (
              <EmptyState icon="👥" text="No users yet. Add your first user above." />
            ) : (
              <table style={s.table}>
                <thead><tr>{["First Name", "Last Name", "Email", "Role", "Phone", "Property", "Created", "Actions"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {userProfiles.map(u => {
                    const nameParts = (u.display_name || "").trim().split(/\s+/);
                    const firstName = nameParts[0] || "—";
                    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "—";
                    return (
                    <tr key={u.id}>
                      <td style={s.td}><span style={{ fontWeight: 600 }}>{firstName}</span></td>
                      <td style={s.td}><span style={{ fontWeight: 600 }}>{lastName}</span></td>
                      <td style={s.td}>{u.email}</td>
                      <td style={s.td}>
                        <select value={u.role} style={{ ...s.select, fontSize: 12, padding: "2px 6px", background: u.role === "admin" || u.role === "property_manager" ? T.accentDim : u.role === "maintenance" ? T.warnDim : T.successDim, color: u.role === "admin" || u.role === "property_manager" ? T.accent : u.role === "maintenance" ? T.warn : T.success, fontWeight: 600, border: "none", borderRadius: 4 }}
                          onChange={async (e) => {
                            const newRole = e.target.value;
                            try {
                              await updateUserProfile(u.id, { role: newRole });
                              setUserProfiles(prev => prev.map(p => p.id === u.id ? { ...p, role: newRole } : p));
                              showSuccess(`${u.display_name || u.email} role changed to ${newRole}`);
                            } catch (err) { showSuccess("Error: " + err.message); }
                          }}>
                          <option value="resident">Resident</option>
                          <option value="admin">Admin</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="property_manager">Property Manager</option>
                        </select>
                      </td>
                      <td style={s.td}><span style={{ fontSize: 12 }}>{u.phone || "—"}</span></td>
                      <td style={s.td}><span style={{ fontSize: 12 }}>{u.property_name || "All"}</span></td>
                      <td style={s.td}><span style={{ fontSize: 12, color: T.muted }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</span></td>
                      <td style={s.td}>
                        <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 12, padding: "2px 8px" }} onClick={async () => {
                          if (!confirm(`Remove ${u.email}? They will no longer be able to sign in.`)) return;
                          try {
                            await deleteUserProfile(u.id);
                            setUserProfiles(prev => prev.filter(p => p.id !== u.id));
                            showSuccess(`${u.email} removed`);
                          } catch (err) { showSuccess("Error: " + err.message); }
                        }}>Remove</button>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "Property" && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Property Information</div>
            <DetailRow label="Property Name" value={(LIVE_PROPERTIES[0]?.name || "—")} />
            <DetailRow label="Address" value={(LIVE_PROPERTIES[0]?.address || "—")} />
            <DetailRow label="Type" value={(LIVE_PROPERTIES[0]?.type || "—")} />
            <DetailRow label="Year Built" value={(LIVE_PROPERTIES[0]?.yearBuilt || "—")} />
            <DetailRow label="Total Units" value={(LIVE_PROPERTIES[0]?.totalUnits || 0)} />
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Management Contact</div>
            <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Manager Name</label><input style={s.mInput(mobile)} value={settings.property.manager} onChange={e => upd("property", "manager", e.target.value)} /></div>
              <div><label style={s.label}>Phone</label><input style={s.mInput(mobile)} value={settings.property.managerPhone} onChange={e => upd("property", "managerPhone", e.target.value)} /></div>
              <div><label style={s.label}>Email</label><input style={s.mInput(mobile)} value={settings.property.managerEmail} onChange={e => upd("property", "managerEmail", e.target.value)} /></div>
              <div><label style={s.label}>Office Hours</label><input style={s.mInput(mobile)} value={settings.property.officeHours} onChange={e => upd("property", "officeHours", e.target.value)} /></div>
            </div>
            <button style={s.btn()} onClick={() => showSuccess("Property settings saved")}>Save Changes</button>
          </div>

          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>RV Unit Fields</div>
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Customize the fields that appear when a unit is marked as an RV. These fields are shown in Add/Edit unit forms.</p>
            {(settings.rvFields || []).map((f, idx) => (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{f.label}</span>
                <span style={{ fontSize: 12, color: T.muted }}>{f.type === "select" ? `Dropdown (${(f.options || []).length} options)` : "Text"}</span>
                <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "2px 8px", color: T.danger }} onClick={() => {
                  setSettings(prev => ({ ...prev, rvFields: prev.rvFields.filter((_, i) => i !== idx) }));
                  showSuccess(`Removed "${f.label}"`);
                }}>Remove</button>
              </div>
            ))}
            <div style={{ marginTop: 14, padding: 14, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Add Custom RV Field</div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <label style={{ ...s.label, fontSize: 11 }}>Field Label</label>
                  <input id="rv-new-label" style={{ ...s.input, fontSize: 12, padding: "4px 8px", width: 160 }} placeholder="e.g. VIN Number" />
                </div>
                <div>
                  <label style={{ ...s.label, fontSize: 11 }}>Type</label>
                  <select id="rv-new-type" style={{ ...s.select, fontSize: 12, padding: "4px 8px" }}>
                    <option value="text">Text</option>
                    <option value="select">Dropdown</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...s.label, fontSize: 11 }}>Placeholder / Options (comma-separated for dropdown)</label>
                  <input id="rv-new-opts" style={{ ...s.input, fontSize: 12, padding: "4px 8px", width: 220 }} placeholder="e.g. Option A, Option B" />
                </div>
                <button style={{ ...s.btn(), fontSize: 12, padding: "6px 12px" }} onClick={() => {
                  const label = document.getElementById("rv-new-label").value.trim();
                  const type = document.getElementById("rv-new-type").value;
                  const optsRaw = document.getElementById("rv-new-opts").value.trim();
                  if (!label) return;
                  const key = "rv" + label.replace(/[^a-zA-Z0-9]/g, "");
                  const newField = { key, label, type };
                  if (type === "text") newField.placeholder = optsRaw;
                  else newField.options = optsRaw.split(",").map(o => o.trim()).filter(Boolean);
                  setSettings(prev => ({ ...prev, rvFields: [...(prev.rvFields || []), newField] }));
                  document.getElementById("rv-new-label").value = "";
                  document.getElementById("rv-new-opts").value = "";
                  showSuccess(`Added "${label}" field`);
                }}>Add Field</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "Notifications" && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Alert Preferences</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Toggle label="Maintenance Alerts" description="Get notified when new requests are submitted or updated" checked={settings.notifications.maintenanceAlerts} onChange={v => upd("notifications", "maintenanceAlerts", v)} />
              <Toggle label="Inspection Reminders" description="Alerts for upcoming and overdue inspections" checked={settings.notifications.inspectionReminders} onChange={v => upd("notifications", "inspectionReminders", v)} />
              <Toggle label="Vendor Compliance Alerts" description="Warnings when vendor licenses or insurance expire" checked={settings.notifications.vendorComplianceAlerts} onChange={v => upd("notifications", "vendorComplianceAlerts", v)} />
              <Toggle label="Rent Payment Updates" description="Notifications for payments received and overdue balances" checked={settings.notifications.rentPaymentUpdates} onChange={v => upd("notifications", "rentPaymentUpdates", v)} />
              <Toggle label="Community Announcements" description="Receive copies of broadcast messages sent to residents" checked={settings.notifications.communityAnnouncements} onChange={v => upd("notifications", "communityAnnouncements", v)} />
            </div>
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Quiet Hours</div>
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Suppress non-critical notifications during these hours</p>
            <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Start Time</label><input type="time" style={s.mInput(mobile)} value={settings.notifications.quietHoursStart} onChange={e => upd("notifications", "quietHoursStart", e.target.value)} /></div>
              <div><label style={s.label}>End Time</label><input type="time" style={s.mInput(mobile)} value={settings.notifications.quietHoursEnd} onChange={e => upd("notifications", "quietHoursEnd", e.target.value)} /></div>
            </div>
            <button style={s.btn()} onClick={() => showSuccess("Notification preferences saved")}>Save Changes</button>
          </div>
        </div>
      )}

      {tab === "Rent & Lease" && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Rent & Lease Defaults</div>
            <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Rent Due Day</label><select style={s.mSelect(mobile)} value={settings.rent.dueDay} onChange={e => upd("rent", "dueDay", e.target.value)}>{["1", "5", "10", "15"].map(d => <option key={d} value={d}>{d === "1" ? "1st" : d === "5" ? "5th" : d === "10" ? "10th" : "15th"}</option>)}</select></div>
              <div><label style={s.label}>Grace Period</label><select style={s.mSelect(mobile)} value={settings.rent.gracePeriodDays} onChange={e => upd("rent", "gracePeriodDays", e.target.value)}>{["3", "5", "7", "10"].map(d => <option key={d} value={d}>{d} days</option>)}</select></div>
              <div><label style={s.label}>Late Fee Amount ($)</label><input type="number" style={s.mInput(mobile)} value={settings.rent.lateFeeAmount} onChange={e => upd("rent", "lateFeeAmount", e.target.value)} /></div>
              <div><label style={s.label}>Default Lease Term</label><select style={s.mSelect(mobile)} value={settings.rent.leaseTermDefault} onChange={e => upd("rent", "leaseTermDefault", e.target.value)}>{["6", "12", "24"].map(d => <option key={d} value={d}>{d} months</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Toggle label="Auto-Renewal Default" description="Automatically renew leases unless tenant opts out" checked={settings.rent.autoRenewal} onChange={v => upd("rent", "autoRenewal", v)} />
            </div>
            <button style={s.btn()} onClick={() => showSuccess("Rent & lease settings saved")}>Save Changes</button>
          </div>

          <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}` }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>Property Bank Accounts</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>Map each property to its bank account so payments are routed correctly. When Stripe Connect is enabled, each property will use its own connected account.</div>
            <table style={s.table}>
              <thead><tr>{["Property", "Bank Name", "Account (last 4)", "Routing", "Status"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {LIVE_PROPERTIES.map(p => {
                  const bankInfo = settings.rent?.bankAccounts?.[p.id] || {};
                  return (
                    <tr key={p.id}>
                      <td style={s.td}><span style={{ fontWeight: 600 }}>{p.name}</span></td>
                      <td style={s.td}>
                        <input type="text" placeholder="e.g. Chase" value={bankInfo.bankName || ""} onChange={e => {
                          const updated = { ...(settings.rent?.bankAccounts || {}), [p.id]: { ...bankInfo, bankName: e.target.value } };
                          upd("rent", "bankAccounts", updated);
                        }} style={{ ...s.mInput(mobile), width: "100%", fontSize: 12 }} />
                      </td>
                      <td style={s.td}>
                        <input type="text" placeholder="1234" maxLength={4} value={bankInfo.lastFour || ""} onChange={e => {
                          const updated = { ...(settings.rent?.bankAccounts || {}), [p.id]: { ...bankInfo, lastFour: e.target.value.replace(/\D/g, "").slice(0, 4) } };
                          upd("rent", "bankAccounts", updated);
                        }} style={{ ...s.mInput(mobile), width: 80, fontSize: 12 }} />
                      </td>
                      <td style={s.td}>
                        <input type="text" placeholder="Routing #" value={bankInfo.routing || ""} onChange={e => {
                          const updated = { ...(settings.rent?.bankAccounts || {}), [p.id]: { ...bankInfo, routing: e.target.value.replace(/\D/g, "").slice(0, 9) } };
                          upd("rent", "bankAccounts", updated);
                        }} style={{ ...s.mInput(mobile), width: 110, fontSize: 12 }} />
                      </td>
                      <td style={s.td}>
                        {bankInfo.bankName && bankInfo.lastFour
                          ? <span style={s.badge(T.successDim, T.success)}>Configured</span>
                          : <span style={s.badge(T.warnDim, T.warn)}>Not Set</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button style={{ ...s.btn(), marginTop: 14 }} onClick={() => showSuccess("Bank account settings saved")}>Save Bank Accounts</button>
          </div>

          <div style={{ ...s.card, borderLeft: `3px solid ${T.info}` }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>Payment Processing</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>Connect Stripe to accept online rent payments via ACH, debit, and credit card.</div>
            <div style={{ padding: "14px 18px", background: T.infoDim, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.info, marginBottom: 4 }}>Stripe Connect — Not Connected</div>
              <div style={{ fontSize: 12, color: T.muted }}>Each property will have its own Stripe connected account so payments route to the correct bank. ACH transfers have the lowest fees (~0.8%).</div>
            </div>
            <button style={{ ...s.btn(), opacity: 0.6, cursor: "not-allowed" }} disabled>Connect Stripe (Coming Soon)</button>
          </div>
        </div>
      )}

      {tab === "Maintenance" && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Work Order Categories</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {settings.maint.categories.map(cat => (
                <span key={cat} style={{ ...s.badge(T.accentDim, T.accent), display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px" }}>
                  {cat}
                  <button onClick={() => upd("maint", "categories", settings.maint.categories.filter(c => c !== cat))} style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...s.mInput(mobile), flex: 1 }} placeholder="New category..." value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newCat.trim() && !settings.maint.categories.includes(newCat.trim())) { upd("maint", "categories", [...settings.maint.categories, newCat.trim()]); setNewCat(""); } }} />
              <button style={s.btn()} onClick={() => { if (newCat.trim() && !settings.maint.categories.includes(newCat.trim())) { upd("maint", "categories", [...settings.maint.categories, newCat.trim()]); setNewCat(""); } }}>Add</button>
            </div>
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Defaults & Emergency</div>
            <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Default Priority</label><select style={s.mSelect(mobile)} value={settings.maint.defaultPriority} onChange={e => upd("maint", "defaultPriority", e.target.value)}>{["routine", "urgent", "critical"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</select></div>
              <div><label style={s.label}>Emergency Phone</label><input style={s.mInput(mobile)} value={settings.maint.emergencyPhone} onChange={e => upd("maint", "emergencyPhone", e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Toggle label="Auto-Assign Work Orders" description="Automatically assign new requests to available staff based on trade" checked={settings.maint.autoAssign} onChange={v => upd("maint", "autoAssign", v)} />
            </div>
            <button style={s.btn()} onClick={() => showSuccess("Maintenance settings saved")}>Save Changes</button>
          </div>
        </div>
      )}

      {tab === "Audit Log" && (
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Recent Activity ({auditEntries.length})</div>
          {loadingAudit ? (
            <div style={{ color: T.muted, padding: 20, textAlign: "center" }}>Loading...</div>
          ) : auditEntries.length === 0 ? (
            <EmptyState icon="📋" text="No audit entries yet. Changes will appear here automatically." />
          ) : (
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {auditEntries.map(a => (
                <div key={a.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, fontSize: 13 }}>
                  <span style={{ fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>
                    {a.action === "INSERT" ? "➕" : a.action === "UPDATE" ? "✏️" : "🗑️"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{a.changedBy}</span>
                      <span style={{ color: T.muted }}> {a.action.toLowerCase()}d </span>
                      <span style={s.badge(T.accentDim, T.accent)}>{a.table}</span>
                      {a.recordId && <span style={{ color: T.muted }}> · {a.recordId}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "System" && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Appearance</div>
            <Toggle label="Dark Mode" description="Use dark color scheme across the portal" checked={darkMode} onChange={setDarkMode} />
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Bulk Data Export</div>
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Download complete datasets as CSV files</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <ExportButton label="All Residents" mobile={mobile} onClick={() => generateCSV([{ label: "Name", key: "name" }, { label: "Unit", key: "unit" }, { label: "Phone", key: "phone" }, { label: "Email", key: "email" }, { label: "Channel", key: "preferredChannel" }], LIVE_RESIDENTS, "residents")} />
              <ExportButton label="All Vendors" mobile={mobile} onClick={() => generateCSV([{ label: "Company", key: "company" }, { label: "Contact", key: "contact" }, { label: "Trade", key: "trade" }, { label: "Phone", key: "phone" }, { label: "Active", key: "active", exportValue: r => r.active ? "Yes" : "No" }], vendors, "vendors")} />
              <ExportButton label="All Maintenance" mobile={mobile} onClick={() => generateCSV([{ label: "ID", key: "id" }, { label: "Unit", key: "unit" }, { label: "Category", key: "category" }, { label: "Priority", key: "priority" }, { label: "Status", key: "status" }, { label: "Submitted", key: "submitted" }], maintenance, "maintenance")} />
              <ExportButton label="All Inspections" mobile={mobile} onClick={() => generateCSV([{ label: "Date", key: "date" }, { label: "Unit", key: "unit" }, { label: "Category", key: "category" }, { label: "Result", key: "result" }, { label: "Inspector", key: "inspector" }], unitInspections, "inspections")} />
            </div>
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>About</div>
            <DetailRow label="App Version" value="1.0.0-beta" />
            <DetailRow label="Last Updated" value="March 2026" />
            <DetailRow label="Support" value="support@bclt.org" accent={T.accent} />
          </div>
          <div style={{ ...s.card, borderLeft: `3px solid ${T.danger}` }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15, color: T.danger }}>Danger Zone</div>
            <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Reset all data back to demo defaults. This cannot be undone.</p>
            {!confirmReset ? (
              <button style={{ ...s.btn("ghost"), color: T.danger, borderColor: T.danger }} onClick={() => setConfirmReset(true)}>Reset Demo Data</button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: T.danger, fontWeight: 600 }}>Are you sure?</span>
                <button style={{ ...s.btn(), background: T.danger, borderColor: T.danger }} onClick={() => { onReset(); setConfirmReset(false); showSuccess("All data reset to defaults"); }}>Yes, Reset Everything</button>
                <button style={s.btn("ghost")} onClick={() => setConfirmReset(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- CALENDAR EVENTS BUILDER ---
const buildCalendarEvents = (maintenance, vendors, unitInspections) => {
  const events = [];
  const add = (date, type, icon, color, label, description, sourcePage) => {
    if (date) events.push({ date: date.slice(0, 10), type, icon, color, label, description, sourcePage });
  };
  // Regulatory inspections
  LIVE_REG_INSPECTIONS.forEach(i => add(i.nextDue, "inspection", "🔍", T.info, `${i.type} Inspection Due`, `${i.authority}`, "inspections"));
  // Unit inspections
  unitInspections.forEach(i => add(i.date, "inspection", "🔍", T.accent, `${i.category} — ${i.unit}`, `${i.result}${i.score ? ` (${i.score})` : ""} — ${i.inspector}`, "inspections"));
  // Maintenance
  maintenance.forEach(m => {
    add(m.submitted, "maintenance", "🔧", T.warn, `${m.id} Submitted`, `${m.category}: ${m.description}`, "maintenance");
    if (m.projectedComplete) add(m.projectedComplete, "maintenance", "🔧", T.warn, `${m.id} Target Completion`, `${m.category} — ${m.unit}`, "maintenance");
  });
  // Recertification — skip if no data
  Object.entries(LIVE_RESIDENTS_EXTENDED || {}).forEach(([id, r]) => {
    const res = LIVE_RESIDENTS.find(rr => rr.id === id);
    add(r.leaseEnd, "recert", "📋", T.danger, `Lease Expiry — ${r.unit}`, res ? res.name : id, "recert");
  });
  // Vendor compliance
  vendors.forEach(v => {
    add(v.licenseExp, "vendor", "📇", T.accent, `License Expiry: ${v.company}`, `${v.trade} — ${v.license}`, "vendors");
    add(v.coiExp, "vendor", "📇", T.accent, `COI Expiry: ${v.company}`, `Certificate of Insurance`, "vendors");
  });
  // Community events from broadcasts
  MOCK_THREADS.filter(t => t.type === "broadcast").forEach(t => {
    const match = t.subject.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
    let d = t.lastDate.slice(0, 10);
    if (match) {
      const mi = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(match[1].toLowerCase());
      d = `2026-${String(mi + 1).padStart(2, "0")}-${String(parseInt(match[2])).padStart(2, "0")}`;
    }
    add(d, "community", "💬", T.success, t.subject, t.lastMessage.slice(0, 60), "communications");
  });
  return events;
};

// --- CALENDAR VIEW ---
const CalendarView = ({ mobile, maintenance, vendors, unitInspections, onNavigate }) => {
  const tabs = ["Calendar", "Upcoming"];
  const [tab, setTab] = useState(tabs[0]);
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(null);

  const allEvents = buildCalendarEvents(maintenance, vendors, unitInspections);
  const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const eventsThisMonth = allEvents.filter(e => e.date.startsWith(monthStr));
  const eventsByDay = {};
  eventsThisMonth.forEach(e => { const d = parseInt(e.date.slice(8, 10)); (eventsByDay[d] = eventsByDay[d] || []).push(e); });

  const prevMonth = () => { setSelectedDay(null); setViewMonth(m => m === 0 ? (setViewYear(y => y - 1), 11) : m - 1); };
  const nextMonth = () => { setSelectedDay(null); setViewMonth(m => m === 11 ? (setViewYear(y => y + 1), 0) : m + 1); };

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => { const d = i - firstDow + 1; return d >= 1 && d <= daysInMonth ? d : null; });
  const isToday = (d) => d && viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const inspDue = eventsThisMonth.filter(e => e.type === "inspection").length;
  const vendorAlerts = vendors.filter(v => { const now = Date.now(); return [v.licenseExp, v.coiExp].some(d => d && new Date(d) > new Date() && (new Date(d) - now) < 90 * 86400000); }).length;
  const maintSched = eventsThisMonth.filter(e => e.type === "maintenance").length;

  const todayStr = today.toISOString().slice(0, 10);
  const future30 = new Date(today); future30.setDate(future30.getDate() + 30);
  const futureStr = future30.toISOString().slice(0, 10);
  const upcoming = allEvents.filter(e => e.date >= todayStr && e.date <= futureStr).sort((a, b) => a.date.localeCompare(b.date));
  const upcomingGrouped = upcoming.reduce((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc; }, {});

  const dayEvents = selectedDay ? (eventsByDay[selectedDay] || []) : [];

  const EventRow = ({ ev }) => (
    <div onClick={() => onNavigate(ev.sourcePage)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, cursor: "pointer" }}>
      <span style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0 }}>{ev.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.label}</div>
        <div style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.description}</div>
      </div>
      <span style={s.badge(ev.type === "inspection" ? T.infoDim : ev.type === "maintenance" ? T.warnDim : ev.type === "recert" ? T.dangerDim : ev.type === "vendor" ? T.accentDim : T.successDim, ev.color)}>{ev.type}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22, marginBottom: 0 }}>Calendar</h1>
        <ExportButton onClick={() => generateCSV([{ label: "Date", key: "date" }, { label: "Type", key: "type" }, { label: "Event", key: "label" }, { label: "Details", key: "description" }], eventsThisMonth, "calendar_events")} label="Export Events" mobile={mobile} />
      </div>
      <p style={s.sectionSub}>All scheduled events across the property</p>

      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Events This Month" value={eventsThisMonth.length} mobile={mobile} />
        <StatCard label="Inspections Due" value={inspDue} accent={T.info} mobile={mobile} />
        <StatCard label="Vendor Alerts" value={vendorAlerts} accent={vendorAlerts > 0 ? T.danger : T.success} mobile={mobile} />
        <StatCard label="Maintenance" value={maintSched} accent={T.warn} mobile={mobile} />
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {tab === "Calendar" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button onClick={prevMonth} style={{ ...s.btn("ghost"), fontSize: 18, padding: "4px 12px" }}>‹</button>
            <div style={{ fontWeight: 700, fontSize: mobile ? 16 : 18 }}>{monthLabel}</div>
            <button onClick={nextMonth} style={{ ...s.btn("ghost"), fontSize: 18, padding: "4px 12px" }}>›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: T.border, borderRadius: T.radius, overflow: "hidden", marginBottom: 16 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} style={{ background: T.surface, padding: mobile ? "6px 2px" : "8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase" }}>{mobile ? d[0] : d}</div>
            ))}
            {cells.map((dayNum, i) => {
              const dayEvts = dayNum ? (eventsByDay[dayNum] || []) : [];
              return (
                <div key={i} onClick={() => dayNum && dayEvts.length > 0 && setSelectedDay(selectedDay === dayNum ? null : dayNum)} style={{
                  background: isToday(dayNum) ? T.accentDim : T.card, padding: mobile ? "4px 3px" : "6px 8px",
                  minHeight: mobile ? 44 : 68, cursor: dayNum && dayEvts.length > 0 ? "pointer" : "default",
                  opacity: dayNum ? 1 : 0.3, outline: selectedDay === dayNum ? `2px solid ${T.accent}` : "none", outlineOffset: -2,
                }}>
                  {dayNum && (<>
                    <div style={{ fontSize: mobile ? 11 : 13, fontWeight: isToday(dayNum) ? 700 : 400, color: isToday(dayNum) ? T.accent : T.text, marginBottom: 3 }}>
                      {isToday(dayNum) ? <span style={{ background: T.accent, color: T.white, borderRadius: "50%", width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{dayNum}</span> : dayNum}
                    </div>
                    {dayEvts.length > 0 && (
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {dayEvts.slice(0, mobile ? 2 : 4).map((ev, j) => <span key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: ev.color, flexShrink: 0 }} />)}
                        {dayEvts.length > (mobile ? 2 : 4) && <span style={{ fontSize: 9, color: T.muted, lineHeight: "7px" }}>+{dayEvts.length - (mobile ? 2 : 4)}</span>}
                      </div>
                    )}
                  </>)}
                </div>
              );
            })}
          </div>

          {selectedDay && dayEvents.length > 0 && (
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{new Date(viewYear, viewMonth, selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
                <button onClick={() => setSelectedDay(null)} style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }}>Close</button>
              </div>
              {dayEvents.map((ev, i) => <EventRow key={i} ev={ev} />)}
            </div>
          )}
        </div>
      )}

      {tab === "Upcoming" && (
        <div>
          {Object.keys(upcomingGrouped).length === 0 && <div style={{ ...s.card, textAlign: "center", color: T.muted }}>No events in the next 30 days</div>}
          {Object.entries(upcomingGrouped).map(([date, evts]) => (
            <div key={date} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
              <div style={s.card}>{evts.map((ev, i) => <EventRow key={i} ev={ev} />)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- COMPLIANCE & AUDIT DASHBOARD (Admin) ---

// --- FINANCIAL OVERVIEW (Admin) ---
const FinancialOverview = ({ mobile, selectedProperty, onSelectProperty }) => {
  const tabs = ["Overview", "Rent Roll", "Payments"];
  const [tab, setTab] = useState(tabs[0]);
  const [dateRange, setDateRange] = useState({ preset: "all", from: null, to: null });
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [payForm, setPayForm] = useState({ residentId: "", amount: "", method: "cash", payType: "rent", date: new Date().toISOString().slice(0, 10), note: "" });
  const [paySuccess, showPaySuccess] = useSuccess();

  const residents = filterByProperty(LIVE_RESIDENTS, selectedProperty).map(r => ({ ...r, ...(LIVE_RESIDENTS_EXTENDED[r.id] || {}) }));
  const ledger = filterByProperty(LIVE_RENT_LEDGER, selectedProperty);
  const monthlyRentRoll = residents.reduce((sum, r) => sum + (r.rentAmount || 0), 0);
  const totalHAP = residents.reduce((sum, r) => sum + (r.hapPayment || 0), 0);
  const totalTenant = residents.reduce((sum, r) => sum + (r.tenantPortion || 0), 0);
  const totalCollected = ledger.reduce((sum, r) => sum + r.tenantPaid + r.hapReceived, 0);
  const collectionRate = monthlyRentRoll ? Math.round((totalCollected / monthlyRentRoll) * 100) : 0;
  const delinquent = ledger.filter(r => r.balance > 0);
  const revenueData = filterByProperty(MOCK_MONTHLY_REVENUE, selectedProperty);
  const monthLabels = [...new Set(revenueData.map(r => r.month))].sort();
  const trendPoints = monthLabels.map(m => revenueData.filter(r => r.month === m).reduce((s, r) => s + r.collected, 0));
  const propLabel = selectedProperty === "all" ? "All Properties" : getProperty(selectedProperty).name;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <div><h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Financial Overview</h1><p style={s.sectionSub}>{propLabel} — Rent roll, revenue, and payment tracking</p></div>
        <PrintButton mobile={mobile} />
      </div>
      <div style={{ marginBottom: 14 }}><DateRangeFilter value={dateRange} onChange={setDateRange} mobile={mobile} /></div>
      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {tab === "Overview" && (
        <div>
          <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label="Monthly Rent Roll" value={`$${monthlyRentRoll.toLocaleString()}`} mobile={mobile} />
            <StatCard label="HAP Income" value={`$${totalHAP.toLocaleString()}`} accent={T.info} mobile={mobile} />
            <StatCard label="Tenant Portions" value={`$${totalTenant.toLocaleString()}`} accent={T.success} mobile={mobile} />
            <StatCard label="Collection Rate" value={`${collectionRate}%`} accent={collectionRate >= 95 ? T.success : collectionRate >= 80 ? T.warn : T.danger} mobile={mobile} />
          </div>

          {/* Per-property revenue breakdown — only when viewing all properties */}
          {selectedProperty === "all" && (
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Revenue by Property</div>
              <table style={s.table}>
                <thead><tr>{["Property", "Rent Roll", "HAP", "Tenant", "Collected", "Collection", "Delinquent"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {LIVE_PROPERTIES.map(p => {
                    const pRes = LIVE_RESIDENTS.filter(r => r.propertyId === p.id).map(r => ({ ...r, ...(LIVE_RESIDENTS_EXTENDED[r.id] || {}) }));
                    const pLedger = LIVE_RENT_LEDGER.filter(r => r.propertyId === p.id);
                    const pRent = pRes.reduce((s, r) => s + (r.rentAmount || 0), 0);
                    const pHap = pRes.reduce((s, r) => s + (r.hapPayment || 0), 0);
                    const pTen = pRes.reduce((s, r) => s + (r.tenantPortion || 0), 0);
                    const pColl = pLedger.reduce((s, r) => s + r.tenantPaid + r.hapReceived, 0);
                    const pRate = pRent ? Math.round((pColl / pRent) * 100) : 0;
                    const pDel = pLedger.filter(r => r.balance > 0).reduce((s, r) => s + r.balance, 0);
                    return (
                      <tr key={p.id} onClick={() => onSelectProperty?.(p.id, "financial")} style={{ cursor: "pointer" }}>
                        <td style={s.td}><span style={{ fontWeight: 600, color: T.accent }}>{p.name.split(" ")[0]} {p.name.split(" ")[1]} →</span><br /><span style={{ fontSize: 11, color: T.muted }}>{p.totalUnits} units</span></td>
                        <td style={s.td}>${pRent.toLocaleString()}</td>
                        <td style={s.td}>${pHap.toLocaleString()}</td>
                        <td style={s.td}>${pTen.toLocaleString()}</td>
                        <td style={s.td}>${pColl.toLocaleString()}</td>
                        <td style={s.td}><span style={{ fontWeight: 600, color: pRate >= 95 ? T.success : pRate >= 80 ? T.warn : T.danger }}>{pRate}%</span></td>
                        <td style={s.td}>{pDel > 0 ? <span style={{ color: T.danger, fontWeight: 600 }}>${pDel}</span> : <span style={{ color: T.success }}>$0</span>}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: T.accentDim }}>
                    <td style={{ ...s.td, fontWeight: 700 }}>Portfolio Total</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>${monthlyRentRoll.toLocaleString()}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>${totalHAP.toLocaleString()}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>${totalTenant.toLocaleString()}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>${totalCollected.toLocaleString()}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>{collectionRate}%</td>
                    <td style={{ ...s.td, fontWeight: 700, color: T.danger }}>${delinquent.reduce((s, d) => s + d.balance, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 20 }}>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Revenue Sources</div>
              <DonutChart segments={selectedProperty === "all"
                ? LIVE_PROPERTIES.map((p, i) => {
                    const pRent = LIVE_RESIDENTS.filter(r => r.propertyId === p.id).map(r => ({ ...r, ...(LIVE_RESIDENTS_EXTENDED[r.id] || {}) })).reduce((s, r) => s + (r.rentAmount || 0), 0);
                    return { label: `${p.name.split(" ")[0]} ($${pRent.toLocaleString()})`, value: pRent, color: [THEMES.light.info, THEMES.light.success, THEMES.light.warn][i] };
                  })
                : [
                  { label: `HAP ($${totalHAP.toLocaleString()})`, value: totalHAP, color: THEMES.light.info },
                  { label: `Tenant ($${totalTenant.toLocaleString()})`, value: totalTenant, color: THEMES.light.success },
                ]
              } centerValue={`$${monthlyRentRoll.toLocaleString()}`} centerLabel={selectedProperty === "all" ? "Portfolio" : "Total"} size={mobile ? 100 : 120} mobile={mobile} />
            </div>
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Monthly Trend</div>
              <SparkLine points={trendPoints.length ? trendPoints : [0]} color={T.success} width={mobile ? 280 : 500} height={48} mobile={mobile} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, marginTop: 6, maxWidth: mobile ? 280 : 500 }}>
                {monthLabels.map(m => <span key={m}>{new Date(m + "-15").toLocaleDateString("en", { month: "short" })}</span>)}
              </div>
            </div>
          </div>
          {delinquent.length > 0 && (
            <div style={{ ...s.card, borderLeft: `3px solid ${T.danger}` }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15, color: T.danger }}>Outstanding Balances ({delinquent.length})</div>
              {delinquent.map(d => (
                <div key={d.unit} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.borderLight}` }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: T.muted }}>Unit {d.unit}{selectedProperty === "all" ? ` · ${getProperty(d.propertyId)?.name?.split(" ")[0] || ""}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: T.danger }}>${d.balance}</div>
                    <span style={s.badge(PAYMENT_STATUS[d.status].bg, PAYMENT_STATUS[d.status].text)}>{PAYMENT_STATUS[d.status].label}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "Rent Roll" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <ExportButton mobile={mobile} onClick={() => generateCSV([{ label: "Resident", key: "name" }, { label: "Unit", key: "unit" }, { label: "Rent", key: "rentAmount", exportValue: r => r.rentAmount || 0 }, { label: "Tenant Portion", key: "tenantPortion", exportValue: r => r.tenantPortion || 0 }, { label: "HAP", key: "hapPayment", exportValue: r => r.hapPayment || 0 }, { label: "Lease End", key: "leaseEnd", exportValue: r => r.leaseEnd || "—" }], residents, "rent_roll")} />
          </div>
          <SortableTable mobile={mobile} columns={[
            { key: "name", label: "Resident", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
            { key: "unit", label: "Unit" },
            { key: "rentAmount", label: "Total Rent", render: v => v ? `$${v.toLocaleString()}` : "—", sortValue: r => r.rentAmount || 0 },
            { key: "tenantPortion", label: "Tenant", render: v => v ? `$${v}` : "—", sortValue: r => r.tenantPortion || 0 },
            { key: "hapPayment", label: "HAP", render: v => v ? `$${v}` : "—", sortValue: r => r.hapPayment || 0 },
            { key: "leaseEnd", label: "Lease End", render: v => v || "—" },
          ]} data={residents} keyField="id" />
        </div>
      )}

      {tab === "Payments" && (
        <div>
          <SuccessMessage message={paySuccess} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <button onClick={() => setShowRecordPayment(v => !v)} style={{ ...s.btn(showRecordPayment ? "ghost" : "primary"), fontSize: 13, padding: mobile ? "10px 16px" : "8px 14px" }}>
              {showRecordPayment ? "Cancel" : "💵 Record Payment"}
            </button>
            <ExportButton mobile={mobile} onClick={() => generateCSV([{ label: "Resident", key: "name" }, { label: "Unit", key: "unit" }, { label: "Rent Due", key: "rentDue" }, { label: "Tenant Paid", key: "tenantPaid" }, { label: "HAP Received", key: "hapReceived" }, { label: "Balance", key: "balance" }, { label: "Status", key: "status" }], ledger, "payment_status")} />
          </div>
          {showRecordPayment && (
            <div style={{ ...s.card, borderLeft: `3px solid ${T.success}`, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Record Manual Payment</div>
              <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={s.label}>Resident</label>
                  <select style={{ ...s.mSelect(mobile), width: "100%" }} value={payForm.residentId} onChange={e => setPayForm(p => ({ ...p, residentId: e.target.value }))}>
                    <option value="">Select resident...</option>
                    {filterByProperty(LIVE_RESIDENTS, selectedProperty).map(r => <option key={r.id} value={r.id}>{r.name} — {r.unit}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Amount ($)</label>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                    style={{ ...s.mInput(mobile), width: "100%" }} />
                </div>
                <div>
                  <label style={s.label}>Payment Type</label>
                  <select style={{ ...s.mSelect(mobile), width: "100%" }} value={payForm.payType} onChange={e => setPayForm(p => ({ ...p, payType: e.target.value }))}>
                    <option value="rent">Rent</option>
                    <option value="late_fee">Late Fee</option>
                    <option value="deposit">Security Deposit</option>
                    <option value="utility">Utility</option>
                    <option value="hap">HAP Payment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={s.label}>Method</label>
                  <select style={{ ...s.mSelect(mobile), width: "100%" }} value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="money_order">Money Order</option>
                    <option value="ach">ACH / Bank Transfer</option>
                    <option value="hap">HAP Direct</option>
                  </select>
                </div>
                <div>
                  <label style={s.label}>Date</label>
                  <input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}
                    style={{ ...s.mInput(mobile), width: "100%" }} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={s.label}>Note (optional)</label>
                <input type="text" placeholder="e.g. Check #1234" value={payForm.note} onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))}
                  style={{ ...s.mInput(mobile), width: "100%" }} />
              </div>
              <button disabled={!payForm.residentId || !payForm.amount} onClick={async () => {
                if (!payForm.residentId || !payForm.amount) return;
                const res = LIVE_RESIDENTS.find(r => r.id === payForm.residentId);
                const amt = parseFloat(payForm.amount);
                try {
                  await recordPayment({
                    residentSlug: payForm.residentId,
                    amount: amt,
                    method: payForm.method,
                    paymentDate: payForm.date,
                    month: payForm.date?.slice(0, 7),
                    note: payForm.note || (payForm.payType !== "rent" ? payForm.payType.replace("_", " ") : ""),
                  });
                  // Refresh ledger from Supabase
                  const fresh = await fetchRentLedger();
                  if (fresh && fresh.length) LIVE_RENT_LEDGER = fresh;
                  showPaySuccess(`Recorded $${amt.toFixed(2)} ${payForm.method} payment from ${res?.name || "resident"}`);
                  // Email receipt to resident
                  if (res?.email) {
                    const entry = fresh?.find(l => l.residentId === payForm.residentId);
                    sendNotification('payment_receipt', {
                      residentEmail: res.email, residentName: res.name,
                      amount: amt, method: payForm.method, date: payForm.date,
                      balance: entry?.balance ?? 0,
                    });
                  }
                } catch (err) {
                  // Fallback: update in-memory
                  const entry = ledger.find(l => l.residentId === payForm.residentId);
                  if (entry) {
                    entry.tenantPaid = (entry.tenantPaid || 0) + amt;
                    entry.balance = Math.max(0, entry.rentDue - entry.tenantPaid - entry.hapReceived);
                    entry.status = entry.balance === 0 ? "paid" : entry.balance < entry.rentDue ? "partial" : "outstanding";
                  }
                  showPaySuccess(`Recorded $${amt.toFixed(2)} ${payForm.method} (offline — will sync later)`);
                }
                setPayForm({ residentId: "", amount: "", method: "cash", payType: "rent", date: new Date().toISOString().slice(0, 10), note: "" });
                setShowRecordPayment(false);
              }} style={{ ...s.mBtn("primary", mobile) }}>Record Payment</button>
            </div>
          )}
          <SortableTable mobile={mobile} columns={[
            { key: "name", label: "Resident", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
            { key: "unit", label: "Unit" },
            ...(selectedProperty === "all" ? [{ key: "propertyId", label: "Property", render: v => getProperty(v)?.name?.split(" ")[0] || v }] : []),
            { key: "rentDue", label: "Rent Due", render: v => `$${v.toLocaleString()}` },
            { key: "tenantPaid", label: "Tenant Paid", render: v => `$${v.toLocaleString()}` },
            { key: "hapReceived", label: "HAP Received", render: v => `$${v.toLocaleString()}` },
            { key: "balance", label: "Balance", render: v => <span style={{ fontWeight: v > 0 ? 700 : 400, color: v > 0 ? T.danger : T.text }}>${v}</span>, sortValue: r => r.balance },
            { key: "status", label: "Status", render: v => { const c = PAYMENT_STATUS[v] || PAYMENT_STATUS.outstanding; return <span style={s.badge(c.bg, c.text)}>{c.label}</span>; }, filterOptions: ["paid", "partial", "outstanding"] },
          ]} data={ledger} keyField="unit" />
        </div>
      )}
    </div>
  );
};

// --- MAINTENANCE PROFILE ---
const MaintenanceProfile = ({ mobile }) => {
  const [onDuty, setOnDuty] = useState(true);
  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>My Profile</h1>
      <p style={s.sectionSub}>Staff information and availability</p>
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22, color: T.accent }}>MR</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Mike R.</div>
            <div style={{ color: T.muted, fontSize: 14 }}>Maintenance Technician</div>
          </div>
        </div>
        <DetailRow label="Phone" value="(415) 555-0150" />
        <DetailRow label="Email" value="mike.r@bclt.org" />
        <DetailRow label="Start Date" value="2020-03-15" />
        <DetailRow label="Employee ID" value="EMP-042" />
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Skills & Certifications</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Plumbing", "HVAC", "Electrical", "Appliance Repair", "EPA 608 Certified", "OSHA 10-Hour", "Lead-Safe Work Practices"].map(sk => (
            <span key={sk} style={s.badge(T.accentDim, T.accent)}>{sk}</span>
          ))}
        </div>
      </div>
      <div style={s.card}>
        <Toggle label="On Duty" checked={onDuty} onChange={() => setOnDuty(d => !d)} description={onDuty ? "Available for work order assignments" : "Off duty — not receiving assignments"} />
      </div>
    </div>
  );
};

const PropertySelector = ({ value, onChange, mobile, properties }) => {
  const props = properties || LIVE_PROPERTIES;
  return (
  <select value={value} onChange={e => onChange(e.target.value)} style={{
    ...s.mSelect(mobile), width: "100%", fontSize: 12, padding: mobile ? "8px 10px" : "6px 8px",
    background: T.bg, color: T.text, fontWeight: 600,
  }}>
    <option value="all">All Properties ({props.reduce((s, p) => s + (p.totalUnits || 0), 0)} units)</option>
    {props.map(p => <option key={p.id} value={p.id}>{p.name} ({p.totalUnits || 0})</option>)}
  </select>
  );
};

const DATE_RANGE_PRESETS = [
  { label: "This Month", value: "month" },
  { label: "This Quarter", value: "quarter" },
  { label: "YTD", value: "ytd" },
  { label: "Last 12 Mo", value: "12mo" },
  { label: "All Time", value: "all" },
];
const getDateRange = (preset) => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (preset === "month") return { from: new Date(y, m, 1).toISOString().slice(0, 10), to: null };
  if (preset === "quarter") { const q = Math.floor(m / 3) * 3; return { from: new Date(y, q, 1).toISOString().slice(0, 10), to: null }; }
  if (preset === "ytd") return { from: `${y}-01-01`, to: null };
  if (preset === "12mo") return { from: new Date(y - 1, m, 1).toISOString().slice(0, 10), to: null };
  return { from: null, to: null };
};
const DateRangeFilter = ({ value, onChange, mobile }) => {
  const [custom, setCustom] = useState(false);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {DATE_RANGE_PRESETS.map(p => (
        <button key={p.value} onClick={() => { setCustom(false); onChange({ preset: p.value, ...getDateRange(p.value) }); }}
          style={{ ...s.btn(value.preset === p.value && !custom ? "primary" : "ghost"), fontSize: 11, padding: mobile ? "8px 12px" : "4px 10px", minHeight: mobile ? 36 : undefined }}>
          {p.label}
        </button>
      ))}
      <button onClick={() => setCustom(c => !c)}
        style={{ ...s.btn(custom ? "primary" : "ghost"), fontSize: 11, padding: mobile ? "8px 12px" : "4px 10px", minHeight: mobile ? 36 : undefined }}>
        Custom
      </button>
      {custom && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 4 }}>
          <input type="date" value={value.from || ""} onChange={e => onChange({ preset: "custom", from: e.target.value, to: value.to })}
            style={{ ...s.input, fontSize: 12, padding: "4px 8px", width: 130 }} />
          <span style={{ color: T.muted, fontSize: 12 }}>to</span>
          <input type="date" value={value.to || ""} onChange={e => onChange({ preset: "custom", from: value.from, to: e.target.value })}
            style={{ ...s.input, fontSize: 12, padding: "4px 8px", width: 130 }} />
        </div>
      )}
    </div>
  );
};
const filterByDateRange = (items, dateField, range) => {
  if (!range.from && !range.to) return items;
  return items.filter(item => {
    const d = item[dateField];
    if (!d) return true;
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
};
const filterByProperty = (items, selectedProperty) =>
  selectedProperty === "all" ? items : items.filter(i => i.propertyId === selectedProperty);

const MobileTabBar = ({ role, activePage, onNavigate, navBadges, onMoreClick }) => {
  const tabs = BOTTOM_TABS[role] || BOTTOM_TABS.resident;
  const isMore = !tabs.some(t => t.id === activePage);
  return (
    <div data-print-hide style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 70, background: T.surface, borderTop: `1px solid ${T.border}`, display: "flex", zIndex: 1100, paddingBottom: "env(safe-area-inset-bottom, 20px)", boxShadow: "0 -2px 10px rgba(0,0,0,0.1)" }}>
      {tabs.map(t => {
        const active = activePage === t.id;
        return (
          <button key={t.id} onClick={() => onNavigate(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: active ? T.accent : T.muted, padding: 0, position: "relative" }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{t.label}</span>
            {navBadges[t.id] > 0 && <span style={{ position: "absolute", top: 6, right: "calc(50% - 16px)", width: 8, height: 8, borderRadius: 4, background: T.danger }} />}
          </button>
        );
      })}
      <button onClick={onMoreClick} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: isMore ? T.accent : T.muted, padding: 0 }}>
        <span style={{ fontSize: 20 }}>⋯</span>
        <span style={{ fontSize: 10, fontWeight: isMore ? 700 : 500 }}>More</span>
      </button>
    </div>
  );
};

const PrintButton = ({ mobile }) => (
  <button data-print-hide onClick={() => window.print()} style={{
    ...s.btn("ghost"), fontSize: 12, padding: mobile ? "10px 14px" : "6px 12px",
    display: "inline-flex", alignItems: "center", gap: 6, minHeight: mobile ? 44 : undefined,
  }}>{"🖨️"} Print</button>
);

const OnboardingChecklist = ({ mobile, selectedProperty, initialRecords }) => {
  const [records, setRecords] = useState(initialRecords || MOCK_ONBOARDING);
  const tabs = ["Active", "Completed", "New"];
  const [tab, setTab] = useState(tabs[0]);
  const [newResident, setNewResident] = useState("");
  const [newType, setNewType] = useState("move-in");
  const [success, showSuccess] = useSuccess();

  const filtered = filterByProperty(records, selectedProperty);
  const active = filtered.filter(r => r.status !== "completed");
  const completed = filtered.filter(r => r.status === "completed");
  const moveIns = active.filter(r => r.type === "move-in").length;
  const moveOuts = active.filter(r => r.type === "move-out").length;
  const overdue = active.filter(r => new Date(r.targetDate) < new Date()).length;

  const toggleStep = (id, stepKey) => {
    setRecords(prev => prev.map(r => {
      if (r.id !== id) return r;
      const steps = { ...r.steps, [stepKey]: !r.steps[stepKey] };
      const vals = Object.values(steps);
      const done = vals.filter(Boolean).length;
      const status = done === 0 ? "not-started" : done === vals.length ? "completed" : "in-progress";
      // Persist to Supabase
      updateOnboardingWorkflow(id, { steps, status }).catch(err => console.warn('Supabase onboarding update failed:', err));
      return { ...r, steps, status };
    }));
  };

  const addOnboarding = async () => {
    if (!newResident) return;
    const steps = newType === "move-in"
      ? { appReview: false, bgCheck: false, leaseSigning: false, keyHandoff: false, unitWalkthrough: false, utilitySetup: false, welcomePacket: false }
      : { noticeReceived: false, inspectionScheduled: false, finalWalkthrough: false, depositReview: false, keyReturn: false, unitTurnover: false };
    const resProp = LIVE_RESIDENTS.find(r => r.id === newResident)?.propertyId || "wharf";
    const newRec = {
      id: `OB-${Date.now()}`, propertyId: resProp, residentId: newResident, type: newType, status: "not-started",
      startDate: new Date().toISOString().slice(0, 10), targetDate: "", steps,
    };
    setRecords(prev => [...prev, newRec]);
    setNewResident("");
    setTab("Active");
    showSuccess("Onboarding workflow created!");
    try { await insertOnboardingWorkflow(newRec); } catch (err) { console.warn('Supabase onboarding insert failed:', err); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <div><h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Onboarding Checklist</h1><p style={s.sectionSub}>Track move-in and move-out workflows</p></div>
        <PrintButton mobile={mobile} />
      </div>
      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {tab === "Active" && (
        <div>
          <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label="Active" value={active.length} accent={T.accent} mobile={mobile} />
            <StatCard label="Move-Ins" value={moveIns} accent={T.info} mobile={mobile} />
            <StatCard label="Move-Outs" value={moveOuts} accent={T.warn} mobile={mobile} />
            <StatCard label="Overdue" value={overdue} accent={overdue > 0 ? T.danger : T.success} mobile={mobile} />
          </div>
          {active.length === 0 ? <EmptyState icon="✨" text="No active onboardings" /> : active.map(rec => {
            const res = LIVE_RESIDENTS.find(r => r.id === rec.residentId);
            const stepEntries = Object.entries(rec.steps);
            const done = stepEntries.filter(([, v]) => v).length;
            const pct = Math.round((done / stepEntries.length) * 100);
            const isOverdue = rec.targetDate && new Date(rec.targetDate) < new Date();
            return (
              <div key={rec.id} style={{ ...s.card, borderLeft: `3px solid ${isOverdue ? T.danger : ONBOARDING_STATUS[rec.status]?.text || T.muted}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{res?.name || rec.residentId}</span>
                    <span style={{ color: T.muted, fontSize: 13, marginLeft: 10 }}>Unit {res?.unit || "—"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={s.badge(rec.type === "move-in" ? T.infoDim : T.warnDim, rec.type === "move-in" ? T.info : T.warn)}>{rec.type === "move-in" ? "Move-In" : "Move-Out"}</span>
                    <span style={s.badge(ONBOARDING_STATUS[rec.status].bg, ONBOARDING_STATUS[rec.status].text)}>{ONBOARDING_STATUS[rec.status].label}</span>
                  </div>
                </div>
                <div style={{ background: T.bg, borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? T.success : T.accent, borderRadius: 6, transition: "width 0.3s" }} />
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{done}/{stepEntries.length} steps complete · Target: {rec.targetDate || "TBD"}{isOverdue ? " · OVERDUE" : ""}</div>
                <div style={{ ...s.grid("1fr 1fr", mobile), gap: 8 }}>
                  {stepEntries.map(([key, val]) => (
                    <div key={key} onClick={() => toggleStep(rec.id, key)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: mobile ? "12px 14px" : "10px 14px",
                      background: val ? T.successDim : T.bg, borderRadius: T.radiusSm,
                      border: `1px solid ${val ? T.successBorder : T.border}`,
                      cursor: "pointer", minHeight: mobile ? 44 : undefined, transition: "all 0.15s",
                    }}>
                      <span style={{ fontSize: 16, color: val ? T.success : T.dim }}>{val ? "✓" : "○"}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: val ? T.success : T.muted }}>{ONBOARDING_STEP_LABELS[key] || key}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "Completed" && (
        <div>
          {completed.length === 0 ? <EmptyState icon="📋" text="No completed onboardings yet" /> : (
            <SortableTable mobile={mobile} keyField="id" data={completed.map(r => ({ ...r, _unit: LIVE_RESIDENTS.find(res => res.id === r.residentId)?.unit || "—" }))} columns={[
              { key: "residentId", label: "Resident", render: v => { const r = LIVE_RESIDENTS.find(res => res.id === v); return <span style={{ fontWeight: 600 }}>{r?.name || v}</span>; } },
              { key: "_unit", label: "Unit" },
              { key: "type", label: "Type", render: v => <span style={s.badge(v === "move-in" ? T.infoDim : T.warnDim, v === "move-in" ? T.info : T.warn)}>{v === "move-in" ? "Move-In" : "Move-Out"}</span>, filterOptions: ["move-in", "move-out"] },
              { key: "startDate", label: "Started" },
              { key: "targetDate", label: "Target" },
              { key: "status", label: "Status", render: () => <span style={s.badge(T.successDim, T.success)}>Completed</span> },
            ]} />
          )}
        </div>
      )}

      {tab === "New" && (
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Start New Onboarding</div>
          <SuccessMessage message={success} />
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div>
              <label style={s.label}>Resident</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={newResident} onChange={e => setNewResident(e.target.value)}>
                <option value="">Select resident...</option>
                {filterByProperty(LIVE_RESIDENTS, selectedProperty).map(r => <option key={r.id} value={r.id}>{r.name} — {r.unit}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Type</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={newType} onChange={e => setNewType(e.target.value)}>
                <option value="move-in">Move-In</option>
                <option value="move-out">Move-Out</option>
              </select>
            </div>
          </div>
          <button style={s.mBtn("primary", mobile)} onClick={addOnboarding}>Create Workflow</button>
        </div>
      )}
    </div>
  );
};

// ── LOGIN PAGE ─────────────────────────────────────────────

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      await signInWithMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || "Failed to send login link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, padding: 20 }}>
      <div style={{ ...s.card, maxWidth: 420, width: "100%", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: T.accent, marginBottom: 4 }}>BCLT Portal</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 28 }}>Bolinas Community Land Trust</div>
        {sent ? (
          <div>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Check your email</div>
            <div style={{ color: T.muted, fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
              We sent a login link to <strong style={{ color: T.text }}>{email}</strong>. Click the link in the email to sign in.
            </div>
            <button onClick={() => { setSent(false); setEmail(""); }} style={{ ...s.btn("ghost"), fontSize: 13 }}>Use a different email</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ textAlign: "left", marginBottom: 16 }}>
              <label style={{ ...s.label, marginBottom: 6 }}>Email Address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoFocus
                style={{ ...s.input, width: "100%", padding: "12px 14px", fontSize: 14 }}
              />
            </div>
            {error && <div style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ ...s.btn("primary"), width: "100%", padding: "12px", fontSize: 14, marginBottom: 16 }}>
              {loading ? "Sending..." : "Send Login Link"}
            </button>
            <div style={{ color: T.dim, fontSize: 12 }}>Don't have an account? Contact your property manager.</div>
          </form>
        )}
      </div>
    </div>
  );
};

// ── MAIN APP ───────────────────────────────────────────────

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleOverride, setRoleOverride] = useState(null);
  const role = roleOverride || profile?.role || "resident";
  const [page, setPage] = useState("dashboard");
  const [commPrefs, setCommPrefs] = useState(MOCK_COMM_PREFS);
  const [leaseDocs, setLeaseDocs] = useState(MOCK_LEASE_DOCS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [maintenance, setMaintenance] = useState([]);
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [unitInspections, setUnitInspections] = useState([]);
  const [allUnits, setAllUnits] = useState([]);
  const [savedChecklists, setSavedChecklists] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [emergencyContacts, setEmergencyContacts] = useState({});
  const [adminNotes, setAdminNotes] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [notifReadAt, setNotifReadAt] = useState({ resident: "2026-03-10T00:00:00", admin: "2026-03-12T00:00:00", maintenance: "2026-03-12T00:00:00" });
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [pendingResidentView, setPendingResidentView] = useState(null);
  const [sbProperties, setSbProperties] = useState(null);
  const [sbResidents, setSbResidents] = useState(null);
  const [sbResidentsExt, setSbResidentsExt] = useState(null);
  const [sbRentLedger, setSbRentLedger] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const mobile = useIsMobile();

  const [onboardingData, setOnboardingData] = useState(null);

  // Reusable data reload function
  const reloadData = useCallback(async () => {
    try {
      const safe = (fn) => fn().catch(err => { console.warn('Fetch failed:', err.message); return null; });
      const [props, res, resExt, docs, ledger, maint, vend, uInsp, rInsp, thr, msgs, compDocs, onboard, staff, notes, aUnits, checklists] = await Promise.all([
        safe(fetchProperties), safe(fetchResidents), safe(fetchResidentsExtended), safe(fetchLeaseDocsByResident),
        safe(fetchRentLedger), safe(fetchMaintenanceRequests), safe(fetchVendors),
        safe(fetchUnitInspections), safe(fetchRegInspections), safe(fetchThreads), safe(fetchMessages),
        safe(fetchComplianceDocs), safe(fetchOnboardingWorkflows), safe(fetchStaffMembers), safe(fetchAdminNotes), safe(fetchAllUnits), safe(fetchInspectionChecklists),
      ]);
      LIVE_PROPERTIES = props || []; LIVE_RESIDENTS = res || []; LIVE_RESIDENTS_EXTENDED = resExt || {};
      LIVE_RENT_LEDGER = ledger || [];
      LIVE_REG_INSPECTIONS = rInsp || [];
      LIVE_COMPLIANCE_DOCS = compDocs || [];
      setSbProperties(props || []); setSbResidents(res || []); setSbResidentsExt(resExt || {});
      setSbRentLedger(ledger || []); setLeaseDocs(docs || {});
      setMaintenance(maint || []);
      setVendors(vend || []);
      setUnitInspections(uInsp || []);
      setAllUnits(aUnits || []);
      setSavedChecklists(checklists || []);
      setStaffMembers(staff || []);
      setThreads(thr || []);
      setMessages(msgs || []);
      setOnboardingData(onboard || []);
      // Map notes from UUID-keyed to slug-keyed using resident lookup
      if (notes && (props || LIVE_PROPERTIES).length) {
        const mapped = {};
        const allRes = res || LIVE_RESIDENTS;
        for (const [uuid, noteList] of Object.entries(notes)) {
          const r = allRes.find(r => r._uuid === uuid);
          if (r) mapped[r.id] = noteList;
        }
        setAdminNotes(mapped);
      }
      setDataReady(true);
    } catch (err) {
      console.warn('Supabase load failed:', err);
      setDataReady(true);
    }
  }, []);

  // Load core data from Supabase on mount
  useEffect(() => {
    reloadData();
    return () => {};
  }, []);

  // Auth: check session on mount, listen for changes
  useEffect(() => {
    getCurrentSession().then(session => {
      if (session?.user) {
        setAuthUser(session.user);
        fetchProfile(session.user.id, session.user.email).then(p => { if (p) setProfile(p); });
      }
      setAuthLoading(false);
    });
    const { data: { subscription } } = onAuthStateChange(session => {
      if (session?.user) {
        setAuthUser(session.user);
        fetchProfile(session.user.id, session.user.email).then(p => { if (p) setProfile(p); });
      } else {
        setAuthUser(null);
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Resident context — derived from profile for logged-in residents, or from View As for admins
  const residentCtx = (() => {
    if (role === "resident") {
      if (profile?.role === "resident" && profile.residentSlug) {
        return { id: profile.residentSlug, name: profile.residentName, firstName: profile.residentName?.split(" ")[0], unit: profile.unit, propertyId: profile.propertySlug };
      }
      // Resident not linked to a resident record — show minimal context
      return { id: "", name: profile?.displayName || "Resident", firstName: profile?.displayName?.split(" ")[0] || "Resident", unit: "—", propertyId: "" };
    }
    return null;
  })();

  // Note: LIVE_PROPERTIES / LIVE_RESIDENTS / LIVE_RESIDENTS_EXTENDED are module-level
  // bindings updated by the Supabase useEffect above. All components read from those.

  const themeVars = Object.fromEntries(
    Object.entries(THEMES[darkMode ? "dark" : "light"]).map(([k, v]) => [`--t-${k}`, v])
  );

  // Base mutation callbacks
  const addMaintenance = async (req) => {
    setMaintenance(prev => [req, ...prev]);
    try {
      await insertMaintenanceRequest({ unit: req.unit, category: req.category, priority: req.priority, description: req.description, propertySlug: req.propertyId });
    } catch (err) { console.warn('Supabase insert maintenance failed:', err); }
  };
  const updateMaintenance = async (id, changes) => {
    setMaintenance(prev => prev.map(m => m.id === id ? { ...m, ...changes } : m));
    try {
      await updateMaintenanceRequest(id, changes);
    } catch (err) { console.warn('Supabase update maintenance failed:', err); }
  };
  const addThread = async (t) => {
    setThreads(prev => [t, ...prev]);
    try { await insertThread(t); } catch (err) { console.warn('Supabase insert thread failed:', err); }
  };
  const addMessage = async (msg) => {
    setMessages(prev => [...prev, msg]);
    try { await insertMessage(msg); } catch (err) { console.warn('Supabase insert message failed:', err); }
  };
  const updateThread = async (id, changes) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
    try { await updateThreadDb(id, changes); } catch (err) { console.warn('Supabase update thread failed:', err); }
  };
  const addVendor = async (v) => {
    setVendors(prev => [v, ...prev]);
    try { await insertVendor(v); } catch (err) { console.warn('Supabase insert vendor failed:', err); }
  };
  const addInspection = async (insp) => {
    setUnitInspections(prev => [insp, ...prev]);
    try { await insertUnitInspection(insp); } catch (err) { console.warn('Supabase insert inspection failed:', err); }
  };
  const updateInspection = async (id, changes) => {
    setUnitInspections(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
    try { await updateUnitInspection(id, changes); } catch (err) { console.warn('Supabase update inspection failed:', err); }
  };
  const updateEmergencyContacts = (residentId, contacts) => setEmergencyContacts(prev => ({ ...prev, [residentId]: contacts }));
  const addAdminNote = async (residentId, note, replace = false) => {
    if (replace) {
      // Deletion — find removed notes and delete from Supabase
      const prev = adminNotes[residentId] || [];
      const kept = Array.isArray(note) ? note : [];
      const removed = prev.filter(n => !kept.find(k => k.id === n.id));
      setAdminNotes(p => ({ ...p, [residentId]: kept }));
      for (const r of removed) {
        try { await deleteAdminNote(r.id); } catch (err) { console.warn('Delete note failed:', err); }
      }
    } else {
      // Add new note
      const resident = LIVE_RESIDENTS.find(r => r.id === residentId);
      const uuid = resident?._uuid;
      setAdminNotes(p => ({ ...p, [residentId]: [...(p[residentId] || []), note] }));
      if (uuid) {
        try {
          const saved = await insertAdminNote(uuid, note);
          // Update the note's id with the Supabase UUID
          setAdminNotes(p => ({ ...p, [residentId]: (p[residentId] || []).map(n => n.id === note.id ? { ...n, id: saved.id } : n) }));
        } catch (err) { console.warn('Insert note failed:', err); }
      }
    }
  };
  const resetAllState = async () => {
    // Re-fetch Supabase data for core tables
    try {
      const [props, res, resExt, docs, ledger, maint, vend, uInsp, rInsp, thr, msgs, compDocs, onboard] = await Promise.all([
        fetchProperties(), fetchResidents(), fetchResidentsExtended(), fetchLeaseDocsByResident(), fetchRentLedger(),
        fetchMaintenanceRequests(), fetchVendors(), fetchUnitInspections(), fetchRegInspections(), fetchThreads(), fetchMessages(),
        fetchComplianceDocs(), fetchOnboardingWorkflows(),
      ]);
      LIVE_PROPERTIES = props; LIVE_RESIDENTS = res; LIVE_RESIDENTS_EXTENDED = resExt;
      if (ledger && ledger.length) LIVE_RENT_LEDGER = ledger;
      if (rInsp && rInsp.length) LIVE_REG_INSPECTIONS = rInsp;
      if (compDocs && compDocs.length) LIVE_COMPLIANCE_DOCS = compDocs;
      setSbProperties(props); setSbResidents(res); setSbResidentsExt(resExt); setSbRentLedger(ledger); setLeaseDocs(docs);
      if (maint && maint.length) setMaintenance(maint);
      if (vend && vend.length) setVendors(vend);
      if (uInsp && uInsp.length) setUnitInspections(uInsp);
      if (thr && thr.length) setThreads(thr);
      if (msgs && msgs.length) setMessages(msgs);
      if (onboard && onboard.length) setOnboardingData(onboard);
    } catch (err) {
      console.warn('Reset fetch failed:', err);
      setLeaseDocs(MOCK_LEASE_DOCS);
    }
    // Reset non-Supabase state to mocks
    setMaintenance([]); setThreads([]); setMessages([]);
    setVendors([]); setUnitInspections([]);
    setEmergencyContacts({}); setAdminNotes({});
    setCommPrefs(MOCK_COMM_PREFS); setSettings(DEFAULT_SETTINGS); setPage("dashboard");
  };

  // Notification-aware wrappers
  const pushNotif = (n) => setNotifications(prev => [n, ...prev]);
  const roleNotifs = notifications.filter(n => n.roles.includes(role)).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const unreadCount = roleNotifs.filter(n => new Date(n.timestamp) > new Date(notifReadAt[role])).length;
  const markAllRead = () => { setNotifReadAt(prev => ({ ...prev, [role]: new Date().toISOString() })); };

  const addMaintenanceN = (req) => {
    addMaintenance(req);
    pushNotif({ id: `N-${Date.now()}`, type: "maintenance", icon: "🔧", message: `New request: ${req.description.slice(0, 50)} (${req.unit})${req.priority === "critical" ? " — Critical" : ""}`, timestamp: new Date().toISOString(), roles: ["admin", "maintenance"] });
    // Email notify admin team about new maintenance request
    const adminEmails = ["maintenance@bolinaslandtrust.org"]; // TODO: pull from user_profiles where role=admin
    adminEmails.forEach(email => {
      sendNotification({ type: "maintenance_created", to: email, residentName: req.unit, unit: req.unit, description: req.description, priority: req.priority, category: req.category }).catch(() => {});
    });
  };
  const updateMaintenanceN = (id, changes) => {
    updateMaintenance(id, changes);
    const parts = [];
    if (changes.status) parts.push(`Status → ${changes.status}`);
    if (changes.assignedTo) parts.push(`Assigned to ${changes.assignedTo}`);
    pushNotif({ id: `N-${Date.now()}`, type: "maintenance", icon: "🔧", message: `${id} updated: ${parts.join(", ") || "notes added"}`, timestamp: new Date().toISOString(), roles: ["resident", "admin", "maintenance"].filter(r => r !== role) });
    // Email notification to resident
    const req = maintenance.find(m => m.id === id);
    if (req) {
      const resident = LIVE_RESIDENTS.find(r => r.unit === req.unit);
      if (resident?.email) {
        sendNotification('maintenance_update', {
          residentEmail: resident.email, residentName: resident.name,
          requestId: id, description: req.description,
          status: changes.status || req.status, assignedTo: changes.assignedTo || req.assignedTo,
          note: changes.notes?.length ? changes.notes[changes.notes.length - 1]?.text : null,
        });
      }
    }
  };
  const addThreadN = (t) => {
    addThread(t);
    pushNotif({ id: `N-${Date.now()}`, type: "message", icon: "💬", message: `New message: ${t.subject}`, timestamp: new Date().toISOString(), roles: ["resident", "admin"].filter(r => r !== role) });
  };
  const addMessageN = (msg) => {
    addMessage(msg);
    const thread = threads.find(t => t.id === msg.threadId);
    pushNotif({ id: `N-${Date.now()}`, type: "message", icon: "💬", message: `Reply in "${thread?.subject || "thread"}"`, timestamp: new Date().toISOString(), roles: ["resident", "admin"].filter(r => r !== role) });
  };
  const addVendorN = (v) => {
    addVendor(v);
    pushNotif({ id: `N-${Date.now()}`, type: "vendor", icon: "📇", message: `New vendor added: ${v.company}`, timestamp: new Date().toISOString(), roles: ["admin", "maintenance"] });
  };
  const addInspectionN = (insp) => {
    addInspection(insp);
    pushNotif({ id: `N-${Date.now()}`, type: "inspection", icon: "🔍", message: `Inspection scheduled: ${insp.category} — ${insp.unit}`, timestamp: new Date().toISOString(), roles: ["admin", "maintenance", ...(insp.unit === (residentCtx?.unit || "") ? ["resident"] : [])] });
  };
  const updateInspectionN = (id, changes) => {
    updateInspection(id, changes);
    const insp = unitInspections.find(i => i.id === id);
    if (changes.result) {
      pushNotif({ id: `N-${Date.now()}`, type: "inspection", icon: "🔍", message: `Inspection ${changes.result === "Pass" ? "completed" : "updated"}: ${insp?.category || "Inspection"} — ${insp?.unit || ""}`, timestamp: new Date().toISOString(), roles: ["admin", "maintenance", ...(insp?.unit === (residentCtx?.unit || "") ? ["resident"] : [])] });
    }
  };

  const nav = NAV[role] || [];
  const navBadges = {};
  if (role === "admin") {
    navBadges.maintenance = maintenance.filter(m => m.status === "submitted").length;
    navBadges.communications = threads.filter(t => t.unread > 0).length;
  } else if (role === "maintenance") {
    navBadges["work-orders"] = maintenance.filter(m => !m.assignedTo).length;
    navBadges.messages = threads.filter(t => t.unread > 0 && (t.type === "broadcast" || t.subject.toLowerCase().includes("maintenance"))).length;
  } else {
    navBadges.messages = threads.filter(t => t.unread > 0 && (t.participants.includes(residentCtx?.id || "") || t.type === "broadcast")).length;
  }

  const handleRoleChange = useCallback((newRole) => {
    setRoleOverride(newRole === profile?.role ? null : newRole);
    setPage("dashboard");
    setSidebarOpen(false);
  }, [profile]);

  const handleNav = (id) => {
    setPage(id);
    if (mobile) setSidebarOpen(false);
  };

  const selectProperty = useCallback((propId, targetPage, residentSlug) => {
    setSelectedProperty(propId);
    setPage(targetPage || "residents");
    if (residentSlug) setPendingResidentView(residentSlug);
    if (mobile) setSidebarOpen(false);
  }, [mobile]);

  const searchGroups = buildSearchResults(searchQuery, role, maintenance, threads, vendors, unitInspections);
  const handleSearchNav = (pageId) => {
    setPage(pageId);
    setSearchQuery("");
    setShowSearch(false);
    if (mobile) setSidebarOpen(false);
  };

  const renderPage = () => {
    if (role === "resident") {
      const rc = residentCtx;
      const myMaint = rc?.unit ? maintenance.filter(m => m.unit === rc.unit) : maintenance;
      const myThreads = rc?.id ? threads.filter(t => t.type === "broadcast" || t.participants.includes(rc.id)) : threads;
      switch (page) {
        case "dashboard": return <ResidentDashboard mobile={mobile} maintenance={myMaint} threads={myThreads} notifications={roleNotifs} rc={rc} onNavigate={handleNav} />;
        case "maintenance": return <ResidentMaintenance mobile={mobile} maintenance={myMaint} onSubmit={addMaintenanceN} rc={rc} />;
        case "rent": return <RentPayments mobile={mobile} rc={rc} />;
        case "recert": return <IncomeCertification role="resident" mobile={mobile} selectedProperty={selectedProperty} rc={rc} pushNotif={pushNotif} />;
        case "unit": return <UnitDetails leaseDocs={leaseDocs} setLeaseDocs={setLeaseDocs} mobile={mobile} rc={rc} />;
        case "inspections": return <Inspections role="resident" mobile={mobile} unitInspections={unitInspections} rc={rc} />;
        case "profile": return <ResidentProfile mobile={mobile} commPrefs={commPrefs} setCommPrefs={setCommPrefs} emergencyContacts={emergencyContacts} onUpdateEmergencyContacts={updateEmergencyContacts} rc={rc} />;
        case "messages": return <Communications role="resident" commPrefs={commPrefs} setCommPrefs={setCommPrefs} mobile={mobile} threads={myThreads} messages={messages} onAddThread={addThreadN} onAddMessage={addMessageN} onUpdateThread={updateThread} rc={rc} />;
        default: return <ResidentDashboard mobile={mobile} maintenance={maintenance} threads={threads} notifications={roleNotifs} rc={rc} />;
      }
    }
    if (role === "admin") {
      const sp = selectedProperty;
      const fMaint = filterByProperty(maintenance, sp);
      const fInsp = filterByProperty(unitInspections, sp);
      switch (page) {
        case "dashboard": return <AdminDashboard mobile={mobile} maintenance={fMaint} vendors={vendors} notifications={roleNotifs} selectedProperty={sp} onSelectProperty={selectProperty} />;
        case "residents": return <AdminResidents mobile={mobile} maintenance={fMaint} threads={threads} emergencyContacts={emergencyContacts} adminNotes={adminNotes} onAddAdminNote={addAdminNote} selectedProperty={sp} onDataChanged={reloadData} leaseDocs={leaseDocs} sbRentLedger={sbRentLedger} pendingResidentView={pendingResidentView} onClearPendingResident={() => setPendingResidentView(null)} onAddThread={addThreadN} onAddMessage={addMessageN} onResidentAdded={async () => {
          try { const [res, resExt] = await Promise.all([fetchResidents(), fetchResidentsExtended()]); LIVE_RESIDENTS = res; LIVE_RESIDENTS_EXTENDED = resExt; setSbResidents(res); setSbResidentsExt(resExt); } catch(e) { console.warn(e); }
        }} />;
        case "onboarding": return <OnboardingChecklist mobile={mobile} selectedProperty={sp} initialRecords={onboardingData} />;
        case "documents": return <AdminDocuments leaseDocs={leaseDocs} setLeaseDocs={setLeaseDocs} mobile={mobile} selectedProperty={sp} />;
        case "maintenance": return <AdminMaintenance mobile={mobile} maintenance={fMaint} onUpdate={updateMaintenanceN} onAdd={addMaintenanceN} staffMembers={staffMembers} />;
        case "recert": return <IncomeCertification role="admin" mobile={mobile} selectedProperty={sp} />;
        case "inspections": return <Inspections role="admin" mobile={mobile} unitInspections={fInsp} onSchedule={addInspectionN} onUpdate={updateInspectionN} selectedProperty={sp} allUnits={allUnits} savedChecklists={savedChecklists} onSaveChecklist={async (cl) => { const saved = await insertInspectionChecklist(cl); setSavedChecklists(prev => [saved, ...prev]); return saved; }} onUpdateChecklist={async (uuid, changes) => { await updateInspectionChecklist(uuid, changes); setSavedChecklists(prev => prev.map(c => c._uuid === uuid ? { ...c, ...changes } : c)); }} />;
        case "property": return <PropertyDetails leaseDocs={leaseDocs} setLeaseDocs={setLeaseDocs} mobile={mobile} selectedProperty={sp} onSelectProperty={selectProperty} onDataRefresh={reloadData} settings={settings} />;
        case "vendors": return <Vendors role="admin" mobile={mobile} vendors={vendors} onAddVendor={addVendorN} onUpdateVendor={(id, changes) => { updateVendor(id, changes).then(() => reloadData()).catch(err => console.warn(err)); setVendors(prev => prev.map(v => v.id === id ? { ...v, ...changes } : v)); }} />;
        case "communications": return <Communications role="admin" commPrefs={commPrefs} setCommPrefs={setCommPrefs} mobile={mobile} threads={threads} messages={messages} onAddThread={addThreadN} onAddMessage={addMessageN} onUpdateThread={updateThread} onDeleteThread={(threadId) => { deleteThreadFromDb(threadId).catch(err => console.warn("Delete thread failed:", err)); setThreads(prev => prev.filter(t => t.id !== threadId)); setMessages(prev => prev.filter(m => m.threadId !== threadId)); }} />;
        case "financial": return <FinancialOverview mobile={mobile} selectedProperty={sp} onSelectProperty={selectProperty} />;
        case "reports": return <AdminReports mobile={mobile} maintenance={fMaint} vendors={vendors} unitInspections={fInsp} selectedProperty={sp} />;
        case "calendar": return <CalendarView mobile={mobile} maintenance={fMaint} vendors={vendors} unitInspections={fInsp} onNavigate={setPage} />;
        case "settings": return <AdminSettings mobile={mobile} settings={settings} setSettings={setSettings} darkMode={darkMode} setDarkMode={setDarkMode} maintenance={maintenance} vendors={vendors} unitInspections={unitInspections} onReset={resetAllState} />;
        default: return <AdminDashboard mobile={mobile} maintenance={fMaint} vendors={vendors} notifications={roleNotifs} selectedProperty={sp} />;
      }
    }
    if (role === "maintenance") {
      switch (page) {
        case "dashboard": return <MaintenanceDashboard mobile={mobile} maintenance={maintenance} notifications={roleNotifs} />;
        case "work-orders": return <WorkOrders mobile={mobile} maintenance={maintenance} onUpdate={updateMaintenanceN} />;
        case "inspections": return <Inspections role="maintenance" mobile={mobile} unitInspections={unitInspections} onUpdate={updateInspectionN} allUnits={allUnits} />;
        case "vendors": return <Vendors role="maintenance" mobile={mobile} vendors={vendors} />;
        case "messages": return <Communications role="maintenance" commPrefs={commPrefs} setCommPrefs={setCommPrefs} mobile={mobile} threads={threads} messages={messages} onAddThread={addThreadN} onAddMessage={addMessageN} onUpdateThread={updateThread} />;
        case "schedule": return <CalendarView mobile={mobile} maintenance={maintenance} vendors={vendors} unitInspections={unitInspections} onNavigate={setPage} />;
        case "profile": return <MaintenanceProfile mobile={mobile} />;
        case "maintenance": return <WorkOrders mobile={mobile} maintenance={maintenance} onUpdate={updateMaintenanceN} />;
        default: return <MaintenanceDashboard mobile={mobile} maintenance={maintenance} notifications={roleNotifs} />;
      }
    }
    return <ResidentDashboard mobile={mobile} maintenance={maintenance} threads={threads} notifications={roleNotifs} />;
  };

  const sidebarContent = (
    <>
      <div style={{ padding: "20px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.accent, letterSpacing: "-0.3px" }}>BCLT Portal</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>Resident Management</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setDarkMode(d => !d)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: 4, color: T.muted }} title={darkMode ? "Light mode" : "Dark mode"}>{darkMode ? "☀️" : "🌙"}</button>
          <NotificationBell count={unreadCount} onClick={() => setShowNotifPanel(!showNotifPanel)} mobile={mobile} />
          {mobile && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", fontSize: 22, color: T.muted, cursor: "pointer", padding: 4 }}>✕</button>}
        </div>
      </div>
      {/* Role is set by auth — no View As switcher needed */}
      {role === "admin" && (
        <div style={{ padding: "10px 12px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "1px", padding: "0 6px", marginBottom: 6 }}>Property</div>
          <PropertySelector value={selectedProperty} onChange={setSelectedProperty} mobile={mobile} properties={sbProperties} />
        </div>
      )}
      <div style={{ padding: "10px 12px 0", position: "relative" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.dim, pointerEvents: "none" }}>🔎</span>
          <input
            type="text" placeholder="Search..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setShowSearch(true)}
            style={{ ...s.input, paddingLeft: 32, fontSize: 13, background: T.bg, minHeight: mobile ? 44 : undefined }}
          />
          {searchQuery && <button onClick={() => { setSearchQuery(""); setShowSearch(false); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", fontSize: 14, color: T.muted, cursor: "pointer", padding: 2 }}>✕</button>}
        </div>
        {showSearch && searchQuery.trim().length >= 2 && (
          <div style={mobile ? { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, marginTop: 6 } : { position: "absolute", left: 12, right: 12, top: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, marginTop: 4 }}>
            <SearchResults groups={searchGroups} onSelect={handleSearchNav} mobile={mobile} />
          </div>
        )}
      </div>
      <div style={{ padding: "16px 12px", flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "1px", padding: "0 6px", marginBottom: 8 }}>Navigation</div>
        {nav.map(item => (
          <button key={item.id} onClick={() => handleNav(item.id)} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
            padding: mobile ? "11px 12px" : "9px 12px", marginBottom: 2, borderRadius: T.radiusSm,
            background: page === item.id ? T.accentDim : "transparent",
            color: page === item.id ? T.accent : T.muted,
            border: "none", cursor: "pointer", fontSize: mobile ? 14 : 13,
            fontWeight: page === item.id ? 700 : 500,
            minHeight: mobile ? 48 : undefined,
          }}>
            <span style={{ fontSize: mobile ? 18 : 15, width: 22, textAlign: "center" }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {navBadges[item.id] > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: T.danger, color: T.white, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{navBadges[item.id]}</span>}
          </button>
        ))}
      </div>
      <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: T.white }}>
          {(profile?.displayName || profile?.email || "?").slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{profile?.displayName || profile?.email?.split("@")[0] || "User"}</div>
          <div style={{ fontSize: 11, color: T.dim }}>{profile?.role === "resident" ? `Unit ${profile.unit}` : profile?.role === "admin" ? "Management" : "Maintenance"}</div>
        </div>
        <button onClick={() => signOut()} style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 8px" }}>Sign Out</button>
      </div>
    </>
  );

  // Auth gate
  if (authLoading) return <div style={{ ...s.page, ...themeVars, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><div style={{ color: T.muted, fontSize: 14 }}>Loading...</div></div>;
  if (!authUser || !profile) return <div style={themeVars}><LoginPage /></div>;

  return (
    <div style={{ ...s.page, ...themeVars, display: "flex", flexDirection: mobile ? "column" : "row" }}>
      {/* MOBILE TOP BAR */}
      {mobile && (
        <div data-print-hide style={{ position: "sticky", top: 0, zIndex: 900, background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 56, flexShrink: 0 }}>
          <div style={{ fontWeight: 800, color: T.accent, fontSize: 15 }}>BCLT Portal</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setDarkMode(d => !d)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: 4, minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" }} title={darkMode ? "Light mode" : "Dark mode"}>{darkMode ? "☀️" : "🌙"}</button>
            <NotificationBell count={unreadCount} onClick={() => setShowNotifPanel(!showNotifPanel)} mobile={mobile} />
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: T.white }}>
              {(profile?.displayName || profile?.email || "?").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      )}
      {/* SIDEBAR — desktop: static, mobile: overlay */}
      {mobile ? (
        sidebarOpen && (
          <>
            <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999 }} />
            <div data-print-hide style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 280, background: T.surface, zIndex: 1000, display: "flex", flexDirection: "column", overflowY: "auto", boxShadow: "4px 0 20px rgba(0,0,0,0.15)" }}>
              {sidebarContent}
            </div>
          </>
        )
      ) : (
        <div data-print-hide style={s.sidebar}>
          {sidebarContent}
        </div>
      )}
      {/* NOTIFICATION PANEL */}
      {showNotifPanel && (
        <>
          <div onClick={() => setShowNotifPanel(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 1100 }} />
          <div data-print-hide style={{ position: "fixed", top: mobile ? 56 : 0, right: 0, width: mobile ? "100%" : 380, maxWidth: "100%", height: mobile ? "calc(100vh - 56px)" : "100vh", background: T.surface, zIndex: 1200, boxShadow: "-4px 0 20px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Notifications</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {unreadCount > 0 && <button onClick={markAllRead} style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }}>Mark all read</button>}
                <button onClick={() => setShowNotifPanel(false)} style={{ background: "none", border: "none", fontSize: 20, color: T.muted, cursor: "pointer", padding: 4 }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {roleNotifs.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: T.dim }}>No notifications</div>
              ) : roleNotifs.map(n => (
                <div key={n.id} style={{ padding: "12px 20px", borderBottom: `1px solid ${T.borderLight}`, display: "flex", gap: 12, background: new Date(n.timestamp) > new Date(notifReadAt[role]) ? T.accentDim : "transparent" }}>
                  <span style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0, marginTop: 2 }}>{n.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, lineHeight: 1.4 }}>{n.message}</div>
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{timeAgo(n.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {/* MAIN CONTENT */}
      <div style={{ ...s.main, padding: mobile ? 16 : 28, paddingBottom: mobile ? 100 : 28 }}>
        {renderPage()}
      </div>
      {/* MOBILE BOTTOM TAB BAR */}
      {mobile && <MobileTabBar role={role} activePage={page} onNavigate={handleNav} navBadges={navBadges} onMoreClick={() => setSidebarOpen(true)} />}
    </div>
  );
}
