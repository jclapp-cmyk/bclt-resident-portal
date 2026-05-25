import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { fetchProperties, fetchResidents, fetchResidentsExtended, fetchLeaseDocsByResident, fetchRentLedger, fetchRentPayments, recordPayment, fetchMaintenanceRequests, insertMaintenanceRequest, updateMaintenanceRequest, fetchVendors, insertVendor, updateVendor, fetchUnitInspections, insertUnitInspection, updateUnitInspection, fetchRegInspections, insertRegInspection, updateRegInspection, deleteRegInspection, fetchThreads, fetchMessages, insertThread, insertMessage, updateThread as updateThreadDb, fetchComplianceDocs, fetchOnboardingWorkflows, insertOnboardingWorkflow, updateOnboardingWorkflow, insertResident, insertLease, uploadLeaseFile, getLeaseFileUrl, deleteLeaseFile, uploadInspectionAttachment, getInspectionAttachmentUrl, deleteInspectionAttachment, insertLeaseDocument, deleteLeaseDocument, fetchAuditLog, insertProperty, insertUnit, fetchUnits, updateProperty, updateUnit, deleteUnit, updateResident, deleteResident, updateLease, fetchResidentLease, fetchHouseholdMembers, insertHouseholdMember, deleteHouseholdMember, fetchStaffMembers, insertStaffMember, updateStaffMember, deleteStaffMember, deleteProperty, deleteThread as deleteThreadFromDb, fetchAllUnits, fetchInspectionChecklists, insertInspectionChecklist, updateInspectionChecklist, fetchIncomeCertifications, insertIncomeCertification, updateIncomeCertification, fetchTICMembers, insertTICMember, updateTICMember, deleteTICMember, fetchTICIncome, insertTICIncome, updateTICIncome, deleteTICIncome, fetchTICAssets, insertTICAsset, updateTICAsset, deleteTICAsset, fetchAMIReference, fetchRentLimits, uploadTICDocument, getTICDocumentUrl, fetchAdminNotes, insertAdminNote, deleteAdminNote, uploadMessageAttachment, uploadMaintenancePhoto, fetchInspectionTemplates, insertInspectionTemplate, updateInspectionTemplate, deleteInspectionTemplate, fetchPropertyDocuments, uploadPropertyDocument, getPropertyDocumentUrl, deletePropertyDocument } from "./lib/data";
import { signInWithMagicLink, signOut, onAuthStateChange, getCurrentSession, fetchProfile, fetchUserProfiles, inviteUser, updateUserProfile, deleteUserProfile } from "./lib/auth";
import { sendNotification, sendSMS, sendBoth } from "./lib/notify";
import { supabase } from "./lib/supabase";

// HEIC files (default iPhone photo format) don't render in <img> on
// Chrome/Firefox/Edge — only Safari. Convert client-side to JPEG so
// uploaded photos display reliably anywhere admins might view them.
// Lazy-loaded so the ~700KB library only ships when needed.
async function convertHeicIfNeeded(file) {
  if (!file) return file;
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  const isHeic = type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
  if (!isHeic) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(out) ? out[0] : out;
    const newName = name.replace(/\.heic$|\.heif$/i, ".jpg");
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    console.warn("HEIC conversion failed, uploading original:", err);
    return file;
  }
}

/* ═══════════════════════════════════════════════════════════
   BCLT RESIDENT PORTAL — Affordable Housing / Section 8
   Full interactive portal with Supabase backend
   Roles: Resident, Admin/Management, Maintenance Staff
   ═══════════════════════════════════════════════════════════ */

// ── DATA DEFAULTS ──

const getProperty = (id) => LIVE_PROPERTIES.find(p => p.id === id || p._uuid === id) || LIVE_PROPERTIES[0] || {};
const DEFAULT_UNIT_INSPECTION_CATEGORIES = [
  { id: 'cat-1', name: 'Move-In', description: 'Document unit condition at lease start', frequency: 'At move-in', scoring: 'pass-fail', active: true, checklist: ['Walls & paint condition', 'Flooring condition', 'Windows & screens', 'Doors & locks', 'Kitchen appliances', 'Bathroom fixtures', 'Plumbing', 'Electrical', 'Smoke/CO detectors', 'HVAC operation', 'Cleanliness', 'Exterior/patio'] },
  { id: 'cat-2', name: 'Move-Out', description: 'Assess unit condition at lease end', frequency: 'At move-out', scoring: 'pass-fail', active: true, checklist: ['Walls & paint condition', 'Flooring condition', 'Windows & screens', 'Doors & locks', 'Kitchen appliances', 'Bathroom fixtures', 'Plumbing', 'Electrical', 'Smoke/CO detectors', 'HVAC', 'Cleanliness', 'Damage beyond normal wear'] },
  { id: 'cat-3', name: 'Annual / Routine', description: 'Proactive check on unit condition and safety', frequency: 'Annually', scoring: 'pass-fail', active: true, checklist: ['Smoke detectors', 'CO detectors', 'Fire extinguisher', 'HVAC filter', 'Water heater', 'Plumbing leaks', 'Window locks', 'Door locks', 'Electrical panels', 'Pest evidence', 'Mold/moisture', 'General condition'] },
  { id: 'cat-4', name: 'Pre-HQS / Pre-REAC', description: 'Internal walkthrough before official inspection', frequency: 'Before scheduled inspection', scoring: 'scored', active: true, checklist: ['Smoke detectors', 'Electrical hazards', 'Plumbing leaks', 'HVAC operational', 'Hot water', 'Windows', 'Doors', 'Handrails', 'Trip hazards', 'Paint condition', 'Kitchen ventilation', 'Bathroom ventilation', 'GFCIs', 'Pest evidence', 'Egress paths'] },
  { id: 'cat-5', name: 'Housekeeping', description: 'Sanitation and cleanliness per lease terms', frequency: 'As needed', scoring: 'pass-fail', active: true, checklist: ['Kitchen cleanliness', 'Bathroom cleanliness', 'Trash/debris', 'Pest attractants', 'Clutter/fire hazards', 'Odors'] },
  { id: 'cat-6', name: 'Safety / Smoke Detector', description: 'Verify life safety devices', frequency: 'Semi-annual', scoring: 'pass-fail', active: true, checklist: ['Smoke detectors', 'CO detector', 'Fire extinguisher present', 'Fire extinguisher charge'] },
  { id: 'cat-7', name: 'Pest', description: 'Check for pest activity', frequency: 'Quarterly', scoring: 'pass-fail', active: true, checklist: ['Roach evidence', 'Bed bug evidence', 'Rodent evidence', 'Ant activity', 'Entry points sealed', 'Moisture issues'] },
  { id: 'cat-8', name: 'Seasonal / Preventive', description: 'HVAC, weatherization, plumbing', frequency: 'Seasonal', scoring: 'pass-fail', active: true, checklist: ['HVAC filter', 'HVAC operation', 'Weather stripping', 'Caulking', 'Pipe insulation', 'Gutter/drainage'] },
];
const DEFAULT_COMM_PREFS = { preferredChannel: 'email', phone: '', email: '', quietHoursStart: '21:00', quietHoursEnd: '08:00', language: 'en' };
const DEFAULT_LEASE_DOCS = {};
const DEFAULT_ONBOARDING = [];
const LEASE_DOC_TYPES = { lease: "Lease Agreement", addendum: "Addendum", notice: "Notice", income: "Income Verification", id: "ID/SSN", other: "Other" };

