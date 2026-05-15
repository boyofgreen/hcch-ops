import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type CategorySummary } from "../api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Props = { locationSlug: string; year: number; month: number };

// Which summary stats to hide per location
const HIDDEN_STATS: Record<string, string[]> = {
  "cider-house": ["Transfers in"],
  "tasting-room": ["Retail sales", "Transfers out"],
};

const STAT_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  "tasting-room": { "Transfers in": "Transfer In kegs / On-Premise Sales" },
};

export default function MonthlyReport({ locationSlug, year, month }: Props) {
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: api.locations });
  const location = locations?.find((l) => l.slug === locationSlug);

  const { data: report, isLoading } = useQuery({
    queryKey: ["report", location?.id, year, month],
    queryFn: () => api.monthlyReport(location!.id, year, month),
    enabled: !!location,
  });

  if (!location) return <p>Loading…</p>;
  if (isLoading || !report) return <p>Loading report…</p>;

  const hiddenStats = new Set(HIDDEN_STATS[locationSlug] ?? []);
  const labelOverrides = STAT_LABEL_OVERRIDES[locationSlug] ?? {};
  const hideInventoryKegs = locationSlug === "tasting-room";

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/compliance/${locationSlug}/${year}/${month}`} className="text-sm text-stone-500 hover:underline">← Back to entry</Link>
        <h1 className="text-2xl font-semibold mt-1">
          {location.name} — {MONTHS[month - 1]} {year}
        </h1>
        {location.tabcLicense && (
          <div className="text-sm text-stone-500">TABC License: {location.tabcLicense}</div>
        )}
      </div>

      <CategoryCard title="Low ABV" summary={report.categories.low} hiddenStats={hiddenStats} labelOverrides={labelOverrides} hideInventoryKegs={hideInventoryKegs} />
      <CategoryCard title="Sparkling" summary={report.categories.sparkling} hiddenStats={hiddenStats} labelOverrides={labelOverrides} hideInventoryKegs={hideInventoryKegs} />

      <p className="text-xs text-stone-500">
        Gallons conversions: 1 bottle = {report.conversions.bottleGallons.toFixed(4)} gal (750 mL),
        1 keg = {report.conversions.sixtelGallons} gal (sixtel).
      </p>
    </div>
  );
}

function CategoryCard({
  title,
  summary,
  hiddenStats,
  labelOverrides,
  hideInventoryKegs,
}: {
  title: string;
  summary: CategorySummary;
  hiddenStats: Set<string>;
  labelOverrides: Record<string, string>;
  hideInventoryKegs: boolean;
}) {
  const stats: { label: string; bottles: number; kegs: number | null; gallons: number }[] = [
    { label: "Starting inventory", bottles: summary.startBottles, kegs: hideInventoryKegs ? null : summary.startKegs, gallons: summary.startGallons },
    { label: "Ending inventory",   bottles: summary.endBottles,   kegs: hideInventoryKegs ? null : summary.endKegs,   gallons: summary.endGallons },
    { label: "To-Go sales",        bottles: summary.togoBottles,  kegs: null,              gallons: summary.togoGallons },
    { label: "Retail sales",       bottles: summary.retailBottles, kegs: summary.retailKegs, gallons: summary.retailGallons },
    { label: "Transfers in",       bottles: summary.transfersInBottles, kegs: summary.transfersInKegs, gallons: summary.transfersInGallons },
    { label: "Transfers out",      bottles: summary.transfersOutBottles, kegs: summary.transfersOutKegs, gallons: summary.transfersOutGallons },
  ]
    .filter((s) => !hiddenStats.has(s.label))
    .map((s) => labelOverrides[s.label] ? { ...s, label: labelOverrides[s.label]! } : s);

  return (
    <section className="bg-white border border-stone-200 rounded-lg">
      <header className="px-4 py-2.5 border-b border-stone-200 bg-stone-50">
        <h2 className="font-medium">{title}</h2>
      </header>
      <div className="grid sm:grid-cols-3 gap-x-6 gap-y-3 px-4 py-4 text-sm">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>
    </section>
  );
}

function Stat(props: { label: string; bottles: number; kegs: number | null; gallons: number }) {
  return (
    <div>
      <div className="text-xs uppercase text-stone-500 tracking-wide">{props.label}</div>
      <div className="mt-1">
        <span className="font-semibold">{props.bottles}</span>
        <span className="text-stone-500"> bottles</span>
        {props.kegs !== null && (
          <>
            <span className="text-stone-500"> · </span>
            <span className="font-semibold">{props.kegs}</span>
            <span className="text-stone-500"> kegs</span>
          </>
        )}
      </div>
      <div className="text-stone-600">{props.gallons.toFixed(2)} gallons</div>
    </div>
  );
}
