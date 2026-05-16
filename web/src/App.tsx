import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import EntryGrid from "./pages/EntryGrid";
import AdminCiders from "./pages/AdminCiders";

const now = new Date();
const CURRENT_YEAR  = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;

export default function App() {
  return (
    <div className="hcc-app" data-palette="saloon" style={{ height: "100vh" }}>
      <Sidebar />
      <main className="hcc-main">
        <MobileTopbar />
        <Routes>
          <Route path="/" element={<Navigate to={`/entry/${CURRENT_YEAR}/${CURRENT_MONTH}`} replace />} />
          <Route path="/entry/:year/:month" element={<EntryGridRoute />} />
          <Route path="/admin/ciders" element={<AdminCiders />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <MobileTabBar />
      </main>
    </div>
  );
}

function EntryGridRoute() {
  const { year, month } = useRouteParams();
  return <EntryGrid year={Number(year)} month={Number(month)} />;
}

function useRouteParams() {
  // Extract :year/:month from the current pathname
  const loc = useLocation();
  const m = loc.pathname.match(/\/entry\/(\d+)\/(\d+)/);
  return { year: m?.[1] ?? String(CURRENT_YEAR), month: m?.[2] ?? String(CURRENT_MONTH) };
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
  const location = useLocation();
  const isEntry = location.pathname.startsWith("/entry") || location.pathname === "/";
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <aside className="hcc-side">
      {/* Brand block */}
      <div className="hcc-brand">
        <img className="logo" src="/shield-logo.png" alt="Hill Country Cider House" />
        <div className="tag">Operations · {CURRENT_YEAR}</div>
      </div>

      {/* Nav */}
      <div className="hcc-navlabel">Workspace</div>

      <Link
        to={`/entry/${CURRENT_YEAR}/${CURRENT_MONTH}`}
        className={`hcc-navitem ${isEntry ? "active" : ""}`}
      >
        <span className="dot" />
        Entry
      </Link>

      <Link
        to="/admin/ciders"
        className={`hcc-navitem ${isAdmin ? "active" : ""}`}
      >
        <span className="dot" />
        Admin
      </Link>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Footer location legend */}
      <div className="hcc-side-footer">
        <div className="loc-row">
          <span
            className="loc-dot"
            style={{ width: 6, height: 6, background: "var(--gold)" }}
          />
          Castroville · HWY 90
        </div>
        <div className="loc-row">
          <span
            className="loc-dot"
            style={{ width: 6, height: 6, background: "var(--terracotta)" }}
          />
          Comfort · Holiday Orchard
        </div>
      </div>
    </aside>
  );
}

// ─── Mobile top bar ───────────────────────────────────────────────────────────

function MobileTopbar() {
  return (
    <div className="hcc-mobile-topbar">
      <div>
        <div className="eyebrow">Operations</div>
        <div className="brand-text">Hill Country Cider House</div>
      </div>
    </div>
  );
}

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────

function MobileTabBar() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <nav className="hcc-mobile-tabs">
      <Link
        to={`/entry/${CURRENT_YEAR}/${CURRENT_MONTH}`}
        className={`ti ${!isAdmin ? "active" : ""}`}
      >
        <span style={{ display: "block", fontSize: 16, marginBottom: 3 }}>📋</span>
        Entry
      </Link>
      <Link
        to="/admin/ciders"
        className={`ti ${isAdmin ? "active" : ""}`}
      >
        <span style={{ display: "block", fontSize: 16, marginBottom: 3 }}>⚙️</span>
        Admin
      </Link>
    </nav>
  );
}
