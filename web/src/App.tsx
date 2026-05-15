import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import EntryGrid from "./pages/EntryGrid";
import MonthlyReport from "./pages/MonthlyReport";
import AdminCiders from "./pages/AdminCiders";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-stone-900 text-stone-100 px-6 py-4 shadow">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Hill Country Cider House · Ops
          </Link>
          <nav className="flex items-center gap-4 text-sm text-stone-300">
            <span>Compliance</span>
            <Link to="/admin/ciders" className="hover:text-white">Admin</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 px-6 py-8 max-w-7xl w-full mx-auto">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/compliance/:locationSlug/:year/:month" element={<EntryGridRoute />} />
          <Route path="/compliance/:locationSlug/:year/:month/report" element={<ReportRoute />} />
          <Route path="/admin/ciders" element={<AdminCiders />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Home() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const { data: locations, isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: api.locations,
  });
  if (isLoading) return <p>Loading…</p>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Monthly Compliance</h1>
      <p className="text-stone-600">
        Pick a location to enter or review this month's numbers.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {locations?.map((loc) => (
          <Link
            key={loc.id}
            to={`/compliance/${loc.slug}/${y}/${m}`}
            className="block p-5 rounded-lg bg-white border border-stone-200 hover:border-stone-400 hover:shadow-sm transition"
          >
            <div className="text-lg font-medium">{loc.name}</div>
            {loc.tabcLicense && (
              <div className="text-xs text-stone-500 mt-1">
                TABC License: {loc.tabcLicense}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function EntryGridRoute() {
  const { locationSlug, year, month } = useParams();
  return (
    <EntryGrid
      locationSlug={locationSlug!}
      year={Number(year)}
      month={Number(month)}
    />
  );
}

function ReportRoute() {
  const { locationSlug, year, month } = useParams();
  return (
    <MonthlyReport
      locationSlug={locationSlug!}
      year={Number(year)}
      month={Number(month)}
    />
  );
}