const DEFAULT_SETTINGS = {
  property: { manager: "Sarah Chen", managerPhone: "(415) 555-0100", managerEmail: "sarah@bclt.org", officeHours: "Mon-Fri 9am-5pm" },
  notifications: {
    maintenanceAlerts: true, inspectionReminders: true, vendorComplianceAlerts: true,
    rentPaymentUpdates: true, communityAnnouncements: false,
    quietHoursStart: "21:00", quietHoursEnd: "08:00",
  },
  rent: { dueDay: "1", gracePeriodDays: "5", lateFeeAmount: "50", leaseTermDefault: "12", autoRenewal: true },
  maint: { categories: ["Plumbing", "Electrical", "HVAC", "Appliance", "Structural", "Pest", "Other"], defaultPriority: "routine", autoAssign: false, emergencyPhone: "(415) 555-0199", notifyPhones: [] },
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

// Maintenance status helpers — recognise both legacy ("submitted"/"completed")
// and new pipeline ("new"/"needs-info"/"todo"/"in-progress"/"done"/"rejected").
const MAINT_OPEN = (m) => m && m.status !== "done" && m.status !== "completed" && m.status !== "rejected";
const MAINT_DONE = (m) => m && (m.status === "done" || m.status === "completed");
const MAINT_AWAITING = (m) => m && (m.status === "new" || m.status === "needs-info" || m.status === "submitted");
const MAINT_ACTIVE_WO = (m) => m && (m.status === "todo" || m.status === "in-progress");
const MAINT_INPROGRESS = (m) => m && m.status === "in-progress";

const STATUS_COLORS = {
  // legacy values (back-compat)
  submitted: { bg: T.infoDim, text: T.info, label: "Submitted" },
  completed: { bg: T.successDim, text: T.success, label: "Completed" },
  // new pipeline
  new: { bg: T.infoDim, text: T.info, label: "New" },
  "needs-info": { bg: T.warnDim, text: T.warn, label: "Needs Info" },
  rejected: { bg: T.dangerDim, text: T.danger, label: "Rejected" },
  todo: { bg: T.dimLight, text: T.muted, label: "To Do" },
  "in-progress": { bg: T.warnDim, text: T.warn, label: "In Progress" },
  done: { bg: T.successDim, text: T.success, label: "Done" },
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

const StatCard = ({ label, value, accent = T.accent, mobile, onClick }) => (
  <div
    onClick={onClick}
    style={{ ...s.statCard(accent, mobile), cursor: onClick ? "pointer" : "default", transition: "transform 0.1s, box-shadow 0.1s" }}
    onMouseEnter={onClick ? (e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; } : undefined}
    onMouseLeave={onClick ? (e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; } : undefined}
  >
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

const SuccessMessage = ({ message }) => {
  if (!message) return null;
  const isError = typeof message === "string" && message.startsWith("Error");
  return (
    <div style={{ padding: "10px 16px", background: isError ? T.dangerDim : T.successDim, color: isError ? T.danger : T.success, borderRadius: T.radiusSm, marginBottom: 14, fontWeight: 600, fontSize: 13 }}>
      {isError ? "✗" : "✓"} {message}
    </div>
  );
};

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
    { id: "messages", label: "Messages", icon: "💬" },
    { id: "recert", label: "Recertification", icon: "📋" },
    { id: "unit", label: "My Unit", icon: "🏠" },
    { id: "inspections", label: "Inspections", icon: "🔍" },
    { id: "profile", label: "My Profile", icon: "👤" },
  ],
  admin: [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "property", label: "Properties", icon: "🏢" },
    { id: "maintenance", label: "Maintenance Requests", icon: "🔧" },
    { id: "communications", label: "Communications", icon: "💬" },
    { id: "residents", label: "Residents", icon: "👥" },
    { id: "financial", label: "Finance", icon: "💰" },
    { id: "recert", label: "Income Certification", icon: "📋" },
    { id: "inspections", label: "Inspections", icon: "🔍" },
    { id: "reports", label: "Reports", icon: "📊" },
    { id: "calendar", label: "Calendar", icon: "📅" },
    { id: "vendors", label: "Vendors", icon: "📇" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ],
  maintenance: [
    { id: "dashboard", label: "Dashboard", icon: "◉" },
    { id: "work-orders", label: "Work Orders", icon: "🔧" },
    { id: "inspections", label: "Inspections", icon: "🔍" },
    { id: "messages", label: "Communications", icon: "💬" },
    { id: "vendors", label: "Vendors", icon: "📇" },
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
  const openRequests = maintenance.filter(m => m.unit === rc?.unit && MAINT_OPEN(m)).length;
  const propName = LIVE_PROPERTIES.find(p => p.id === rc?.propertyId)?.name || "BCLT";
  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Welcome back, {rc?.firstName || "Resident"}</h1>
      <p style={s.sectionSub}>Unit {rc?.unit || "—"} — {propName}</p>
      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
        {(() => { const curMonth = new Date().toISOString().slice(0, 7); const le = LIVE_RENT_LEDGER.find(l => l.residentId === rc?.id && l.month === curMonth) || LIVE_RENT_LEDGER.find(l => l.residentId === rc?.id) || {}; const bal = le.balance || 0; return <StatCard label="Rent Balance" value={`$${Math.abs(bal).toFixed(2)}`} accent={bal > 0 ? T.danger : T.success} mobile={mobile} onClick={() => onNavigate && onNavigate("rent")} />; })()}
        <StatCard label="Open Requests" value={openRequests} accent={openRequests > 0 ? T.warn : T.success} mobile={mobile} onClick={() => onNavigate && onNavigate("maintenance")} />
        <StatCard label="Income Cert" value={certStatus.label} accent={certStatus.color === "danger" ? T.danger : certStatus.color === "warn" ? T.warn : T.success} mobile={mobile} onClick={() => onNavigate && onNavigate("recert")} />
        <StatCard label="Lease Status" value={ext.leaseEnd ? (new Date(ext.leaseEnd) < new Date() ? "Expired" : "Active") : (ext.leaseType === "month-to-month" ? "M-to-M" : "Active")} accent={ext.leaseEnd && new Date(ext.leaseEnd) < new Date() ? T.danger : T.success} mobile={mobile} onClick={() => onNavigate && onNavigate("unit")} />
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
      <div style={{ ...s.card, marginBottom: 24, cursor: onNavigate ? "pointer" : "default" }} onClick={() => onNavigate && onNavigate("rent")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Payment History {onNavigate && <span style={{ fontSize: 11, color: T.accent, marginLeft: 6 }}>→</span>}</div>
            <div style={{ fontSize: 12, color: T.muted }}>Last 6 months — balance at month end</div>
          </div>
          <span style={{ fontSize: 12, color: T.success, fontWeight: 600 }}>On Track</span>
        </div>
        {(() => {
          const now = new Date();
          const months = [];
          const points = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = d.toISOString().slice(0, 7);
            months.push(d.toLocaleString("default", { month: "short" }));
            const ledgerEntry = LIVE_RENT_LEDGER.find(l => l.residentId === rc?.id && l.month === monthKey);
            points.push(ledgerEntry ? (ledgerEntry.balance || 0) : 0);
          }
          return (
            <>
              <SparkLine points={points} color={points.some(p => p > 0) ? T.warn : T.success} width={mobile ? 260 : 400} height={48} mobile={mobile} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.dim, marginTop: 6, maxWidth: mobile ? 160 : 400 }}>
                {months.map((m, i) => <span key={i}>{m}</span>)}
              </div>
            </>
          );
        })()}
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Messages</div>
          {onNavigate && <button onClick={() => onNavigate("messages")} style={{ ...s.btn("ghost"), fontSize: 12, padding: "2px 8px" }}>View all →</button>}
        </div>
        {threads.filter(t => t.type === "broadcast" || t.participants.includes(rc?.id || "")).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate)).slice(0, 3).map(t => (
          <div key={t.id} onClick={() => onNavigate && onNavigate("messages")} style={{ padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, cursor: onNavigate ? "pointer" : "default" }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Active Maintenance</div>
          {onNavigate && <button onClick={() => onNavigate("maintenance")} style={{ ...s.btn("ghost"), fontSize: 12, padding: "2px 8px" }}>View all →</button>}
        </div>
        {maintenance.filter(m => m.unit === (rc?.unit || "") && MAINT_OPEN(m)).map(m => (
          <div key={m.id} onClick={() => onNavigate && onNavigate("maintenance")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, cursor: onNavigate ? "pointer" : "default" }}>
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
const AdminDashboard = ({ mobile, maintenance, vendors: vendorData, notifications, selectedProperty, onSelectProperty, onOpenMaintenance, onNavigateTo }) => {
  const [dashCerts, setDashCerts] = useState([]);
  useEffect(() => { fetchIncomeCertifications().then(c => setDashCerts(c || [])).catch((err) => { console.error('Failed to fetch certifications:', err); }); }, []);
  const regInsp = filterByProperty(LIVE_REG_INSPECTIONS, selectedProperty);
  const propLabel = selectedProperty === "all" ? "All Properties" : getProperty(selectedProperty).name;
  const totalUnits = selectedProperty === "all" ? LIVE_PROPERTIES.reduce((s, p) => s + p.totalUnits, 0) : getProperty(selectedProperty).totalUnits;
  // Financials roll-up scoped to selectedProperty (or all)
  const finLedger = selectedProperty === "all" ? LIVE_RENT_LEDGER : LIVE_RENT_LEDGER.filter(l => l.propertyId === selectedProperty);
  const finCurrentMonth = new Date().toISOString().slice(0, 7);
  const finCurrent = finLedger.filter(l => l.month === finCurrentMonth);
  const finRollupLedger = finCurrent.length > 0
    ? finCurrent
    : Object.values(finLedger.reduce((acc, l) => {
        if (!acc[l.residentId] || acc[l.residentId].month < l.month) acc[l.residentId] = l;
        return acc;
      }, {}));
  const finRent = finRollupLedger.reduce((s, l) => s + (l.rentDue || 0), 0);
  const finCollected = finRollupLedger.reduce((s, l) => s + (l.tenantPaid || 0) + (l.hapReceived || 0), 0);
  const finTenantPaid = finRollupLedger.reduce((s, l) => s + (l.tenantPaid || 0), 0);
  const finHap = finRollupLedger.reduce((s, l) => s + (l.hapReceived || 0), 0);
  const finOutstanding = finLedger.reduce((s, l) => s + Math.max(0, l.balance || 0), 0);
  const finRate = finRent > 0 ? Math.round((finCollected / finRent) * 100) : 0;
  const finDelinquent = finLedger.filter(l => (l.balance || 0) > 0).reduce((acc, l) => {
    if (!acc[l.residentId] || acc[l.residentId].month < l.month) acc[l.residentId] = l;
    return acc;
  }, {});
  const finTopDelinquent = Object.values(finDelinquent)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0))
    .slice(0, 3)
    .map(l => ({ ...l, resident: LIVE_RESIDENTS.find(r => r.id === l.residentId) }));

  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Admin Dashboard</h1>
      <p style={s.sectionSub}>{propLabel} — {totalUnits} Units</p>

      {/* Financials roll-up */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>💰 Financials <span style={{ fontSize: 11, color: T.muted, fontWeight: 400 }}>· {selectedProperty === "all" ? "all properties" : propLabel} · current month</span></div>
          {onSelectProperty && <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => onSelectProperty(selectedProperty, "financial")}>Full report →</button>}
        </div>
        <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: finTopDelinquent.length > 0 ? 16 : 0 }}>
          {(() => {
            const goFinance = onNavigateTo ? () => onNavigateTo("financial") : undefined;
            return <>
              <StatCard label="Monthly Rent" value={`$${finRent.toLocaleString()}`} accent={T.accent} mobile={mobile} onClick={goFinance} />
              <StatCard label="Collected" value={`$${finCollected.toLocaleString()}`} accent={T.success} mobile={mobile} onClick={goFinance} />
              <StatCard label="Tenant Paid" value={`$${finTenantPaid.toLocaleString()}`} accent={T.info} mobile={mobile} onClick={goFinance} />
              <StatCard label="HAP / Subsidy" value={`$${finHap.toLocaleString()}`} accent={T.info} mobile={mobile} onClick={goFinance} />
              <StatCard label="Collection Rate" value={`${finRate}%`} accent={finRate >= 95 ? T.success : finRate >= 80 ? T.warn : T.danger} mobile={mobile} onClick={goFinance} />
              <StatCard label="Outstanding" value={`$${finOutstanding.toLocaleString()}`} accent={finOutstanding > 0 ? T.danger : T.success} mobile={mobile} onClick={goFinance} />
            </>;
          })()}
        </div>
        {finTopDelinquent.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>Top delinquencies</div>
            <table style={s.table}>
              <thead><tr>{["Resident", "Unit", "Month", "Balance"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {finTopDelinquent.map((l, i) => (
                  <tr key={i} onClick={() => onNavigateTo && onNavigateTo("financial")} style={{ cursor: onNavigateTo ? "pointer" : "default" }}
                    onMouseEnter={e => { if (onNavigateTo) e.currentTarget.style.background = T.surfaceHover; }}
                    onMouseLeave={e => { if (onNavigateTo) e.currentTarget.style.background = "transparent"; }}>
                    <td style={s.td}>{l.resident?.name || "—"}</td>
                    <td style={s.td}>{l.resident?.unit || "—"}</td>
                    <td style={s.td}>{l.month}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: T.danger }}>${(l.balance || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-property performance cards — portfolio view */}
      {selectedProperty === "all" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Property Performance</div>
          <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap" }}>
            {LIVE_PROPERTIES.map(p => {
              const pMaint = maintenance.filter(m => m.propertyId === p.id);
              const pOpen = pMaint.filter(m => MAINT_OPEN(m)).length;
              const pCrit = pMaint.filter(m => m.priority === "critical" && MAINT_OPEN(m)).length;
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
            { value: maintenance.filter(m => MAINT_AWAITING(m)).length, color: T.info, label: "Submitted" },
            { value: maintenance.filter(m => m.status === "in-progress").length, color: T.warn, label: "In Progress" },
            { value: maintenance.filter(m => MAINT_DONE(m)).length, color: T.success, label: "Completed" },
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
          <thead><tr>{["Issue", "Requester", "Unit", "Category", "Priority", "Status", "Assigned"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {maintenance.filter(m => MAINT_OPEN(m)).map(m => (
              <tr key={m.id} onClick={() => onOpenMaintenance && onOpenMaintenance(m.id)} style={{ cursor: onOpenMaintenance ? "pointer" : "default" }}
                onMouseEnter={e => { e.currentTarget.style.background = T.surfaceHover; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                <td style={s.td}>
                  <div style={{ fontWeight: 600, color: T.accent }}>{m.description}</div>
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>{m.id}</div>
                </td>
                <td style={s.td}>{m.residentName || m.requesterName || "—"}</td>
                <td style={s.td}>{m.unit || "—"}</td>
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
                      <tr key={r.id} onClick={() => onNavigateTo && onNavigateTo("recert")} style={{ cursor: onNavigateTo ? "pointer" : "default" }}
                        onMouseEnter={e => { if (onNavigateTo) e.currentTarget.style.background = T.surfaceHover; }}
                        onMouseLeave={e => { if (onNavigateTo) e.currentTarget.style.background = "transparent"; }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Upcoming Inspections</div>
          {onNavigateTo && <button onClick={() => onNavigateTo("inspections")} style={{ ...s.btn("ghost"), fontSize: 12, padding: "2px 8px" }}>View all →</button>}
        </div>
        {regInsp.filter(i => new Date(i.nextDue) < new Date("2027-01-01")).slice(0, 3).map(i => (
          <div key={i.id} onClick={() => onNavigateTo && onNavigateTo("inspections")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, cursor: onNavigateTo ? "pointer" : "default" }}>
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
const MaintenanceDashboard = ({ mobile, maintenance, notifications, profile, staffMembers = [], threads = [], onOpenWorkOrder, onOpenMessages, onNavigateTo }) => {
  const staffName = profile?.displayName || profile?.email?.split("@")[0] || "Staff";
  // Permissive match that avoids short-name false positives:
  //  - case-insensitive equality on full display name
  //  - whole-word display-name containment (only if display name is >= 4 chars)
  //  - first-name match only if first name is >= 4 chars
  //  - staff_members linked by email
  const userEmail = (profile?.email || "").toLowerCase();
  const myDisplayLc = staffName.toLowerCase().trim();
  const myFirstName = myDisplayLc.split(/\s+/)[0] || "";
  const wholeWord = (haystack, needle) => {
    if (!needle || needle.length < 4) return false;
    return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack);
  };
  const matchesMe = (assignee) => {
    if (!assignee) return false;
    const a = assignee.toLowerCase().trim();
    if (a === myDisplayLc) return true;
    if (wholeWord(a, myDisplayLc)) return true;
    if (myFirstName.length >= 4 && (a === myFirstName || wholeWord(a, myFirstName))) return true;
    return staffMembers.some(s => s.name && s.name.toLowerCase() === a && (s.email || "").toLowerCase() === userEmail);
  };
  const myOrders = maintenance.filter(m => matchesMe(m.assignedTo) && MAINT_OPEN(m));
  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>My Dashboard</h1>
      <p style={s.sectionSub}>{staffName} — Maintenance Staff</p>
      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="My Open Orders" value={myOrders.length} accent={T.warn} mobile={mobile} onClick={onNavigateTo ? () => onNavigateTo("work-orders") : undefined} />
        <StatCard label="Unassigned" value={maintenance.filter(m => !m.assignedTo).length} accent={T.danger} mobile={mobile} onClick={onNavigateTo ? () => onNavigateTo("work-orders") : undefined} />
        <StatCard label="Completed (Month)" value={maintenance.filter(m => MAINT_DONE(m)).length} accent={T.success} mobile={mobile} onClick={onNavigateTo ? () => onNavigateTo("work-orders") : undefined} />
      </div>
      <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 24 }}>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Completion Rate</div>
          <div style={{ display: "flex", alignItems: "center", gap: mobile ? 16 : 24 }}>
            <ProgressRing value={maintenance.filter(m => MAINT_DONE(m)).length} max={maintenance.length} color={T.success} size={90} label="Complete" mobile={mobile} />
            <div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>{maintenance.filter(m => MAINT_DONE(m)).length} of {maintenance.length} completed</div>
              <div style={{ fontSize: 13, color: T.muted }}>{maintenance.filter(m => m.status === "in-progress").length} in progress</div>
              <div style={{ fontSize: 13, color: T.muted }}>{maintenance.filter(m => MAINT_AWAITING(m)).length} awaiting action</div>
            </div>
          </div>
        </div>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Open by Priority</div>
          <MiniBarChart bars={[
            { label: "Critical", value: maintenance.filter(m => m.priority === "critical" && MAINT_OPEN(m)).length, color: T.danger },
            { label: "Urgent", value: maintenance.filter(m => m.priority === "urgent" && MAINT_OPEN(m)).length, color: T.warn },
            { label: "Routine", value: maintenance.filter(m => m.priority === "routine" && MAINT_OPEN(m)).length, color: T.info },
          ]} mobile={mobile} />
        </div>
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>My Work Orders</div>
          <span style={{ fontSize: 11, color: T.muted }}>Matching: <strong>{staffName}</strong></span>
        </div>
        {myOrders.length === 0 ? (
          <EmptyState icon="🔧" text={`No open work orders assigned to ${staffName}. Open work orders assigned to other names won't show here — check the Work Orders page (All filter).`} />
        ) : myOrders.map(m => (
          <div key={m.id} onClick={() => onOpenWorkOrder && onOpenWorkOrder(m.id)} style={{ ...s.card, marginBottom: 10, padding: 14, cursor: onOpenWorkOrder ? "pointer" : "default", transition: "background 0.15s" }}
            onMouseEnter={e => { if (onOpenWorkOrder) e.currentTarget.style.background = T.surfaceHover; }}
            onMouseLeave={e => { if (onOpenWorkOrder) e.currentTarget.style.background = T.surface; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>{m.id} — {m.category}</span>
              <Badge status={m.priority} type="priority" />
            </div>
            <div style={{ color: T.muted, fontSize: 13 }}>Unit {m.unit} · {m.description}</div>
            {m.assignedTo && <div style={{ color: T.dim, fontSize: 12, marginTop: 4 }}>Assigned to: {m.assignedTo}</div>}
            {m.projectedComplete && <div style={{ color: T.dim, fontSize: 12, marginTop: 6 }}>Est. complete: {m.projectedComplete}</div>}
          </div>
        ))}
      </div>

      {/* Recent Messages — click to jump to Communications */}
      <div style={{ ...s.card, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Messages</div>
          {onOpenMessages && <button onClick={() => onOpenMessages()} style={{ ...s.btn("ghost"), fontSize: 12, padding: "2px 8px" }}>View all →</button>}
        </div>
        {threads.length === 0 ? (
          <EmptyState icon="💬" text="No messages yet." />
        ) : (
          <div>
            {[...threads].sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate)).slice(0, 5).map(t => {
              const resident = LIVE_RESIDENTS.find(r => t.participants.includes(r.id));
              const name = t.type === "broadcast" ? "Broadcast" : (resident?.name || "Unknown");
              return (
                <div key={t.id} onClick={() => onOpenMessages && onOpenMessages(t.id)} style={{
                  padding: "10px 12px", borderRadius: T.radiusSm, marginBottom: 6, cursor: onOpenMessages ? "pointer" : "default",
                  background: t.unread > 0 ? T.accentDim : "transparent", borderBottom: `1px solid ${T.borderLight}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontWeight: t.unread > 0 ? 700 : 600, fontSize: 13 }}>{name}</span>
                    <span style={{ fontSize: 11, color: T.dim }}>{new Date(t.lastDate).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.muted, marginBottom: 2 }}>{t.subject}</div>
                  <div style={{ fontSize: 12, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.lastMessage}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ActivityFeed items={notifications} mobile={mobile} />
    </div>
  );
};

// --- MAINTENANCE PAGE (Resident) ---
const ResidentMaintenance = ({ mobile, maintenance, onSubmit, onUpdate, rc }) => {
  const [replyDrafts, setReplyDrafts] = useState({}); // { [requestId]: text }
  const [replyFiles, setReplyFiles] = useState({}); // { [requestId]: File[] }
  const [replySubmitting, setReplySubmitting] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [success, showSuccess] = useSuccess();
  const [formData, setFormData] = useState({ category: "Plumbing", urgency: "routine", description: "", permission: "Yes, enter anytime" });
  const [photoFiles, setPhotoFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");
  const photoInputRef = useRef(null);
  const allMyRequests = maintenance.filter(m => m.unit === (rc?.unit || ""));
  const myRequests = (() => {
    if (statusFilter === "all") return allMyRequests;
    if (statusFilter === "done") return allMyRequests.filter(m => MAINT_DONE(m) || m.status === "rejected");
    // "active" — everything that's still open (new, needs-info, todo, in-progress, legacy submitted)
    return allMyRequests.filter(m => MAINT_OPEN(m));
  })();
  const counts = {
    active: allMyRequests.filter(m => MAINT_OPEN(m)).length,
    done: allMyRequests.filter(m => MAINT_DONE(m) || m.status === "rejected").length,
    all: allMyRequests.length,
  };

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    // Accept anything tagged as an image OR an iPhone HEIC/HEIF (some
    // browsers don't tag those with image/*)
    const imageFiles = files.filter(f => {
      const t = (f.type || "").toLowerCase();
      const n = (f.name || "").toLowerCase();
      return t.startsWith("image/") || t.includes("heic") || t.includes("heif") || n.endsWith(".heic") || n.endsWith(".heif");
    });
    setPhotoFiles(prev => [...prev, ...imageFiles].slice(0, 5));
  };

  const removePhoto = (idx) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!formData.description.trim()) return;
    setUploading(true);
    const uploadedPhotos = [];
    for (const original of photoFiles) {
      try {
        // Convert iPhone HEIC photos to JPEG so admin browsers can render them
        const file = await convertHeicIfNeeded(original);
        const photo = await uploadMaintenancePhoto(file, rc?.unit || 'unknown');
        if (photo?.url) uploadedPhotos.push({ url: photo.url, name: photo.name, path: photo.path });
      } catch (err) {
        console.warn(`Photo ${original.name} upload failed:`, err);
      }
    }
    const newReq = {
      id: `MR-${2406 + maintenance.length}`,
      unit: rc?.unit || "",
      propertyId: rc?.propertyId || "",
      category: formData.category,
      priority: formData.urgency,
      status: "new",
      source: "resident",
      description: formData.description.trim(),
      submitted: new Date().toISOString().slice(0, 10),
      assignedTo: null,
      queuePos: maintenance.filter(m => MAINT_OPEN(m)).length + 1,
      projectedComplete: null,
      notes: [],
      photos: uploadedPhotos,
    };
    onSubmit(newReq);
    setFormData({ category: "Plumbing", urgency: "routine", description: "", permission: "Yes, enter anytime" });
    setPhotoFiles([]);
    setShowForm(false);
    setUploading(false);
    showSuccess("Request submitted! You'll receive updates as it progresses.");
  };

  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22, marginBottom: 4 }}>Maintenance Requests</h1>
      <p style={s.sectionSub}>Submit and track maintenance issues for your unit</p>
      {!showForm && (
        <button onClick={() => setShowForm(true)} style={{
          width: "100%", padding: mobile ? "16px" : "18px 22px", marginBottom: 16,
          background: T.accent, color: "#fff", border: "none", borderRadius: T.radius,
          fontSize: mobile ? 15 : 16, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>＋</span>
          <span>Submit a New Maintenance Request</span>
        </button>
      )}
      {showForm && (
        <button onClick={() => setShowForm(false)} style={{ ...s.btn("ghost"), marginBottom: 12 }}>Cancel</button>
      )}
      <div style={{ marginBottom: 12 }}>
        <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setShowQr(!showQr)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/></svg>
          {showQr ? "Hide QR Code" : "Share QR Code"}
        </button>
      </div>
      {showQr && rc?.unit && (
        <div style={{ ...s.card, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{rc.property || ""} — Unit {rc.unit}</div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>Anyone can scan this to submit a maintenance request for your unit</div>
          <QRCodeCanvas
            id="resident-qr"
            value={window.location.origin + window.location.pathname + "?maintenance=" + encodeURIComponent(rc.unit)}
            size={180}
            level="M"
            includeMargin
          />
          <div style={{ marginTop: 10 }}>
            <button style={{ ...s.btn("ghost"), fontSize: 12 }} onClick={() => {
              const canvas = document.getElementById("resident-qr");
              if (canvas) { const a = document.createElement("a"); a.download = `QR-Unit-${rc.unit}.png`; a.href = canvas.toDataURL(); a.click(); }
            }}>Download PNG</button>
          </div>
        </div>
      )}
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
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Photos (optional, max 5)</label>
            <input ref={photoInputRef} type="file" accept="image/*,.heic,.heif" multiple style={{ display: "none" }} onChange={handlePhotoSelect} />
            <div onClick={() => photoInputRef.current?.click()} onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); handlePhotoSelect({ target: { files: e.dataTransfer.files } }); }} style={{ border: `2px dashed ${T.border}`, borderRadius: T.radiusSm, padding: 24, textAlign: "center", color: T.dim, cursor: "pointer" }}>
              {photoFiles.length === 0 ? "Click or drag to upload photos" : `${photoFiles.length} photo${photoFiles.length > 1 ? "s" : ""} selected — click to add more`}
            </div>
            {photoFiles.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {photoFiles.map((f, i) => (
                  <div key={i} style={{ position: "relative", width: 64, height: 64, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
                    <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => removePhoto(i)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, cursor: "pointer", lineHeight: "16px", textAlign: "center", padding: 0 }}>x</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button style={s.btn()} onClick={handleSubmit} disabled={uploading}>{uploading ? "Uploading..." : "Submit Request"}</button>
        </div>
      )}
      {allMyRequests.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[["active", `Active (${counts.active})`], ["done", `Done (${counts.done})`], ["all", `All (${counts.all})`]].map(([k, label]) => {
            const active = statusFilter === k;
            return (
              <button key={k} onClick={() => setStatusFilter(k)} style={{
                padding: "6px 14px", fontSize: 13, fontWeight: 600, borderRadius: T.radiusSm, cursor: "pointer",
                background: active ? T.accent : T.bg, color: active ? "#fff" : T.text, border: `1px solid ${active ? T.accent : T.border}`,
              }}>{label}</button>
            );
          })}
        </div>
      )}
      {allMyRequests.length > 0 && myRequests.length === 0 && (
        <EmptyState icon="✅" text={statusFilter === "done" ? "No completed requests yet." : "No active requests right now."} />
      )}
      {myRequests.map(m => (
        <div key={m.id} style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 4 }}>{m.description}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{m.category}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}><Badge status={m.priority} type="priority" /><Badge status={m.status} /></div>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 13, color: T.muted, flexWrap: "wrap" }}>
            <span>Submitted: {m.submitted}</span>
            {m.assignedTo && <span>Assigned: {m.assignedTo}</span>}
            {m.queuePos && MAINT_OPEN(m) && <span style={{ color: T.accent }}>Queue position: #{m.queuePos}</span>}
            {m.projectedComplete && <span>Est. complete: {m.projectedComplete}</span>}
            <span style={{ color: T.dim, fontSize: 11, marginLeft: "auto" }}>#{m.id}</span>
          </div>
          {(Array.isArray(m.notes) ? m.notes : []).length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: T.bg, borderRadius: T.radiusSm }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Updates</div>
              {(Array.isArray(m.notes) ? m.notes : []).map((n, i) => <div key={i} style={{ fontSize: 13, color: T.text, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{n.by}</span> <span style={{ color: T.dim }}>({n.date})</span>: {n.text}</div>)}
            </div>
          )}
          {m.status === "needs-info" && onUpdate && (() => {
            const notes = Array.isArray(m.notes) ? m.notes : [];
            const lastInfoReq = [...notes].reverse().find(n => /^Needs info:/i.test(n.text || ""));
            const submitting = !!replySubmitting[m.id];
            const draft = replyDrafts[m.id] || "";
            const files = replyFiles[m.id] || [];
            return (
              <div style={{ marginTop: 12, padding: 14, background: T.warnDim, borderLeft: `3px solid ${T.warn}`, borderRadius: T.radiusSm }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: T.warn, marginBottom: 6 }}>Management is asking for more info</div>
                {lastInfoReq && (
                  <div style={{ fontSize: 13, color: T.text, marginBottom: 10, fontStyle: "italic" }}>
                    "{lastInfoReq.text.replace(/^Needs info:\s*/i, "")}"
                  </div>
                )}
                <textarea
                  style={{ ...s.input, width: "100%", minHeight: 80, resize: "vertical", marginBottom: 10 }}
                  placeholder="Type your response…"
                  value={draft}
                  onChange={e => setReplyDrafts(prev => ({ ...prev, [m.id]: e.target.value }))}
                />
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: "block", marginBottom: 4 }}>📎 Add photos or files (optional)</label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.heic,.heif,.pdf"
                    style={{ fontSize: 13 }}
                    onChange={e => setReplyFiles(prev => ({ ...prev, [m.id]: Array.from(e.target.files || []) }))}
                  />
                  {files.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: T.muted }}>
                      {files.map((f, i) => <div key={i}>📎 {f.name} ({(f.size / 1024).toFixed(1)} KB)</div>)}
                    </div>
                  )}
                </div>
                <button
                  disabled={submitting || (!draft.trim() && files.length === 0)}
                  style={s.btn("primary")}
                  onClick={async () => {
                    const text = (draft || "").trim();
                    if (!text && files.length === 0) return;
                    setReplySubmitting(prev => ({ ...prev, [m.id]: true }));
                    try {
                      // Upload any attached files (HEIC → JPEG client-side, then to maintenance-photos bucket)
                      const newPhotos = [];
                      for (const original of files) {
                        try {
                          const file = await convertHeicIfNeeded(original);
                          const photo = await uploadMaintenancePhoto(file, m.unit || "unknown");
                          if (photo?.url) newPhotos.push({ url: photo.url, name: photo.name, path: photo.path });
                        } catch (err) { console.warn(`Reply attachment ${original.name} failed:`, err); }
                      }
                      const existingPhotos = Array.isArray(m.photos) ? m.photos : [];
                      const noteText = text || (newPhotos.length === 1 ? "Attached a photo." : `Attached ${newPhotos.length} files.`);
                      const newNotes = [...notes, { by: rc?.name || "Resident", date: new Date().toISOString().slice(0, 10), text: noteText }];
                      const changes = { status: "new", notes: newNotes };
                      if (newPhotos.length > 0) changes.photos = [...existingPhotos, ...newPhotos];
                      await onUpdate(m.id, changes);
                      showSuccess(`Response sent${newPhotos.length > 0 ? ` with ${newPhotos.length} attachment${newPhotos.length > 1 ? "s" : ""}` : ""}.`);
                      setReplyDrafts(prev => { const next = { ...prev }; delete next[m.id]; return next; });
                      setReplyFiles(prev => { const next = { ...prev }; delete next[m.id]; return next; });
                    } catch (err) { showSuccess("Error: " + err.message); }
                    setReplySubmitting(prev => { const next = { ...prev }; delete next[m.id]; return next; });
                  }}
                >{submitting ? "Sending…" : "Send Response"}</button>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
};

// --- WORK ORDERS (Maintenance Staff) ---
const WorkOrders = ({ mobile, maintenance, onUpdate, onAdd, profile, vendors = [], staffMembers = [], pendingOpenId, onClearPendingOpen }) => {
  const staffName = profile?.displayName || profile?.email?.split("@")[0] || "Staff";
  const maintStaff = staffMembers.filter(s => s.active && (s.role === "maintenance" || s.role === "admin" || s.role === "property_manager")).filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i);
  // The signed-in user might appear in the assignee field under multiple names:
  // their profile displayName, or any staff_members rows that share their email
  // (e.g., "Jeff Clapp" the user vs. "jeff clapp maint" the staff record).
  // Match case-insensitively, and also accept staff names that contain the
  // user's display name (so "jeff clapp maint" matches "Jeff Clapp").
  const userEmail = (profile?.email || "").toLowerCase();
  const myDisplayLc = staffName.toLowerCase().trim();
  const myFirstName = myDisplayLc.split(/\s+/)[0] || "";
  // Substring/word matches require >= 4 chars so short names like "Al"
  // don't catch every assignee whose name contains those letters.
  const wholeWord = (haystack, needle) => {
    if (!needle || needle.length < 4) return false;
    return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack);
  };
  const matchesMe = (assignee) => {
    if (!assignee) return false;
    const a = assignee.toLowerCase().trim();
    if (a === myDisplayLc) return true;
    if (wholeWord(a, myDisplayLc)) return true;
    if (myFirstName.length >= 4 && (a === myFirstName || wholeWord(a, myFirstName))) return true;
    return staffMembers.some(s => s.name && s.name.toLowerCase() === a && (s.email || "").toLowerCase() === userEmail);
  };
  const [topTab, setTopTab] = useState("workorders");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [success, showSuccess] = useSuccess();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ unit: "", category: "Plumbing", priority: "routine", description: "", requesterName: "", assignedTo: staffName, vendorId: "" });

  useEffect(() => {
    if (!selected) return;
    const updated = maintenance.find(m => m.id === selected.id);
    if (updated && updated !== selected) setSelected(updated);
  }, [maintenance, selected]);

  // Auto-open a work order when navigated here from the dashboard
  useEffect(() => {
    if (!pendingOpenId) return;
    const row = maintenance.find(m => m.id === pendingOpenId);
    if (row) {
      setSelected(row);
      if (row.status === "done" || row.status === "rejected" || row.status === "completed") setTopTab("archive");
      else setTopTab("workorders");
    }
    if (onClearPendingOpen) onClearPendingOpen();
  }, [pendingOpenId, maintenance]);

  const todoRows = maintenance.filter(m => m.status === "todo" || m.status === "in-progress");
  const archiveRows = maintenance.filter(m => m.status === "done" || m.status === "rejected" || m.status === "completed");
  const applyAssignee = (rows) => assigneeFilter === "mine" ? rows.filter(r => matchesMe(r.assignedTo)) : rows;

  const issueCol = {
    key: "description", label: "Issue",
    render: (v, row) => (
      <div>
        <div style={{ fontWeight: 600, color: T.accent }}>{v}</div>
        <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{row.id}</div>
      </div>
    ),
    sortValue: row => (row.description || "").toLowerCase(),
  };

  const propertyOptions = [...new Set(maintenance.map(m => propertyDisplayName(m.propertyId)))];
  const workOrderCols = [
    issueCol,
    { key: "residentName", label: "Requester", render: (v, row) => v || row.requesterName || "—" },
    { key: "propertyId", label: "Property", render: v => propertyDisplayName(v), filterOptions: propertyOptions, filterValue: row => propertyDisplayName(row.propertyId) },
    { key: "unit", label: "Unit" },
    { key: "category", label: "Category", filterOptions: [...new Set(maintenance.map(m => m.category))] },
    { key: "priority", label: "Priority", render: v => <Badge status={v} type="priority" />, filterOptions: ["critical", "urgent", "routine"], filterValue: row => row.priority },
    { key: "status", label: "Status", render: v => <Badge status={v} />, filterOptions: ["todo", "in-progress"], filterValue: row => row.status },
    { key: "assignedTo", label: "Assigned To", render: v => v || <span style={{ color: T.dim }}>Unassigned</span> },
    { key: "vendorId", label: "Vendor", render: v => vendors.find(x => x.id === v)?.company || "—", filterOptions: [...new Set(vendors.map(v => v.company))], filterValue: row => vendors.find(x => x.id === row.vendorId)?.company || "" },
    { key: "projectedComplete", label: "Projected", render: v => v || "—" },
  ];
  const archiveCols = [
    issueCol,
    { key: "residentName", label: "Requester", render: (v, row) => v || row.requesterName || "—" },
    { key: "propertyId", label: "Property", render: v => propertyDisplayName(v), filterOptions: propertyOptions, filterValue: row => propertyDisplayName(row.propertyId) },
    { key: "unit", label: "Unit" },
    { key: "category", label: "Category", filterOptions: [...new Set(archiveRows.map(m => m.category))] },
    { key: "status", label: "Status", render: v => <Badge status={v} />, filterOptions: ["done", "rejected", "completed"], filterValue: row => row.status },
    { key: "assignedTo", label: "Worked By", render: v => v || <span style={{ color: T.dim }}>—</span> },
    { key: "completedDate", label: "Closed", render: (v, row) => v || row.convertedAt?.slice(0, 10) || "—" },
  ];

  const currentRows = topTab === "archive" ? applyAssignee(archiveRows) : applyAssignee(todoRows);
  const currentCols = topTab === "archive" ? archiveCols : workOrderCols;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div><h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Work Orders</h1><p style={s.sectionSub}>Manage and update assigned maintenance requests</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          {onAdd && <button onClick={() => setShowCreate(v => !v)} style={{ ...s.btn(showCreate ? "ghost" : "primary"), fontSize: 15, padding: "10px 18px", fontWeight: 600 }}>{showCreate ? "Cancel" : "➕ New Request"}</button>}
          <ExportButton mobile={mobile} onClick={() => generateCSV([
            { label: "Issue", key: "description" }, { label: "Requester", key: "residentName", exportValue: r => r.residentName || r.requesterName || "" },
            { label: "Property", key: "propertyId", exportValue: r => propertyDisplayName(r.propertyId) }, { label: "Unit", key: "unit" },
            { label: "Category", key: "category" }, { label: "Status", key: "status" },
            { label: "Vendor", key: "vendorId", exportValue: r => vendors.find(v => v.id === r.vendorId)?.company || "" },
            { label: "Projected", key: "projectedComplete" }, { label: "Closed", key: "completedDate" }, { label: "ID", key: "id" },
          ], currentRows, topTab === "archive" ? "work_orders_archive" : "work_orders")} />
        </div>
      </div>
      <SuccessMessage message={success} />

      {showCreate && onAdd && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.warn}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Create Maintenance Request</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>Unit *</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.unit} onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))}>
                <option value="">Select unit...</option>
                {LIVE_RESIDENTS.map(r => <option key={r.id} value={r.unit}>{r.unit} — {r.name}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Requester (optional)</label>
              <input style={{ ...s.mInput(mobile), width: "100%" }} value={createForm.requesterName} onChange={e => setCreateForm(f => ({ ...f, requesterName: e.target.value }))} placeholder="Who reported this?" />
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
            <div><label style={s.label}>Assign To</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.assignedTo} onChange={e => setCreateForm(f => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">Unassigned</option>
                {maintStaff.map(m => <option key={m.id} value={m.name}>{m.name}{m.role === "property_manager" ? " (PM)" : m.role === "admin" ? " (Admin)" : ""}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Vendor</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.vendorId} onChange={e => setCreateForm(f => ({ ...f, vendorId: e.target.value }))}>
                <option value="">—</option>
                {vendors.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.company} ({v.trade})</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={s.label}>Description *</label><textarea style={{ ...s.mInput(mobile), width: "100%", minHeight: 60, resize: "vertical" }} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue..." /></div>
          <button disabled={!createForm.unit || !createForm.description.trim()} onClick={() => {
            const res = LIVE_RESIDENTS.find(r => r.unit === createForm.unit);
            const req = {
              propertyId: res?.propertyId || "",
              unit: createForm.unit,
              category: createForm.category,
              priority: createForm.priority,
              description: createForm.description.trim(),
              source: "staff",
              status: "todo",
              requesterName: createForm.requesterName.trim() || null,
              assignedTo: createForm.assignedTo || null,
              vendorId: createForm.vendorId || null,
              notes: [],
            };
            onAdd(req);
            showSuccess(`Work order created for unit ${createForm.unit}`);
            setCreateForm({ unit: "", category: "Plumbing", priority: "routine", description: "", requesterName: "", assignedTo: staffName, vendorId: "" });
            setShowCreate(false);
          }} style={{ ...s.mBtn("primary", mobile) }}>Create Work Order</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: `1px solid ${T.border}` }}>
        {[
          ["workorders", `🔧 Work Orders (${applyAssignee(todoRows).length})`],
          ["archive", `📦 Archive (${applyAssignee(archiveRows).length})`],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTopTab(k)} style={{ background: "transparent", border: "none", padding: "10px 14px", fontWeight: 600, cursor: "pointer", fontSize: 14, borderBottom: topTab === k ? `2px solid ${T.accent}` : "2px solid transparent", color: topTab === k ? T.accent : T.text }}>{label}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "flex-end", alignItems: "center" }}>
        {assigneeFilter === "mine" && (
          <span style={{ fontSize: 11, color: T.muted, marginRight: 8 }}>
            Matching: <strong>{staffName}</strong>
          </span>
        )}
        <button style={s.btn(assigneeFilter === "mine" ? "primary" : "ghost")} onClick={() => setAssigneeFilter("mine")}>My Orders</button>
        <button style={s.btn(assigneeFilter === "all" ? "primary" : "ghost")} onClick={() => setAssigneeFilter("all")}>All</button>
      </div>

      <div style={s.card}>
        <SortableTable mobile={mobile} columns={currentCols} data={currentRows} onRowClick={setSelected} />
      </div>

      {selected && (
        <MaintenanceDetailModal
          row={selected}
          onClose={() => setSelected(null)}
          onUpdate={(id, changes) => { onUpdate(id, changes); showSuccess("Updated"); }}
          staffMembers={maintStaff}
          vendors={vendors}
          isStaff={true}
          currentUserName={staffName}
          mobile={mobile}
        />
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
      <p style={s.sectionSub}>View your balance and make payments</p>
      <SuccessMessage message={success} />

      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Current Balance" value={balance > 0 ? `$${balance.toLocaleString()}` : "$0.00"} accent={balance > 0 ? T.danger : T.success} mobile={mobile} />
        <StatCard label="Monthly Rent" value={`$${(_ext.rentAmount || 0).toLocaleString()}`} accent={T.accent} mobile={mobile} />
        <StatCard label="Your Portion" value={`$${(_ext.tenantPortion || 0).toLocaleString()}`} accent={T.accent} mobile={mobile} />
        <StatCard label="HAP Payment" value={`$${(_ext.hapPayment || 0).toLocaleString()}`} accent={T.info} mobile={mobile} />
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
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editMemberForm, setEditMemberForm] = useState({ name: "", relationship: "", dob: "", ssn4: "", ftStudent: false });
  const [showNewMember, setShowNewMember] = useState(false);
  const [newResidentId, setNewResidentId] = useState("");
  // Defaults: deadline 30 days out
  const [newDeadline, setNewDeadline] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); });
  const [newNotify, setNewNotify] = useState(true);

  // All possible steps (0–5). Residents skip Eligibility (3) and Rent & Program (4) —
  // admins handle those when they review/approve. The submit on step 5 still
  // computes eligibility automatically from the math.
  const ALL_STEP_LABELS = ["Household", "Income", "Assets", "Eligibility", "Rent & Program", "Review & Sign"];
  const visibleStepIndices = isAdmin ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 5];
  const stepLabels = visibleStepIndices.map(i => ALL_STEP_LABELS[i]);
  // helpers to move forward/back through only the visible steps
  const goNext = () => {
    const pos = visibleStepIndices.indexOf(step);
    const next = visibleStepIndices[pos + 1];
    if (next !== undefined) setStep(next);
  };
  const goPrev = () => {
    const pos = visibleStepIndices.indexOf(step);
    const prev = visibleStepIndices[pos - 1];
    if (prev !== undefined) setStep(prev);
  };
  const isLastVisibleStep = step === visibleStepIndices[visibleStepIndices.length - 1];
  const lastBeforeReview = visibleStepIndices[visibleStepIndices.length - 2]; // used to label "Next"

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchIncomeCertifications(), fetchAMIReference(2026, "Marin"), fetchRentLimits(2026, "Marin")])
      .then(([c, ami, rents]) => { setCerts(c || []); if (ami && Object.keys(ami).length) setAmiLookup(ami); setRentLimits(rents || {}); })
      .catch((err) => { console.error('Failed to load certification data:', err); })
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
      const cert = await insertIncomeCertification({ residentId: res._uuid, certType: "annual", effectiveDate: new Date().toISOString().slice(0, 10), deadline: newDeadline || null });
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
      setActiveCert({ ...cert, id: cert.id, residentName: res.name, unit: res.unit, status: "draft", deadline: newDeadline || null });
      setStep(0);
      // Notify resident with the deadline
      let notified = "";
      if (newNotify) {
        const firstName = res.name?.split(" ")[0] || "there";
        const dl = newDeadline ? new Date(newDeadline + "T00:00:00").toLocaleDateString() : "soon";
        try {
          if (res.email) {
            await sendNotification("custom", {
              to: res.email,
              subject: "Action Required: Annual Income Certification",
              body: `<p>Hi ${firstName},</p><p>It's time to complete your annual income certification with BCLT. The deadline to submit is <strong>${dl}</strong>.</p><p>Please log in to your BCLT HomeBase portal to fill out the form and upload your documents:</p><p><a href="https://bclt-resident-portal.vercel.app">https://bclt-resident-portal.vercel.app</a></p><p>If you have any questions, reply to this email or contact BCLT management.</p>`,
            });
            notified += "📧 ";
          }
          if (res.phone) {
            await sendSMS(res.phone, `BCLT: Your annual income certification is due ${dl}. Log in to BCLT HomeBase to complete it: https://bclt-resident-portal.vercel.app`);
            notified += "💬 ";
          }
          await updateIncomeCertification(cert.id, { lastNotifiedAt: new Date().toISOString() });
        } catch (err) { console.warn("Cert notification failed:", err); }
      }
      showSuccess(`Certification started for ${res.name}${notified ? ` — resident notified ${notified.trim()}` : ""}`);
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

        {/* Step indicator — only shows the steps relevant to the current role */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {stepLabels.map((lbl, i) => {
            const stepIdx = visibleStepIndices[i];
            const currentPos = visibleStepIndices.indexOf(step);
            const isCurrent = stepIdx === step;
            const isDone = i < currentPos;
            return (
              <button key={stepIdx} onClick={() => setStep(stepIdx)} style={{
                flex: 1, minWidth: mobile ? 80 : 100, padding: "8px 4px", border: `1px solid ${isCurrent ? T.accent : T.border}`,
                borderRadius: T.radiusSm, background: isCurrent ? T.accentDim : isDone ? T.successDim : T.bg,
                color: isCurrent ? T.accent : isDone ? T.success : T.muted, fontWeight: isCurrent ? 700 : 500,
                fontSize: 11, cursor: "pointer", textAlign: "center",
              }}>{isDone ? "✓ " : ""}{lbl}</button>
            );
          })}
        </div>
        <SuccessMessage message={success} />

        {/* STEP 0: HOUSEHOLD */}
        {step === 0 && (
          <div>
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Household Members ({hhMembers.length})</div>
                <button onClick={() => setShowNewMember(v => !v)} style={{ ...s.btn(showNewMember ? "ghost" : "primary"), padding: "10px 18px", fontSize: 14 }}>{showNewMember ? "Cancel" : "➕ Add Member"}</button>
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
                <tbody>{hhMembers.map((m, i) => {
                  const isEditing = editingMemberId === m.id;
                  if (isEditing) {
                    return (
                      <tr key={m.id}>
                        <td style={s.td}>{i + 1}</td>
                        <td style={s.td}><input style={{ ...s.input, padding: "4px 8px", fontSize: 13 }} value={editMemberForm.name} onChange={e => setEditMemberForm(f => ({ ...f, name: e.target.value }))} /></td>
                        <td style={s.td}>
                          <select style={{ ...s.select, padding: "4px 6px", fontSize: 13 }} value={editMemberForm.relationship} onChange={e => setEditMemberForm(f => ({ ...f, relationship: e.target.value }))}>
                            <option>Head of Household</option><option>Spouse</option><option>Co-Head</option><option>Child</option><option>Other Adult</option><option>Foster Child</option><option>Live-in Aide</option>
                          </select>
                        </td>
                        <td style={s.td}><input type="date" style={{ ...s.input, padding: "4px 6px", fontSize: 12 }} value={editMemberForm.dob || ""} onChange={e => setEditMemberForm(f => ({ ...f, dob: e.target.value }))} /></td>
                        <td style={s.td}><input maxLength={4} placeholder="0000" style={{ ...s.input, padding: "4px 6px", fontSize: 13, width: 60 }} value={editMemberForm.ssn4 || ""} onChange={e => setEditMemberForm(f => ({ ...f, ssn4: e.target.value.replace(/\D/g, "").slice(0, 4) }))} /></td>
                        <td style={s.td}>
                          <select style={{ ...s.select, padding: "4px 6px", fontSize: 13 }} value={editMemberForm.ftStudent ? "yes" : "no"} onChange={e => setEditMemberForm(f => ({ ...f, ftStudent: e.target.value === "yes" }))}>
                            <option value="no">No</option><option value="yes">Yes</option>
                          </select>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button style={{ ...s.btn("primary"), fontSize: 12, padding: "4px 10px" }} onClick={async () => {
                              try {
                                await updateTICMember(m.id, editMemberForm);
                                setHhMembers(prev => prev.map(x => x.id === m.id ? { ...x, ...editMemberForm } : x));
                                setEditingMemberId(null);
                                showSuccess("Saved");
                              } catch (err) { showSuccess("Error: " + err.message); }
                            }}>Save</button>
                            <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 8px" }} onClick={() => setEditingMemberId(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={m.id || i}>
                      <td style={s.td}>{i + 1}</td>
                      <td style={s.td}><span style={{ fontWeight: 600 }}>{m.name}</span></td>
                      <td style={s.td}>{m.relationship}</td>
                      <td style={s.td}>{m.dob || "—"}</td>
                      <td style={s.td}>{m.ssn4 ? `***-**-${m.ssn4}` : "—"}</td>
                      <td style={s.td}>{m.ftStudent ? "FT" : "N/A"}</td>
                      <td style={s.td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => { setEditingMemberId(m.id); setEditMemberForm({ name: m.name || "", relationship: m.relationship || "Head of Household", dob: m.dob || "", ssn4: m.ssn4 || "", ftStudent: !!m.ftStudent }); }}>Edit</button>
                          {i > 0 && <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 12, padding: "4px 10px" }} onClick={async () => { if (!confirm(`Remove ${m.name}?`)) return; try { await deleteTICMember(m.id); setHhMembers(prev => prev.filter(x => x.id !== m.id)); } catch {} }}>Remove</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
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
            <div style={{ padding: 14, background: T.infoDim, borderLeft: `3px solid ${T.info}`, borderRadius: T.radiusSm, marginBottom: 14, fontSize: 13, color: T.text }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>📎 Attach documentation for every income source</div>
              <div style={{ color: T.muted }}>For each income entry, click <strong>"Attach Doc"</strong> to upload supporting documentation: pay stubs, Social Security award letters, public-assistance notices, employer verification — whatever you have. PDF, JPG, or PNG. You can attach more than one entry per category.</div>
            </div>
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
                          }} style={{ ...s.btn("primary"), fontSize: 13, padding: "6px 14px" }}>＋ Add</button>
                        </div>
                        {catEntries.map(entry => (
                          <div key={entry.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                            <input placeholder="Source" value={entry.source || ""} onChange={e => { setIncomeEntries(prev => prev.map(x => x.id === entry.id ? { ...x, source: e.target.value } : x)); }} onBlur={() => updateTICIncome(entry.id, { source: entry.source }).catch((err) => { showSuccess('Error saving: ' + err.message); })} style={{ ...s.input, flex: 2, fontSize: 12, padding: "4px 8px" }} />
                            <input type="number" placeholder="$/yr" value={entry.amount || ""} onChange={e => { setIncomeEntries(prev => prev.map(x => x.id === entry.id ? { ...x, amount: parseFloat(e.target.value) || 0 } : x)); }} onBlur={() => updateTICIncome(entry.id, { amount: entry.amount }).catch((err) => { showSuccess('Error saving: ' + err.message); })} style={{ ...s.input, flex: 1, fontSize: 12, padding: "4px 8px" }} />
                            <label title={entry.docPath ? "Replace attached document" : "Attach supporting document"} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: T.radiusSm, cursor: "pointer", fontSize: 13, fontWeight: 600, background: entry.docPath ? T.successDim : T.accentDim, color: entry.docPath ? T.success : T.accent, border: `1px solid ${entry.docPath ? T.success : T.accent}`, whiteSpace: "nowrap" }}>
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" style={{ display: "none" }} onChange={async (ev) => {
                                const original = ev.target.files?.[0]; if (!original) return;
                                try {
                                  const file = await convertHeicIfNeeded(original);
                                  const path = await uploadTICDocument(file, activeCert.id);
                                  await updateTICIncome(entry.id, { docPath: path });
                                  setIncomeEntries(prev => prev.map(x => x.id === entry.id ? { ...x, docPath: path, verified: true } : x));
                                  showSuccess("Document attached");
                                } catch (err) { showSuccess("Upload failed: " + (err.message || "")); }
                              }} />
                              📎 {entry.docPath ? "Attached ✓" : "Attach Doc"}
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
            <div style={{ padding: 14, background: T.infoDim, borderLeft: `3px solid ${T.info}`, borderRadius: T.radiusSm, marginBottom: 14, fontSize: 13, lineHeight: 1.55, color: T.text }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>💰 What counts as an asset?</div>
              <div style={{ color: T.muted, marginBottom: 8 }}>This is where you report what you own — not just income. Please add anything that applies to your household:</div>
              <ul style={{ margin: "0 0 8px 18px", padding: 0, color: T.text }}>
                <li><strong>Cash accounts</strong> — checking, savings, money-market, CDs</li>
                <li><strong>Investment accounts</strong> — brokerage, mutual funds, individual stocks/bonds</li>
                <li><strong>Retirement accounts</strong> — 401(k), IRA, Roth IRA, pension cash value</li>
                <li><strong>Real estate</strong> you own (other than your primary home)</li>
                <li><strong>Life insurance</strong> with a cash value</li>
                <li><strong>Trust funds</strong> or other holdings you can access</li>
              </ul>
              <div style={{ color: T.muted, fontStyle: "italic" }}>If you don't have any of these, just leave the section empty and click Next. Attach a recent statement for each asset you list.</div>
            </div>
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
                    }} style={{ ...s.btn("primary"), fontSize: 13, padding: "6px 14px" }}>＋ Add Asset</button>
                  </div>
                  {memberAssets.length === 0 ? <div style={{ fontSize: 12, color: T.dim }}>No assets reported</div> : memberAssets.map(a => (
                    <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <select value={a.assetType} onChange={e => { setAssetEntries(prev => prev.map(x => x.id === a.id ? { ...x, assetType: e.target.value } : x)); updateTICAsset(a.id, { assetType: e.target.value }).catch((err) => { showSuccess('Error saving: ' + err.message); }); }} style={{ ...s.select, flex: 1, fontSize: 12, padding: "4px 6px" }}>
                        <option value="savings">Savings</option><option value="checking">Checking</option><option value="cd">CD</option><option value="stocks">Stocks/Bonds</option><option value="real_estate">Real Estate</option><option value="retirement">Retirement</option><option value="life_insurance">Life Insurance</option><option value="other">Other</option>
                      </select>
                      <input type="number" placeholder="Cash Value" value={a.cashValue || ""} onChange={e => setAssetEntries(prev => prev.map(x => x.id === a.id ? { ...x, cashValue: parseFloat(e.target.value) || 0 } : x))} onBlur={() => updateTICAsset(a.id, { cashValue: a.cashValue }).catch((err) => { showSuccess('Error saving: ' + err.message); })} style={{ ...s.input, flex: 1, fontSize: 12, padding: "4px 8px" }} />
                      <input type="number" placeholder="Annual Income" value={a.annualIncome || ""} onChange={e => setAssetEntries(prev => prev.map(x => x.id === a.id ? { ...x, annualIncome: parseFloat(e.target.value) || 0 } : x))} onBlur={() => updateTICAsset(a.id, { annualIncome: a.annualIncome }).catch((err) => { showSuccess('Error saving: ' + err.message); })} style={{ ...s.input, flex: 1, fontSize: 12, padding: "4px 8px" }} />
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
              <button onClick={() => { saveCertTotals(); goNext(); }} style={s.mBtn("primary", mobile)}>
                {isAdmin ? "Next: Eligibility →" : "Next: Review & Sign →"}
              </button>
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
          // Look up the resident's unit AMI set-aside so admin sees what tier
          // this unit is restricted to (separate from the calculated eligibility tier)
          const residentRec = LIVE_RESIDENTS.find(r => r._uuid === activeCert.residentId);
          const unitAmi = residentRec?.unitAmiSetAside || null;
          const pullFromLease = async () => {
            if (!activeCert.residentId) return;
            try {
              const lease = await fetchResidentLease(activeCert.residentId);
              if (!lease) { showSuccess("No active lease on file for this resident."); return; }
              const tp = Number(lease.tenant_portion || 0);
              const hap = Number(lease.hap_payment || 0);
              const rentAmt = Number(lease.rent_amount || 0);
              // Tenant Rent comes from tenant_portion if set, otherwise total rent
              const newTenantRent = tp > 0 ? tp : rentAmt;
              setActiveCert(c => ({ ...c, tenantRent: newTenantRent, hapPayment: hap }));
              showSuccess(`Pulled from lease — tenant rent $${newTenantRent.toLocaleString()}${hap ? `, HAP $${hap.toLocaleString()}` : ""}`);
            } catch (err) { showSuccess("Couldn't pull lease: " + err.message); }
          };
          return (
          <div>
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Rent Details</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {unitAmi && (
                    <span style={s.badge(T.accentDim, T.accent)} title="AMI set-aside for this unit (from the Unit record)">Unit: {unitAmi} AMI</span>
                  )}
                  {isAdmin && (
                    <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "6px 12px" }} onClick={pullFromLease}>📥 Pull from active lease</button>
                  )}
                </div>
              </div>
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
                <div><label style={s.label}>Primary Program</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={activeCert.programType || ""} onChange={e => setActiveCert(c => ({ ...c, programType: e.target.value || null }))}><option value="">Select program…</option><option>9% LIHTC</option><option>4% LIHTC</option><option>Tax-Exempt Bond</option><option>HOME</option><option>Section 8</option><option>Section 811</option><option>Section 202</option><option>Market</option><option>Other</option></select></div>
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
              {isAdmin && <DetailRow label="AMI Category" value={eligibility.category} accent={eligibility.eligible ? T.success : T.danger} />}
              {isAdmin && <DetailRow label="Income Eligible" value={eligibility.eligible ? "Yes" : "No"} accent={eligibility.eligible ? T.success : T.danger} />}
              {isAdmin && <DetailRow label="Program" value={activeCert.programType || "—"} />}
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
              <button onClick={goPrev} style={s.btn("ghost")}>← {isAdmin ? "Rent & Program" : "Assets"}</button>
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
                      hapPayment: activeCert.hapPayment || 0, programType: activeCert.programType || null,
                      allStudentHousehold: activeCert.allStudentHousehold || false,
                      residentSignature: activeCert.residentSignature, residentSignedAt: activeCert.residentSignature ? new Date().toISOString() : null,
                      adminSignature: activeCert.adminSignature, adminSignedAt: activeCert.adminSignature ? new Date().toISOString() : null,
                      adminSignerName: activeCert.adminSignerName,
                    });
                    showSuccess(isAdmin ? "Certification approved!" : "Submitted for review!");
                    // Notify admin when resident submits + send resident a confirmation
                    if (!isAdmin) {
                      if (pushNotif) {
                        pushNotif({
                          id: `N-${Date.now()}`,
                          type: "recert",
                          icon: "📋",
                          message: `Income certification submitted by ${activeCert.residentName} (${activeCert.unit}) — $${incomeForDetermination.toLocaleString()}/yr. Review required.`,
                          timestamp: new Date().toISOString(),
                          roles: ["admin"],
                        });
                      }
                      // Email the shared portal mailbox so admins see it in Gmail too
                      sendNotification("custom", {
                        to: "residentportal@bolinaslandtrust.org",
                        subject: `Income Certification Submitted — ${activeCert.residentName} (${activeCert.unit})`,
                        body: `${activeCert.residentName} in Unit ${activeCert.unit} has submitted their income certification for review.\n\nTotal Annual Household Income: $${incomeForDetermination.toLocaleString()}\nAMI Category: ${eligibility.category}\n\nPlease log in to the Resident Portal to review and approve.`,
                      }).catch((err) => { console.error('Income cert admin notification failed:', err); });
                      // Confirm to the resident that we got it
                      const resRec = LIVE_RESIDENTS.find(r => r._uuid === activeCert.residentId);
                      if (resRec?.email) {
                        sendNotification("custom", {
                          to: resRec.email,
                          subject: "Received: Your income certification",
                          body: `<p>Hi ${resRec.name?.split(" ")[0] || "there"},</p><p>Thanks — we've received your annual income certification. BCLT will review it and follow up if anything is missing. Otherwise you'll get a confirmation when it's approved.</p>`,
                        }).catch(() => {});
                      }
                      if (resRec?.phone) {
                        sendSMS(resRec.phone, `BCLT: Got your income certification. We'll review and confirm shortly.`).catch(() => {});
                      }
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
            <div style={{ minWidth: 160 }}><label style={s.label}>Deadline</label>
              <input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={newDeadline} onChange={e => setNewDeadline(e.target.value)} />
            </div>
            <button disabled={!newResidentId} onClick={startNewCert} style={s.mBtn("primary", mobile)}>📋 Start Certification</button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", fontSize: 13, color: T.muted }}>
            <input type="checkbox" checked={newNotify} onChange={e => setNewNotify(e.target.checked)} />
            <span>Notify resident now (email + SMS) with deadline and a link to the portal</span>
          </label>
        </div>
      ) : (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
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
          <div style={{ marginTop: 14, padding: 14, background: T.bg, borderRadius: T.radiusSm, fontSize: 13, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: T.text }}>📑 What you'll need before you start</div>
            <div style={{ color: T.text, marginBottom: 8 }}>Have these documents ready to upload — you can attach them inside the form:</div>
            <ul style={{ margin: "0 0 10px 18px", padding: 0, color: T.text }}>
              <li>Copy of your most recent <strong>Tax Return</strong> (2024 or 2025)</li>
              <li>Your <strong>2 most recent bank statements</strong></li>
            </ul>
            <div style={{ color: T.text, marginTop: 10, marginBottom: 4, fontWeight: 600 }}>If you are employed:</div>
            <ul style={{ margin: "0 0 10px 18px", padding: 0, color: T.text }}>
              <li>Your <strong>2 most recent pay stubs</strong></li>
            </ul>
            <div style={{ color: T.text, marginBottom: 4, fontWeight: 600 }}>If you are self-employed:</div>
            <ul style={{ margin: "0 0 10px 18px", padding: 0, color: T.text }}>
              <li>Any documentation of monthly income</li>
            </ul>
            <div style={{ color: T.text, marginTop: 10, marginBottom: 4, fontWeight: 600 }}>Other income documents (only if they apply to you — it's fine if you don't have any):</div>
            <ul style={{ margin: "0 0 0 18px", padding: 0, color: T.muted }}>
              <li>Social Security / Disability statement</li>
              <li>Investment account statements</li>
              <li>Pension income statement</li>
              <li>Child Support / Alimony document</li>
            </ul>
            <div style={{ marginTop: 10, fontSize: 12, color: T.muted, fontStyle: "italic" }}>Tip: snap photos with your phone if you don't have PDFs — JPG, PNG, HEIC, and PDF are all fine.</div>
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
          { key: "status", label: "Status", render: (v, row) => {
            const colors = { draft: [T.dimLight, T.muted], in_progress: [T.warnDim, T.warn], pending_review: [T.infoDim, T.info], needs_info: [T.warnDim, T.warn], approved: [T.successDim, T.success], rejected: [T.dangerDim, T.danger] };
            const [bg, fg] = colors[v] || colors.draft;
            const reason = v === "needs_info" ? row.infoRequest : v === "rejected" ? row.rejectionReason : "";
            return (
              <span title={reason || undefined} style={s.badge(bg, fg)}>
                {(v || "").replace("_", " ")}{reason ? " ⓘ" : ""}
              </span>
            );
          }, filterOptions: ["draft", "in_progress", "pending_review", "needs_info", "approved", "rejected"], filterValue: row => row.status },
          { key: "deadline", label: "Deadline", render: v => v || <span style={{ color: T.dim }}>—</span>, tdStyle: row => ({ color: row.deadline && new Date(row.deadline) < new Date() && row.status !== "approved" ? T.danger : T.text, fontWeight: row.deadline && new Date(row.deadline) < new Date() && row.status !== "approved" ? 600 : 400 }) },
          { key: "amiCategory", label: "AMI", render: v => v || "—" },
          { key: "incomeForDetermination", label: "Income", render: v => v ? `$${Number(v).toLocaleString()}` : "—" },
          ...(isAdmin ? [{ key: "id", label: "Actions", sortable: false, filterable: false, render: (v, row) => {
            if (row.status !== "pending_review") return null;
            const notifyResident = async (subject, body, smsText) => {
              const r = LIVE_RESIDENTS.find(x => x._uuid === row.residentId);
              try {
                if (r?.email) await sendNotification("custom", { to: r.email, subject, body });
                if (r?.phone && smsText) await sendSMS(r.phone, smsText);
              } catch (err) { console.warn("Cert status notify failed:", err); }
            };
            return (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                <button title="Approve" style={{ ...s.btn("primary"), fontSize: 11, padding: "4px 8px" }} onClick={async () => {
                  try {
                    await updateIncomeCertification(v, { status: "approved", lastNotifiedAt: new Date().toISOString() });
                    const r = LIVE_RESIDENTS.find(x => x._uuid === row.residentId);
                    const first = r?.name?.split(" ")[0] || "there";
                    await notifyResident(
                      "Your income certification was approved",
                      `<p>Hi ${first},</p><p>Good news — your income certification for Unit ${row.unit} has been <strong>approved</strong>. No further action needed.</p><p>You can view the details any time in BCLT HomeBase.</p>`,
                      `BCLT: Your income certification has been approved. Thanks!`
                    );
                    showSuccess("Approved — resident notified");
                    const refreshed = await fetchIncomeCertifications();
                    setCerts(refreshed || []);
                  } catch (err) { showSuccess("Error: " + err.message); }
                }}>✓ Approve</button>
                <button title="Request more info" style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 8px", color: T.warn }} onClick={async () => {
                  const reason = window.prompt("What additional info do you need from the resident?");
                  if (!reason || !reason.trim()) return;
                  try {
                    await updateIncomeCertification(v, { status: "needs_info", infoRequest: reason.trim(), lastNotifiedAt: new Date().toISOString() });
                    const r = LIVE_RESIDENTS.find(x => x._uuid === row.residentId);
                    const first = r?.name?.split(" ")[0] || "there";
                    await notifyResident(
                      "Additional info needed for your income certification",
                      `<p>Hi ${first},</p><p>BCLT needs some additional info to finish reviewing your income certification:</p><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555;">${reason.trim()}</blockquote><p>Please log in to BCLT HomeBase to update your certification.</p>`,
                      `BCLT: More info needed on your income certification: ${reason.trim().slice(0, 120)}`
                    );
                    showSuccess("Info request sent");
                    const refreshed = await fetchIncomeCertifications();
                    setCerts(refreshed || []);
                  } catch (err) { showSuccess("Error: " + err.message); }
                }}>? More Info</button>
                <button title="Reject" style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 8px", color: T.danger }} onClick={async () => {
                  const reason = window.prompt("Reason for rejecting this certification?");
                  if (!reason || !reason.trim()) return;
                  try {
                    await updateIncomeCertification(v, { status: "rejected", rejectionReason: reason.trim(), lastNotifiedAt: new Date().toISOString() });
                    const r = LIVE_RESIDENTS.find(x => x._uuid === row.residentId);
                    const first = r?.name?.split(" ")[0] || "there";
                    await notifyResident(
                      "Your income certification was rejected",
                      `<p>Hi ${first},</p><p>Your income certification was rejected with the following reason:</p><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555;">${reason.trim()}</blockquote><p>Please contact BCLT management to discuss next steps.</p>`,
                      `BCLT: Your income certification was rejected. Reason: ${reason.trim().slice(0, 120)}`
                    );
                    showSuccess("Rejected — resident notified");
                    const refreshed = await fetchIncomeCertifications();
                    setCerts(refreshed || []);
                  } catch (err) { showSuccess("Error: " + err.message); }
                }}>✕ Reject</button>
              </div>
            );
          } }] : []),
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
        {(() => { const prop = getProperty(rc?.propertyId); return (<>
          <DetailRow label="Manager" value={prop?.manager || "—"} />
          <DetailRow label="Phone" value={prop?.managerPhone || "—"} />
          <DetailRow label="Email" value={prop?.managerEmail || "—"} />
          <DetailRow label="Office Hours" value={prop?.officeHours || "—"} />
        </>); })()}
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
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [loadingHousehold, setLoadingHousehold] = useState(false);

  useEffect(() => {
    if (!rc?.id) return;
    setLoadingHousehold(true);
    fetchHouseholdMembers(rc.id).then(members => {
      setHouseholdMembers(members || []);
      setLoadingHousehold(false);
    }).catch(() => setLoadingHousehold(false));
  }, [rc?.id]);

  const saveContact = async () => {
    try {
      if (myRes._uuid) {
        await updateResident(myRes._uuid, { phone: contactForm.phone, email: contactForm.email });
      }
      setEditingContact(false);
      showSuccess("Contact information updated!");
    } catch (err) {
      showSuccess("Error: " + (err.message || "Failed to update contact info"));
    }
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
          {loadingHousehold ? (
            <div style={{ textAlign: "center", padding: 24, color: T.muted }}>Loading household members...</div>
          ) : householdMembers.length > 0 ? (
            <table style={s.table}>
              <thead><tr>{["Name", "Relationship", "Date of Birth"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {householdMembers.map((m, i) => (
                  <tr key={m.id || i}>
                    <td style={s.td}><span style={{ fontWeight: 600 }}>{m.name}</span></td>
                    <td style={s.td}>{m.relationship}</td>
                    <td style={s.td}>{m.date_of_birth || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon="👥" text="No household members on file. Contact management to update your household composition." />
          )}
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
  const [hideInactive, setHideInactive] = useState(true);
  const [residentUsers, setResidentUsers] = useState([]);
  const [inviteResForm, setInviteResForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [invitingRes, setInvitingRes] = useState(false);

  // Load units when property changes or form opens
  useEffect(() => {
    const prop = LIVE_PROPERTIES.find(p => p.id === addForm.propertyId);
    if (prop?._uuid) fetchUnits(prop._uuid).then(u => setAddFormUnits(u || [])).catch((err) => { console.error('Failed to fetch units:', err); });
  }, [addForm.propertyId]);

  const detailTabs = ["Overview", "Household", "Portal Access", "Lease & Docs", "Maintenance", "Payments", "Communications", "Notes"];

  // Load portal-access users for the selected resident
  const loadResidentUsers = useCallback(async (residentUuid) => {
    if (!residentUuid) { setResidentUsers([]); return; }
    try {
      const all = await fetchUserProfiles();
      setResidentUsers((all || []).filter(u => u.resident_id === residentUuid));
    } catch (err) { console.warn("fetchUserProfiles for resident failed:", err); setResidentUsers([]); }
  }, []);
  useEffect(() => { loadResidentUsers(selectedResident?._uuid); }, [selectedResident?._uuid, loadResidentUsers]);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => { setSelectedResident(null); setTab("Overview"); }} style={{ ...s.btn("ghost") }}>&larr; Back to Directory</button>
          <button onClick={async () => {
            if (!confirm(`Remove ${selectedResident.name} and all their associated data (lease, maintenance, certifications, household members)? This cannot be undone.`)) return;
            try {
              await deleteResident(selectedResident._uuid);
              showSuccess(`${selectedResident.name} removed`);
              setSelectedResident(null);
              setTab("Overview");
              if (onDataChanged) onDataChanged();
            } catch (err) { showSuccess("Error: " + (err.message || "Failed to delete resident")); }
          }} style={{ ...s.btn("ghost"), color: T.danger, fontSize: 13 }}>🗑 Remove Resident</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: T.white }}>
            {selectedResident.name.split(" ").map(n => n[0]).join("")}
          </div>
          <div>
            <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22, marginBottom: 2 }}>{selectedResident.name}</h1>
            <p style={{ ...s.sectionSub, marginBottom: 0 }}>Unit {selectedResident.unit} — {ext.status === "inactive" ? "Inactive" : "Active Resident"}</p>
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
              <button style={{ ...s.btn("ghost"), color: ext.status === "inactive" ? T.success : T.danger }} onClick={async () => {
                const newStatus = ext.status === "inactive" ? "active" : "inactive";
                try {
                  await updateResident(selectedResident._uuid, { status: newStatus });
                  if (onDataChanged) await onDataChanged();
                  showSuccess(`Resident ${newStatus === "active" ? "reactivated" : "deactivated"}`);
                } catch (err) {
                  console.warn(err);
                  showSuccess("Error: " + (err.message || "Failed to update status"));
                }
              }}>{ext.status === "inactive" ? "✅ Reactivate" : "🚫 Deactivate"}</button>
              {selectedResident.email && (
                <button style={s.btn("ghost")} onClick={async () => {
                  if (!selectedResident.email) { showSuccess("No email address on file"); return; }
                  const resUuid = selectedResident._uuid || LIVE_RESIDENTS.find(r => r.id === selectedResident.id || r.name === selectedResident.name)?._uuid;
                  if (!resUuid) { showSuccess("Error: Could not find resident UUID. Try refreshing the page."); return; }
                  if (!confirm(`Send the welcome email to ${selectedResident.name} (${selectedResident.email})?`)) return;
                  try {
                    const result = await inviteUser(selectedResident.email, "resident", resUuid, selectedResident.name);
                    if (result?.warning) showSuccess(result.warning);
                    else showSuccess(`${result?.resent ? "Re-sent" : "Sent"} welcome email to ${selectedResident.email}.`);
                  } catch (err) {
                    showSuccess("Error: " + (err.message || "Failed to send"));
                  }
                }}>📧 Send Welcome Email</button>
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
                      // Optimistically update the visible record so the page reflects the save immediately
                      setSelectedResident(prev => prev ? {
                        ...prev,
                        name: ef.name, phone: ef.phone, email: ef.email,
                        preferredChannel: ef.preferredChannel, smsConsent: ef.smsConsent,
                        mailingStreet: ef.mailingStreet, mailingCity: ef.mailingCity, mailingState: ef.mailingState, mailingZip: ef.mailingZip,
                        mailingAddress: [ef.mailingStreet, ef.mailingCity, ef.mailingState, ef.mailingZip].filter(Boolean).join(", "),
                      } : prev);
                      showSuccess("Resident updated!");
                      setEditing(false);
                      if (onResidentAdded) {
                        await onResidentAdded();
                        // Re-pull the freshly-loaded record so derived fields (joins, lease) reflect the latest server data
                        const updated = LIVE_RESIDENTS.find(r => r._uuid === selectedResident._uuid);
                        if (updated) setSelectedResident(updated);
                      }
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
                  fetchHouseholdMembers(selectedResident._uuid).then(setHouseholdMembers).catch((err) => { console.error('Failed to fetch household members:', err); });
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

        {tab === "Portal Access" && (() => {
          const residentUuid = selectedResident._uuid;
          return (
            <div>
              <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}` }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>Invite to Portal</div>
                <p style={{ fontSize: 12, color: T.muted, marginTop: 0, marginBottom: 14 }}>
                  Each person you invite here gets their own login but shares this unit's rent ledger, maintenance requests, lease docs, and income certification.
                </p>
                {householdMembers.length > 0 && (
                  <div style={{ marginBottom: 14, padding: 10, background: T.bg, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                      Household Members on File — click to quick-fill
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {householdMembers.map(hm => {
                        const nameParts = (hm.name || "").trim().split(/\s+/);
                        const fn = nameParts[0] || "";
                        const ln = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
                        const alreadyInvited = residentUsers.some(p => (p.email || "").toLowerCase() === (hm.email || "").toLowerCase() && hm.email);
                        return (
                          <button key={hm.id} type="button" disabled={alreadyInvited} onClick={() => setInviteResForm({ firstName: fn, lastName: ln, email: hm.email || "", phone: hm.phone || "" })}
                            style={{
                              padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: T.radiusSm,
                              cursor: alreadyInvited ? "not-allowed" : "pointer",
                              background: alreadyInvited ? T.dimLight : T.surface,
                              color: alreadyInvited ? T.dim : T.text,
                              border: `1px solid ${T.border}`,
                              textAlign: "left",
                            }}
                            title={alreadyInvited ? "This person already has a portal login" : `Use ${hm.name}'s info`}
                          >
                            {hm.name} <span style={{ color: T.muted, fontWeight: 400 }}>· {hm.relationship}</span>{alreadyInvited ? <span style={{ color: T.success, marginLeft: 4 }}> ✓ invited</span> : ""}
                            {hm.phone && <div style={{ fontSize: 11, color: T.muted, fontWeight: 400 }}>{hm.phone}{hm.email ? ` · ${hm.email}` : ""}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={s.label}>First Name *</label>
                    <input type="text" placeholder="First" value={inviteResForm.firstName} onChange={e => setInviteResForm(p => ({ ...p, firstName: e.target.value }))}
                      style={{ ...s.mInput(mobile), width: "100%" }} />
                  </div>
                  <div>
                    <label style={s.label}>Last Name *</label>
                    <input type="text" placeholder="Last" value={inviteResForm.lastName} onChange={e => setInviteResForm(p => ({ ...p, lastName: e.target.value }))}
                      style={{ ...s.mInput(mobile), width: "100%" }} />
                  </div>
                  <div>
                    <label style={s.label}>Email *</label>
                    <input type="email" placeholder="user@example.com" value={inviteResForm.email} onChange={e => setInviteResForm(p => ({ ...p, email: e.target.value }))}
                      style={{ ...s.mInput(mobile), width: "100%" }} />
                  </div>
                </div>
                <button disabled={!inviteResForm.email || !inviteResForm.firstName.trim() || !inviteResForm.lastName.trim() || invitingRes}
                  onClick={async () => {
                    setInvitingRes(true);
                    try {
                      const displayName = `${inviteResForm.firstName.trim()} ${inviteResForm.lastName.trim()}`.trim();
                      const result = await inviteUser(inviteResForm.email, "resident", residentUuid, displayName);
                      if (result?.warning) showSuccess(`${displayName} added. ${result.warning}`);
                      else showSuccess(`${result?.resent ? "Re-sent" : "Sent"} welcome email to ${inviteResForm.email}.`);
                      setInviteResForm({ firstName: "", lastName: "", email: "", phone: "" });
                      loadResidentUsers(residentUuid);
                    } catch (err) {
                      showSuccess("Error: " + (err.message || "Failed to invite"));
                    } finally { setInvitingRes(false); }
                  }}
                  style={{ ...s.mBtn("primary", mobile) }}>
                  {invitingRes ? "Inviting..." : "Send Portal Invite"}
                </button>
              </div>

              <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Portal Users for This Unit ({residentUsers.length})</div>
                {residentUsers.length === 0 ? (
                  <EmptyState icon="🔑" text="No one has portal access for this unit yet. Invite someone above." />
                ) : (
                  <table style={s.table}>
                    <thead><tr>{["Name", "Email", "Status", "Actions"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {residentUsers.map(u => (
                        <tr key={u.id}>
                          <td style={s.td}><span style={{ fontWeight: 600 }}>{u.display_name || "—"}</span></td>
                          <td style={s.td}>{u.email}</td>
                          <td style={s.td}>
                            <span style={s.badge(T.successDim, T.success)}>Active</span>
                            <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>
                              {u.created_at ? `Invited ${new Date(u.created_at).toLocaleDateString()}` : ""}
                            </span>
                          </td>
                          <td style={s.td}>
                            <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 12, padding: "2px 8px" }} onClick={async () => {
                              if (!confirm(`Revoke portal access for ${u.email}? They will no longer be able to sign in.`)) return;
                              try {
                                await deleteUserProfile(u.id);
                                setResidentUsers(prev => prev.filter(p => p.id !== u.id));
                                showSuccess(`${u.email} revoked`);
                              } catch (err) { showSuccess("Error: " + err.message); }
                            }}>Revoke</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })()}

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
                  // Create thread first so we can include threadCode in emails
                  const threadId = `THR-${Date.now()}`;
                  const now = new Date().toISOString();
                  if (onAddThread) await onAddThread({
                    id: threadId, participants: [selectedResident.id], subject: msgSubject || `${channel.toUpperCase()} to ${selectedResident.name}`,
                    lastMessage: msgBody.slice(0, 100), lastDate: now, unread: 0, channel: channel === "both" ? "multi" : channel, type: "direct",
                  });
                  if (onAddMessage) await onAddMessage({
                    id: `MSG-${Date.now()}`, threadId, from: "admin", body: msgBody, date: now, status: "delivered",
                  });
                  if (channel === "email" && selectedResident.email) {
                    await sendNotification("custom", { to: selectedResident.email, subject: msgSubject, body: msgBody, threadCode: threadId });
                  } else if (channel === "sms" && selectedResident.phone) {
                    const result = await sendSMS(selectedResident.phone, msgBody);
                    if (!result?.success) throw new Error(result?.error || "SMS failed");
                  } else if (channel === "both") {
                    await sendBoth({ email: selectedResident.email, phone: selectedResident.phone, subject: msgSubject, emailBody: msgBody, smsBody: msgBody, threadCode: threadId });
                  } else {
                    throw new Error(channel === "sms" ? "No phone number on file" : "No email on file");
                  }
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
        <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22, marginBottom: 0 }}>Primary Residents</h1>
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
      <p style={{ ...s.sectionSub, marginTop: 4 }}>Click a row to see household members, lease details, and portal access.</p>
      {showAddForm && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>New Resident</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>First Name *</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.firstName || ""} onChange={e => setAddForm(p => ({ ...p, firstName: e.target.value, name: e.target.value + " " + (p.lastName || "") }))} placeholder="First" /></div>
            <div><label style={s.label}>Last Name *</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={addForm.lastName || ""} onChange={e => setAddForm(p => ({ ...p, lastName: e.target.value, name: (p.firstName || "") + " " + e.target.value }))} placeholder="Last" /></div>
            <div><label style={s.label}>Property *</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={addForm.propertyId} onChange={e => { setAddForm(p => ({ ...p, propertyId: e.target.value, unitId: "" })); const pr = LIVE_PROPERTIES.find(x => x.id === e.target.value); if (pr?._uuid) fetchUnits(pr._uuid).then(u => setAddFormUnits(u || [])).catch((err) => { console.error('Failed to fetch units:', err); }); }}>
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
        const allRes = filterByProperty(LIVE_RESIDENTS, selectedProperty).map(r => ({ ...r, ...(LIVE_RESIDENTS_EXTENDED[r.id] || {}) }));
        const fr = hideInactive ? allRes.filter(r => (r.status || "active") !== "inactive") : allRes;
        const inactiveCount = allRes.length - allRes.filter(r => (r.status || "active") !== "inactive").length;
        const propLabel = selectedProperty === "all" ? "All Properties" : getProperty(selectedProperty).name;
        return (<>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <p style={{ ...s.sectionSub, marginBottom: 0 }}>{propLabel} — {fr.length} Residents{hideInactive && inactiveCount > 0 ? ` (${inactiveCount} inactive hidden)` : ""}</p>
        {inactiveCount > 0 && <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => setHideInactive(h => !h)}>{hideInactive ? `Show ${inactiveCount} Inactive` : "Hide Inactive"}</button>}
      </div>
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
const PropertyCard = ({ p, mobile, onSelect, maintenance = [] }) => {
  const residents = LIVE_RESIDENTS.filter(r => r.propertyId === p.id);
  const maint = maintenance.filter(m => m.propertyId === p.id);
  const openMaint = maint.filter(m => MAINT_OPEN(m)).length;
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

const PropertyDetails = ({ leaseDocs, setLeaseDocs, mobile, selectedProperty, onSelectProperty, onDataRefresh, settings, maintenance = [], unitInspections = [], threads = [], setPage, onOpenMaintenance }) => {
  const isAll = !selectedProperty || selectedProperty === "all";
  const totalUnits = LIVE_PROPERTIES.reduce((s, p) => s + p.totalUnits, 0);
  const totalResidents = LIVE_RESIDENTS.length;
  const totalSF = LIVE_PROPERTIES.reduce((s, p) => s + p.totalSF, 0);
  const [showAddProp, setShowAddProp] = useState(false);
  const [propForm, setPropForm] = useState({ name: "", address: "", type: "", totalUnits: "", totalSF: "" });
  const [propSuccess, showPropSuccess] = useSuccess();
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ number: "", bedrooms: "1", bathrooms: "1", sqft: "", amiSetAside: "", unitType: "apartment", isRv: false, rvInfo: {} });
  const [unitSuccess, showUnitSuccess] = useSuccess();
  const [unitList, setUnitList] = useState([]);
  const [editingUnit, setEditingUnit] = useState(null);
  const [editUnitForm, setEditUnitForm] = useState({});
  const [qrUnit, setQrUnit] = useState(null);
  const [showEditProp, setShowEditProp] = useState(false);
  const [editPropForm, setEditPropForm] = useState({});
  const [propDocs, setPropDocs] = useState([]);
  const [docForm, setDocForm] = useState({ docType: "plan", name: "", notes: "", file: null });
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [detailsTab, setDetailsTab] = useState("Overview");
  const [unitDetailModal, setUnitDetailModal] = useState(null); // { unit, tab, editing?: bool }

  // Load units for selected property (must be before early return to satisfy hooks rules)
  const p = !isAll ? getProperty(selectedProperty) : null;
  useEffect(() => {
    if (p?._uuid) fetchUnits(p._uuid).then(setUnitList).catch((err) => { console.error('Failed to fetch units:', err); });
    if (p?._uuid) fetchPropertyDocuments(p._uuid).then(setPropDocs).catch(() => {});
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
        {LIVE_PROPERTIES.map(p => <PropertyCard key={p.id} p={p} mobile={mobile} maintenance={maintenance} onSelect={() => onSelectProperty?.(p.id, "property")} />)}
      </div>
    );
  }

  if (!p) return <EmptyState icon="🏘️" text="Property not found" />;
  const propResidents = LIVE_RESIDENTS.filter(r => r.propertyId === selectedProperty);

  // Financials roll-up for this property
  const propLedger = LIVE_RENT_LEDGER.filter(l => l.propertyId === selectedProperty);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthLedger = propLedger.filter(l => l.month === currentMonth);
  // Fallback: if no current-month entries exist, use the most recent month per resident
  const ledgerForRollup = currentMonthLedger.length > 0
    ? currentMonthLedger
    : Object.values(propLedger.reduce((acc, l) => {
        if (!acc[l.residentId] || acc[l.residentId].month < l.month) acc[l.residentId] = l;
        return acc;
      }, {}));
  const monthlyRent = ledgerForRollup.reduce((s, l) => s + (l.rentDue || 0), 0);
  const collected = ledgerForRollup.reduce((s, l) => s + (l.tenantPaid || 0) + (l.hapReceived || 0), 0);
  const tenantCollected = ledgerForRollup.reduce((s, l) => s + (l.tenantPaid || 0), 0);
  const hapCollected = ledgerForRollup.reduce((s, l) => s + (l.hapReceived || 0), 0);
  const outstanding = propLedger.reduce((s, l) => s + Math.max(0, l.balance || 0), 0);
  const collectionRate = monthlyRent > 0 ? Math.round((collected / monthlyRent) * 100) : 0;
  const delinquent = propLedger
    .filter(l => (l.balance || 0) > 0)
    .reduce((acc, l) => {
      if (!acc[l.residentId] || acc[l.residentId].month < l.month) acc[l.residentId] = l;
      return acc;
    }, {});
  const topDelinquent = Object.values(delinquent)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0))
    .slice(0, 3)
    .map(l => ({ ...l, resident: LIVE_RESIDENTS.find(r => r.id === l.residentId) }));

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
      {/* Financials roll-up for this property */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>💰 Financials <span style={{ fontSize: 11, color: T.muted, fontWeight: 400 }}>· current month</span></div>
          {onSelectProperty && <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => onSelectProperty(selectedProperty, "financial")}>Full report →</button>}
        </div>
        <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: outstanding > 0 ? 16 : 0 }}>
          <StatCard label="Monthly Rent" value={`$${monthlyRent.toLocaleString()}`} accent={T.accent} mobile={mobile} />
          <StatCard label="Collected" value={`$${collected.toLocaleString()}`} accent={T.success} mobile={mobile} />
          <StatCard label="Tenant Paid" value={`$${tenantCollected.toLocaleString()}`} accent={T.info} mobile={mobile} />
          <StatCard label="HAP / Subsidy" value={`$${hapCollected.toLocaleString()}`} accent={T.info} mobile={mobile} />
          <StatCard label="Collection Rate" value={`${collectionRate}%`} accent={collectionRate >= 95 ? T.success : collectionRate >= 80 ? T.warn : T.danger} mobile={mobile} />
          <StatCard label="Outstanding" value={`$${outstanding.toLocaleString()}`} accent={outstanding > 0 ? T.danger : T.success} mobile={mobile} />
        </div>
        {topDelinquent.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>Top delinquencies</div>
            <table style={s.table}>
              <thead><tr>{["Resident", "Unit", "Month", "Balance"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {topDelinquent.map((l, i) => (
                  <tr key={i} onClick={() => l.resident && onSelectProperty?.(selectedProperty, "residents", l.resident.id)} style={{ cursor: l.resident && onSelectProperty ? "pointer" : "default" }}>
                    <td style={s.td}>{l.resident?.name || "—"}</td>
                    <td style={s.td}>{l.resident?.unit || "—"}</td>
                    <td style={s.td}>{l.month}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: T.danger }}>${(l.balance || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Maintenance for this property */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🔧 Maintenance — Open</div>
          {setPage && <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => setPage("maintenance")}>See all →</button>}
        </div>
        {(() => {
          const propMaint = maintenance.filter(m => m.propertyId === selectedProperty && MAINT_OPEN(m));
          if (propMaint.length === 0) return <div style={{ color: T.dim, fontSize: 13, fontStyle: "italic" }}>No open maintenance items for this property.</div>;
          return (
            <table style={s.table}>
              <thead><tr>{["Issue", "Requester", "Unit", "Category", "Priority", "Status", "Assigned"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {propMaint.slice(0, 10).map(m => (
                  <tr key={m.id} onClick={() => onOpenMaintenance && onOpenMaintenance(m.id)} style={{ cursor: onOpenMaintenance ? "pointer" : "default" }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.surfaceHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600, color: T.accent }}>{m.description}</div>
                      <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>{m.id}</div>
                    </td>
                    <td style={s.td}>{m.residentName || m.requesterName || "—"}</td>
                    <td style={s.td}>{m.unit || "—"}</td>
                    <td style={s.td}>{m.category}</td>
                    <td style={s.td}><Badge status={m.priority} type="priority" /></td>
                    <td style={s.td}><Badge status={m.status} /></td>
                    <td style={s.td}>{m.assignedTo || <span style={{ color: T.dim }}>Unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>

      {/* Recent Communications */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>💬 Recent Communications</div>
          {setPage && <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => setPage("communications")}>See all →</button>}
        </div>
        {(() => {
          const propResIds = new Set(propResidents.map(r => r.id));
          const propThreads = (threads || [])
            .filter(t => t.type === "broadcast" || (t.participants || []).some(pid => propResIds.has(pid)))
            .sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate))
            .slice(0, 5);
          if (propThreads.length === 0) return <div style={{ color: T.dim, fontSize: 13, fontStyle: "italic" }}>No recent communications.</div>;
          return propThreads.map(t => {
            const isBroadcast = t.type === "broadcast";
            const resident = !isBroadcast ? propResidents.find(r => (t.participants || []).includes(r.id)) : null;
            return (
              <div key={t.id} onClick={() => setPage && setPage("communications")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, cursor: setPage ? "pointer" : "default" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t.subject}</div>
                  <div style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isBroadcast ? "📢 Broadcast" : (resident?.name || "Resident")} · {t.lastMessage}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
                  {t.unread > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />}
                  <span style={{ fontSize: 11, color: T.dim }}>{new Date(t.lastDate).toLocaleDateString()}</span>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Property Details — metadata + documents (appliances/finishes live on units) */}
      {(() => {
        const detailTabs = ["Overview", "Documents"];
        return (
          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🏠 Property Details</div>
              {detailsTab === "Overview" && (
                <button style={s.btn("ghost")} onClick={() => { setShowEditProp(v => !v); if (!showEditProp) setEditPropForm({ name: p.name, address: p.address, type: p.type, totalUnits: String(p.totalUnits || ""), totalSF: String(p.totalSF || ""), lotSize: p.lotSize || "", yearBuilt: String(p.yearBuilt || ""), adaUnits: String(p.adaUnits || ""), manager: p.manager || "", managerPhone: p.managerPhone || "", managerEmail: p.managerEmail || "", officeHours: p.officeHours || "" }); }}>
                  {showEditProp ? "Cancel" : "✏️ Edit"}
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: `1px solid ${T.border}` }}>
              {detailTabs.map(tk => (
                <button key={tk} onClick={() => setDetailsTab(tk)} style={{
                  background: "transparent", border: "none", padding: "8px 12px",
                  fontWeight: 600, cursor: "pointer", fontSize: 13,
                  borderBottom: detailsTab === tk ? `2px solid ${T.accent}` : "2px solid transparent",
                  color: detailsTab === tk ? T.accent : T.text,
                }}>{tk}{tk === "Documents" && propDocs.length > 0 ? ` (${propDocs.length})` : ""}</button>
              ))}
            </div>

            {detailsTab === "Overview" && (
              showEditProp ? (
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
                    <div><label style={s.label}>Manager</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.manager || ""} onChange={e => setEditPropForm(f => ({ ...f, manager: e.target.value }))} /></div>
                    <div><label style={s.label}>Manager Phone</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.managerPhone || ""} onChange={e => setEditPropForm(f => ({ ...f, managerPhone: e.target.value }))} /></div>
                    <div><label style={s.label}>Manager Email</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.managerEmail || ""} onChange={e => setEditPropForm(f => ({ ...f, managerEmail: e.target.value }))} /></div>
                    <div><label style={s.label}>Office Hours</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editPropForm.officeHours || ""} onChange={e => setEditPropForm(f => ({ ...f, officeHours: e.target.value }))} /></div>
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
                <div style={{ ...s.grid("1fr 1fr", mobile), gap: 10, fontSize: 13 }}>
                  <div><span style={{ color: T.muted }}>Address:</span> <strong>{p?.address || "—"}</strong></div>
                  <div><span style={{ color: T.muted }}>Type:</span> <strong>{p?.type || "—"}</strong></div>
                  <div><span style={{ color: T.muted }}>Year Built:</span> <strong>{p?.yearBuilt || "—"}</strong></div>
                  <div><span style={{ color: T.muted }}>Last Renovation:</span> <strong>{p?.lastRenovation || "—"}</strong></div>
                  <div><span style={{ color: T.muted }}>Total Units:</span> <strong>{p?.totalUnits || 0}</strong></div>
                  <div><span style={{ color: T.muted }}>Total SF:</span> <strong>{p?.totalSF ? p.totalSF.toLocaleString() : "—"}</strong></div>
                  <div><span style={{ color: T.muted }}>Lot Size:</span> <strong>{p?.lotSize || "—"}</strong></div>
                  <div><span style={{ color: T.muted }}>ADA Units:</span> <strong>{p?.adaUnits || 0}</strong></div>
                  <div><span style={{ color: T.muted }}>Manager:</span> <strong>{p?.manager || "—"}</strong></div>
                  <div><span style={{ color: T.muted }}>Office Hours:</span> <strong>{p?.officeHours || "—"}</strong></div>
                  {p?.managerPhone && <div><span style={{ color: T.muted }}>Phone:</span> <strong>{p.managerPhone}</strong></div>}
                  {p?.managerEmail && <div><span style={{ color: T.muted }}>Email:</span> <strong>{p.managerEmail}</strong></div>}
                </div>
              )
            )}

            {detailsTab === "Documents" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
                  <div style={{ fontSize: 13, color: T.muted }}>Plans, manuals, regulatory agreements, insurance, inspection reports, etc.</div>
                  <button style={{ ...s.btn(showAddDoc ? "ghost" : "primary"), fontSize: 12, padding: "4px 12px" }} onClick={() => setShowAddDoc(v => !v)}>{showAddDoc ? "Cancel" : "➕ Upload"}</button>
                </div>
                {showAddDoc && (
                  <div style={{ padding: 14, background: T.bg, borderRadius: T.radiusSm, marginBottom: 14 }}>
                    <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 10, marginBottom: 10 }}>
                      <div><label style={s.label}>Type</label>
                        <select style={{ ...s.mSelect(mobile), width: "100%" }} value={docForm.docType} onChange={e => setDocForm(f => ({ ...f, docType: e.target.value }))}>
                          <option value="plan">Plan</option>
                          <option value="manual">Manual</option>
                          <option value="regulatory_agreement">Regulatory Agreement</option>
                          <option value="inspection_report">Inspection Report</option>
                          <option value="insurance">Insurance</option>
                          <option value="lease_template">Lease Template</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div><label style={s.label}>Document Name</label>
                        <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="e.g. 2025 Site Plan" value={docForm.name} onChange={e => setDocForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div><label style={s.label}>File</label>
                        <input type="file" style={{ fontSize: 13 }} onChange={e => setDocForm(f => ({ ...f, file: e.target.files?.[0] || null, name: f.name || e.target.files?.[0]?.name?.replace(/\.[^.]+$/, "") || "" }))} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={s.label}>Notes (optional)</label>
                      <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="Any context for this document" value={docForm.notes} onChange={e => setDocForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <button disabled={!docForm.file || !p?._uuid || docUploading} style={s.btn("primary")} onClick={async () => {
                      if (!docForm.file || !p?._uuid) return;
                      setDocUploading(true);
                      try {
                        const saved = await uploadPropertyDocument(docForm.file, p._uuid, docForm.docType, docForm.name || docForm.file.name, docForm.notes);
                        setPropDocs(prev => [saved, ...prev]);
                        setDocForm({ docType: "plan", name: "", notes: "", file: null });
                        setShowAddDoc(false);
                        showUnitSuccess("Document uploaded");
                      } catch (err) { showUnitSuccess("Upload failed: " + (err.message || "")); }
                      setDocUploading(false);
                    }}>{docUploading ? "Uploading…" : "Upload"}</button>
                  </div>
                )}
                {propDocs.length === 0 && !showAddDoc ? (
                  <div style={{ color: T.dim, fontSize: 13, fontStyle: "italic" }}>No documents yet. Upload plans, manuals, regulatory agreements, etc.</div>
                ) : propDocs.length > 0 && (
                  <table style={s.table}>
                    <thead><tr>{["Name", "Type", "Notes", "Uploaded", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {propDocs.map(d => {
                        const typeLabels = { plan: "Plan", manual: "Manual", regulatory_agreement: "Regulatory Agreement", inspection_report: "Inspection Report", insurance: "Insurance", lease_template: "Lease Template", other: "Other" };
                        return (
                          <tr key={d.id}>
                            <td style={s.td}><span style={{ fontWeight: 600 }}>{d.name}</span></td>
                            <td style={s.td}><span style={s.badge(T.accentDim, T.accent)}>{typeLabels[d.doc_type] || d.doc_type}</span></td>
                            <td style={{ ...s.td, color: T.muted, fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{d.notes || "—"}</td>
                            <td style={{ ...s.td, fontSize: 12, color: T.muted }}>{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : "—"}</td>
                            <td style={s.td}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={async () => {
                                  try { const url = await getPropertyDocumentUrl(d.path); if (url) window.open(url, "_blank"); else showUnitSuccess("Could not generate link"); }
                                  catch (err) { showUnitSuccess("Error: " + err.message); }
                                }}>Open</button>
                                <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px", color: T.danger }} onClick={async () => {
                                  if (!confirm(`Delete "${d.name}"?`)) return;
                                  try { await deletePropertyDocument(d.id, d.path); setPropDocs(prev => prev.filter(x => x.id !== d.id)); showUnitSuccess("Deleted"); }
                                  catch (err) { showUnitSuccess("Error: " + err.message); }
                                }}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
            <div><label style={s.label}>AMI Set-Aside</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={unitForm.amiSetAside || ""} onChange={e => setUnitForm(u => ({ ...u, amiSetAside: e.target.value }))}>
                <option value="">Not set</option>
                {["30%", "40%", "50%", "60%", "70%", "80%", "100%", "120%", "Market"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14, maxWidth: 300 }}>
            <label style={s.label}>Type</label>
            <select style={{ ...s.mSelect(mobile), width: "100%" }} value={unitForm.unitType} onChange={e => setUnitForm(u => ({ ...u, unitType: e.target.value, isRv: e.target.value === "rv", rvInfo: e.target.value === "rv" ? u.rvInfo : {} }))}>
              <option value="apartment">Apartment</option>
              <option value="house">House</option>
              <option value="sro">SRO</option>
              <option value="rv">RV</option>
            </select>
          </div>
          {unitForm.unitType === "rv" && (
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
              const newUnit = await insertUnit({ ...unitForm, bedrooms: parseInt(unitForm.bedrooms) || 1, bathrooms: parseInt(unitForm.bathrooms) || 1, sqft: parseInt(unitForm.sqft) || 0, is_rv: unitForm.unitType === "rv", rv_info: unitForm.unitType === "rv" ? unitForm.rvInfo : null, amiSetAside: unitForm.amiSetAside || null, unitType: unitForm.unitType || "apartment" }, p._uuid);
              showUnitSuccess(`Unit ${unitForm.number} added!`);
              setUnitList(prev => [...prev, newUnit]);
              // Update property total_units count in global state so sidebar reflects it
              const propIdx = LIVE_PROPERTIES.findIndex(x => x._uuid === p._uuid);
              if (propIdx >= 0) LIVE_PROPERTIES[propIdx] = { ...LIVE_PROPERTIES[propIdx], totalUnits: (LIVE_PROPERTIES[propIdx].totalUnits || 0) + 1 };
              setUnitForm({ number: "", bedrooms: "1", bathrooms: "1", sqft: "", amiSetAside: "", unitType: "apartment", isRv: false, rvInfo: {} });
              setShowAddUnit(false);
              if (onDataRefresh) onDataRefresh();
            } catch (err) { showUnitSuccess("Error: " + err.message); }
          }} style={{ ...s.mBtn("primary", mobile) }}>Add Unit</button>
        </div>
      )}
      {/* Always show unit list section */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Units ({unitList.length})</div>
        <SuccessMessage message={unitSuccess} />
      {unitList.length > 0 ? (
        <>
          <table style={s.table}>
            <thead><tr>{["Unit", "Resident", "BR", "BA", "Sqft", "AMI", "Type", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {unitList.map(u => {
                const uid = u._uuid || u.id;
                const unitResident = propResidents.find(r => r.unit === u.number);
                const openUnit = () => setUnitDetailModal({ unit: u, tab: "Overview" });
                return (
                  <tr key={uid}
                    onClick={openUnit}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.surfaceHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <td style={s.td}><span style={{ fontWeight: 600, color: T.accent }}>{u.number}</span></td>
                    <td style={s.td}>{unitResident ? (
                      <button style={{ ...s.btn("ghost"), fontWeight: 600, padding: "2px 6px", fontSize: 13 }} onClick={e => {
                        e.stopPropagation();
                        if (onSelectProperty) onSelectProperty(selectedProperty, "residents", unitResident.id);
                      }}>{unitResident.name}</button>
                    ) : <span style={{ color: T.dim, fontSize: 12 }}>Vacant</span>}</td>
                    <td style={s.td}>{u.bedrooms}</td>
                    <td style={s.td}>{u.bathrooms}</td>
                    <td style={s.td}>{u.sqft || "—"}</td>
                    <td style={s.td}>{u.ami_set_aside ? <span style={s.badge(T.accentDim, T.accent)}>{u.ami_set_aside}</span> : <span style={{ color: T.dim, fontSize: 12 }}>—</span>}</td>
                    <td style={s.td}>{(() => {
                      const t = u.unit_type || (u.is_rv ? "rv" : "apartment");
                      const labels = { apartment: "Apartment", house: "House", sro: "SRO", rv: "RV" };
                      const styles = { rv: [T.warnDim, T.warn], house: [T.successDim, T.success], sro: [T.infoDim, T.info], apartment: [T.accentDim, T.accent] };
                      const [bg, fg] = styles[t] || styles.apartment;
                      return <span style={s.badge(bg, fg)}>{labels[t] || t}</span>;
                    })()}</td>
                    <td style={s.td} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 8px", color: T.danger }} onClick={async () => {
                          if (!confirm(`Delete unit ${u.number}?`)) return;
                          try {
                            await deleteUnit(uid);
                            setUnitList(prev => prev.filter(x => (x._uuid || x.id) !== uid));
                            const propIdx = LIVE_PROPERTIES.findIndex(x => x._uuid === p._uuid);
                            if (propIdx >= 0) LIVE_PROPERTIES[propIdx] = { ...LIVE_PROPERTIES[propIdx], totalUnits: Math.max(0, (LIVE_PROPERTIES[propIdx].totalUnits || 1) - 1) };
                            showUnitSuccess(`Unit ${u.number} deleted`);
                            if (onDataRefresh) onDataRefresh();
                          } catch (err) { showUnitSuccess("Error: " + err.message); }
                        }}>Delete</button>
                        <button title="QR Code — Maintenance Request" style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 8px" }} onClick={() => setQrUnit(qrUnit === u.number ? null : u.number)}>QR Code</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Unit Details Modal — full details: overview / resident / appliances / finishes / maintenance / inspections */}
          {unitDetailModal && (() => {
            const u = unitDetailModal.unit;
            const uid = u._uuid || u.id;
            const tab = unitDetailModal.tab;
            const setTab = (t) => setUnitDetailModal(prev => ({ ...prev, tab: t }));
            const appliances = Array.isArray(u.appliances) ? u.appliances : (typeof u.appliances === 'string' ? (() => { try { return JSON.parse(u.appliances); } catch { return []; } })() : []);
            const finishes = Array.isArray(u.finishes) ? u.finishes : (typeof u.finishes === 'string' ? (() => { try { return JSON.parse(u.finishes); } catch { return []; } })() : []);
            const resident = LIVE_RESIDENTS.find(r => r.unit === u.number && r.propertyId === selectedProperty);
            const ext = resident ? (LIVE_RESIDENTS_EXTENDED[resident.id] || {}) : {};
            const unitMaint = (maintenance || []).filter(m => m.unit === u.number && (!selectedProperty || m.propertyId === selectedProperty));
            const openMaint = unitMaint.filter(m => MAINT_OPEN(m));
            const doneMaint = unitMaint.filter(m => MAINT_DONE(m));
            const unitInsp = (unitInspections || []).filter(i => i.unit === u.number).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            const saveAppliances = async (newList) => {
              try {
                await updateUnit(uid, { appliances: newList });
                setUnitList(prev => prev.map(x => (x._uuid || x.id) === uid ? { ...x, appliances: newList } : x));
                setUnitDetailModal(prev => ({ ...prev, unit: { ...prev.unit, appliances: newList } }));
              } catch (err) { showUnitSuccess("Error: " + err.message); }
            };
            const saveFinishes = async (newList) => {
              try {
                await updateUnit(uid, { finishes: newList });
                setUnitList(prev => prev.map(x => (x._uuid || x.id) === uid ? { ...x, finishes: newList } : x));
                setUnitDetailModal(prev => ({ ...prev, unit: { ...prev.unit, finishes: newList } }));
              } catch (err) { showUnitSuccess("Error: " + err.message); }
            };
            const tabsList = ["Overview", "Resident", "Appliances", "Finishes", "Maintenance", "Inspections"];
            const counts = { Maintenance: unitMaint.length, Inspections: unitInsp.length, Appliances: appliances.length, Finishes: finishes.length };
            return (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setUnitDetailModal(null)}>
                <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius, maxWidth: 880, width: "100%", maxHeight: "92vh", overflowY: "auto", padding: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 18 }}>Unit {u.number}</h2>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                        {u.bedrooms}BR / {u.bathrooms}BA
                        {u.sqft ? ` · ${u.sqft} sqft` : ""}
                        {u.ami_set_aside ? ` · ${u.ami_set_aside} AMI` : ""}
                        {(u.unit_type && u.unit_type !== "apartment") ? ` · ${({ rv: "RV", house: "House", sro: "SRO" })[u.unit_type] || u.unit_type}` : (u.is_rv ? " · RV" : "")}
                      </div>
                    </div>
                    <button style={s.btn("ghost")} onClick={() => setUnitDetailModal(null)}>✕</button>
                  </div>

                  <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
                    {tabsList.map(t => (
                      <button key={t} onClick={() => setTab(t)} style={{
                        background: "transparent", border: "none", padding: "8px 12px",
                        fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
                        borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent",
                        color: tab === t ? T.accent : T.text,
                      }}>{t}{counts[t] > 0 ? ` (${counts[t]})` : ""}</button>
                    ))}
                  </div>

                  {tab === "Overview" && (
                    unitDetailModal.editing ? (
                      <div>
                        <div style={{ ...s.grid("1fr 1fr 1fr", mobile), gap: 12, marginBottom: 14 }}>
                          <div><label style={s.label}>Unit Number</label><input style={{ ...s.mInput(mobile), width: "100%" }} value={editUnitForm.number || ""} onChange={e => setEditUnitForm(f => ({ ...f, number: e.target.value }))} /></div>
                          <div><label style={s.label}>Bedrooms</label><input type="number" min="0" style={{ ...s.mInput(mobile), width: "100%" }} value={editUnitForm.bedrooms || ""} onChange={e => setEditUnitForm(f => ({ ...f, bedrooms: e.target.value }))} /></div>
                          <div><label style={s.label}>Bathrooms</label><input type="number" min="0" style={{ ...s.mInput(mobile), width: "100%" }} value={editUnitForm.bathrooms || ""} onChange={e => setEditUnitForm(f => ({ ...f, bathrooms: e.target.value }))} /></div>
                          <div><label style={s.label}>Sqft</label><input type="number" style={{ ...s.mInput(mobile), width: "100%" }} value={editUnitForm.sqft || ""} onChange={e => setEditUnitForm(f => ({ ...f, sqft: e.target.value }))} /></div>
                          <div><label style={s.label}>AMI Set-Aside</label>
                            <select style={{ ...s.mSelect(mobile), width: "100%" }} value={editUnitForm.amiSetAside || ""} onChange={e => setEditUnitForm(f => ({ ...f, amiSetAside: e.target.value }))}>
                              <option value="">Not set</option>
                              {["30%", "40%", "50%", "60%", "70%", "80%", "100%", "120%", "Market"].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                          <div><label style={s.label}>Type</label>
                            <select style={{ ...s.mSelect(mobile), width: "100%" }} value={editUnitForm.unitType || "apartment"} onChange={e => setEditUnitForm(f => ({ ...f, unitType: e.target.value, isRv: e.target.value === "rv", rvInfo: e.target.value === "rv" ? (f.rvInfo || {}) : {} }))}>
                              <option value="apartment">Apartment</option>
                              <option value="house">House</option>
                              <option value="sro">SRO</option>
                              <option value="rv">RV</option>
                            </select>
                          </div>
                        </div>
                        {(editUnitForm.unitType || (editUnitForm.isRv ? "rv" : "")) === "rv" && (
                          <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 14, marginBottom: 14 }}>
                            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, color: T.accent }}>RV Information</div>
                            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                              {(settings.rvFields || []).map(f => (
                                <div key={f.key}>
                                  <label style={{ ...s.label, fontSize: 11 }}>{f.label}</label>
                                  {f.type === "select" ? (
                                    <select style={{ ...s.mSelect(mobile), width: "100%" }} value={(editUnitForm.rvInfo || {})[f.key] || ""} onChange={e => setEditUnitForm(prev => ({ ...prev, rvInfo: { ...(prev.rvInfo || {}), [f.key]: e.target.value } }))}>
                                      <option value="">Select...</option>
                                      {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                  ) : (
                                    <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder={f.placeholder || ""} value={(editUnitForm.rvInfo || {})[f.key] || ""} onChange={e => setEditUnitForm(prev => ({ ...prev, rvInfo: { ...(prev.rvInfo || {}), [f.key]: e.target.value } }))} />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10 }}>
                          <button style={s.btn("primary")} onClick={async () => {
                            try {
                              const isRv = (editUnitForm.unitType || "apartment") === "rv";
                              const updated = { number: editUnitForm.number, bedrooms: parseInt(editUnitForm.bedrooms) || 1, bathrooms: parseInt(editUnitForm.bathrooms) || 1, sqft: parseInt(editUnitForm.sqft) || 0, amiSetAside: editUnitForm.amiSetAside || null, is_rv: isRv, rv_info: isRv ? (editUnitForm.rvInfo || {}) : null, unitType: editUnitForm.unitType || "apartment" };
                              await updateUnit(uid, updated);
                              const merged = { ...u, number: updated.number, bedrooms: updated.bedrooms, bathrooms: updated.bathrooms, sqft: updated.sqft, ami_set_aside: updated.amiSetAside, is_rv: updated.is_rv, rv_info: updated.rv_info, unit_type: updated.unitType };
                              setUnitList(prev => prev.map(x => (x._uuid || x.id) === uid ? merged : x));
                              setUnitDetailModal(prev => ({ ...prev, unit: merged, editing: false }));
                              showUnitSuccess("Unit updated");
                            } catch (err) { showUnitSuccess("Error: " + err.message); }
                          }}>Save Changes</button>
                          <button style={s.btn("ghost")} onClick={() => setUnitDetailModal(prev => ({ ...prev, editing: false }))}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                          <button style={s.btn("ghost")} onClick={() => { setEditUnitForm({ number: u.number, bedrooms: String(u.bedrooms), bathrooms: String(u.bathrooms), sqft: String(u.sqft || ""), amiSetAside: u.ami_set_aside || "", unitType: u.unit_type || (u.is_rv ? "rv" : "apartment"), isRv: u.is_rv || false, rvInfo: u.rv_info || {} }); setUnitDetailModal(prev => ({ ...prev, editing: true })); }}>✏️ Edit</button>
                        </div>
                        <div style={{ ...s.grid("1fr 1fr", mobile), gap: 10, fontSize: 13 }}>
                          <div><span style={{ color: T.muted }}>Unit Number:</span> <strong>{u.number}</strong></div>
                          <div><span style={{ color: T.muted }}>Property:</span> <strong>{p?.name || "—"}</strong></div>
                          <div><span style={{ color: T.muted }}>Bedrooms:</span> <strong>{u.bedrooms || "—"}</strong></div>
                          <div><span style={{ color: T.muted }}>Bathrooms:</span> <strong>{u.bathrooms || "—"}</strong></div>
                          <div><span style={{ color: T.muted }}>Square Feet:</span> <strong>{u.sqft ? u.sqft.toLocaleString() : "—"}</strong></div>
                          <div><span style={{ color: T.muted }}>AMI Set-Aside:</span> <strong>{u.ami_set_aside || "—"}</strong></div>
                          <div><span style={{ color: T.muted }}>Type:</span> <strong>{({ apartment: "Apartment", house: "House", sro: "SRO", rv: "RV" })[u.unit_type || (u.is_rv ? "rv" : "apartment")] || u.unit_type || "Apartment"}</strong></div>
                          {(u.unit_type === "rv" || u.is_rv) && u.rv_info && Object.entries(u.rv_info).map(([k, v]) => (
                            v ? <div key={k}><span style={{ color: T.muted }}>{k}:</span> <strong>{v}</strong></div> : null
                          ))}
                        </div>
                      </div>
                    )
                  )}

                  {tab === "Resident" && (
                    resident ? (
                      <div style={{ ...s.grid("1fr 1fr", mobile), gap: 10, fontSize: 13 }}>
                        <div style={{ gridColumn: "1 / -1", marginBottom: 8 }}>
                          <button style={{ ...s.btn("primary"), fontSize: 13 }} onClick={() => { setUnitDetailModal(null); if (onSelectProperty) onSelectProperty(selectedProperty, "residents", resident.id); }}>View Full Resident Profile →</button>
                        </div>
                        <div><span style={{ color: T.muted }}>Name:</span> <strong>{resident.name}</strong></div>
                        <div><span style={{ color: T.muted }}>Phone:</span> <strong>{resident.phone || "—"}</strong></div>
                        <div><span style={{ color: T.muted }}>Email:</span> <strong>{resident.email || "—"}</strong></div>
                        <div><span style={{ color: T.muted }}>Preferred Channel:</span> <strong>{resident.preferredChannel || "—"}</strong></div>
                        <div><span style={{ color: T.muted }}>Move-In:</span> <strong>{ext.moveIn || ext.leaseStart || "—"}</strong></div>
                        <div><span style={{ color: T.muted }}>Lease End:</span> <strong>{ext.leaseEnd || "—"}</strong></div>
                        <div><span style={{ color: T.muted }}>Monthly Rent:</span> <strong>{ext.rentAmount ? `$${Number(ext.rentAmount).toLocaleString()}` : "—"}</strong></div>
                        <div><span style={{ color: T.muted }}>Tenant Portion:</span> <strong>{ext.tenantPortion ? `$${Number(ext.tenantPortion).toLocaleString()}` : "—"}</strong></div>
                        <div><span style={{ color: T.muted }}>HAP Payment:</span> <strong>{ext.hapPayment ? `$${Number(ext.hapPayment).toLocaleString()}` : "—"}</strong></div>
                        {resident.mailingAddress && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: T.muted }}>Mailing Address:</span> <strong>{resident.mailingAddress}</strong></div>}
                      </div>
                    ) : (
                      <EmptyState icon="🏠" text="Vacant — no resident currently in this unit" />
                    )
                  )}

                  {tab === "Appliances" && (
                    <div>
                      <div style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>In-unit appliances (fridge, stove, dishwasher, etc.).</div>
                      {appliances.length === 0 ? (
                        <div style={{ color: T.dim, fontSize: 13, fontStyle: "italic", marginBottom: 10 }}>No appliances logged yet.</div>
                      ) : (
                        <table style={{ ...s.table, marginBottom: 10 }}>
                          <thead><tr>{["Name", "Brand", "Model", "Serial / Notes", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                          <tbody>{appliances.map((a, i) => (
                            <tr key={i}>
                              <td style={s.td}><strong>{a.name}</strong></td>
                              <td style={s.td}>{a.brand || "—"}</td>
                              <td style={s.td}>{a.model || "—"}</td>
                              <td style={{ ...s.td, color: T.muted, fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{a.serial || a.notes || "—"}</td>
                              <td style={s.td}><button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 11, padding: "2px 8px" }} onClick={async () => { if (!confirm(`Remove ${a.name}?`)) return; await saveAppliances(appliances.filter((_, idx) => idx !== i)); }}>🗑</button></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                      <button style={{ ...s.btn("ghost"), fontSize: 13 }} onClick={async () => {
                        const name = window.prompt("Appliance (e.g. Fridge, Stove, Dishwasher):"); if (!name) return;
                        const brand = window.prompt("Brand (optional):") || "";
                        const model = window.prompt("Model (optional):") || "";
                        const serial = window.prompt("Serial number or notes (optional):") || "";
                        await saveAppliances([...appliances, { name, brand, model, serial }]);
                      }}>＋ Add Appliance</button>
                    </div>
                  )}

                  {tab === "Finishes" && (
                    <div>
                      <div style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>Finishes in this specific unit (paint, flooring, countertops, fixtures).</div>
                      {finishes.length === 0 ? (
                        <div style={{ color: T.dim, fontSize: 13, fontStyle: "italic", marginBottom: 10 }}>No finishes logged yet.</div>
                      ) : (
                        <table style={{ ...s.table, marginBottom: 10 }}>
                          <thead><tr>{["Area", "Material", "Color / Style", "Year", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                          <tbody>{finishes.map((f, i) => (
                            <tr key={i}>
                              <td style={s.td}><strong>{f.area}</strong></td>
                              <td style={s.td}>{f.material || "—"}</td>
                              <td style={s.td}>{f.color || "—"}</td>
                              <td style={s.td}>{f.year || "—"}</td>
                              <td style={s.td}><button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 11, padding: "2px 8px" }} onClick={async () => { if (!confirm(`Remove ${f.area} finish?`)) return; await saveFinishes(finishes.filter((_, idx) => idx !== i)); }}>🗑</button></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                      <button style={{ ...s.btn("ghost"), fontSize: 13 }} onClick={async () => {
                        const area = window.prompt("Area (e.g. Kitchen, Bath, Bedroom 1):"); if (!area) return;
                        const material = window.prompt("Material (e.g. Quartz, LVP, Tile):") || "";
                        const color = window.prompt("Color or style (optional):") || "";
                        const year = window.prompt("Year installed (optional):") || "";
                        await saveFinishes([...finishes, { area, material, color, year }]);
                      }}>＋ Add Finish</button>
                    </div>
                  )}

                  {tab === "Maintenance" && (
                    <div>
                      <div style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>{unitMaint.length === 0 ? "No maintenance history for this unit." : `${openMaint.length} open, ${doneMaint.length} closed.`}</div>
                      {unitMaint.length > 0 && (
                        <table style={s.table}>
                          <thead><tr>{["Issue", "Category", "Priority", "Status", "Submitted", "Assigned"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                          <tbody>
                            {unitMaint.sort((a, b) => (b.submitted || "").localeCompare(a.submitted || "")).map(m => (
                              <tr key={m.id} onClick={() => { setUnitDetailModal(null); if (onOpenMaintenance) onOpenMaintenance(m.id); }} style={{ cursor: onOpenMaintenance ? "pointer" : "default" }}>
                                <td style={s.td}><div style={{ fontWeight: 600, color: T.accent }}>{m.description}</div><div style={{ fontSize: 10, color: T.dim }}>{m.id}</div></td>
                                <td style={s.td}>{m.category}</td>
                                <td style={s.td}><Badge status={m.priority} type="priority" /></td>
                                <td style={s.td}><Badge status={m.status} /></td>
                                <td style={s.td}>{m.submitted || "—"}</td>
                                <td style={s.td}>{m.assignedTo || <span style={{ color: T.dim }}>Unassigned</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {tab === "Inspections" && (
                    <div>
                      <div style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>{unitInsp.length === 0 ? "No inspection history for this unit." : `${unitInsp.length} inspection${unitInsp.length === 1 ? "" : "s"} on file.`}</div>
                      {unitInsp.length > 0 && (
                        <table style={s.table}>
                          <thead><tr>{["Date", "Category", "Inspector", "Result", "Failed Items"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                          <tbody>
                            {unitInsp.map(i => (
                              <tr key={i.id}>
                                <td style={s.td}>{i.date}{i.timeWindow ? <span style={{ color: T.dim, fontSize: 11 }}> · {i.timeWindow}</span> : ""}</td>
                                <td style={s.td}>{i.category}</td>
                                <td style={s.td}>{i.inspector || "—"}</td>
                                <td style={s.td}><Badge status={i.result === "Scheduled" ? "todo" : (i.result || "").toLowerCase()} /></td>
                                <td style={{ ...s.td, fontSize: 12, color: (i.failedItems || []).length ? T.danger : T.dim }}>{(i.failedItems || []).length ? i.failedItems.join("; ") : (i.notes || "None")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* QR Code Popup */}
          {qrUnit && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setQrUnit(null)}>
              <div style={{ background: "#fff", borderRadius: 12, padding: 24, textAlign: "center", maxWidth: 320, boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{p?.name || ""} — Unit {qrUnit}</div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 14 }}>Scan to submit a maintenance request</div>
                <QRCodeCanvas
                  id={"qr-unit-popup-" + qrUnit}
                  value={window.location.origin + window.location.pathname + "?maintenance=" + encodeURIComponent(qrUnit)}
                  size={200}
                  level="M"
                  includeMargin
                />
                <div style={{ fontSize: 10, color: "#999", marginTop: 8, wordBreak: "break-all" }}>
                  {window.location.origin + window.location.pathname + "?maintenance=" + encodeURIComponent(qrUnit)}
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center" }}>
                  <button style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }} onClick={() => {
                    const canvas = document.getElementById("qr-unit-popup-" + qrUnit);
                    if (canvas) { const a = document.createElement("a"); a.download = `QR-${(p?.name || "Property").replace(/\s+/g, "_")}-Unit_${qrUnit}.png`; a.href = canvas.toDataURL(); a.click(); }
                  }}>Download PNG</button>
                  <button style={{ padding: "8px 16px", background: "#e5e7eb", color: "#333", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }} onClick={() => setQrUnit(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ color: T.dim, fontSize: 13, textAlign: "center", padding: "12px 0" }}>No units yet. Click "Add Unit" above to create one.</div>
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
  const [selectedResident, setSelectedResident] = useState(filteredResidents[0]?.id || LIVE_RESIDENTS[0]?.id || "");
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
  const completed = dMaint.filter(m => MAINT_DONE(m)).length;
  const open = total - completed;
  const avgResolution = (() => {
    const resolved = dMaint.filter(m => m.completedDate && m.submitted);
    if (!resolved.length) return "—";
    const avg = resolved.reduce((sum, m) => sum + (new Date(m.completedDate) - new Date(m.submitted)) / 86400000, 0) / resolved.length;
    return avg.toFixed(1) + "d";
  })();
  const cats = dMaint.reduce((acc, m) => { acc[m.category] = (acc[m.category] || 0) + 1; return acc; }, {});
  const topCategory = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const statusCounts = { submitted: dMaint.filter(m => MAINT_AWAITING(m)).length, "in-progress": dMaint.filter(m => m.status === "in-progress").length, completed };
  const priCounts = { critical: dMaint.filter(m => m.priority === "critical" && MAINT_OPEN(m)).length, urgent: dMaint.filter(m => m.priority === "urgent" && MAINT_OPEN(m)).length, routine: dMaint.filter(m => m.priority === "routine" && MAINT_OPEN(m)).length };

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
  const revenueData = filterByProperty([], selectedProperty);
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
const Inspections = ({ role, mobile, unitInspections, onSchedule, onUpdate, rc, selectedProperty, allUnits = [], savedChecklists = [], onSaveChecklist, onUpdateChecklist, staffMembers = [], onScheduleReg, onUpdateReg, onDeleteReg, inspectionTemplates = [], onSaveTemplate, onUpdateTemplate, onDeleteTemplate }) => {
  const inspectorOptions = useMemo(() => {
    const list = (staffMembers || [])
      .filter(s => s && s.active !== false && (s.role === "admin" || s.role === "maintenance" || s.role === "property_manager"))
      .map(s => s.name)
      .filter(Boolean);
    const unique = Array.from(new Set(list));
    return unique.length ? unique : ["External Vendor"];
  }, [staffMembers]);
  const isResident = role === "resident";
  const isAdmin = role === "admin";
  // Two top-level processes: Regulatory and Maintenance. Each gets its own sub-tabs.
  const [topTab, setTopTab] = useState("maintenance");
  const subTabs = isResident
    ? null
    : isAdmin
      ? (topTab === "regulatory" ? ["Upcoming", "Log", "Schedule"] : ["Schedule", "Unit History", "Checklists"])
      : (topTab === "regulatory" ? ["Upcoming", "Log"] : ["Unit History", "Checklists", "My Assigned"]);
  const [tab, setTab] = useState(isResident ? null : subTabs[0]);
  // Reset sub-tab when top-tab flips
  useEffect(() => { if (!isResident) setTab(subTabs[0]); }, [topTab]);
  const [success, showSuccess] = useSuccess();
  const [schedForm, setSchedForm] = useState({ category: "", unit: "", date: "", timeWindow: "", inspector: "", notify: "Yes — 48hr notice" });
  const [regSchedForm, setRegSchedForm] = useState({ type: "HQS", authority: "", propertyId: "", date: "", timeWindow: "", nextDue: "", units: "", notifyResidents: true });
  const [selectedInsp, setSelectedInsp] = useState(null);
  const [selectedReg, setSelectedReg] = useState(null);
  const [regUpdateForm, setRegUpdateForm] = useState({ result: "Pass", date: "", score: "", deficiencies: "0", nextDue: "" });
  const [updateForm, setUpdateForm] = useState({ result: "", score: "", failedItems: "", notes: "" });
  const [activeChecklist, setActiveChecklist] = useState(null);
  const [viewingChecklist, setViewingChecklist] = useState(null);
  const [editingChecklist, setEditingChecklist] = useState(false); // true when editing a completed checklist
  const [templateEditor, setTemplateEditor] = useState(null); // { code, name, description, frequency, scoring, sections, isBuiltin } or null
  // Built-in templates can't be deleted from the DB (they're code), so we
  // soft-delete them per browser via localStorage. Stored as an array of IDs.
  const [hiddenBuiltins, setHiddenBuiltins] = useState(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("bclt_hiddenBuiltinTemplates") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem("bclt_hiddenBuiltinTemplates", JSON.stringify(hiddenBuiltins)); } catch {}
  }, [hiddenBuiltins]);

  const unitData = isResident ? unitInspections.filter(i => i.unit === (rc?.unit || "")) : unitInspections;
  const regInsp = selectedProperty && selectedProperty !== "all"
    ? LIVE_REG_INSPECTIONS.filter(i => i.propertyId === selectedProperty)
    : LIVE_REG_INSPECTIONS;
  const regDueSoon = regInsp.filter(i => new Date(i.nextDue) < new Date("2026-09-01")).length;
  // Template names available for scheduling — pulls from the built-in
  // categories (filtered by hide-state) plus any active custom templates,
  // so the Categories tab is no longer needed as a separate source of truth.
  const scheduleTemplateNames = useMemo(() => {
    const builtinNames = DEFAULT_UNIT_INSPECTION_CATEGORIES
      .filter(c => c.active && !hiddenBuiltins.includes(`PROC-CAT-${c.id}`))
      .map(c => c.name);
    const customNames = (inspectionTemplates || []).filter(t => t.active !== false).map(t => t.name);
    return [...new Set([...builtinNames, ...customNames])];
  }, [hiddenBuiltins, inspectionTemplates]);
  const catNames = scheduleTemplateNames;
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

      {/* Top-level: Regulatory vs Maintenance — each has its own process */}
      {!isResident && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: `1px solid ${T.border}` }}>
          {[["maintenance", "🛠️ Maintenance / Preventive"], ["regulatory", "📋 Regulatory"]].map(([k, label]) => (
            <button key={k} onClick={() => setTopTab(k)} style={{
              background: "transparent", border: "none", padding: "10px 14px",
              fontWeight: 600, cursor: "pointer", fontSize: 14,
              borderBottom: topTab === k ? `2px solid ${T.accent}` : "2px solid transparent",
              color: topTab === k ? T.accent : T.text,
            }}>{label}</button>
          ))}
        </div>
      )}
      {subTabs && <TabBar tabs={subTabs} active={tab} onChange={setTab} mobile={mobile} />}
      <SuccessMessage message={success} />

      {/* Schedule — admin only (Maintenance flow) */}
      {tab === "Schedule" && isAdmin && topTab === "maintenance" && (
        <div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Schedule New Inspection</div>
            <div style={{ ...s.grid("1fr 1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Template</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={schedForm.category} onChange={e => setSchedForm(p => ({ ...p, category: e.target.value }))}><option value="">Select...</option>{scheduleTemplateNames.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label style={s.label}>Unit</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={schedForm.unit} onChange={e => setSchedForm(p => ({ ...p, unit: e.target.value }))}><option value="">Select unit...</option>{unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              <div><label style={s.label}>Date</label><input style={s.mInput(mobile)} type="date" value={schedForm.date} onChange={e => setSchedForm(p => ({ ...p, date: e.target.value }))} /></div>
            </div>
            <div style={{ ...s.grid("1fr 1fr 1fr", mobile), marginBottom: 14 }}>
              <div><label style={s.label}>Time / Window</label><input style={s.mInput(mobile)} placeholder="e.g. 9am–12pm or 10:30 AM" value={schedForm.timeWindow} onChange={e => setSchedForm(p => ({ ...p, timeWindow: e.target.value }))} /></div>
              <div><label style={s.label}>Inspector</label><select style={{ ...s.mSelect(mobile), width: "100%" }} value={schedForm.inspector} onChange={e => setSchedForm(p => ({ ...p, inspector: e.target.value }))}>{inspectorOptions.map(n => <option key={n} value={n}>{n}</option>)}<option value="External Vendor">External Vendor</option></select></div>
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
                timeWindow: schedForm.timeWindow || null,
                inspector: schedForm.inspector,
                result: "Scheduled",
                score: null,
                failedItems: [],
                notes: `Notification: ${schedForm.notify}`,
              });
              setSchedForm({ category: "", unit: "", date: "", timeWindow: "", inspector: "", notify: "Yes — 48hr notice" });
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
              { key: "date", label: "Date", render: (v, row) => v ? <span>{v}{row.timeWindow ? <span style={{ color: T.dim, fontSize: 11 }}> · {row.timeWindow}</span> : ""}</span> : "—" },
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
              <div><span style={{ color: T.dim }}>Date:</span> <strong>{selectedInsp.date}{selectedInsp.timeWindow ? ` · ${selectedInsp.timeWindow}` : ""}</strong></div>
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
      {tab === "Checklists" && (() => {
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

        // Auto-generate fillable templates from each active category — the
        // checklist items become yes/no/N/A line items so staff can run
        // them on a real inspection (not just view in the Categories tab).
        const CATEGORY_PROCEDURES = DEFAULT_UNIT_INSPECTION_CATEGORIES
          .filter(c => c.active)
          .map(c => ({
            id: `PROC-CAT-${c.id}`,
            name: `${c.name} Checklist`,
            nameSp: "",
            year: new Date().getFullYear(),
            frequency: c.frequency,
            scoring: c.scoring,
            description: c.description,
            sections: [{
              name: c.name,
              items: c.checklist.map(text => ({ text, type: "yesNoNa" })),
            }],
          }));
        // Custom templates stored in the inspection_templates table —
        // editable in the UI (modal below). Filtered to active=true so
        // disabled ones disappear from the picker but stay in the DB.
        const CUSTOM_TEMPLATES = (inspectionTemplates || [])
          .filter(t => t.active !== false)
          .map(t => ({
            id: t.id,
            code: t.id,
            _uuid: t._uuid,
            name: t.name,
            description: t.description || '',
            frequency: t.frequency || '',
            scoring: t.scoring || 'yesNoNa',
            sections: t.sections || [],
            custom: true,
          }));
        const ALL_PROCEDURES = [...CUSTOM_TEMPLATES, ...CATEGORY_PROCEDURES, RV_PROCEDURE, QUARTERLY_PROCEDURE]
          .filter(p => p.custom || !hiddenBuiltins.includes(p.id));
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
                          {inspectorOptions.map(n => <option key={n} value={n}>{n}</option>)}
                          <option value="External Vendor">External Vendor</option>
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

                {/* Available templates */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 10px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1px" }}>Available Templates ({ALL_PROCEDURES.length})</div>
                  {isAdmin && onSaveTemplate && (
                    <button style={{ ...s.btn(), fontSize: 13 }} onClick={() => setTemplateEditor({ code: null, name: "", description: "", frequency: "Annual", scoring: "yesNoNa", sections: [{ name: "Items", items: [{ text: "", type: "yesNoNa" }] }] })}>+ Create Template</button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                  {ALL_PROCEDURES.map(proc => {
                    const procItems = proc.sections.reduce((sum, sec) => sum + sec.items.length, 0);
                    const freq = proc.frequency || (proc.id.includes("QPM") ? "Quarterly" : "Annual");
                    const isCustom = !!proc.custom;
                    return (
                      <div key={proc.id} style={{ ...s.card, marginBottom: 0, borderLeft: isCustom ? `3px solid ${T.accent}` : undefined }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{proc.name}</div>
                            {proc.description && <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>{proc.description}</div>}
                            {proc.nameSp && <div style={{ color: T.dim, fontSize: 12, fontStyle: "italic", marginTop: 2 }}>{proc.nameSp}</div>}
                          </div>
                          <span style={s.badge(isCustom ? T.accentDim : T.successDim, isCustom ? T.accent : T.success)}>{isCustom ? "Custom" : "Active"}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, marginBottom: 10 }}>
                          <span style={{ color: T.dim }}>{procItems} items</span>
                          <span style={{ color: T.dim }}>· {freq}</span>
                          {proc.scoring && <span style={{ color: T.dim }}>· {proc.scoring}</span>}
                        </div>
                        {isAdmin && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => {
                              const procSel = document.getElementById("proc-type");
                              if (procSel) { procSel.value = proc.id; procSel.scrollIntoView({ behavior: "smooth", block: "center" }); }
                            }}>Use this template</button>
                            {onSaveTemplate && (
                              <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => setTemplateEditor({
                                code: isCustom ? proc.code : null,            // null → save creates a new row
                                name: isCustom ? proc.name : `${proc.name} (custom)`,
                                description: proc.description || "",
                                frequency: proc.frequency || "",
                                scoring: proc.scoring || "yesNoNa",
                                sections: JSON.parse(JSON.stringify(proc.sections || [])),
                                isBuiltin: !isCustom,
                              })}>{isCustom ? "Edit" : "Edit / Duplicate"}</button>
                            )}
                            <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px", color: T.danger }} onClick={async () => {
                              if (isCustom) {
                                if (!onDeleteTemplate) return;
                                if (!confirm(`Delete the "${proc.name}" template? Completed checklists using it will keep their data.`)) return;
                                try { await onDeleteTemplate(proc.code); showSuccess("Template deleted"); }
                                catch (err) { showSuccess("Error: " + err.message); }
                              } else {
                                if (!confirm(`Hide the built-in "${proc.name}" template? You can restore it from Settings later.`)) return;
                                setHiddenBuiltins(prev => prev.includes(proc.id) ? prev : [...prev, proc.id]);
                                showSuccess("Template hidden");
                              }
                            }}>🗑️</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Hidden built-in templates — admins can restore them */}
                {isAdmin && hiddenBuiltins.length > 0 && (
                  <div style={{ marginTop: 16, padding: 12, background: T.bg, borderRadius: T.radiusSm, fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: T.muted }}>Hidden built-in templates ({hiddenBuiltins.length})</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {hiddenBuiltins.map(id => {
                        // Look up the original built-in by id to display a name
                        const all = [...CATEGORY_PROCEDURES, RV_PROCEDURE, QUARTERLY_PROCEDURE];
                        const found = all.find(p => p.id === id);
                        return (
                          <span key={id} style={{ ...s.badge(T.dimLight, T.muted), display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px" }}>
                            {found?.name || id}
                            <button onClick={() => setHiddenBuiltins(prev => prev.filter(x => x !== id))} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 600 }}>↺ Restore</button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                                {(item.response?.attachments || []).length > 0 && (
                                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
                                    {item.response.attachments.map((att, ai) => (
                                      <a key={ai} href="#" onClick={async e => {
                                        e.preventDefault();
                                        try {
                                          const url = await getInspectionAttachmentUrl(att.path);
                                          if (url) window.open(url, "_blank");
                                        } catch (err) {}
                                      }} style={{ fontSize: 11, color: T.accent, textDecoration: "underline" }}>📎 {att.name}</a>
                                    ))}
                                  </div>
                                )}
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
                              {/* Attachments */}
                              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                {(r.attachments || []).map((att, ai) => (
                                  <div key={ai} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                                    <span style={{ color: T.dim }}>📎</span>
                                    <a href="#" onClick={async e => {
                                      e.preventDefault();
                                      try {
                                        const url = await getInspectionAttachmentUrl(att.path);
                                        if (url) window.open(url, "_blank");
                                      } catch (err) { showSuccess("Could not open attachment"); }
                                    }} style={{ color: T.accent, textDecoration: "underline", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</a>
                                    <button onClick={async () => {
                                      try { await deleteInspectionAttachment(att.path); } catch (err) {}
                                      const current = (activeChecklist.responses[key]?.attachments) || [];
                                      setResp(key, "attachments", current.filter((_, idx) => idx !== ai));
                                    }} style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                                  </div>
                                ))}
                                <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: T.accent, cursor: "pointer", fontWeight: 600 }}>
                                  <span>+ Attach file</span>
                                  <input type="file" style={{ display: "none" }} onChange={async e => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (!file) return;
                                    try {
                                      const att = await uploadInspectionAttachment(file, activeChecklist.id, key);
                                      const current = (activeChecklist.responses[key]?.attachments) || [];
                                      setResp(key, "attachments", [...current, att]);
                                    } catch (err) {
                                      showSuccess("Upload failed: " + (err.message || "error"));
                                    }
                                  }} />
                                </label>
                              </div>
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
      {/* ────────────────────────── REGULATORY ────────────────────────── */}
      {topTab === "regulatory" && tab === "Upcoming" && (() => {
        const today = new Date(new Date().toISOString().slice(0, 10));
        // Effective due date = nextDue if set, otherwise inspection date (for scheduled/future-dated ones)
        const effectiveDate = (i) => i.nextDue || (i.result === "Scheduled" ? i.date : null);
        const upcoming = regInsp
          .filter(i => { const d = effectiveDate(i); return d && new Date(d) >= today; })
          .sort((a, b) => new Date(effectiveDate(a)) - new Date(effectiveDate(b)));
        const overdue = regInsp
          .filter(i => { const d = effectiveDate(i); return d && new Date(d) < today && i.result !== "Pass"; })
          .sort((a, b) => new Date(effectiveDate(a)) - new Date(effectiveDate(b)));
        return (
          <div>
            {overdue.length > 0 && (
              <div style={{ ...s.card, borderLeft: `3px solid ${T.danger}`, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15, color: T.danger }}>⚠ Overdue ({overdue.length})</div>
                <SortableTable mobile={mobile} columns={[
                  { key: "_when", label: "Was Due", render: (_, row) => <span style={{ color: T.danger, fontWeight: 600 }}>{effectiveDate(row)}{row.timeWindow ? ` · ${row.timeWindow}` : ""}</span>, sortValue: row => effectiveDate(row) || "" },
                  { key: "type", label: "Type", render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
                  { key: "authority", label: "Authority" },
                  { key: "propertyId", label: "Property", render: v => LIVE_PROPERTIES.find(p => p.id === v)?.name || v || "—" },
                ]} data={overdue} onRowClick={row => { setSelectedReg(row); setRegUpdateForm({ result: "Pass", date: new Date().toISOString().slice(0, 10), timeWindow: row.timeWindow || "", score: row.score || "", deficiencies: String(row.deficiencies || 0), nextDue: "" }); }} />
              </div>
            )}
            <div style={s.card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Upcoming Regulatory Inspections ({upcoming.length})</div>
              {upcoming.length === 0 ? (
                <EmptyState icon="📋" text="Nothing on the books. Use the Schedule tab to add one." />
              ) : (
                <SortableTable mobile={mobile} columns={[
                  { key: "_when", label: "Date / Time", render: (_, row) => <span style={{ fontWeight: 600 }}>{effectiveDate(row)}{row.timeWindow ? ` · ${row.timeWindow}` : ""}</span>, sortValue: row => effectiveDate(row) || "" },
                  { key: "type", label: "Type" },
                  { key: "authority", label: "Authority" },
                  { key: "propertyId", label: "Property", render: v => LIVE_PROPERTIES.find(p => p.id === v)?.name || v || "—", filterOptions: [...new Set(upcoming.map(i => LIVE_PROPERTIES.find(p => p.id === i.propertyId)?.name).filter(Boolean))] },
                  { key: "units", label: "Units", render: v => v || "—" },
                  { key: "result", label: "Status", render: v => <Badge status={v === "Scheduled" ? "todo" : v.toLowerCase()} /> },
                ]} data={upcoming} onRowClick={row => { setSelectedReg(row); setRegUpdateForm({ result: row.result === "Scheduled" ? "Pass" : row.result, date: row.date || new Date().toISOString().slice(0, 10), timeWindow: row.timeWindow || "", score: row.score || "", deficiencies: String(row.deficiencies || 0), nextDue: row.nextDue || "" }); }} />
              )}
            </div>
          </div>
        );
      })()}

      {topTab === "regulatory" && tab === "Log" && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Regulatory Inspection Log</div>
            <ExportButton mobile={mobile} onClick={() => generateCSV(
              [{ label: "Type", key: "type" }, { label: "Authority", key: "authority" }, { label: "Property", key: "propertyId", exportValue: r => LIVE_PROPERTIES.find(p => p.id === r.propertyId)?.name || r.propertyId }, { label: "Last Date", key: "date" }, { label: "Result", key: "result" }, { label: "Score", key: "score" }, { label: "Next Due", key: "nextDue" }, { label: "Deficiencies", key: "deficiencies" }],
              regInsp, "regulatory_inspections"
            )} />
          </div>
          <SortableTable
            mobile={mobile}
            columns={[
              { key: "type", label: "Type", render: v => <span style={{ fontWeight: 600 }}>{v}</span>, filterOptions: [...new Set(regInsp.map(i => i.type))] },
              { key: "authority", label: "Authority" },
              { key: "propertyId", label: "Property", render: v => LIVE_PROPERTIES.find(p => p.id === v)?.name || v || "—", filterOptions: [...new Set(regInsp.map(i => LIVE_PROPERTIES.find(p => p.id === i.propertyId)?.name).filter(Boolean))] },
              { key: "date", label: "Date", render: (v, row) => v ? <span>{v}{row.timeWindow ? <span style={{ color: T.dim, fontSize: 11 }}> · {row.timeWindow}</span> : ""}</span> : "—" },
              { key: "result", label: "Result", render: v => <span style={s.badge(v === "Pass" ? T.successDim : v === "Scheduled" ? T.accentDim : T.dangerDim, v === "Pass" ? T.success : v === "Scheduled" ? T.accent : T.danger)}>{v}</span>, filterOptions: ["Pass", "Fail", "Scheduled"], filterValue: row => row.result },
              { key: "score", label: "Score", render: v => v || "—", filterable: false },
              { key: "nextDue", label: "Next Due", tdStyle: row => ({ color: row.nextDue && new Date(row.nextDue) < new Date() ? T.warn : T.text, fontWeight: row.nextDue && new Date(row.nextDue) < new Date() ? 600 : 400 }) },
              { key: "deficiencies", label: "Deficiencies", render: v => v > 0 ? <span style={s.badge(T.dangerDim, T.danger)}>{v}</span> : <span style={{ color: T.dim }}>0</span>, sortValue: row => row.deficiencies, filterable: false },
            ]}
            data={regInsp}
            onRowClick={row => { setSelectedReg(row); setRegUpdateForm({ result: row.result === "Scheduled" ? "Pass" : row.result, date: row.date || new Date().toISOString().slice(0, 10), timeWindow: row.timeWindow || "", score: row.score || "", deficiencies: String(row.deficiencies || 0), nextDue: row.nextDue || "" }); }}
          />
        </div>
      )}

      {topTab === "regulatory" && tab === "Schedule" && isAdmin && (
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Schedule a Regulatory Inspection</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div>
              <label style={s.label}>Type *</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={regSchedForm.type} onChange={e => setRegSchedForm(p => ({ ...p, type: e.target.value }))}>
                {["HQS", "REAC/NSPIRE", "Fire & Safety", "LIHTC Compliance", "Lead-Based Paint", "Marin County HHS", "EHS", "MHA", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Authority</label>
              <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="e.g. Marin County Housing Authority" value={regSchedForm.authority} onChange={e => setRegSchedForm(p => ({ ...p, authority: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Property *</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={regSchedForm.propertyId} onChange={e => setRegSchedForm(p => ({ ...p, propertyId: e.target.value }))}>
                <option value="">Select property...</option>
                {LIVE_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Inspection Date *</label>
              <input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={regSchedForm.date} onChange={e => setRegSchedForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Time / Window</label>
              <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="e.g. 9am–12pm or 10:30 AM" value={regSchedForm.timeWindow} onChange={e => setRegSchedForm(p => ({ ...p, timeWindow: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Next Due (after this one)</label>
              <input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={regSchedForm.nextDue} onChange={e => setRegSchedForm(p => ({ ...p, nextDue: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Units to Inspect</label>
              <input type="number" min="0" style={{ ...s.mInput(mobile), width: "100%" }} placeholder="e.g. 42 or leave blank" value={regSchedForm.units} onChange={e => setRegSchedForm(p => ({ ...p, units: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: 14, padding: 12, background: T.bg, borderRadius: T.radiusSm }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
              <input type="checkbox" checked={regSchedForm.notifyResidents} onChange={e => setRegSchedForm(p => ({ ...p, notifyResidents: e.target.checked }))} />
              <span><strong>Notify residents of this property</strong> — emails (and texts, if phone on file) every resident with date, type, and authority</span>
            </label>
          </div>
          <button disabled={!regSchedForm.type || !regSchedForm.propertyId || !regSchedForm.date} style={s.btn()} onClick={async () => {
            try {
              const sched = {
                propertyId: regSchedForm.propertyId,
                type: regSchedForm.type,
                authority: regSchedForm.authority || regSchedForm.type,
                date: regSchedForm.date,
                timeWindow: regSchedForm.timeWindow || null,
                nextDue: regSchedForm.nextDue || null,
                units: regSchedForm.units ? parseInt(regSchedForm.units, 10) : null,
                result: "Scheduled",
                deficiencies: 0,
                notifyResidents: regSchedForm.notifyResidents,
              };
              await onScheduleReg(sched);
              showSuccess(regSchedForm.notifyResidents ? "Scheduled — residents notified" : "Scheduled");
              setRegSchedForm({ type: "HQS", authority: "", propertyId: "", date: "", timeWindow: "", nextDue: "", units: "", notifyResidents: true });
            } catch (err) { showSuccess("Error: " + (err.message || "Failed to schedule")); }
          }}>Schedule Inspection</button>
        </div>
      )}

      {/* Regulatory detail / record modal */}
      {selectedReg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setSelectedReg(null)}>
          <div style={{ ...s.card, maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{selectedReg.type} · {LIVE_PROPERTIES.find(p => p.id === selectedReg.propertyId)?.name || selectedReg.propertyId}</h2>
              <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.text }} onClick={() => setSelectedReg(null)}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10, padding: 12, background: T.bg, borderRadius: T.radiusSm, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: T.muted }}>Authority:</span> <strong>{selectedReg.authority || "—"}</strong></div>
              <div><span style={{ color: T.muted }}>Date:</span> <strong>{selectedReg.date || "—"}{selectedReg.timeWindow ? ` · ${selectedReg.timeWindow}` : ""}</strong></div>
              <div><span style={{ color: T.muted }}>Status:</span> <Badge status={selectedReg.result === "Scheduled" ? "todo" : (selectedReg.result || "").toLowerCase()} /></div>
              <div><span style={{ color: T.muted }}>Units:</span> <strong>{selectedReg.units || "—"}</strong></div>
              <div><span style={{ color: T.muted }}>Next Due:</span> <strong>{selectedReg.nextDue || "—"}</strong></div>
              <div><span style={{ color: T.muted }}>Deficiencies:</span> <strong>{selectedReg.deficiencies || 0}</strong></div>
            </div>
            {isAdmin && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>Record Results</div>
                <div style={{ ...s.grid("1fr 1fr", mobile), gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={s.label}>Result</label>
                    <select style={{ ...s.mSelect(mobile), width: "100%" }} value={regUpdateForm.result} onChange={e => setRegUpdateForm(p => ({ ...p, result: e.target.value }))}>
                      <option value="Pass">Pass</option>
                      <option value="Fail">Fail</option>
                      <option value="Scheduled">Scheduled</option>
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Inspection Date</label>
                    <input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={regUpdateForm.date} onChange={e => setRegUpdateForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={s.label}>Time / Window</label>
                    <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="e.g. 9am–12pm" value={regUpdateForm.timeWindow || ""} onChange={e => setRegUpdateForm(p => ({ ...p, timeWindow: e.target.value }))} />
                  </div>
                  <div>
                    <label style={s.label}>Score (optional)</label>
                    <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="e.g. 88" value={regUpdateForm.score} onChange={e => setRegUpdateForm(p => ({ ...p, score: e.target.value }))} />
                  </div>
                  <div>
                    <label style={s.label}>Deficiencies</label>
                    <input type="number" min="0" style={{ ...s.mInput(mobile), width: "100%" }} value={regUpdateForm.deficiencies} onChange={e => setRegUpdateForm(p => ({ ...p, deficiencies: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: mobile ? "1" : "1 / -1" }}>
                    <label style={s.label}>Next Due Date</label>
                    <input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={regUpdateForm.nextDue} onChange={e => setRegUpdateForm(p => ({ ...p, nextDue: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={s.btn()} onClick={async () => {
                      try {
                        await onUpdateReg(selectedReg.id, {
                          result: regUpdateForm.result,
                          date: regUpdateForm.date || null,
                          timeWindow: regUpdateForm.timeWindow || null,
                          score: regUpdateForm.score ? parseInt(regUpdateForm.score, 10) : null,
                          deficiencies: parseInt(regUpdateForm.deficiencies, 10) || 0,
                          nextDue: regUpdateForm.nextDue || null,
                        });
                        showSuccess("Inspection updated");
                        setSelectedReg(null);
                      } catch (err) { showSuccess("Error: " + err.message); }
                    }}>Save</button>
                    <button style={s.btn("ghost")} onClick={() => setSelectedReg(null)}>Cancel</button>
                  </div>
                  {onDeleteReg && (
                    <button style={{ ...s.btn("ghost"), color: T.danger }} onClick={async () => {
                      if (!confirm(`Delete this ${selectedReg.type} inspection?`)) return;
                      try {
                        await onDeleteReg(selectedReg.id);
                        showSuccess("Deleted");
                        setSelectedReg(null);
                      } catch (err) { showSuccess("Error: " + err.message); }
                    }}>🗑️ Delete</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* My Assigned — maintenance only */}
      {tab === "My Assigned" && role === "maintenance" && (
        <EmptyState icon="📋" text="No inspections currently assigned. Check back soon!" />
      )}

      {/* ────────────────────── TEMPLATE EDITOR MODAL ────────────────────── */}
      {templateEditor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setTemplateEditor(null)}>
          <div style={{ ...s.card, maxWidth: 720, width: "100%", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{templateEditor.code ? "Edit Template" : "New Template"}</h2>
              <button style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: T.text }} onClick={() => setTemplateEditor(null)}>×</button>
            </div>

            <div style={{ ...s.grid("1fr 1fr", mobile), gap: 12, marginBottom: 14 }}>
              <div>
                <label style={s.label}>Name *</label>
                <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="e.g. Quarterly Fire Safety Walk" value={templateEditor.name} onChange={e => setTemplateEditor(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>Frequency</label>
                <select style={{ ...s.mSelect(mobile), width: "100%" }} value={templateEditor.frequency} onChange={e => setTemplateEditor(p => ({ ...p, frequency: e.target.value }))}>
                  {["Annual", "Semi-annual", "Quarterly", "Monthly", "Move-in", "Move-out", "As needed", "Before scheduled inspection", "Seasonal", "One-time"].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: mobile ? "1" : "1 / -1" }}>
                <label style={s.label}>Description</label>
                <input style={{ ...s.mInput(mobile), width: "100%" }} placeholder="Brief description shown on the template card" value={templateEditor.description} onChange={e => setTemplateEditor(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>Scoring</label>
                <select style={{ ...s.mSelect(mobile), width: "100%" }} value={templateEditor.scoring} onChange={e => setTemplateEditor(p => ({ ...p, scoring: e.target.value }))}>
                  <option value="yesNoNa">Yes / No / N/A</option>
                  <option value="pass-fail">Pass / Fail</option>
                  <option value="scored">Scored</option>
                </select>
              </div>
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, marginTop: 8 }}>Sections</div>
            {templateEditor.sections.map((sec, sIdx) => (
              <div key={sIdx} style={{ border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input style={{ ...s.mInput(mobile), flex: 1, fontWeight: 600 }} placeholder={`Section ${sIdx + 1} name`} value={sec.name} onChange={e => setTemplateEditor(p => ({ ...p, sections: p.sections.map((s2, i) => i === sIdx ? { ...s2, name: e.target.value } : s2) }))} />
                  <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 12, padding: "4px 8px" }} onClick={() => setTemplateEditor(p => ({ ...p, sections: p.sections.filter((_, i) => i !== sIdx) }))}>Remove section</button>
                </div>
                {sec.items.map((it, iIdx) => (
                  <div key={iIdx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input style={{ ...s.mInput(mobile), flex: 1 }} placeholder={`Item ${iIdx + 1}`} value={it.text} onChange={e => setTemplateEditor(p => ({ ...p, sections: p.sections.map((s2, si) => si === sIdx ? { ...s2, items: s2.items.map((i2, ii) => ii === iIdx ? { ...i2, text: e.target.value } : i2) } : s2) }))} />
                    <select style={{ ...s.mSelect(mobile), width: 130 }} value={it.type} onChange={e => setTemplateEditor(p => ({ ...p, sections: p.sections.map((s2, si) => si === sIdx ? { ...s2, items: s2.items.map((i2, ii) => ii === iIdx ? { ...i2, type: e.target.value } : i2) } : s2) }))}>
                      <option value="yesNoNa">Yes/No/N/A</option>
                      <option value="text">Text</option>
                      <option value="photo">Photo</option>
                    </select>
                    <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 14, padding: "4px 8px" }} onClick={() => setTemplateEditor(p => ({ ...p, sections: p.sections.map((s2, si) => si === sIdx ? { ...s2, items: s2.items.filter((_, ii) => ii !== iIdx) } : s2) }))}>✕</button>
                  </div>
                ))}
                <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 10px", marginTop: 4 }} onClick={() => setTemplateEditor(p => ({ ...p, sections: p.sections.map((s2, si) => si === sIdx ? { ...s2, items: [...s2.items, { text: "", type: "yesNoNa" }] } : s2) }))}>+ Add item</button>
              </div>
            ))}
            <button style={{ ...s.btn("ghost"), fontSize: 13, marginBottom: 16 }} onClick={() => setTemplateEditor(p => ({ ...p, sections: [...p.sections, { name: `Section ${p.sections.length + 1}`, items: [{ text: "", type: "yesNoNa" }] }] }))}>+ Add section</button>

            <div style={{ display: "flex", gap: 10, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
              <button disabled={!templateEditor.name.trim()} style={s.btn()} onClick={async () => {
                try {
                  // Clean up empty items / sections before saving
                  const cleanSections = templateEditor.sections
                    .map(sec => ({ ...sec, items: sec.items.filter(it => it.text.trim()) }))
                    .filter(sec => sec.items.length > 0);
                  if (cleanSections.length === 0) { showSuccess("Add at least one item before saving."); return; }
                  const payload = {
                    name: templateEditor.name.trim(),
                    description: templateEditor.description.trim(),
                    frequency: templateEditor.frequency,
                    scoring: templateEditor.scoring,
                    sections: cleanSections,
                    active: true,
                  };
                  if (templateEditor.code) {
                    await onUpdateTemplate(templateEditor.code, payload);
                    showSuccess("Template updated");
                  } else {
                    await onSaveTemplate(payload);
                    showSuccess("Template created");
                  }
                  setTemplateEditor(null);
                } catch (err) { showSuccess("Error: " + (err.message || "Save failed")); }
              }}>{templateEditor.code ? "Save Changes" : "Create Template"}</button>
              <button style={s.btn("ghost")} onClick={() => setTemplateEditor(null)}>Cancel</button>
            </div>
          </div>
        </div>
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
  const editPanelRef = useRef(null);
  const vendors = filter === "active" ? vendorData.filter(v => v.active) : filter === "inactive" ? vendorData.filter(v => !v.active) : vendorData;
  const openEdit = (row) => {
    setEditingVendor(row);
    setEvForm({ company: row.company, contact: row.contact, trade: row.trade, phone: row.phone, email: row.email, license: row.license, licenseExp: row.licenseExp, insured: row.insured ? "Yes" : "No", coiExp: row.coiExp, notes: row.notes || "", active: row.active });
    setTimeout(() => { editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  };
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
          ]}
          data={vendors}
          rowStyle={row => ({ opacity: row.active ? 1 : 0.55 })}
          onRowClick={onUpdateVendor ? openEdit : undefined}
        />
      </div>
      {editingVendor && (
        <div ref={editPanelRef} style={{ ...s.card, borderLeft: `3px solid ${T.info}`, marginTop: 16, position: "sticky", bottom: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 10 }}>
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

const ThreadView = ({ thread, onBack, mobile, messages: allMessages, onAddMessage, onUpdateThread, role, rc }) => {
  const [reply, setReply] = useState("");
  const messages = allMessages.filter(m => m.threadId === thread.id);
  const resident = LIVE_RESIDENTS.find(r => thread.participants.includes(r.id));
  const isBroadcast = thread.type === "broadcast";
  const currentSender = role === "resident" ? (rc?.id || "resident") : "admin";

  const sendReply = async () => {
    const body = reply.trim();
    if (!body) return;
    const now = new Date().toISOString();
    await onAddMessage({ id: `MSG-${Date.now()}`, threadId: thread.id, from: currentSender, body, date: now });
    onUpdateThread(thread.id, { lastMessage: body, lastDate: now });
    setReply("");
    // Notify the other side via the original channel
    const isSmsChannel = thread.channel === "sms";
    try {
      if (role === "resident") {
        // Resident → staff: email the portal mailbox so admins see it in Gmail too
        await sendNotification("custom", {
          to: "residentportal@bolinaslandtrust.org",
          subject: `Re: ${thread.subject}`,
          body: `<p><strong>From: ${rc?.name || "Resident"} (Unit ${rc?.unit || "—"})</strong></p><p>${body.replace(/\n/g, "<br>")}</p>`,
          threadCode: thread.id,
        });
      } else {
        // Admin/staff → resident — use the thread's original channel
        if (isSmsChannel && resident?.phone) {
          await sendSMS(resident.phone, body);
        } else if (resident?.email) {
          await sendNotification("custom", {
            to: resident.email,
            subject: `Re: ${thread.subject}`,
            body: `<p>${body.replace(/\n/g, "<br>")}</p>`,
            threadCode: thread.id,
          });
        } else if (resident?.phone) {
          // No email on file — fall back to SMS regardless of channel
          await sendSMS(resident.phone, body);
        }
      }
    } catch (err) { console.warn("Reply delivery failed:", err); }
  };

  return (
    <div>
      <button onClick={onBack} style={{ ...s.btn("ghost"), marginBottom: 16, minHeight: mobile ? 44 : undefined }}>← Back</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: mobile ? "flex-start" : "center", marginBottom: 16, flexDirection: mobile ? "column" : "row", gap: mobile ? 8 : 0 }}>
        <div>
          <h2 style={{ fontSize: mobile ? 16 : 18, fontWeight: 700, marginBottom: 4 }}>{thread.subject}</h2>
          <div style={{ fontSize: 13, color: T.muted }}>
            {isBroadcast ? "Broadcast to all residents" : role === "resident" ? "Management" : `${resident?.name || "Unknown"} — Unit ${resident?.unit || "?"}`}
            <span style={{ ...s.badge(CHANNEL_BADGES[thread.channel].bg, CHANNEL_BADGES[thread.channel].text), marginLeft: 10 }}>{CHANNEL_BADGES[thread.channel].label}</span>
          </div>
        </div>
        {isBroadcast && <span style={s.badge(T.successDim, T.success)}>{LIVE_RESIDENTS.length} delivered</span>}
      </div>
      <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: mobile ? 12 : 20, maxHeight: mobile ? "60vh" : 400, overflowY: "auto" }}>
          {messages.map(msg => {
            const isMe = msg.from === currentSender;
            const isStaffMsg = msg.from === "admin";
            const sender = isStaffMsg ? "Management" : (LIVE_RESIDENTS.find(r => r.id === msg.from)?.name || msg.from);
            return (
              <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: mobile ? "85%" : "70%", padding: "10px 14px", borderRadius: 12, background: isMe ? T.accent : T.bg, color: isMe ? T.white : T.text, borderBottomRightRadius: isMe ? 4 : 12, borderBottomLeftRadius: isMe ? 12 : 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>{sender}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{
                    msg.body.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
                      part.match(/^https?:\/\//)
                        ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{part}</a>
                        : part
                    )
                  }</div>
                  <div style={{ fontSize: 10, marginTop: 6, opacity: 0.6, textAlign: "right" }}>{new Date(msg.date).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
        {!isBroadcast && (
          <div style={{ padding: mobile ? "10px 12px" : "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: mobile ? "column" : "row", gap: 10 }}>
            <input style={{ ...s.mInput(mobile), flex: 1 }} placeholder="Type a reply..." value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendReply(); }} />
            <button style={s.mBtn(undefined, mobile)} onClick={sendReply}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
};

const Communications = ({ role, commPrefs, setCommPrefs, mobile, threads: threadData, messages: messageData, onAddThread, onAddMessage, onUpdateThread, onDeleteThread, rc }) => {
  const isAdmin = role === "admin";
  const isMaint = role === "maintenance";
  const isStaff = isAdmin || isMaint;
  const tabs = isStaff ? ["Inbox", "Compose", "Templates"] : ["Messages", "Compose", "Preferences"];
  const [tab, setTab] = useState(tabs[0]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [composeData, setComposeData] = useState({ to: "", broadcast: false, channel: "auto", subject: "", body: "", priority: "normal", template: "", audience: "residents", recipients: [], propertyIds: [] });
  const [residentAttachments, setResidentAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [success, showSuccess] = useSuccess();
  // Inbox sort + filter (admin only — but keep in shared state for simplicity)
  const [inboxSort, setInboxSort] = useState("recent"); // recent | resident | building
  const [inboxPropertyFilter, setInboxPropertyFilter] = useState("");

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
  const baseThreads = isStaff ? threadData
    : threadData.filter(t => t.type === "broadcast" || t.participants.includes(rc?.id || ""));

  // Helpers used for sort/filter and headers
  const threadResident = (t) => t.participants
    .map(pid => LIVE_RESIDENTS.find(r => r.id === pid))
    .find(Boolean) || null;
  const threadResidentName = (t) => t.type === "broadcast" ? "" : (threadResident(t)?.name || "");
  const threadPropertySlug = (t) => threadResident(t)?.propertyId || "";
  const threadBuildingName = (t) => {
    if (t.type === "broadcast") return "";
    const slug = threadPropertySlug(t);
    return LIVE_PROPERTIES.find(p => p.id === slug)?.name || slug || "";
  };

  // Apply staff-only filters
  const filteredThreads = isStaff && inboxPropertyFilter
    ? baseThreads.filter(t => threadPropertySlug(t) === inboxPropertyFilter)
    : baseThreads;

  // Sort
  const sortedThreads = [...filteredThreads].sort((a, b) => {
    if (isStaff && inboxSort === "resident") {
      const cmp = threadResidentName(a).localeCompare(threadResidentName(b));
      if (cmp !== 0) return cmp;
    } else if (isStaff && inboxSort === "building") {
      const cmp = threadBuildingName(a).localeCompare(threadBuildingName(b));
      if (cmp !== 0) return cmp;
    }
    return new Date(b.lastDate) - new Date(a.lastDate);
  });
  const unreadCount = sortedThreads.filter(t => t.unread > 0).length;

  // If viewing a thread
  if (selectedThread) {
    return (
      <div>
        <h1 style={s.sectionTitle}>{isStaff ? "Communications" : "Messages"}</h1>
        <p style={s.sectionSub}>{isStaff ? "Manage resident communications" : "Your messages"}</p>
        <ThreadView thread={selectedThread} onBack={() => setSelectedThread(null)} mobile={mobile} messages={messageData} onAddMessage={onAddMessage} onUpdateThread={onUpdateThread} role={role} rc={rc} />
      </div>
    );
  }

  const handleTemplateSelect = (tplId) => {
    const tpl = [].find(t => t.id === tplId);
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
              {t.priority === "high" && <span style={s.badge(T.warnDim, T.warn)} title="High priority">High</span>}
              {t.priority === "urgent" && <span style={s.badge(T.dangerDim, T.danger)} title="Urgent">Urgent</span>}
              {t.unread > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />}
              {onDeleteThread && (isStaff || (role === "resident" && !t.type?.includes("broadcast") && t.participants?.includes(rc?.id || ""))) && (
                <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this thread?")) onDeleteThread(t.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.dim, fontSize: 14, padding: "2px 4px", marginLeft: 4 }} title="Delete thread">🗑</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={s.sectionTitle}>{isStaff ? "Communications" : "Messages"}</h1>
        {unreadCount > 0 && <span style={s.badge(T.accentDim, T.accent)}>{unreadCount} unread</span>}
      </div>
      <p style={s.sectionSub}>{isStaff ? "Send, receive, and manage all resident communications" : "View messages and manage your contact preferences"}</p>
      <SuccessMessage message={success} />

      <TabBar tabs={tabs} active={tab} onChange={setTab} mobile={mobile} />

      {/* INBOX / MESSAGES TAB */}
      {(tab === "Inbox" || tab === "Messages") && (
        <div>
          {isStaff && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Sort by</span>
                <select style={{ ...s.select, fontSize: 13, padding: "6px 8px" }} value={inboxSort} onChange={e => setInboxSort(e.target.value)}>
                  <option value="recent">Most recent</option>
                  <option value="resident">Resident (A–Z)</option>
                  <option value="building">Building (A–Z)</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Building</span>
                <select style={{ ...s.select, fontSize: 13, padding: "6px 8px" }} value={inboxPropertyFilter} onChange={e => setInboxPropertyFilter(e.target.value)}>
                  <option value="">All buildings</option>
                  {LIVE_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <span style={{ fontSize: 12, color: T.dim, marginLeft: "auto" }}>{sortedThreads.length} thread{sortedThreads.length === 1 ? "" : "s"}</span>
            </div>
          )}
          <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
            {sortedThreads.length === 0 ? (
              <EmptyState icon="💬" text="No messages yet" />
            ) : (() => {
              // Group with header rows when grouping by resident or building
              const groupKey = (t) => {
                if (!isStaff) return null;
                if (inboxSort === "resident") return threadResidentName(t) || (t.type === "broadcast" ? "Broadcasts" : "—");
                if (inboxSort === "building") return threadBuildingName(t) || (t.type === "broadcast" ? "Broadcasts" : "—");
                return null;
              };
              const items = [];
              let lastGroup = null;
              for (const t of sortedThreads) {
                const g = groupKey(t);
                if (g !== null && g !== lastGroup) {
                  items.push(
                    <div key={`hdr-${g}`} style={{ padding: "10px 16px", background: T.bg, borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{g}</div>
                  );
                  lastGroup = g;
                }
                items.push(<ThreadItem key={t.id} thread={t} />);
              }
              return items;
            })()}
          </div>
        </div>
      )}

      {/* COMPOSE TAB (Staff: admin + maintenance) */}
      {tab === "Compose" && isStaff && (() => {
        const audience = composeData.audience || "residents";
        const propertyList = LIVE_PROPERTIES || [];
        const resolveRecipients = () => {
          if (audience === "all") return LIVE_RESIDENTS;
          if (audience === "buildings") return LIVE_RESIDENTS.filter(r => composeData.propertyIds.includes(r.propertyId));
          if (audience === "residents") return LIVE_RESIDENTS.filter(r => composeData.recipients.includes(r.id));
          return [];
        };
        const recipientCount = resolveRecipients().length;
        const isBroadcastLike = audience === "all" || audience === "buildings" || (audience === "residents" && composeData.recipients.length > 1);
        return (
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>New Message</div>
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Audience</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["residents", "Residents"], ["buildings", "Buildings"], ["all", "Everyone"]].map(([k, label]) => {
                const active = audience === k;
                return (
                  <button key={k} onClick={() => setComposeData(prev => ({ ...prev, audience: k, to: "", recipients: [], propertyIds: [], broadcast: k === "all" }))} style={{
                    padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: T.radiusSm, cursor: "pointer",
                    background: active ? T.accent : T.bg, color: active ? "#fff" : T.text, border: `1px solid ${active ? T.accent : T.border}`,
                  }}>{label}</button>
                );
              })}
            </div>
          </div>
          {audience === "residents" && (
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Pick one or more residents ({composeData.recipients.length} selected)</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 10px" }} onClick={() => setComposeData(prev => ({ ...prev, recipients: LIVE_RESIDENTS.map(r => r.id) }))}>Select all</button>
                <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 10px" }} onClick={() => setComposeData(prev => ({ ...prev, recipients: [] }))}>Clear</button>
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 8 }}>
                {LIVE_RESIDENTS.map(r => {
                  const checked = composeData.recipients.includes(r.id);
                  return (
                    <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={checked} onChange={e => {
                        setComposeData(prev => ({
                          ...prev,
                          recipients: e.target.checked
                            ? [...prev.recipients, r.id]
                            : prev.recipients.filter(id => id !== r.id),
                        }));
                      }} />
                      <span>{r.name} — Unit {r.unit} <span style={{ color: T.dim }}>({propertyList.find(p => p.id === r.propertyId)?.name || r.propertyId || "—"})</span></span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {audience === "buildings" && (
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Pick one or more buildings ({composeData.propertyIds.length} selected)</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 10px" }} onClick={() => setComposeData(prev => ({ ...prev, propertyIds: propertyList.map(p => p.id) }))}>Select all</button>
                <button style={{ ...s.btn("ghost"), fontSize: 11, padding: "4px 10px" }} onClick={() => setComposeData(prev => ({ ...prev, propertyIds: [] }))}>Clear</button>
              </div>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 8 }}>
                {propertyList.map(p => {
                  const count = LIVE_RESIDENTS.filter(r => r.propertyId === p.id).length;
                  const checked = composeData.propertyIds.includes(p.id);
                  return (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={checked} onChange={e => {
                        setComposeData(prev => ({
                          ...prev,
                          propertyIds: e.target.checked
                            ? [...prev.propertyIds, p.id]
                            : prev.propertyIds.filter(id => id !== p.id),
                        }));
                      }} />
                      <span>{p.name} <span style={{ color: T.dim }}>({count} residents)</span></span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {audience === "all" && (
            <div style={{ padding: 12, background: T.warnDim, borderRadius: T.radiusSm, marginBottom: 14, fontSize: 13, color: T.warn }}>
              This message will be sent to all {LIVE_RESIDENTS.length} residents.
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
                {[].map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
          <div style={{ padding: 12, background: T.bg, borderRadius: T.radiusSm, marginBottom: 14, fontSize: 13, color: T.muted }}>
            {recipientCount === 0
              ? "No recipients selected yet."
              : `Will be sent to ${recipientCount} resident${recipientCount === 1 ? "" : "s"}.`}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button disabled={sending || recipientCount === 0 || !composeData.subject.trim() || !composeData.body.trim()} style={s.btn()} onClick={async () => {
              if (!composeData.subject.trim() || !composeData.body.trim() || sending) return;
              const recipients = resolveRecipients();
              if (recipients.length === 0) { showSuccess("No recipients selected."); return; }
              setSending(true);
              const threadId = `THR-${Date.now()}`;
              const ch = composeData.channel === "auto" ? "email" : composeData.channel;
              const isBroadcast = isBroadcastLike;
              // Save thread + message to database
              await onAddThread({
                id: threadId,
                participants: isBroadcast && audience === "all" ? ["all"] : recipients.map(r => r.id),
                subject: composeData.subject.trim(),
                lastMessage: composeData.body.trim().slice(0, 80),
                lastDate: new Date().toISOString(),
                unread: 0,
                channel: isBroadcast ? "multi" : ch,
                type: isBroadcast ? "broadcast" : "direct",
                priority: composeData.priority,
              });
              await onAddMessage({
                id: `MSG-${Date.now()}`,
                threadId,
                from: "admin",
                body: composeData.body.trim(),
                date: new Date().toISOString(),
              });
              // Deliver via SMS/email
              const deliveryReport = { emailSent: 0, emailFailed: 0, smsSent: 0, smsFailed: 0, errors: [] };
              const trySend = async (label, fn) => {
                try { const res = await fn(); if (res && res.success === false) throw new Error(res.error || "send failed"); return true; }
                catch (err) { deliveryReport.errors.push(`${label}: ${err.message || err}`); return false; }
              };
              const emailData = { subject: composeData.subject.trim(), body: composeData.body.trim(), threadCode: threadId };
              const sendToRecipient = async (r) => {
                if (!r) return;
                const wantsEmail = ch === "email" || ch === "auto";
                const wantsSms = ch === "sms" || ch === "auto";
                if (wantsEmail) {
                  if (!r.email) { deliveryReport.emailFailed++; deliveryReport.errors.push(`${r.name || r.id}: no email on file`); }
                  else (await trySend(`email to ${r.email}`, () => sendNotification("custom", { ...emailData, to: r.email }))) ? deliveryReport.emailSent++ : deliveryReport.emailFailed++;
                }
                if (wantsSms && ch === "sms") {
                  if (!r.phone) { deliveryReport.smsFailed++; deliveryReport.errors.push(`${r.name || r.id}: no phone on file`); }
                  else (await trySend(`sms to ${r.phone}`, () => sendSMS(r.phone, composeData.body.trim()))) ? deliveryReport.smsSent++ : deliveryReport.smsFailed++;
                } else if (wantsSms && ch === "auto" && r.phone) {
                  (await trySend(`sms to ${r.phone}`, () => sendSMS(r.phone, composeData.body.trim()))) ? deliveryReport.smsSent++ : deliveryReport.smsFailed++;
                }
              };
              for (const r of recipients) await sendToRecipient(r);
              setComposeData({ to: "", broadcast: false, channel: "auto", subject: "", body: "", priority: "normal", template: "", audience: "residents", recipients: [], propertyIds: [] });
              setSending(false);
              setTab("Inbox");
              const totalSent = deliveryReport.emailSent + deliveryReport.smsSent;
              const totalFailed = deliveryReport.emailFailed + deliveryReport.smsFailed;
              if (totalFailed > 0) {
                console.warn("Send delivery report:", deliveryReport);
                showSuccess(`Saved, but ${totalFailed} delivery failure${totalFailed > 1 ? "s" : ""}: ${deliveryReport.errors.slice(0, 2).join("; ")}${deliveryReport.errors.length > 2 ? "…" : ""}`);
              } else if (totalSent === 0) {
                showSuccess("Saved to inbox, but no email/phone on file to deliver to.");
              } else {
                showSuccess(`Message sent to ${recipients.length} recipient${recipients.length > 1 ? "s" : ""}! ${deliveryReport.emailSent ? `📧 ${deliveryReport.emailSent} email${deliveryReport.emailSent > 1 ? "s" : ""}` : ""}${deliveryReport.emailSent && deliveryReport.smsSent ? " · " : ""}${deliveryReport.smsSent ? `💬 ${deliveryReport.smsSent} SMS` : ""}`);
              }
            }}>{sending ? "Sending..." : `Send to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`}</button>
            <button style={s.btn("ghost")} onClick={() => setComposeData({ to: "", broadcast: false, channel: "auto", subject: "", body: "", priority: "normal", template: "", audience: "single", recipients: [], propertyId: "" })}>Clear</button>
          </div>
        </div>
        );
      })()}

      {/* COMPOSE TAB — Resident */}
      {tab === "Compose" && !isStaff && (
        <div style={s.card}>
          <div style={{ fontSize: 14, color: T.text, marginBottom: 6 }}>Send a message. We'll reply as soon as we can.</div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>If this is a maintenance request, please submit a maintenance request from the <strong>Maintenance</strong> tab instead.</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div>
              <label style={s.label}>Send to</label>
              <select style={{ ...s.select, width: "100%" }} value={composeData.to || "management"} onChange={e => setComposeData(prev => ({ ...prev, to: e.target.value }))}>
                <option value="management">BCLT Management</option>
                <option value="property_manager">Property Manager</option>
                <option value="maintenance">Maintenance Team</option>
                <option value="rent">Rent / Billing</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Subject</label>
              <input style={s.input} value={composeData.subject} onChange={e => setComposeData(prev => ({ ...prev, subject: e.target.value }))} placeholder="What's this about?" />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Message</label>
            <textarea style={{ ...s.input, minHeight: 140, resize: "vertical" }} value={composeData.body} onChange={e => setComposeData(prev => ({ ...prev, body: e.target.value }))} placeholder="Type your message..." />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Attachments (optional)</label>
            <input type="file" multiple onChange={e => setResidentAttachments(Array.from(e.target.files || []))} style={{ display: "block", fontSize: 13, color: T.muted }} />
            {residentAttachments.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: T.muted }}>
                {residentAttachments.map((f, i) => <div key={i}>📎 {f.name} ({(f.size / 1024).toFixed(1)} KB)</div>)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button disabled={sending || !composeData.subject.trim() || !composeData.body.trim()} style={s.btn()} onClick={async () => {
              if (sending) return;
              setSending(true);
              const threadId = `THR-${Date.now()}`;
              const now = new Date().toISOString();
              const recipientKey = composeData.to || "management";
              const recipientLabels = { management: "BCLT Management", property_manager: "Property Manager", maintenance: "Maintenance Team", rent: "Rent / Billing" };
              const recipientLabel = recipientLabels[recipientKey] || "BCLT Management";
              const taggedSubject = `[${recipientLabel}] ${composeData.subject.trim()}`;
              // Upload attachments (if any). HEIC images get converted to JPEG first.
              const uploaded = [];
              for (const original of residentAttachments) {
                try {
                  const f = await convertHeicIfNeeded(original);
                  uploaded.push(await uploadMessageAttachment(f, threadId));
                } catch (err) { console.warn(`Attachment ${original.name} failed:`, err); }
              }
              const attachmentText = uploaded.length > 0
                ? "\n\n— Attachments —\n" + uploaded.map(a => `📎 ${a.name}: ${a.url}`).join("\n")
                : "";
              const bodyWithAttachments = composeData.body.trim() + attachmentText;
              await onAddThread({
                id: threadId,
                participants: [rc?.id || "resident"],
                subject: taggedSubject,
                lastMessage: composeData.body.trim().slice(0, 80),
                lastDate: now,
                unread: 1,
                channel: "email",
                type: "direct",
                priority: "normal",
              });
              await onAddMessage({
                id: `MSG-${Date.now()}`,
                threadId,
                from: rc?.id || "resident",
                body: bodyWithAttachments,
                date: now,
              });
              let emailStatus = "no email sent";
              try {
                const attachmentsHtml = uploaded.length > 0
                  ? `<p><strong>Attachments:</strong></p><ul>${uploaded.map(a => `<li>📎 <a href="${a.url}">${a.name}</a></li>`).join("")}</ul>`
                  : "";
                await sendNotification("custom", {
                  to: "residentportal@bolinaslandtrust.org",
                  subject: taggedSubject,
                  body: `<p><strong>From: ${rc?.name || "Resident"} (Unit ${rc?.unit || "—"})</strong></p><p><strong>To: ${recipientLabel}</strong></p><p>${composeData.body.trim().replace(/\n/g, "<br>")}</p>${attachmentsHtml}`,
                  threadCode: threadId,
                });
                emailStatus = `routed to ${recipientLabel}${uploaded.length > 0 ? ` with ${uploaded.length} attachment${uploaded.length > 1 ? "s" : ""}` : ""}`;
              } catch (err) { console.warn("Compose email failed:", err); }
              setComposeData({ to: "", broadcast: false, channel: "auto", subject: "", body: "", priority: "normal", template: "" });
              setResidentAttachments([]);
              setSending(false);
              setTab("Messages");
              showSuccess(`Message sent — ${emailStatus}`);
            }}>{sending ? "Sending..." : "Send Message"}</button>
            <button style={s.btn("ghost")} onClick={() => { setComposeData({ to: "", broadcast: false, channel: "auto", subject: "", body: "", priority: "normal", template: "" }); setResidentAttachments([]); }}>Clear</button>
          </div>
        </div>
      )}

      {/* TEMPLATES TAB (Admin) */}
      {tab === "Templates" && isStaff && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div />
            <button style={s.btn()}>+ New Template</button>
          </div>
          {[].map(tpl => {
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
      {tab === "Preferences" && !isStaff && (
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
// ── MAINTENANCE: Intake + Work Orders ──
const propertyDisplayName = (slug) => LIVE_PROPERTIES.find(p => p.id === slug)?.name || slug || "—";

const MaintenanceDetailModal = ({ row, onClose, onUpdate, staffMembers, vendors, isStaff, currentUserName, mobile }) => {
  const notes = Array.isArray(row.notes) ? row.notes : [];
  const isIntake = row.status === "new" || row.status === "needs-info";
  const ven = vendors.find(v => v.id === row.vendorId);
  // Only show active admin / maintenance / property managers as possible assignees.
  // Always include the current assignee even if their role/active state changed, so it remains visible.
  const assignableStaff = staffMembers.filter(s =>
    s.active && (s.role === "admin" || s.role === "maintenance" || s.role === "property_manager")
  );
  const currentAssignee = row.assignedTo && !assignableStaff.some(s => s.name === row.assignedTo)
    ? staffMembers.find(s => s.name === row.assignedTo)
    : null;
  const staffOptions = currentAssignee ? [...assignableStaff, currentAssignee] : assignableStaff;
  const [tab, setTab] = useState(isIntake ? "review" : "update");
  const [draft, setDraft] = useState({
    status: row.status,
    assignedTo: row.assignedTo || "",
    vendorId: row.vendorId || "",
    priority: row.priority,
    projectedComplete: row.projectedComplete || "",
    note: "",
    rejectionReason: "",
  });

  const addNote = (existing, text, by) => [...existing, { by: by || "Admin", date: new Date().toISOString().slice(0, 10), text }];

  const handleConvert = () => {
    if (!draft.assignedTo && !draft.vendorId) {
      alert("Assign a staff member or vendor before converting to a work order.");
      return;
    }
    const changes = {
      status: "todo",
      assignedTo: draft.assignedTo || null,
      vendorId: draft.vendorId || null,
      priority: draft.priority,
      projectedComplete: draft.projectedComplete || null,
      convertedAt: new Date().toISOString(),
    };
    if (draft.note.trim()) changes.notes = addNote(notes, `Converted to work order. ${draft.note.trim()}`, currentUserName || "Admin");
    else changes.notes = addNote(notes, "Converted to work order.", currentUserName || "Admin");
    onUpdate(row.id, changes);
    onClose();
  };

  const handleNeedsInfo = () => {
    if (!draft.note.trim()) { alert("Add a note describing what info you need."); return; }
    onUpdate(row.id, { status: "needs-info", notes: addNote(notes, `Needs info: ${draft.note.trim()}`, currentUserName || "Admin") });
    onClose();
  };

  const handleReject = () => {
    if (!draft.rejectionReason.trim()) { alert("Add a rejection reason."); return; }
    onUpdate(row.id, { status: "rejected", rejectionReason: draft.rejectionReason.trim(), notes: addNote(notes, `Rejected: ${draft.rejectionReason.trim()}`, currentUserName || "Admin") });
    onClose();
  };

  const handleUpdate = () => {
    const changes = {
      status: draft.status,
      assignedTo: draft.assignedTo || null,
      vendorId: draft.vendorId || null,
      priority: draft.priority,
      projectedComplete: draft.projectedComplete || null,
    };
    if (draft.status === "done" && !row.completedDate) changes.completedDate = new Date().toISOString().slice(0, 10);
    if (draft.note.trim()) changes.notes = addNote(notes, draft.note.trim(), currentUserName || "Admin");
    onUpdate(row.id, changes);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius, maxWidth: 720, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              <Badge status={row.priority} type="priority" />
              <Badge status={row.status} />
              <span style={{ fontSize: 11, color: T.dim }}>{row.id} · {row.source === "resident" ? "Resident-submitted" : "Staff-created"}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{row.description}</h2>
          </div>
          <button style={s.btn("ghost")} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10, padding: 12, background: T.bg, borderRadius: T.radiusSm, marginBottom: 16, fontSize: 13 }}>
          <div><span style={{ color: T.muted }}>Requester: </span><span style={{ fontWeight: 600 }}>{row.residentName || row.requesterName || "—"}</span></div>
          <div><span style={{ color: T.muted }}>Property: </span><span style={{ fontWeight: 600 }}>{propertyDisplayName(row.propertyId)}</span></div>
          <div><span style={{ color: T.muted }}>Unit: </span><span style={{ fontWeight: 600 }}>{row.unit || "—"}</span></div>
          <div><span style={{ color: T.muted }}>Category: </span><span style={{ fontWeight: 600 }}>{row.category}</span></div>
          <div><span style={{ color: T.muted }}>Submitted: </span>{row.submitted || "—"}</div>
          <div><span style={{ color: T.muted }}>Assignee: </span>{row.assignedTo || "Unassigned"}{ven ? ` · ${ven.company}` : ""}</div>
          {row.projectedComplete && <div><span style={{ color: T.muted }}>Projected: </span>{row.projectedComplete}</div>}
          {row.completedDate && <div><span style={{ color: T.muted }}>Completed: </span>{row.completedDate}</div>}
          {row.rejectionReason && <div style={{ gridColumn: "1 / -1", color: T.danger }}><span style={{ color: T.muted }}>Rejection reason: </span>{row.rejectionReason}</div>}
        </div>

        {Array.isArray(row.photos) && row.photos.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>Photos ({row.photos.length})</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {row.photos.map((p, i) => {
                const url = typeof p === "string" ? p : p.url;
                const name = typeof p === "string" ? `photo-${i + 1}` : (p.name || `photo-${i + 1}`);
                if (!url) return null;
                return (
                  <a key={i} href={url} target="_blank" rel="noreferrer" title={name} style={{ display: "block", width: 96, height: 96, borderRadius: T.radiusSm, overflow: "hidden", border: `1px solid ${T.border}` }}>
                    <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {notes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>Notes History</div>
            <div style={{ padding: 12, background: T.bg, borderRadius: T.radiusSm }}>
              {notes.map((n, i) => (
                <div key={i} style={{ fontSize: 13, color: T.text, marginBottom: 6, paddingBottom: 6, borderBottom: i < notes.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontWeight: 600 }}>{n.by}</span> <span style={{ color: T.dim }}>({n.date})</span>: {n.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {isIntake ? (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: `1px solid ${T.border}` }}>
              {[["review", "Approve / Convert"], ["needsinfo", "Needs Info"], ["reject", "Reject"]].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ ...s.btn("ghost"), background: "transparent", borderRadius: 0, borderBottom: tab === k ? `2px solid ${T.accent}` : "2px solid transparent", color: tab === k ? T.accent : T.text }}>{label}</button>
              ))}
            </div>

            {tab === "review" && (
              <div>
                <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={s.label}>Assign To Staff</label>
                    <select style={{ ...s.mSelect(mobile), width: "100%" }} value={draft.assignedTo} onChange={e => setDraft(d => ({ ...d, assignedTo: e.target.value }))}>
                      <option value="">—</option>
                      {staffOptions.map(m => <option key={m.id} value={m.name}>{m.name}{m.role === "property_manager" ? " (PM)" : m.role === "admin" ? " (Admin)" : " (Maint)"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Or Assign Vendor</label>
                    <select style={{ ...s.mSelect(mobile), width: "100%" }} value={draft.vendorId} onChange={e => setDraft(d => ({ ...d, vendorId: e.target.value }))}>
                      <option value="">—</option>
                      {vendors.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.company} ({v.trade})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Priority</label>
                    <select style={{ ...s.mSelect(mobile), width: "100%" }} value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))}>
                      {["routine", "urgent", "critical"].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Projected Complete</label>
                    <input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={draft.projectedComplete} onChange={e => setDraft(d => ({ ...d, projectedComplete: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={s.label}>Note (optional)</label>
                  <textarea style={{ ...s.input, width: "100%", minHeight: 60, resize: "vertical" }} placeholder="Notes for the work order..." value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
                </div>
                <button style={s.btn("primary")} onClick={handleConvert}>✓ Convert to Work Order</button>
              </div>
            )}

            {tab === "needsinfo" && (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <label style={s.label}>What info do you need from the requester?</label>
                  <textarea style={{ ...s.input, width: "100%", minHeight: 80, resize: "vertical" }} placeholder="e.g. Which bathroom? When does it happen?" value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
                </div>
                <button style={s.btn("primary")} onClick={handleNeedsInfo}>Request More Info</button>
              </div>
            )}

            {tab === "reject" && (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <label style={s.label}>Rejection Reason</label>
                  <textarea style={{ ...s.input, width: "100%", minHeight: 80, resize: "vertical" }} placeholder="Reason for rejecting this request..." value={draft.rejectionReason} onChange={e => setDraft(d => ({ ...d, rejectionReason: e.target.value }))} />
                </div>
                <button style={{ ...s.btn("primary"), background: T.danger }} onClick={handleReject}>Reject Request</button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
              <div>
                <label style={s.label}>Status</label>
                <select style={{ ...s.mSelect(mobile), width: "100%" }} value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
                  <option value="todo">To Do</option>
                  <option value="in-progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Priority</label>
                <select style={{ ...s.mSelect(mobile), width: "100%" }} value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))}>
                  {["routine", "urgent", "critical"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Assigned Staff</label>
                <select style={{ ...s.mSelect(mobile), width: "100%" }} value={draft.assignedTo} onChange={e => setDraft(d => ({ ...d, assignedTo: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {staffOptions.map(m => <option key={m.id} value={m.name}>{m.name}{m.role === "property_manager" ? " (PM)" : m.role === "admin" ? " (Admin)" : " (Maint)"}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Vendor</label>
                <select style={{ ...s.mSelect(mobile), width: "100%" }} value={draft.vendorId} onChange={e => setDraft(d => ({ ...d, vendorId: e.target.value }))}>
                  <option value="">—</option>
                  {vendors.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.company} ({v.trade})</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Projected Complete</label>
                <input type="date" style={{ ...s.mInput(mobile), width: "100%" }} value={draft.projectedComplete} onChange={e => setDraft(d => ({ ...d, projectedComplete: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Add Note</label>
              <textarea style={{ ...s.input, width: "100%", minHeight: 60, resize: "vertical" }} placeholder="Add a note..." value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={s.btn("primary")} onClick={handleUpdate}>Save Changes</button>
              <button style={s.btn("ghost")} onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AdminMaintenance = ({ mobile, maintenance, onUpdate, onAdd, staffMembers = [], vendors = [], profile, pendingOpenId, onClearPendingOpen }) => {
  const maintStaff = staffMembers.filter(s => s.active && (s.role === "maintenance" || s.role === "admin" || s.role === "property_manager")).filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i);
  const staffName = profile?.displayName || profile?.email?.split("@")[0] || null;
  const isMaintStaff = !!(staffName && maintStaff.some(m => m.name === staffName));

  const [topTab, setTopTab] = useState("intake");
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState(isMaintStaff ? "mine" : "all");
  const [createForm, setCreateForm] = useState({ unit: "", category: "Plumbing", priority: "routine", description: "", requesterName: "", assignedTo: "", vendorId: "" });
  const [success, showSuccess] = useSuccess();

  // Re-sync selected row whenever maintenance updates so the modal reflects latest data
  useEffect(() => {
    if (!selected) return;
    const updated = maintenance.find(m => m.id === selected.id);
    if (updated && updated !== selected) setSelected(updated);
  }, [maintenance, selected]);

  // If we arrived here from a dashboard click, open the detail modal for that work order.
  useEffect(() => {
    if (!pendingOpenId) return;
    const row = maintenance.find(m => m.id === pendingOpenId);
    if (row) {
      // Switch to whichever top tab makes the row visible.
      // Status taxonomy: intake = new/needs-info/submitted (legacy),
      // archive = done/rejected/completed, workorders = everything else.
      const isIntake = row.status === "new" || row.status === "needs-info" || row.status === "submitted";
      const isArchive = row.status === "done" || row.status === "rejected" || row.status === "completed";
      setTopTab(isIntake ? "intake" : isArchive ? "archive" : "workorders");
      setSelected(row);
    }
    if (onClearPendingOpen) onClearPendingOpen();
  }, [pendingOpenId, maintenance]);

  // Intake covers new + needs-info, plus legacy "submitted" rows from before the
  // status pipeline expanded so nothing hides from the queue.
  const intakeRows = maintenance.filter(m => m.status === "new" || m.status === "needs-info" || m.status === "submitted");
  const todoRows = maintenance.filter(m => m.status === "todo" || m.status === "in-progress");
  const archiveRows = maintenance.filter(m => m.status === "done" || m.status === "rejected" || m.status === "completed");

  const applyAssignee = (rows) => assigneeFilter === "mine" && staffName ? rows.filter(r => r.assignedTo === staffName) : rows;

  const issueCol = {
    key: "description", label: "Issue",
    render: (v, row) => (
      <div>
        <div style={{ fontWeight: 600, color: T.accent }}>{v}</div>
        <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{row.id} · {row.source === "resident" ? "📨" : "🛠️"}</div>
      </div>
    ),
    sortValue: row => (row.description || "").toLowerCase(),
  };

  const propertyOptions = [...new Set(maintenance.map(m => propertyDisplayName(m.propertyId)))];

  const intakeCols = [
    issueCol,
    { key: "residentName", label: "Requester", render: (v, row) => v || row.requesterName || "—", sortValue: row => (row.residentName || row.requesterName || "").toLowerCase() },
    { key: "propertyId", label: "Property", render: v => propertyDisplayName(v), filterOptions: propertyOptions, filterValue: row => propertyDisplayName(row.propertyId) },
    { key: "unit", label: "Unit" },
    { key: "category", label: "Category", filterOptions: [...new Set(intakeRows.map(m => m.category))] },
    { key: "priority", label: "Priority", render: v => <Badge status={v} type="priority" />, filterOptions: ["critical", "urgent", "routine"], filterValue: row => row.priority },
    { key: "status", label: "Status", render: v => <Badge status={v} />, filterOptions: ["new", "needs-info", "submitted"], filterValue: row => row.status },
    { key: "submitted", label: "Submitted" },
  ];

  const workOrderCols = [
    issueCol,
    { key: "residentName", label: "Requester", render: (v, row) => v || row.requesterName || "—", sortValue: row => (row.residentName || row.requesterName || "").toLowerCase() },
    { key: "propertyId", label: "Property", render: v => propertyDisplayName(v), filterOptions: propertyOptions, filterValue: row => propertyDisplayName(row.propertyId) },
    { key: "unit", label: "Unit" },
    { key: "category", label: "Category", filterOptions: [...new Set(maintenance.map(m => m.category))] },
    { key: "priority", label: "Priority", render: v => <Badge status={v} type="priority" />, filterOptions: ["critical", "urgent", "routine"], filterValue: row => row.priority },
    { key: "status", label: "Status", render: v => <Badge status={v} />, filterOptions: ["todo", "in-progress"], filterValue: row => row.status },
    { key: "assignedTo", label: "Assignee", render: v => v || <span style={{ color: T.danger }}>Unassigned</span>, filterValue: row => row.assignedTo || "Unassigned" },
    { key: "vendorId", label: "Vendor", render: v => vendors.find(x => x.id === v)?.company || "—", filterOptions: [...new Set(vendors.map(v => v.company))], filterValue: row => vendors.find(x => x.id === row.vendorId)?.company || "" },
    { key: "projectedComplete", label: "Projected", render: v => v || "—" },
  ];

  const archiveCols = [
    issueCol,
    { key: "residentName", label: "Requester", render: (v, row) => v || row.requesterName || "—", sortValue: row => (row.residentName || row.requesterName || "").toLowerCase() },
    { key: "propertyId", label: "Property", render: v => propertyDisplayName(v), filterOptions: propertyOptions, filterValue: row => propertyDisplayName(row.propertyId) },
    { key: "unit", label: "Unit" },
    { key: "category", label: "Category", filterOptions: [...new Set(archiveRows.map(m => m.category))] },
    { key: "status", label: "Status", render: v => <Badge status={v} />, filterOptions: ["done", "rejected", "completed"], filterValue: row => row.status },
    { key: "assignedTo", label: "Worked By", render: v => v || <span style={{ color: T.dim }}>—</span> },
    { key: "completedDate", label: "Closed", render: (v, row) => v || row.convertedAt?.slice(0, 10) || "—" },
  ];

  const currentRows = topTab === "intake" ? intakeRows : topTab === "archive" ? applyAssignee(archiveRows) : applyAssignee(todoRows);
  const currentCols = topTab === "intake" ? intakeCols : topTab === "archive" ? archiveCols : workOrderCols;

  const csvExport = () => {
    if (topTab === "intake") {
      generateCSV([
        { label: "Issue", key: "description" }, { label: "Requester", key: "residentName", exportValue: r => r.residentName || r.requesterName || "" },
        { label: "Property", key: "propertyId", exportValue: r => propertyDisplayName(r.propertyId) }, { label: "Unit", key: "unit" },
        { label: "Category", key: "category" }, { label: "Priority", key: "priority" }, { label: "Status", key: "status" }, { label: "Submitted", key: "submitted" }, { label: "ID", key: "id" },
      ], currentRows, "maintenance_intake");
    } else if (topTab === "archive") {
      generateCSV([
        { label: "Issue", key: "description" }, { label: "Requester", key: "residentName", exportValue: r => r.residentName || r.requesterName || "" },
        { label: "Property", key: "propertyId", exportValue: r => propertyDisplayName(r.propertyId) }, { label: "Unit", key: "unit" },
        { label: "Category", key: "category" }, { label: "Status", key: "status" },
        { label: "Worked By", key: "assignedTo", exportValue: r => r.assignedTo || "" },
        { label: "Closed", key: "completedDate" }, { label: "ID", key: "id" },
      ], currentRows, "maintenance_archive");
    } else {
      generateCSV([
        { label: "Issue", key: "description" }, { label: "Requester", key: "residentName", exportValue: r => r.residentName || r.requesterName || "" },
        { label: "Property", key: "propertyId", exportValue: r => propertyDisplayName(r.propertyId) }, { label: "Unit", key: "unit" },
        { label: "Category", key: "category" }, { label: "Priority", key: "priority" }, { label: "Status", key: "status" },
        { label: "Assignee", key: "assignedTo", exportValue: r => r.assignedTo || "Unassigned" },
        { label: "Vendor", key: "vendorId", exportValue: r => vendors.find(v => v.id === r.vendorId)?.company || "" },
        { label: "Projected", key: "projectedComplete" }, { label: "Completed", key: "completedDate" }, { label: "ID", key: "id" },
      ], currentRows, "maintenance_workorders");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div><h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>Maintenance</h1><p style={s.sectionSub}>Triage intake requests and manage work orders</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowCreate(v => !v)} style={{ ...s.btn(showCreate ? "ghost" : "primary"), fontSize: 13 }}>{showCreate ? "Cancel" : "➕ New Work Order"}</button>
          <ExportButton mobile={mobile} onClick={csvExport} />
        </div>
      </div>
      <SuccessMessage message={success} />

      {showCreate && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.warn}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Create Work Order (staff-initiated)</div>
          <div style={{ ...s.grid("1fr 1fr", mobile), gap: 14, marginBottom: 14 }}>
            <div><label style={s.label}>Unit *</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.unit} onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))}>
                <option value="">Select unit...</option>
                {LIVE_RESIDENTS.map(r => <option key={r.id} value={r.unit}>{r.unit} — {r.name}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Requester (optional)</label>
              <input style={{ ...s.mInput(mobile), width: "100%" }} value={createForm.requesterName} onChange={e => setCreateForm(f => ({ ...f, requesterName: e.target.value }))} placeholder="Who reported this?" />
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
            <div><label style={s.label}>Assign To Staff</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.assignedTo} onChange={e => setCreateForm(f => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">Unassigned</option>
                {maintStaff.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Vendor</label>
              <select style={{ ...s.mSelect(mobile), width: "100%" }} value={createForm.vendorId} onChange={e => setCreateForm(f => ({ ...f, vendorId: e.target.value }))}>
                <option value="">—</option>
                {vendors.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.company} ({v.trade})</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={s.label}>Description *</label><textarea style={{ ...s.mInput(mobile), width: "100%", minHeight: 60, resize: "vertical" }} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue..." /></div>
          <button disabled={!createForm.unit || !createForm.description.trim()} onClick={() => {
            const res = LIVE_RESIDENTS.find(r => r.unit === createForm.unit);
            const req = {
              propertyId: res?.propertyId || "",
              unit: createForm.unit,
              category: createForm.category,
              priority: createForm.priority,
              description: createForm.description.trim(),
              source: "staff",
              status: "todo",
              requesterName: createForm.requesterName.trim() || null,
              assignedTo: createForm.assignedTo || null,
              vendorId: createForm.vendorId || null,
              notes: [],
            };
            if (onAdd) onAdd(req);
            showSuccess(`Work order created for unit ${createForm.unit}`);
            setCreateForm({ unit: "", category: "Plumbing", priority: "routine", description: "", requesterName: "", assignedTo: "", vendorId: "" });
            setShowCreate(false);
          }} style={{ ...s.mBtn("primary", mobile) }}>Create Work Order</button>
        </div>
      )}

      {/* Top tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: `1px solid ${T.border}` }}>
        {[
          ["intake", `📥 Intake (${intakeRows.length})`],
          ["workorders", `🔧 Work Orders (${todoRows.length})`],
          ["archive", `📦 Archive (${archiveRows.length})`],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTopTab(k)} style={{ background: "transparent", border: "none", padding: "10px 14px", fontWeight: 600, cursor: "pointer", fontSize: 14, borderBottom: topTab === k ? `2px solid ${T.accent}` : "2px solid transparent", color: topTab === k ? T.accent : T.text }}>{label}</button>
        ))}
      </div>

      {/* Assignee filter for staff on the work orders + archive views */}
      {(topTab === "workorders" || topTab === "archive") && isMaintStaff && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "flex-end" }}>
          <button style={s.btn(assigneeFilter === "mine" ? "primary" : "ghost")} onClick={() => setAssigneeFilter("mine")}>My Orders</button>
          <button style={s.btn(assigneeFilter === "all" ? "primary" : "ghost")} onClick={() => setAssigneeFilter("all")}>All</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: mobile ? 10 : 14, flexWrap: "wrap", marginBottom: 24 }}>
        {topTab === "intake" && (
          <>
            <StatCard label="New" value={maintenance.filter(m => m.status === "new").length} accent={T.warn} mobile={mobile} />
            <StatCard label="Needs Info" value={maintenance.filter(m => m.status === "needs-info").length} accent={T.info} mobile={mobile} />
          </>
        )}
        {topTab === "workorders" && (
          <>
            <StatCard label="To Do" value={maintenance.filter(m => m.status === "todo").length} accent={T.warn} mobile={mobile} />
            <StatCard label="In Progress" value={maintenance.filter(m => m.status === "in-progress").length} accent={T.info} mobile={mobile} />
            <StatCard label="Unassigned" value={maintenance.filter(m => (m.status === "todo" || m.status === "in-progress") && !m.assignedTo && !m.vendorId).length} accent={T.danger} mobile={mobile} />
          </>
        )}
        {topTab === "archive" && (
          <>
            <StatCard label="Done" value={maintenance.filter(m => MAINT_DONE(m)).length} accent={T.success} mobile={mobile} />
            <StatCard label="Rejected" value={maintenance.filter(m => m.status === "rejected").length} accent={T.danger} mobile={mobile} />
            <StatCard label="Total Archived" value={archiveRows.length} accent={T.muted} mobile={mobile} />
          </>
        )}
      </div>

      <div style={s.card}>
        <SortableTable mobile={mobile} columns={currentCols} data={currentRows} onRowClick={setSelected} />
      </div>

      {selected && (
        <MaintenanceDetailModal
          row={selected}
          onClose={() => setSelected(null)}
          onUpdate={(id, changes) => { onUpdate(id, changes); showSuccess("Updated"); }}
          staffMembers={maintStaff}
          vendors={vendors}
          isStaff={isMaintStaff}
          currentUserName={staffName}
          mobile={mobile}
        />
      )}
    </div>
  );
};

// --- ADMIN SETTINGS ---
const AdminSettings = ({ mobile, settings, setSettings, darkMode, setDarkMode, maintenance, vendors, unitInspections, onReset, staffMembers: parentStaffMembers, allUnits: parentAllUnits }) => {
  const tabs = ["Staff", "Property", "Notifications", "Rent & Lease", "Maintenance", "Audit Log", "System"];
  const [tab, setTab] = useState(tabs[0]);
  const [success, showSuccess] = useSuccess();
  const [newCat, setNewCat] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [userProfiles, setUserProfiles] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "maintenance", residentId: "", firstName: "", lastName: "", phone: "", propertyId: "" });
  const [inviting, setInviting] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ firstName: "", lastName: "", role: "maintenance", email: "", phone: "", propertyId: "" });
  const [editingStaff, setEditingStaff] = useState(null);
  const [editStaffForm, setEditStaffForm] = useState({});
  const [settingsPropIdx, setSettingsPropIdx] = useState(0);
  const [householdMembers, setHouseholdMembers] = useState([]);

  // When inviting a resident and a unit is picked, load that household's members
  // so the admin can quick-fill the form from an existing co-resident record.
  useEffect(() => {
    if (inviteForm.role === "resident" && inviteForm.residentId) {
      fetchHouseholdMembers(inviteForm.residentId).then(setHouseholdMembers).catch(() => setHouseholdMembers([]));
    } else {
      setHouseholdMembers([]);
    }
  }, [inviteForm.role, inviteForm.residentId]);

  useEffect(() => {
    if (tab === "Audit Log") {
      setLoadingAudit(true);
      fetchAuditLog(100).then(data => { setAuditEntries(data); setLoadingAudit(false); }).catch(() => setLoadingAudit(false));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "Staff") {
      setLoadingUsers(true);
      fetchUserProfiles()
        .then(data => { setUserProfiles(data || []); setLoadingUsers(false); })
        .catch(err => { console.warn("fetchUserProfiles failed:", err); setLoadingUsers(false); });
      // Also load staff so we can show phone/property/active fields that live there
      fetchStaffMembers().then(data => setStaffList(data || [])).catch(err => console.warn("fetchStaffMembers failed:", err));
    }
  }, [tab]);

  const handleInvite = async () => {
    if (!inviteForm.email) return;
    setInviting(true);
    try {
      const displayName = [inviteForm.firstName, inviteForm.lastName].filter(Boolean).join(" ") || null;
      const userRole = inviteForm.role;
      const result = await inviteUser(inviteForm.email, userRole, inviteForm.residentId || null, displayName);
      // Also create staff record for non-resident roles
      if (inviteForm.role !== "resident" && displayName) {
        try {
          await insertStaffMember({ name: displayName, role: inviteForm.role, email: inviteForm.email, phone: inviteForm.phone || "", propertyId: inviteForm.propertyId || "" });
        } catch (staffErr) { /* staff record is supplementary, don't block */ }
      }
      if (result?.warning) {
        showSuccess(`${displayName || inviteForm.email}: ${result.warning}`);
      } else {
        showSuccess(`${result?.resent ? "Re-sent welcome email to" : "Added and invited"} ${displayName || inviteForm.email}`);
      }
      setInviteForm({ email: "", role: "maintenance", residentId: "", firstName: "", lastName: "", phone: "", propertyId: "" });
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

      {tab === "Staff" && (
        <div>
          <div style={{ ...s.card, borderLeft: `3px solid ${T.accent}` }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>Add Staff Member</div>
            <p style={{ fontSize: 12, color: T.muted, marginTop: 0, marginBottom: 14 }}>
              For admins and maintenance only. To give a resident portal access, open their profile in the Residents section.
            </p>
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
                  <option value="admin">Admin / Property Manager</option>
                  <option value="maintenance">Maintenance Staff</option>
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
            </div>
            <button disabled={!inviteForm.email || !inviteForm.firstName.trim() || !inviteForm.lastName.trim() || inviting} onClick={handleInvite}
              style={{ ...s.mBtn("primary", mobile) }}>
              {inviting ? "Adding..." : "Add User & Send Invite"}
            </button>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>A magic link will be sent to their email so they can sign in.</div>
          </div>

          <div style={s.card}>
            {(() => { const staffOnly = userProfiles.filter(u => u.role !== "resident"); return (<>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Staff Directory ({staffOnly.length})</div>
            {loadingUsers ? (
              <div style={{ color: T.muted, padding: 20, textAlign: "center" }}>Loading...</div>
            ) : staffOnly.length === 0 ? (
              <EmptyState icon="👷" text="No staff yet. Add your first staff member above." />
            ) : (
              <table style={s.table}>
                <thead><tr>{["Name", "Email", "Role", "Property", "Phone", "Active", "Actions"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {staffOnly.map(u => {
                    // Match this person to their staff_members row (if any) by email
                    const emailLc = (u.email || "").toLowerCase();
                    const staffRow = staffList.find(s2 => (s2.email || "").toLowerCase() === emailLc) || null;
                    const isEditing = editingStaff === u.id;
                    if (isEditing) {
                      return (
                        <tr key={u.id} style={{ background: T.accentDim }}>
                          <td style={s.td}><input value={editStaffForm.name || ""} onChange={e => setEditStaffForm(f => ({ ...f, name: e.target.value }))} style={{ ...s.input, padding: "4px 6px", fontSize: 13, width: "100%" }} /></td>
                          <td style={s.td}><span style={{ fontSize: 12, color: T.muted }}>{u.email}</span></td>
                          <td style={s.td}>
                            <select value={editStaffForm.role || u.role} onChange={e => setEditStaffForm(f => ({ ...f, role: e.target.value }))} style={{ ...s.select, fontSize: 12, padding: "2px 6px" }}>
                              <option value="admin">Admin</option>
                              <option value="maintenance">Maintenance</option>
                            </select>
                          </td>
                          <td style={s.td}>
                            <select value={editStaffForm.propertyId || ""} onChange={e => setEditStaffForm(f => ({ ...f, propertyId: e.target.value }))} style={{ ...s.select, fontSize: 12, padding: "2px 6px" }}>
                              <option value="">All</option>
                              {LIVE_PROPERTIES.map(p => <option key={p._uuid || p.id} value={p._uuid || p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td style={s.td}><input value={editStaffForm.phone || ""} onChange={e => setEditStaffForm(f => ({ ...f, phone: e.target.value }))} placeholder="(415) 555-0000" style={{ ...s.input, padding: "4px 6px", fontSize: 13, width: "100%" }} /></td>
                          <td style={s.td}>
                            <Toggle checked={editStaffForm.active !== false} onChange={() => setEditStaffForm(f => ({ ...f, active: f.active === false }))} />
                          </td>
                          <td style={s.td}>
                            <button style={{ ...s.btn("primary"), fontSize: 12, padding: "2px 8px", marginRight: 4 }} onClick={async () => {
                              try {
                                // 1. Update user_profile (name + role)
                                const newName = (editStaffForm.name || "").trim();
                                const profileChanges = {};
                                if (newName && newName !== u.display_name) profileChanges.display_name = newName;
                                if (editStaffForm.role && editStaffForm.role !== u.role) profileChanges.role = editStaffForm.role;
                                if (Object.keys(profileChanges).length > 0) {
                                  await updateUserProfile(u.id, profileChanges);
                                }
                                // 2. Sync staff_members row for staff roles
                                const newRole = editStaffForm.role || u.role;
                                const isStaffNow = newRole === "admin" || newRole === "maintenance" || newRole === "property_manager";
                                if (isStaffNow) {
                                  const staffChanges = {
                                    name: newName || u.display_name || u.email,
                                    role: newRole,
                                    email: u.email,
                                    phone: editStaffForm.phone || null,
                                    propertyId: editStaffForm.propertyId || null,
                                    active: editStaffForm.active !== false,
                                  };
                                  if (staffRow) {
                                    await updateStaffMember(staffRow.id, staffChanges);
                                    setStaffList(prev => prev.map(s2 => s2.id === staffRow.id ? { ...s2, ...staffChanges } : s2));
                                  } else {
                                    const created = await insertStaffMember(staffChanges);
                                    setStaffList(prev => [created, ...prev]);
                                  }
                                } else if (staffRow) {
                                  // Demoted to resident — remove the staff row
                                  await deleteStaffMember(staffRow.id);
                                  setStaffList(prev => prev.filter(s2 => s2.id !== staffRow.id));
                                }
                                setUserProfiles(prev => prev.map(p => p.id === u.id ? { ...p, display_name: newName || p.display_name, role: newRole } : p));
                                setEditingStaff(null);
                                showSuccess(`${newName || u.email} updated`);
                              } catch (err) { showSuccess("Error: " + (err.message || "Update failed")); }
                            }}>Save</button>
                            <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "2px 8px" }} onClick={() => setEditingStaff(null)}>Cancel</button>
                          </td>
                        </tr>
                      );
                    }
                    const phone = staffRow?.phone || u.phone || "—";
                    const propertyName = staffRow?.propertyName || u.property_name || "All";
                    const active = staffRow ? (staffRow.active !== false) : true;
                    const roleLabel = u.role === "property_manager" ? "PM" : u.role === "admin" ? "Admin" : u.role === "maintenance" ? "Maint" : "Resident";
                    return (
                    <tr key={u.id} style={{ opacity: active ? 1 : 0.55 }}>
                      <td style={s.td}><span style={{ fontWeight: 600 }}>{u.display_name || "—"}</span></td>
                      <td style={s.td}>{u.email}</td>
                      <td style={s.td}>
                        <span style={s.badge(u.role === "admin" ? T.accentDim : u.role === "property_manager" ? T.infoDim : u.role === "maintenance" ? T.warnDim : T.successDim, u.role === "admin" ? T.accent : u.role === "property_manager" ? T.info : u.role === "maintenance" ? T.warn : T.success)}>{roleLabel}</span>
                      </td>
                      <td style={s.td}><span style={{ fontSize: 12 }}>{propertyName}</span></td>
                      <td style={s.td}><span style={{ fontSize: 12 }}>{phone}</span></td>
                      <td style={s.td}>
                        <span style={s.badge(active ? T.successDim : T.dangerDim, active ? T.success : T.danger)}>{active ? "Yes" : "No"}</span>
                      </td>
                      <td style={s.td}>
                        <button style={{ ...s.btn("ghost"), fontSize: 12, padding: "2px 8px", marginRight: 4 }} onClick={() => {
                          setEditingStaff(u.id);
                          setEditStaffForm({
                            name: u.display_name || "",
                            role: u.role,
                            phone: staffRow?.phone || "",
                            propertyId: staffRow?.propertyId || "",
                            active: staffRow ? staffRow.active : true,
                          });
                        }}>Edit</button>
                        <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 12, padding: "2px 8px" }} onClick={async () => {
                          if (!confirm(`Remove ${u.email}? They will no longer be able to sign in or be assigned work orders.`)) return;
                          try {
                            await deleteUserProfile(u.id);
                            if (staffRow) {
                              try { await deleteStaffMember(staffRow.id); } catch (e) { /* non-blocking */ }
                              setStaffList(prev => prev.filter(s2 => s2.id !== staffRow.id));
                            }
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
            </>); })()}
          </div>

          {/* Orphaned staff_members — directory entries with no portal user.
              Surfaced here so admins can clean up legacy / test rows that
              still appear in the maintenance assignee dropdowns. */}
          {(() => {
            const userEmails = new Set(userProfiles.map(u => (u.email || "").toLowerCase()).filter(Boolean));
            const orphans = staffList.filter(s => !s.email || !userEmails.has((s.email || "").toLowerCase()));
            if (orphans.length === 0) return null;
            return (
              <div style={{ ...s.card, borderLeft: `3px solid ${T.warn}` }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>Directory-Only Staff Records ({orphans.length})</div>
                <p style={{ fontSize: 12, color: T.muted, marginTop: 0, marginBottom: 14 }}>
                  These staff entries don't have a portal login. They show up in maintenance assignee dropdowns — remove any that are stale or test rows.
                </p>
                <table style={s.table}>
                  <thead><tr>{["Name", "Role", "Email", "Phone", "Property", "Active", "Actions"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {orphans.map(st => (
                      <tr key={st.id} style={{ opacity: st.active === false ? 0.55 : 1 }}>
                        <td style={s.td}><span style={{ fontWeight: 600 }}>{st.name}</span></td>
                        <td style={s.td}><span style={s.badge(st.role === "admin" ? T.accentDim : st.role === "property_manager" ? T.infoDim : T.warnDim, st.role === "admin" ? T.accent : st.role === "property_manager" ? T.info : T.warn)}>{st.role === "property_manager" ? "PM" : st.role === "admin" ? "Admin" : "Maint"}</span></td>
                        <td style={s.td}><span style={{ fontSize: 12 }}>{st.email || "—"}</span></td>
                        <td style={s.td}><span style={{ fontSize: 12 }}>{st.phone || "—"}</span></td>
                        <td style={s.td}><span style={{ fontSize: 12 }}>{st.propertyName || "All"}</span></td>
                        <td style={s.td}><span style={s.badge(st.active !== false ? T.successDim : T.dangerDim, st.active !== false ? T.success : T.danger)}>{st.active !== false ? "Yes" : "No"}</span></td>
                        <td style={s.td}>
                          <button style={{ ...s.btn("ghost"), color: T.danger, fontSize: 12, padding: "2px 8px" }} onClick={async () => {
                            if (!confirm(`Remove "${st.name}" from the staff directory?`)) return;
                            try {
                              await deleteStaffMember(st.id);
                              setStaffList(prev => prev.filter(s2 => s2.id !== st.id));
                              showSuccess(`${st.name} removed`);
                            } catch (err) { showSuccess("Error: " + err.message); }
                          }}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {tab === "Property" && (
        <div>
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Property Information</div>
              {LIVE_PROPERTIES.length > 1 && (
                <select style={{ ...s.select, fontSize: 13, padding: "6px 10px" }} value={settingsPropIdx} onChange={e => setSettingsPropIdx(Number(e.target.value))}>
                  {LIVE_PROPERTIES.map((p, i) => <option key={p._uuid || i} value={i}>{p.name}</option>)}
                </select>
              )}
            </div>
            {(() => {
              const prop = LIVE_PROPERTIES[settingsPropIdx] || LIVE_PROPERTIES[0] || {};
              return (
                <>
                  <DetailRow label="Property Name" value={prop.name || "—"} />
                  <DetailRow label="Address" value={prop.address || "—"} />
                  <DetailRow label="Type" value={prop.type || "—"} />
                  <DetailRow label="Year Built" value={prop.yearBuilt || "—"} />
                  <DetailRow label="Total Units" value={prop.totalUnits || 0} />
                </>
              );
            })()}
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Management Contact</div>
            {(() => {
              const allStaff = (parentStaffMembers || staffList || []).filter(st => st.active);
              const selectedStaff = allStaff.find(st => st.name === settings.property.manager);
              return (
                <div style={{ ...s.grid("1fr 1fr", mobile), marginBottom: 14 }}>
                  <div>
                    <label style={s.label}>Manager</label>
                    <select style={{ ...s.mSelect(mobile), width: "100%" }} value={settings.property.manager || ""} onChange={e => {
                      const staff = allStaff.find(st => st.name === e.target.value);
                      if (staff) {
                        setSettings(p => ({ ...p, property: { ...p.property, manager: staff.name, managerPhone: staff.phone || p.property.managerPhone, managerEmail: staff.email || p.property.managerEmail } }));
                      } else {
                        upd("property", "manager", e.target.value);
                      }
                    }}>
                      <option value="">Select staff member...</option>
                      {allStaff.map(st => <option key={st.id} value={st.name}>{st.name} — {st.role === "property_manager" ? "Property Manager" : st.role === "admin" ? "Admin" : "Maintenance"}</option>)}
                    </select>
                  </div>
                  <div><label style={s.label}>Phone</label><input value={settings.property.managerPhone} readOnly style={{ ...s.mInput(mobile), background: T.bg, color: T.muted }} /></div>
                  <div><label style={s.label}>Email</label><input value={settings.property.managerEmail} readOnly style={{ ...s.mInput(mobile), background: T.bg, color: T.muted }} /></div>
                  <div><label style={s.label}>Office Hours</label><input style={s.mInput(mobile)} value={settings.property.officeHours} onChange={e => upd("property", "officeHours", e.target.value)} /></div>
                </div>
              );
            })()}
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

          {/* QR Codes for Units */}
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Unit QR Codes</div>
                <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Generate QR codes for each unit so residents can access the portal</p>
              </div>
              <button style={s.btn()} onClick={() => {
                const printWindow = window.open("", "_blank");
                const baseUrl = window.location.origin + window.location.pathname;
                let html = `<html><head><title>BCLT HomeBase — Unit QR Codes</title><style>
                  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }
                  .qr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; }
                  .qr-card { text-align: center; border: 2px solid #e0e0e0; border-radius: 12px; padding: 20px; page-break-inside: avoid; }
                  .qr-card h3 { margin: 0 0 4px; font-size: 16px; }
                  .qr-card p { margin: 0 0 12px; color: #666; font-size: 12px; }
                  .qr-card .url { font-size: 10px; color: #999; margin-top: 8px; word-break: break-all; }
                  @media print { .no-print { display: none; } .qr-grid { gap: 20px; } }
                </style></head><body>
                <h1>BCLT HomeBase — Unit QR Codes</h1>
                <p class="no-print">Print this page or save as PDF. Each resident can scan their unit's code to access the portal.</p>
                <button class="no-print" onclick="window.print()" style="padding:8px 20px;margin:10px 0 20px;font-size:14px;cursor:pointer;">Print All</button>
                <div class="qr-grid">`;
                const allUnits = (parentAllUnits || []).map(u => ({
                  unit: u.number,
                  property: u.propertyName || "—",
                  id: u._uuid || u.id,
                }));
                allUnits.forEach(u => {
                  const url = baseUrl + "?maintenance=" + encodeURIComponent(u.unit);
                  const canvas = document.createElement("canvas");
                  const size = 180;
                  // Use a simple inline QR generation via the existing QRCodeCanvas
                  const qrEl = document.getElementById("qr-gen-" + CSS.escape(u.unit));
                  const dataUrl = qrEl ? qrEl.toDataURL() : "";
                  html += `<div class="qr-card">
                    <h3>${u.property} — Unit ${u.unit}</h3>
                    <img src="${dataUrl}" width="180" height="180" />
                    <div class="url">${url}</div>
                  </div>`;
                });
                html += `</div></body></html>`;
                printWindow.document.write(html);
                printWindow.document.close();
              }}>🖨️ Print All QR Codes</button>
            </div>
            {(() => {
              const allUnits = (parentAllUnits || []).map(u => ({
                unit: u.number,
                property: u.propertyName || "—",
                id: u._uuid || u.id,
              }));
              const baseUrl = window.location.origin + window.location.pathname;
              if (allUnits.length === 0) return <EmptyState icon="📱" text="No units found. Add properties and units first." />;
              return (
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3, 1fr)", gap: 16 }}>
                  {allUnits.map(u => {
                    const url = baseUrl + "?maintenance=" + encodeURIComponent(u.unit);
                    return (
                      <div key={u.unit + u.property} style={{ textAlign: "center", border: `2px solid ${T.border}`, borderRadius: T.radius, padding: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{u.property} — Unit {u.unit}</div>
                        <QRCodeCanvas
                          id={"qr-gen-" + u.unit}
                          value={url}
                          size={160}
                          level="M"
                          includeMargin
                          style={{ borderRadius: 8 }}
                        />
                        <div style={{ fontSize: 10, color: T.dim, marginTop: 8, wordBreak: "break-all" }}>{url}</div>
                        <button style={{ ...s.btn("ghost"), fontSize: 11, marginTop: 8 }} onClick={() => {
                          const canvas = document.getElementById("qr-gen-" + CSS.escape(u.unit));
                          if (canvas) {
                            const link = document.createElement("a");
                            link.download = `QR-${(u.property || "Property").replace(/\s+/g, "_")}-Unit_${u.unit}.png`;
                            link.href = canvas.toDataURL();
                            link.click();
                          }
                        }}>Download PNG</button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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

          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>New-Request SMS Notifications</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Each phone number here gets a text whenever a resident submits a maintenance request. US numbers; +1 is added automatically if missing.</div>
            {(settings.maint.notifyPhones || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {(settings.maint.notifyPhones || []).map((phone, i) => (
                  <span key={i} style={{ ...s.badge(T.accentDim, T.accent), display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px" }}>
                    {phone}
                    <button onClick={() => upd("maint", "notifyPhones", settings.maint.notifyPhones.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...s.mInput(mobile), flex: 1 }} placeholder="(415) 555-0123" id="new-notify-phone" onKeyDown={e => {
                if (e.key === "Enter" && e.target.value.trim()) {
                  const list = settings.maint.notifyPhones || [];
                  if (!list.includes(e.target.value.trim())) upd("maint", "notifyPhones", [...list, e.target.value.trim()]);
                  e.target.value = "";
                }
              }} />
              <button style={s.btn()} onClick={() => {
                const input = document.getElementById("new-notify-phone");
                const val = input?.value?.trim();
                if (val) {
                  const list = settings.maint.notifyPhones || [];
                  if (!list.includes(val)) upd("maint", "notifyPhones", [...list, val]);
                  if (input) input.value = "";
                }
              }}>Add Phone</button>
            </div>
            {(settings.maint.notifyPhones || []).length === 0 && (
              <div style={{ fontSize: 12, color: T.dim, marginTop: 10, fontStyle: "italic" }}>No numbers yet — new requests won't trigger SMS until you add one.</div>
            )}
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
const buildCalendarEvents = (maintenance, vendors, unitInspections, threads = [], certs = []) => {
  const events = [];
  const add = (date, type, icon, color, label, description, sourcePage) => {
    if (date) events.push({ date: date.slice(0, 10), type, icon, color, label, description, sourcePage });
  };
  // Regulatory inspections — show BOTH the scheduled date and the next-due date
  LIVE_REG_INSPECTIONS.forEach(i => {
    const propName = (LIVE_PROPERTIES.find(p => p.id === i.propertyId)?.name) || i.propertyId || "";
    const detail = `${i.authority || i.type}${propName ? ` · ${propName}` : ""}${i.timeWindow ? ` · ${i.timeWindow}` : ""}`;
    if (i.date && i.result === "Scheduled") add(i.date, "inspection", "📋", T.info, `${i.type} Inspection`, detail, "inspections");
    if (i.nextDue) add(i.nextDue, "inspection", "🔍", T.info, `${i.type} Next Due`, detail, "inspections");
  });
  // Unit inspections
  unitInspections.forEach(i => {
    const desc = `${i.result || "Scheduled"}${i.score ? ` (${i.score})` : ""}${i.inspector ? ` — ${i.inspector}` : ""}${i.timeWindow ? ` · ${i.timeWindow}` : ""}`;
    add(i.date, "inspection", "🔍", T.accent, `${i.category} — ${i.unit}`, desc, "inspections");
  });
  // Maintenance
  maintenance.forEach(m => {
    add(m.submitted, "maintenance", "🔧", T.warn, `Submitted: ${m.description?.slice(0, 60) || m.category}`, `${m.category}${m.unit ? ` — Unit ${m.unit}` : ""}`, "maintenance");
    if (m.projectedComplete) add(m.projectedComplete, "maintenance", "🔧", T.warn, `Target Complete: ${m.description?.slice(0, 60) || m.category}`, `${m.category}${m.unit ? ` — Unit ${m.unit}` : ""}`, "maintenance");
  });
  // Income certification deadlines + effective dates
  (certs || []).forEach(c => {
    const who = c.residentName ? `${c.residentName}${c.unit ? ` (Unit ${c.unit})` : ""}` : "Resident";
    if (c.deadline && c.status !== "approved" && c.status !== "rejected") {
      add(c.deadline, "recert", "📋", T.danger, `Cert deadline: ${who}`, `${(c.status || "draft").replace("_", " ")}`, "recert");
    }
    if (c.status === "approved" && c.effectiveDate) {
      add(c.effectiveDate, "recert", "📋", T.success, `Cert effective: ${who}`, `Approved`, "recert");
    }
  });
  // Lease expiries (from residents extended)
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
  (threads || []).filter(t => t.type === "broadcast").forEach(t => {
    const match = t.subject?.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
    let d = (t.lastDate || "").slice(0, 10);
    if (match) {
      const mi = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(match[1].toLowerCase());
      const yr = new Date().getFullYear();
      d = `${yr}-${String(mi + 1).padStart(2, "0")}-${String(parseInt(match[2])).padStart(2, "0")}`;
    }
    if (d) add(d, "community", "💬", T.success, t.subject, (t.lastMessage || "").slice(0, 60), "communications");
  });
  return events;
};

// --- CALENDAR VIEW ---
const CalendarView = ({ mobile, maintenance, vendors, unitInspections, onNavigate, threads = [], certs: certsProp }) => {
  const tabs = ["Calendar", "Upcoming"];
  const [tab, setTab] = useState(tabs[0]);
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(null);
  // Income certs aren't held at App-level state, so fetch them here if not provided
  const [localCerts, setLocalCerts] = useState([]);
  useEffect(() => {
    if (certsProp) { setLocalCerts(certsProp); return; }
    fetchIncomeCertifications().then(c => setLocalCerts(c || [])).catch(() => {});
  }, [certsProp]);
  const certs = certsProp || localCerts;

  const allEvents = buildCalendarEvents(maintenance, vendors, unitInspections, threads, certs);
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
  const revenueData = filterByProperty([], selectedProperty);
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
const MaintenanceProfile = ({ mobile, profile, staffMembers = [] }) => {
  const [onDuty, setOnDuty] = useState(true);
  // Match the logged-in user to their staff_members row by email (case-insensitive)
  const email = (profile?.email || "").toLowerCase();
  const staffRecord = staffMembers.find(s => (s.email || "").toLowerCase() === email) || null;
  const name = staffRecord?.name || profile?.displayName || profile?.email || "—";
  const role = staffRecord?.role || profile?.role || "maintenance";
  const roleLabel = role === "admin" ? "Administrator" : role === "property_manager" ? "Property Manager" : role === "maintenance" ? "Maintenance Technician" : role;
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div>
      <h1 style={{ ...s.sectionTitle, fontSize: mobile ? 18 : 22 }}>My Profile</h1>
      <p style={s.sectionSub}>Staff information and availability</p>
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22, color: T.accent }}>{initials}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
            <div style={{ color: T.muted, fontSize: 14 }}>{roleLabel}</div>
          </div>
        </div>
        <DetailRow label="Phone" value={staffRecord?.phone || "—"} />
        <DetailRow label="Email" value={staffRecord?.email || profile?.email || "—"} />
        {staffRecord?.propertyName && <DetailRow label="Assigned Property" value={staffRecord.propertyName} />}
        <DetailRow label="Status" value={staffRecord?.active === false ? "Inactive" : "Active"} />
      </div>
      <div style={s.card}>
        <Toggle label="On Duty" checked={onDuty} onChange={() => setOnDuty(d => !d)} description={onDuty ? "Available for work order assignments" : "Off duty — not receiving assignments"} />
      </div>
      {!staffRecord && (
        <div style={{ ...s.card, borderLeft: `3px solid ${T.warn}`, background: T.warnDim }}>
          <div style={{ fontSize: 13, color: T.text }}>
            <strong>No staff record found for this account.</strong> Ask an admin to add you under Settings → Staff with the email <code>{profile?.email}</code> so your phone and assigned property show up here.
          </div>
        </div>
      )}
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
  const [records, setRecords] = useState(initialRecords || DEFAULT_ONBOARDING);
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
        <div style={{ fontSize: 28, fontWeight: 800, color: T.accent, marginBottom: 4 }}>BCLT HomeBase</div>
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

// ── PUBLIC MAINTENANCE REQUEST FORM (no auth) ─────────────

const PublicMaintenanceForm = ({ unitId, mobile, themeVars }) => {
  const [form, setForm] = useState({ name: "", phone: "", email: "", category: "General", priority: "routine", description: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [unitInfo, setUnitInfo] = useState(null);

  useEffect(() => {
    // Look up unit info from Supabase
    (async () => {
      try {
        const { data } = await supabase.from("units").select("*, properties(name)").or(`id.eq.${unitId},number.eq.${unitId}`).limit(1).single();
        if (data) setUnitInfo(data);
      } catch (e) {
        // Try by number match
        try {
          const { data } = await supabase.from("units").select("*, properties(name)").eq("number", unitId).limit(1).single();
          if (data) setUnitInfo(data);
        } catch (e2) { console.warn("Unit lookup failed"); }
      }
    })();
  }, [unitId]);

  const handleSubmit = async () => {
    if (!form.description.trim()) { setError("Please describe the issue"); return; }
    setSubmitting(true);
    setError("");
    try {
      const requestId = `MR-${Date.now().toString().slice(-4)}`;
      await insertMaintenanceRequest({
        id: requestId,
        unit: unitInfo?.number || unitId,
        category: form.category,
        priority: form.priority,
        description: form.description.trim(),
        status: "submitted",
        date: new Date().toISOString().split("T")[0],
        assignedTo: "",
        notes: form.name ? `Submitted by: ${form.name}${form.phone ? ` | Phone: ${form.phone}` : ""}${form.email ? ` | Email: ${form.email}` : ""}` : "",
        source: "qr_code",
      });
      setSubmitted(true);
    } catch (err) {
      setError("Failed to submit: " + (err.message || "Please try again"));
    } finally {
      setSubmitting(false);
    }
  };

  const cardStyle = { background: "#fff", borderRadius: 12, padding: mobile ? 20 : 28, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", marginBottom: 16 };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" };

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f7f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ ...cardStyle, maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>Request Submitted!</h2>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>Your maintenance request for <strong>{unitInfo?.number || unitId}</strong> has been received. Our team will review it and get back to you.</p>
          <button onClick={() => { setSubmitted(false); setForm({ name: "", phone: "", email: "", category: "General", priority: "routine", description: "" }); }}
            style={{ padding: "10px 24px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7f9", padding: mobile ? "20px 16px" : "40px 20px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#2563eb", marginBottom: 4 }}>BCLT HomeBase</div>
          <h1 style={{ margin: "0 0 4px", fontSize: mobile ? 22 : 26 }}>Maintenance Request</h1>
          {unitInfo && <p style={{ color: "#666", fontSize: 14, margin: 0 }}>{unitInfo.properties?.name || ""} — Unit {unitInfo.number}</p>}
          {!unitInfo && <p style={{ color: "#666", fontSize: 14, margin: 0 }}>Unit: {unitId}</p>}
        </div>

        <div style={cardStyle}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Your Name</label>
            <input style={inputStyle} placeholder="Optional" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} placeholder="Optional" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" style={inputStyle} placeholder="Optional" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Category *</label>
              <select style={inputStyle} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                <option>General</option>
                <option>Plumbing</option>
                <option>Electrical</option>
                <option>HVAC</option>
                <option>Appliance</option>
                <option>Structural</option>
                <option>Pest Control</option>
                <option>Exterior</option>
                <option>Safety</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select style={inputStyle} value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Describe the Issue *</label>
            <textarea style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} placeholder="Please describe the maintenance issue in detail..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          {error && <div style={{ padding: 10, background: "#fee2e2", color: "#dc2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
          <button disabled={submitting} onClick={handleSubmit}
            style={{ width: "100%", padding: 14, background: submitting ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </div>
        <p style={{ textAlign: "center", fontSize: 12, color: "#999" }}>Bolinas Community Land Trust • Resident Portal</p>
      </div>
    </div>
  );
};

// ── MAIN APP ───────────────────────────────────────────────

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const actualRole = profile?.role || "resident";
  // Admins can "View As" another role for testing. Persist across reloads.
  const [viewAsRole, setViewAsRole] = useState(() => localStorage.getItem("bclt_viewAsRole") || null);
  const [viewAsResident, setViewAsResident] = useState(() => localStorage.getItem("bclt_viewAsResident") || null);
  useEffect(() => {
    if (viewAsRole) localStorage.setItem("bclt_viewAsRole", viewAsRole); else localStorage.removeItem("bclt_viewAsRole");
  }, [viewAsRole]);
  useEffect(() => {
    if (viewAsResident) localStorage.setItem("bclt_viewAsResident", viewAsResident); else localStorage.removeItem("bclt_viewAsResident");
  }, [viewAsResident]);
  const role = actualRole === "admin" && viewAsRole ? viewAsRole : actualRole;
  // Page state is synced with the URL hash so the browser Back/Forward
  // buttons navigate the portal like a traditional website. Initial value
  // comes from the current hash (if any) so deep-links also work.
  const [page, setPageState] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    const h = window.location.hash.replace(/^#/, "").trim();
    return h || "dashboard";
  });
  const setPage = useCallback((id) => {
    setPageState(id);
    if (typeof window !== "undefined") {
      const target = `#${id}`;
      if (window.location.hash !== target) {
        // pushState (not replaceState) so each navigation becomes a back-button entry
        window.history.pushState({ page: id }, "", target);
      }
    }
  }, []);
  // Listen for browser back/forward — sync the page state to whatever hash is now active.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const h = window.location.hash.replace(/^#/, "").trim();
      setPageState(h || "dashboard");
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);
  const [commPrefs, setCommPrefs] = useState(DEFAULT_COMM_PREFS);
  const [leaseDocs, setLeaseDocs] = useState(DEFAULT_LEASE_DOCS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [maintenance, setMaintenance] = useState([]);
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [unitInspections, setUnitInspections] = useState([]);
  const [allUnits, setAllUnits] = useState([]);
  const [savedChecklists, setSavedChecklists] = useState([]);
  const [inspectionTemplates, setInspectionTemplates] = useState([]);
  // Load custom templates once after auth — fetchInspectionTemplates returns
  // [] gracefully if the table doesn't exist yet, so the app keeps working
  // even before the SQL migration is run.
  useEffect(() => { if (profile) fetchInspectionTemplates().then(t => setInspectionTemplates(t || [])).catch(() => {}); }, [profile]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [emergencyContacts, setEmergencyContacts] = useState({});
  const [adminNotes, setAdminNotes] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [notifReadAt, setNotifReadAt] = useState({ resident: "2026-03-10T00:00:00", admin: "2026-03-12T00:00:00", maintenance: "2026-03-12T00:00:00" });
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  // Settings persisted to localStorage so admin tweaks survive reloads. Merged
  // with DEFAULT_SETTINGS so new fields added later (like maint.notifyPhones)
  // always have a value even on existing browsers.
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem("bclt_settings");
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        maint: { ...DEFAULT_SETTINGS.maint, ...(parsed.maint || {}) },
        property: { ...DEFAULT_SETTINGS.property, ...(parsed.property || {}) },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.notifications || {}) },
        rent: { ...DEFAULT_SETTINGS.rent, ...(parsed.rent || {}) },
      };
    } catch { return DEFAULT_SETTINGS; }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem("bclt_settings", JSON.stringify(settings)); } catch {}
  }, [settings]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [pendingResidentView, setPendingResidentView] = useState(null);
  const [pendingMaintenanceId, setPendingMaintenanceId] = useState(null);
  const [sbProperties, setSbProperties] = useState(null);
  const [sbResidents, setSbResidents] = useState(null);
  const [sbResidentsExt, setSbResidentsExt] = useState(null);
  const [sbRentLedger, setSbRentLedger] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
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
      setDataVersion(v => v + 1);
    } catch (err) {
      console.warn('Supabase load failed:', err);
      setDataReady(true);
    }
  }, []);

  // H6 fix: Removed standalone reloadData() on mount.
  // Data is loaded after auth succeeds inside loadProfile via reloadData().

  // Auto-poll threads & messages every 30s so inbound email replies appear
  // without requiring the user to reload. Only runs once authenticated.
  useEffect(() => {
    if (!profile) return;
    const tick = async () => {
      try {
        const [thr, msgs] = await Promise.all([fetchThreads(), fetchMessages()]);
        if (thr) setThreads(thr);
        if (msgs) setMessages(msgs);
      } catch (err) { /* silent — next tick will retry */ }
    };
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [profile]);

  // Auth: check session on mount, listen for changes
  useEffect(() => {
    const loadProfile = async (user) => {
      setAuthUser(user);
      // Try up to 3 times with a small delay — handles race condition
      // where auth.uid() isn't available in the RPC on first attempt
      for (let attempt = 0; attempt < 3; attempt++) {
        const p = await fetchProfile(user.id, user.email);
        if (p) {
          setProfile(p);
          reloadData(); // Reload data now that we're authenticated
          return;
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
      console.warn('Profile load failed after 3 attempts for', user.email);
    };

    // L2 fix: Removed getCurrentSession() — onAuthStateChange with
    // INITIAL_SESSION event handles existing sessions, avoiding double loadProfile.
    const { data: { subscription } } = onAuthStateChange(session => {
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setAuthUser(null);
        setProfile(null);
      }
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Resident context — derived from profile for logged-in residents, or from View As for admins
  const residentCtx = (() => {
    if (role !== "resident") return null;
    // Admin viewing as a specific resident
    if (actualRole === "admin" && viewAsRole === "resident" && viewAsResident) {
      const r = LIVE_RESIDENTS.find(x => x.id === viewAsResident || x._uuid === viewAsResident || x.slug === viewAsResident);
      if (r) return { id: r.id, name: r.name, firstName: r.name?.split(" ")[0], unit: r.unit, propertyId: r.propertyId, email: r.email, phone: r.phone };
    }
    if (profile?.role === "resident" && profile.residentSlug) {
      return { id: profile.residentSlug, name: profile.residentName, firstName: profile.residentName?.split(" ")[0], unit: profile.unit, propertyId: profile.propertySlug };
    }
    // Resident not linked to a resident record — show minimal context
    return { id: "", name: profile?.displayName || "Resident", firstName: profile?.displayName?.split(" ")[0] || "Resident", unit: "—", propertyId: "" };
  })();

  // Note: LIVE_PROPERTIES / LIVE_RESIDENTS / LIVE_RESIDENTS_EXTENDED are module-level
  // bindings updated by the Supabase useEffect above. All components read from those.

  const themeVars = Object.fromEntries(
    Object.entries(THEMES[darkMode ? "dark" : "light"]).map(([k, v]) => [`--t-${k}`, v])
  );

  // Base mutation callbacks
  const addMaintenance = async (req) => {
    const optimistic = {
      ...req,
      id: req.id || `MR-pending-${Date.now()}`,
      status: req.status || (req.source === "staff" ? "todo" : "new"),
      source: req.source || "resident",
      submitted: req.submitted || new Date().toISOString().slice(0, 10),
      notes: req.notes || [],
    };
    setMaintenance(prev => [optimistic, ...prev]);
    try {
      const saved = await insertMaintenanceRequest({
        unit: req.unit, category: req.category, priority: req.priority, description: req.description,
        propertySlug: req.propertyId, source: req.source, requesterName: req.requesterName,
        assignedTo: req.assignedTo, vendorId: req.vendorId, status: req.status, photos: req.photos,
      });
      if (saved?.code) setMaintenance(prev => prev.map(m => m.id === optimistic.id ? { ...optimistic, id: saved.code } : m));
    } catch (err) { console.warn('Supabase insert maintenance failed:', err); }
  };
  const updateMaintenance = async (id, changes) => {
    const prev = maintenance;
    setMaintenance(p => p.map(m => m.id === id ? { ...m, ...changes } : m));
    try {
      await updateMaintenanceRequest(id, changes);
    } catch (err) { setMaintenance(prev); showSuccess('Error updating request: ' + err.message); }
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
    const prev = threads;
    setThreads(p => p.map(t => t.id === id ? { ...t, ...changes } : t));
    try { await updateThreadDb(id, changes); } catch (err) { setThreads(prev); showSuccess('Error updating thread: ' + err.message); }
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
    const prev = unitInspections;
    setUnitInspections(p => p.map(i => i.id === id ? { ...i, ...changes } : i));
    try { await updateUnitInspection(id, changes); } catch (err) { setUnitInspections(prev); showSuccess('Error updating inspection: ' + err.message); }
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
      LIVE_PROPERTIES = props || []; LIVE_RESIDENTS = res || []; LIVE_RESIDENTS_EXTENDED = resExt || {};
      LIVE_RENT_LEDGER = ledger || [];
      LIVE_REG_INSPECTIONS = rInsp || [];
      LIVE_COMPLIANCE_DOCS = compDocs || [];
      setSbProperties(props || []); setSbResidents(res || []); setSbResidentsExt(resExt || {}); setSbRentLedger(ledger || []); setLeaseDocs(docs || {});
      setMaintenance(maint || []);
      setVendors(vend || []);
      setUnitInspections(uInsp || []);
      setThreads(thr || []);
      setMessages(msgs || []);
      setOnboardingData(onboard || []);
    } catch (err) {
      console.warn('Reset fetch failed:', err);
      setLeaseDocs(DEFAULT_LEASE_DOCS);
    }
    // Reset non-Supabase state to mocks (only state not fetched above)
    setEmergencyContacts({}); setAdminNotes({});
    setCommPrefs(DEFAULT_COMM_PREFS); setSettings(DEFAULT_SETTINGS); setPage("dashboard");
  };

  // Notification-aware wrappers
  const pushNotif = (n) => setNotifications(prev => [n, ...prev]);
  const roleNotifs = notifications.filter(n => n.roles.includes(role)).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const unreadCount = roleNotifs.filter(n => new Date(n.timestamp) > new Date(notifReadAt[role])).length;
  const markAllRead = () => { setNotifReadAt(prev => ({ ...prev, [role]: new Date().toISOString() })); };

  const addMaintenanceN = (req) => {
    addMaintenance(req);
    pushNotif({ id: `N-${Date.now()}`, type: "maintenance", icon: "🔧", message: `New request: ${req.description.slice(0, 50)} (${req.unit})${req.priority === "critical" ? " — Critical" : ""}`, timestamp: new Date().toISOString(), roles: ["admin", "maintenance"] });
    // Notify the shared portal mailbox — one email, not one per admin's personal inbox
    sendNotification("custom", {
      to: "residentportal@bolinaslandtrust.org",
      subject: `New Maintenance Request — ${req.unit}`,
      body: `A new ${req.priority} priority maintenance request has been submitted for Unit ${req.unit}.\n\nCategory: ${req.category}\nDescription: ${req.description}\n\nPlease log in to the Resident Portal to review and assign.`,
    }).catch((err) => { console.error('Maintenance notification failed:', err); });
    // SMS the configured notify list (Admin Settings → Maintenance → Notify Phones)
    const notifyPhones = (settings?.maint?.notifyPhones || []).filter(Boolean);
    if (notifyPhones.length > 0) {
      const building = LIVE_PROPERTIES.find(p => p.id === req.propertyId)?.name || "";
      const requester = req.requesterName
        || LIVE_RESIDENTS.find(r => r.unit === req.unit && r.propertyId === req.propertyId)?.name
        || LIVE_RESIDENTS.find(r => r.unit === req.unit)?.name
        || "";
      const locParts = [building, req.unit ? `Unit ${req.unit}` : ""].filter(Boolean).join(" · ");
      const requesterLine = requester ? `From: ${requester}\n` : "";
      const smsBody =
        `BCLT: New ${req.priority} maintenance request\n` +
        (locParts ? `${locParts}\n` : "") +
        requesterLine +
        `${req.category}: ${req.description.slice(0, 120)}${req.description.length > 120 ? "…" : ""}`;
      for (const phone of notifyPhones) {
        sendSMS(phone, smsBody).catch(err => console.warn(`SMS notify ${phone} failed:`, err));
      }
    }
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
  const addThreadN = async (t) => {
    await addThread(t);
    pushNotif({ id: `N-${Date.now()}`, type: "message", icon: "💬", message: `New message: ${t.subject}`, timestamp: new Date().toISOString(), roles: ["resident", "admin"].filter(r => r !== role) });
  };
  const addMessageN = async (msg) => {
    await addMessage(msg);
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

  // ── Regulatory inspections ──
  const scheduleRegInspection = async (sched) => {
    const saved = await insertRegInspection(sched);
    const fresh = await fetchRegInspections().catch(() => null);
    if (fresh) { LIVE_REG_INSPECTIONS = fresh; }
    const property = LIVE_PROPERTIES.find(p => p.id === sched.propertyId);
    pushNotif({
      id: `N-${Date.now()}`,
      type: "inspection",
      icon: "📋",
      message: `${sched.type} inspection scheduled at ${property?.name || sched.propertyId} for ${sched.date}`,
      timestamp: new Date().toISOString(),
      roles: ["admin", "maintenance", "resident"],
    });
    // Notify residents of the affected property if requested
    if (sched.notifyResidents) {
      const residents = LIVE_RESIDENTS.filter(r => r.propertyId === sched.propertyId);
      const whenStr = `${sched.date}${sched.timeWindow ? ` · ${sched.timeWindow}` : ""}`;
      const subject = `Notice: ${sched.type} Inspection at ${property?.name || "your building"} on ${whenStr}`;
      const body =
        `<p>Hello,</p>` +
        `<p>This is a notice that a <strong>${sched.type}</strong> inspection by <strong>${sched.authority || sched.type}</strong> ` +
        `has been scheduled at <strong>${property?.name || "your building"}</strong> on <strong>${sched.date}</strong>` +
        `${sched.timeWindow ? ` between <strong>${sched.timeWindow}</strong>` : ""}.</p>` +
        `<p>Please ensure access to your unit as needed. Reach out to BCLT management with any questions.</p>`;
      const smsText = `BCLT: ${sched.type} inspection (${sched.authority || sched.type}) at ${property?.name || "your building"} on ${whenStr}.`;
      for (const r of residents) {
        if (r.email) sendNotification("custom", { to: r.email, subject, body }).catch(err => console.warn(`Reg notify email ${r.email} failed:`, err));
        if (r.phone) sendSMS(r.phone, smsText).catch(err => console.warn(`Reg notify SMS ${r.phone} failed:`, err));
      }
    }
    return saved;
  };
  const updateRegInspectionN = async (code, changes) => {
    await updateRegInspection(code, changes);
    const fresh = await fetchRegInspections().catch(() => null);
    if (fresh) { LIVE_REG_INSPECTIONS = fresh; setDataVersion(v => v + 1); }
  };
  const deleteRegInspectionN = async (code) => {
    await deleteRegInspection(code);
    const fresh = await fetchRegInspections().catch(() => null);
    if (fresh) { LIVE_REG_INSPECTIONS = fresh; setDataVersion(v => v + 1); }
  };

  const nav = NAV[role] || [];
  const navBadges = {};
  if (role === "admin") {
    navBadges.maintenance = maintenance.filter(m => MAINT_AWAITING(m)).length;
    navBadges.communications = threads.filter(t => t.unread > 0).length;
  } else if (role === "maintenance") {
    navBadges["work-orders"] = maintenance.filter(m => !m.assignedTo).length;
    navBadges.messages = threads.filter(t => t.unread > 0 && (t.type === "broadcast" || t.subject.toLowerCase().includes("maintenance"))).length;
  } else {
    navBadges.messages = threads.filter(t => t.unread > 0 && (t.participants.includes(residentCtx?.id || "") || t.type === "broadcast")).length;
  }

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
        case "maintenance": return <ResidentMaintenance mobile={mobile} maintenance={myMaint} onSubmit={addMaintenanceN} onUpdate={updateMaintenanceN} rc={rc} />;
        case "rent": return <RentPayments mobile={mobile} rc={rc} />;
        case "recert": return <IncomeCertification role="resident" mobile={mobile} selectedProperty={selectedProperty} rc={rc} pushNotif={pushNotif} />;
        case "unit": return <UnitDetails leaseDocs={leaseDocs} setLeaseDocs={setLeaseDocs} mobile={mobile} rc={rc} />;
        case "inspections": return <Inspections role="resident" mobile={mobile} unitInspections={unitInspections} rc={rc} staffMembers={staffMembers} />;
        case "profile": return <ResidentProfile mobile={mobile} commPrefs={commPrefs} setCommPrefs={setCommPrefs} emergencyContacts={emergencyContacts} onUpdateEmergencyContacts={updateEmergencyContacts} rc={rc} />;
        case "messages": return <Communications role="resident" commPrefs={commPrefs} setCommPrefs={setCommPrefs} mobile={mobile} threads={myThreads} messages={messages} onAddThread={addThreadN} onAddMessage={addMessageN} onUpdateThread={updateThread} rc={rc} />;
        default: return <ResidentDashboard mobile={mobile} maintenance={maintenance} threads={threads} notifications={roleNotifs} rc={rc} onNavigate={handleNav} />;
      }
    }
    if (role === "admin") {
      const sp = selectedProperty;
      const fMaint = filterByProperty(maintenance, sp);
      const fInsp = filterByProperty(unitInspections, sp);
      switch (page) {
        case "dashboard": return <AdminDashboard mobile={mobile} maintenance={fMaint} vendors={vendors} notifications={roleNotifs} selectedProperty={sp} onSelectProperty={selectProperty} onOpenMaintenance={(id) => { setPendingMaintenanceId(id); setPage("maintenance"); }} onNavigateTo={setPage} />;
        case "residents": return <AdminResidents mobile={mobile} maintenance={fMaint} threads={threads} emergencyContacts={emergencyContacts} adminNotes={adminNotes} onAddAdminNote={addAdminNote} selectedProperty={sp} onDataChanged={reloadData} leaseDocs={leaseDocs} sbRentLedger={sbRentLedger} pendingResidentView={pendingResidentView} onClearPendingResident={() => setPendingResidentView(null)} onAddThread={addThreadN} onAddMessage={addMessageN} onResidentAdded={async () => {
          try { const [res, resExt] = await Promise.all([fetchResidents(), fetchResidentsExtended()]); LIVE_RESIDENTS = res; LIVE_RESIDENTS_EXTENDED = resExt; setSbResidents(res); setSbResidentsExt(resExt); } catch(e) { console.warn(e); }
        }} />;
        case "onboarding": return <OnboardingChecklist mobile={mobile} selectedProperty={sp} initialRecords={onboardingData} />;
        case "documents": return <AdminDocuments leaseDocs={leaseDocs} setLeaseDocs={setLeaseDocs} mobile={mobile} selectedProperty={sp} />;
        case "maintenance": return <AdminMaintenance mobile={mobile} maintenance={fMaint} onUpdate={updateMaintenanceN} onAdd={addMaintenanceN} staffMembers={staffMembers} vendors={vendors} profile={profile} pendingOpenId={pendingMaintenanceId} onClearPendingOpen={() => setPendingMaintenanceId(null)} />;
        case "recert": return <IncomeCertification role="admin" mobile={mobile} selectedProperty={sp} />;
        case "inspections": return <Inspections role="admin" mobile={mobile} unitInspections={fInsp} onSchedule={addInspectionN} onUpdate={updateInspectionN} selectedProperty={sp} allUnits={allUnits} savedChecklists={savedChecklists} onSaveChecklist={async (cl) => { const saved = await insertInspectionChecklist(cl); setSavedChecklists(prev => [saved, ...prev]); return saved; }} onUpdateChecklist={async (uuid, changes) => { await updateInspectionChecklist(uuid, changes); setSavedChecklists(prev => prev.map(c => c._uuid === uuid ? { ...c, ...changes } : c)); }} staffMembers={staffMembers} onScheduleReg={scheduleRegInspection} onUpdateReg={updateRegInspectionN} onDeleteReg={deleteRegInspectionN} inspectionTemplates={inspectionTemplates} onSaveTemplate={async (tpl) => { const saved = await insertInspectionTemplate(tpl); setInspectionTemplates(prev => [saved, ...prev]); return saved; }} onUpdateTemplate={async (code, changes) => { await updateInspectionTemplate(code, changes); setInspectionTemplates(prev => prev.map(t => t.id === code ? { ...t, ...changes } : t)); }} onDeleteTemplate={async (code) => { await deleteInspectionTemplate(code); setInspectionTemplates(prev => prev.filter(t => t.id !== code)); }} />;
        case "property": return <PropertyDetails leaseDocs={leaseDocs} setLeaseDocs={setLeaseDocs} mobile={mobile} selectedProperty={sp} onSelectProperty={selectProperty} onDataRefresh={reloadData} settings={settings} maintenance={fMaint} unitInspections={fInsp} threads={threads} setPage={setPage} onOpenMaintenance={(id) => { setPendingMaintenanceId(id); setPage("maintenance"); }} />;
        case "vendors": return <Vendors role="admin" mobile={mobile} vendors={vendors} onAddVendor={addVendorN} onUpdateVendor={(id, changes) => { updateVendor(id, changes).then(() => reloadData()).catch(err => console.warn(err)); setVendors(prev => prev.map(v => v.id === id ? { ...v, ...changes } : v)); }} />;
        case "communications": return <Communications role="admin" commPrefs={commPrefs} setCommPrefs={setCommPrefs} mobile={mobile} threads={threads} messages={messages} onAddThread={addThreadN} onAddMessage={addMessageN} onUpdateThread={updateThread} onDeleteThread={(threadId) => { deleteThreadFromDb(threadId).catch(err => console.warn("Delete thread failed:", err)); setThreads(prev => prev.filter(t => t.id !== threadId)); setMessages(prev => prev.filter(m => m.threadId !== threadId)); }} />;
        case "financial": return <FinancialOverview mobile={mobile} selectedProperty={sp} onSelectProperty={selectProperty} />;
        case "reports": return <AdminReports mobile={mobile} maintenance={fMaint} vendors={vendors} unitInspections={fInsp} selectedProperty={sp} />;
        case "calendar": return <CalendarView mobile={mobile} maintenance={fMaint} vendors={vendors} unitInspections={fInsp} onNavigate={setPage} threads={threads} />;
        case "settings": return <AdminSettings mobile={mobile} settings={settings} setSettings={setSettings} darkMode={darkMode} setDarkMode={setDarkMode} maintenance={maintenance} vendors={vendors} unitInspections={unitInspections} onReset={resetAllState} staffMembers={staffMembers} allUnits={allUnits} />;
        default: return <AdminDashboard mobile={mobile} maintenance={fMaint} vendors={vendors} notifications={roleNotifs} selectedProperty={sp} onOpenMaintenance={(id) => { setPendingMaintenanceId(id); setPage("maintenance"); }} onNavigateTo={setPage} />;
      }
    }
    if (role === "maintenance") {
      switch (page) {
        case "dashboard": return <MaintenanceDashboard mobile={mobile} maintenance={maintenance} notifications={roleNotifs} profile={profile} staffMembers={staffMembers} threads={threads} onOpenWorkOrder={(id) => { setPendingMaintenanceId(id); setPage("work-orders"); }} onOpenMessages={() => setPage("messages")} onNavigateTo={setPage} />;
        case "work-orders": return <WorkOrders mobile={mobile} maintenance={maintenance} onUpdate={updateMaintenanceN} onAdd={addMaintenanceN} profile={profile} vendors={vendors} staffMembers={staffMembers} pendingOpenId={pendingMaintenanceId} onClearPendingOpen={() => setPendingMaintenanceId(null)} />;
        case "inspections": return <Inspections role="maintenance" mobile={mobile} unitInspections={unitInspections} onUpdate={updateInspectionN} allUnits={allUnits} staffMembers={staffMembers} onUpdateReg={updateRegInspectionN} inspectionTemplates={inspectionTemplates} savedChecklists={savedChecklists} onSaveChecklist={async (cl) => { const saved = await insertInspectionChecklist(cl); setSavedChecklists(prev => [saved, ...prev]); return saved; }} onUpdateChecklist={async (uuid, changes) => { await updateInspectionChecklist(uuid, changes); setSavedChecklists(prev => prev.map(c => c._uuid === uuid ? { ...c, ...changes } : c)); }} />;
        case "vendors": return <Vendors role="maintenance" mobile={mobile} vendors={vendors} onAddVendor={addVendorN} onUpdateVendor={(id, changes) => { updateVendor(id, changes).then(() => reloadData()).catch(err => console.warn(err)); setVendors(prev => prev.map(v => v.id === id ? { ...v, ...changes } : v)); }} />;
        case "messages": return <Communications role="maintenance" commPrefs={commPrefs} setCommPrefs={setCommPrefs} mobile={mobile} threads={threads} messages={messages} onAddThread={addThreadN} onAddMessage={addMessageN} onUpdateThread={updateThread} onDeleteThread={(threadId) => { deleteThreadFromDb(threadId).catch(err => console.warn("Delete thread failed:", err)); setThreads(prev => prev.filter(t => t.id !== threadId)); setMessages(prev => prev.filter(m => m.threadId !== threadId)); }} />;
        case "schedule": return <CalendarView mobile={mobile} maintenance={maintenance} vendors={vendors} unitInspections={unitInspections} onNavigate={setPage} threads={threads} />;
        case "profile": return <MaintenanceProfile mobile={mobile} profile={profile} staffMembers={staffMembers} />;
        case "maintenance": return <WorkOrders mobile={mobile} maintenance={maintenance} onUpdate={updateMaintenanceN} onAdd={addMaintenanceN} profile={profile} vendors={vendors} staffMembers={staffMembers} pendingOpenId={pendingMaintenanceId} onClearPendingOpen={() => setPendingMaintenanceId(null)} />;
        default: return <MaintenanceDashboard mobile={mobile} maintenance={maintenance} notifications={roleNotifs} profile={profile} staffMembers={staffMembers} threads={threads} onOpenWorkOrder={(id) => { setPendingMaintenanceId(id); setPage("work-orders"); }} onOpenMessages={() => setPage("messages")} onNavigateTo={setPage} />;
      }
    }
    return <ResidentDashboard mobile={mobile} maintenance={maintenance} threads={threads} notifications={roleNotifs} onNavigate={handleNav} />;
  };

  const sidebarContent = (
    <>
      <div style={{ padding: "20px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.accent, letterSpacing: "-0.3px" }}>BCLT HomeBase</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>Bolinas Community Land Trust</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setDarkMode(d => !d)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: 4, color: T.muted }} title={darkMode ? "Light mode" : "Dark mode"}>{darkMode ? "☀️" : "🌙"}</button>
          <NotificationBell count={unreadCount} onClick={() => setShowNotifPanel(!showNotifPanel)} mobile={mobile} />
          {mobile && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", fontSize: 22, color: T.muted, cursor: "pointer", padding: 4 }}>✕</button>}
        </div>
      </div>
      {/* View As switcher — only visible to actual admins */}
      {actualRole === "admin" && (
        <div style={{ padding: "10px 12px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "1px", padding: "0 6px", marginBottom: 6 }}>View As</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {[["admin", "Admin"], ["maintenance", "Maint"], ["resident", "Resident"]].map(([k, label]) => {
              const active = (k === "admin" && !viewAsRole) || viewAsRole === k;
              return (
                <button key={k} onClick={() => { setViewAsRole(k === "admin" ? null : k); if (k !== "resident") setViewAsResident(null); setPage("dashboard"); }} style={{
                  flex: 1, padding: "6px 4px", fontSize: 11, fontWeight: 600, borderRadius: T.radiusSm, cursor: "pointer",
                  background: active ? T.accent : T.bg, color: active ? "#fff" : T.text, border: `1px solid ${active ? T.accent : T.border}`,
                }}>{label}</button>
              );
            })}
          </div>
          {viewAsRole === "resident" && (
            <select value={viewAsResident || ""} onChange={e => setViewAsResident(e.target.value || null)} style={{ ...s.select, width: "100%", fontSize: 12, marginBottom: 6 }}>
              <option value="">Pick a resident…</option>
              {LIVE_RESIDENTS.map(r => <option key={r.id} value={r.id}>{r.name} — {r.unit}</option>)}
            </select>
          )}
        </div>
      )}
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

  // Public maintenance request form (no auth required)
  const urlParams = new URLSearchParams(window.location.search);
  const publicMaintUnit = urlParams.get("maintenance");
  if (publicMaintUnit) {
    return <PublicMaintenanceForm unitId={publicMaintUnit} mobile={mobile} themeVars={themeVars} />;
  }

  // Auth gate
  if (authLoading) return <div style={{ ...s.page, ...themeVars, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><div style={{ color: T.muted, fontSize: 14 }}>Loading...</div></div>;
  if (!authUser || !profile) return <div style={themeVars}><LoginPage /></div>;

  return (
    <div style={{ ...s.page, ...themeVars, display: "flex", flexDirection: mobile ? "column" : "row" }}>
      {/* MOBILE TOP BAR */}
      {mobile && (
        <div data-print-hide style={{ position: "sticky", top: 0, zIndex: 900, background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 56, flexShrink: 0 }}>
          <div style={{ fontWeight: 800, color: T.accent, fontSize: 15 }}>BCLT HomeBase</div>
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
