import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EntryRow, type Location } from "../api";

const LOCK_ICON    = "🔒";
const UNLOCK_ICON  = "🔓";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BOTTLE_GALLONS = 750 / 3785.411784; // 750 mL per bottle
const SIXTEL_GALLONS = 5.16;              // sixtel keg

function toGal(bottles: number, kegs: number) {
  return Math.round((bottles * BOTTLE_GALLONS + kegs * SIXTEL_GALLONS) * 100) / 100;
}

type Props = { locationSlug: string; year: number; month: number };

type EntryFieldKey =
  | "bottlesOnHand" | "kegsOnHand"
  | "togoBottles" | "togoKegs"
  | "retailBottles" | "retailKegs"
  | "transfersInBottles" | "transfersInKegs"
  | "transfersOutBottles" | "transfersOutKegs";

const ALL_FIELD_COLUMNS: { key: EntryFieldKey; label: string }[] = [
  { key: "bottlesOnHand",      label: "Bottles on hand" },
  { key: "kegsOnHand",         label: "Kegs on hand" },
  { key: "togoBottles",        label: "To-Go bottles" },
  { key: "togoKegs",           label: "To-Go kegs" },
  { key: "retailBottles",      label: "Retail bottles" },
  { key: "retailKegs",         label: "Retail kegs" },
  { key: "transfersInBottles", label: "Transfer In bottles" },
  { key: "transfersInKegs",    label: "Transfer In kegs" },
  { key: "transfersOutBottles",label: "Transfer Out bottles" },
  { key: "transfersOutKegs",   label: "Transfer Out kegs" },
];

const HIDDEN_FIELDS: Record<string, EntryFieldKey[]> = {
  "cider-house": ["togoKegs", "transfersInBottles", "transfersInKegs"],
  "tasting-room": ["togoKegs", "kegsOnHand", "retailBottles", "retailKegs", "transfersOutBottles", "transfersOutKegs"],
};

const LABEL_OVERRIDES: Record<string, Partial<Record<EntryFieldKey, string>>> = {
  "tasting-room": { transfersInKegs: "Transfer In kegs / On-Premise Sales" },
};

function columnsForLocation(slug: string) {
  const hidden = new Set(HIDDEN_FIELDS[slug] ?? []);
  const overrides = LABEL_OVERRIDES[slug] ?? {};
  return ALL_FIELD_COLUMNS
    .filter((c) => !hidden.has(c.key))
    .map((c) => overrides[c.key] ? { ...c, label: overrides[c.key]! } : c);
}

function colGallons(key: EntryFieldKey, count: number): number {
  const isKeg = key === "kegsOnHand" || key.endsWith("Kegs");
  return Math.round(count * (isKeg ? SIXTEL_GALLONS : BOTTLE_GALLONS) * 100) / 100;
}

// ─── Compliance calculation helpers ──────────────────────────────────────────

function sumField(rows: EntryRow[], key: EntryFieldKey): number {
  return rows.reduce((s, r) => s + ((r.entry?.[key] as number | undefined) ?? 0), 0);
}

// Cider House
type CHCalcResult = {
  startingInventory: number;
  endingInventory: number;
  directSalesOffPremise: number;
  directSalesRetail: number;
  transfer: number;
  manufacturing: number;
};

function calcCiderHouseCategory(current: EntryRow[], prev: EntryRow[]): CHCalcResult {
  const startingInventory     = toGal(sumField(prev, "bottlesOnHand"), sumField(prev, "kegsOnHand"));
  const endingInventory       = toGal(sumField(current, "bottlesOnHand"), sumField(current, "kegsOnHand"));
  const directSalesOffPremise = toGal(sumField(current, "togoBottles"), 0);
  const directSalesRetail     = toGal(sumField(current, "retailBottles"), sumField(current, "retailKegs"));
  const transfer              = toGal(sumField(current, "transfersOutBottles"), sumField(current, "transfersOutKegs"));
  const manufacturing         = endingInventory + directSalesOffPremise + directSalesRetail + transfer - startingInventory;
  return { startingInventory, endingInventory, directSalesOffPremise, directSalesRetail, transfer, manufacturing };
}

// Tasting Room
type TRCalcResult = {
  startingInventory: number;
  endingInventory: number;
  directSalesOffPremise: number;
  adjustedBottleSales: number;
  directSalesOnPremise: number;
  transfer: number;
};

function calcTastingRoomCategory(current: EntryRow[], prev: EntryRow[]): TRCalcResult {
  const startingInventory     = toGal(sumField(prev, "bottlesOnHand"), 0);
  const endingInventory       = toGal(sumField(current, "bottlesOnHand"), 0);
  const directSalesOffPremise = toGal(sumField(current, "togoBottles"), 0);
  const transferInBottlesGal  = toGal(sumField(current, "transfersInBottles"), 0);
  // Adjusted bottle sales: what inventory math says you sold in bottles
  const adjustedBottleSales   = Math.round((startingInventory + transferInBottlesGal - endingInventory) * 100) / 100;
  const directSalesOnPremise  = toGal(0, sumField(current, "transfersInKegs"));
  const transfer              = toGal(sumField(current, "transfersInBottles"), sumField(current, "transfersInKegs"));
  return { startingInventory, endingInventory, directSalesOffPremise, adjustedBottleSales, directSalesOnPremise, transfer };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EntryGrid({ locationSlug, year, month }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: api.locations });
  const location = locations?.find((l) => l.slug === locationSlug);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["entries", location?.id, year, month],
    queryFn: () => api.entries(location!.id, year, month),
    enabled: !!location,
  });

  // Previous month — needed for Starting Inventory in both compliance calcs
  const prevYear  = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const { data: prevRows } = useQuery({
    queryKey: ["entries", location?.id, prevYear, prevMonth],
    queryFn: () => api.entries(location!.id, prevYear, prevMonth),
    enabled: !!location,
  });

  // Lock status
  const { data: lockData } = useQuery({
    queryKey: ["lock", location?.id, year, month],
    queryFn: () => api.lockStatus(location!.id, year, month),
    enabled: !!location,
  });
  const locked = lockData?.locked ?? false;

  const lockToggle = useMutation({
    mutationFn: () =>
      locked
        ? api.unlockMonth(location!.id, year, month)
        : api.lockMonth(location!.id, year, month),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lock", location?.id, year, month] });
    },
  });

  const save = useMutation({
    mutationFn: api.saveEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entries", location?.id, year, month] });
    },
  });

  if (!locations) return <p>Loading…</p>;
  if (!location)  return <p>Location not found.</p>;
  if (isLoading || !rows) return <p>Loading entries…</p>;

  const columns       = columnsForLocation(locationSlug);
  const lowRows       = rows.filter((r) => r.cider.category === "low");
  const sparklingRows = rows.filter((r) => r.cider.category === "sparkling");

  const prevLow       = prevRows?.filter((r) => r.cider.category === "low") ?? [];
  const prevSparkling = prevRows?.filter((r) => r.cider.category === "sparkling") ?? [];

  function goMonth(delta: number) {
    let m = month + delta, y = year;
    if (m < 1)  { m = 12; y -= 1; }
    if (m > 12) { m = 1;  y += 1; }
    navigate(`/compliance/${locationSlug}/${y}/${m}`);
  }

  const tables = (
    <div className="space-y-6 min-w-0 flex-1">
      <CategoryTable title="Low ABV"   rows={lowRows}       columns={columns} location={location} year={year} month={month} onSave={save.mutate} saving={save.isPending} locked={locked} />
      <CategoryTable title="Sparkling" rows={sparklingRows} columns={columns} location={location} year={year} month={month} onSave={save.mutate} saving={save.isPending} locked={locked} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/" className="text-sm text-stone-500 hover:underline">← All locations</Link>
          <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">
            {location.name}
            {locked && <span className="text-sm font-normal px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">Locked</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => goMonth(-1)} className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100">←</button>
          <div className="px-3 py-1.5 font-medium min-w-[10rem] text-center">{MONTHS[month - 1]} {year}</div>
          <button onClick={() => goMonth(1)}  className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100">→</button>
          <button
            onClick={() => lockToggle.mutate()}
            disabled={lockToggle.isPending}
            title={locked ? "Unlock this month" : "Lock this month"}
            className={`px-3 py-1.5 rounded border text-sm font-medium transition ${
              locked
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
            } disabled:opacity-50`}
          >
            {locked ? `${UNLOCK_ICON} Unlock` : `${LOCK_ICON} Lock`}
          </button>
          <Link to={`/compliance/${locationSlug}/${year}/${month}/report`} className="px-4 py-1.5 rounded bg-stone-900 text-white text-sm hover:bg-stone-800">
            View report
          </Link>
        </div>
      </div>

      {/* Body — left rail for both locations */}
      {(locationSlug === "cider-house" || locationSlug === "tasting-room") ? (
        <div className="flex gap-5 items-start">
          <aside className="w-64 shrink-0 space-y-4 sticky top-4">
            {locationSlug === "cider-house" ? (
              <CiderHouseCalc
                lowCurrent={lowRows}       lowPrev={prevLow}
                sparklingCurrent={sparklingRows} sparklingPrev={prevSparkling}
                month={month} year={year}
              />
            ) : (
              <TastingRoomCalc
                lowCurrent={lowRows}       lowPrev={prevLow}
                sparklingCurrent={sparklingRows} sparklingPrev={prevSparkling}
                month={month} year={year}
              />
            )}
          </aside>
          {tables}
        </div>
      ) : tables}
    </div>
  );
}

// ─── Compliance calc panels ───────────────────────────────────────────────────

type CalcRow = { label: string; value: number; derived?: boolean };

function CalcPanel({ title, month, year, children }: {
  title: string; month: number; year: number; children: ReactNode;
}) {
  return (
    <>
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 px-1">
        Compliance — {MONTHS[month - 1]} {year}
      </div>
      {children}
    </>
  );
}

function CalcBox({ title, rows }: { title: string; rows: CalcRow[] }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden text-sm">
      <div className="px-3 py-2 bg-stone-50 border-b border-stone-200 font-medium">{title}</div>
      <div className="divide-y divide-stone-100">
        {rows.map(({ label, value, derived }) => (
          <div key={label} className={`flex justify-between items-baseline px-3 py-1.5 ${derived ? "bg-amber-50" : ""}`}>
            <span className={`text-xs ${derived ? "font-semibold text-amber-800" : "text-stone-600"}`}>{label}</span>
            <span className={`tabular-nums font-medium ${derived ? "text-amber-900" : "text-stone-800"}`}>
              {value.toFixed(2)}<span className="text-stone-400 font-normal text-xs"> gal</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CiderHouseCalc({ lowCurrent, lowPrev, sparklingCurrent, sparklingPrev, month, year }: {
  lowCurrent: EntryRow[]; lowPrev: EntryRow[];
  sparklingCurrent: EntryRow[]; sparklingPrev: EntryRow[];
  month: number; year: number;
}) {
  const mkRows = (c: CHCalcResult): CalcRow[] => [
    { label: "Starting Inventory",       value: c.startingInventory },
    { label: "Ending Inventory",         value: c.endingInventory },
    { label: "Direct Sales Off-Premise", value: c.directSalesOffPremise },
    { label: "Direct Sales Retail",      value: c.directSalesRetail },
    { label: "Transfer",                 value: c.transfer },
    { label: "Manufacturing",            value: c.manufacturing, derived: true },
  ];
  return (
    <CalcPanel title="Cider House" month={month} year={year}>
      <CalcBox title="Low ABV"   rows={mkRows(calcCiderHouseCategory(lowCurrent, lowPrev))} />
      <CalcBox title="Sparkling" rows={mkRows(calcCiderHouseCategory(sparklingCurrent, sparklingPrev))} />
    </CalcPanel>
  );
}

function TastingRoomCalc({ lowCurrent, lowPrev, sparklingCurrent, sparklingPrev, month, year }: {
  lowCurrent: EntryRow[]; lowPrev: EntryRow[];
  sparklingCurrent: EntryRow[]; sparklingPrev: EntryRow[];
  month: number; year: number;
}) {
  const mkRows = (c: TRCalcResult): CalcRow[] => [
    { label: "Starting Inventory",        value: c.startingInventory },
    { label: "Ending Inventory",          value: c.endingInventory },
    { label: "Direct Sales Off-Premise",  value: c.directSalesOffPremise },
    { label: "Adjusted Bottle Sales",     value: c.adjustedBottleSales, derived: true },
    { label: "Direct Sales On-Premise",   value: c.directSalesOnPremise },
    { label: "Transfer",                  value: c.transfer },
  ];
  return (
    <CalcPanel title="Tasting Room" month={month} year={year}>
      <CalcBox title="Low ABV"   rows={mkRows(calcTastingRoomCategory(lowCurrent, lowPrev))} />
      <CalcBox title="Sparkling" rows={mkRows(calcTastingRoomCategory(sparklingCurrent, sparklingPrev))} />
    </CalcPanel>
  );
}

// ─── Category table ───────────────────────────────────────────────────────────

function CategoryTable(props: {
  title: string;
  rows: EntryRow[];
  columns: { key: EntryFieldKey; label: string }[];
  location: Location;
  year: number;
  month: number;
  onSave: (payload: any) => void;
  saving: boolean;
  locked: boolean;
}) {
  const { title, rows, columns, location, year, month, onSave, saving, locked } = props;

  const totals = Object.fromEntries(
    columns.map((c) => [
      c.key,
      rows.reduce((sum, r) => sum + ((r.entry?.[c.key as keyof typeof r.entry] as number | undefined) ?? 0), 0),
    ])
  ) as Record<EntryFieldKey, number>;

  return (
    <section className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-stone-200 bg-stone-50 flex justify-between items-center">
        <h2 className="font-medium">{title}</h2>
        {locked
          ? <span className="text-xs text-amber-600 font-medium">🔒 Read-only</span>
          : saving && <span className="text-xs text-stone-500">Saving…</span>
        }
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-600 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2 sticky left-0 bg-stone-50">Cider</th>
              {columns.map((c) => (
                <th key={c.key} className="text-right px-3 py-2 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CiderRow key={`${r.cider.id}-${year}-${month}`} row={r} columns={columns} location={location} year={year} month={month} onSave={onSave} locked={locked} />
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 bg-stone-50 text-sm">
            <tr className="font-semibold">
              <td className="px-3 py-1.5 sticky left-0 bg-stone-50 text-stone-700">Total</td>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-1.5 text-right">{totals[c.key]}</td>
              ))}
            </tr>
            <tr className="text-stone-500 text-xs border-t border-stone-200">
              <td className="px-3 py-1.5 sticky left-0 bg-stone-50">Amount (gal)</td>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-1.5 text-right">{colGallons(c.key, totals[c.key]).toFixed(2)}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

// ─── Cider row ────────────────────────────────────────────────────────────────

function CiderRow(props: {
  row: EntryRow;
  columns: { key: EntryFieldKey; label: string }[];
  location: Location;
  year: number;
  month: number;
  onSave: (payload: any) => void;
  locked: boolean;
}) {
  const { row, columns, location, year, month, onSave, locked } = props;
  const initial = useMemo(() => buildInitial(row), [row]);
  const [values, setValues] = useState(initial);

  useEffect(() => { setValues(initial); }, [initial]);

  function blur(key: EntryFieldKey, raw: string) {
    const num = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(num)) return;
    if (num === initial[key]) return;
    setValues((v) => ({ ...v, [key]: num }));
    onSave({ locationId: location.id, ciderId: row.cider.id, year, month, ...values, [key]: num });
  }

  return (
    <tr className="border-t border-stone-100 hover:bg-stone-50/50">
      <td className="px-3 py-1.5 sticky left-0 bg-white font-medium">{row.cider.name}</td>
      {columns.map((c) => (
        <td key={c.key} className="px-1 py-1">
          <input
            type="number"
            min={0}
            defaultValue={values[c.key]}
            onBlur={(e) => blur(c.key, e.target.value)}
            disabled={locked}
            className={`w-20 text-right px-2 py-1 rounded border focus:outline-none ${
              locked
                ? "border-stone-100 bg-stone-50 text-stone-400 cursor-not-allowed"
                : "border-stone-200 focus:border-stone-500"
            }`}
          />
        </td>
      ))}
    </tr>
  );
}

function buildInitial(row: EntryRow): Record<EntryFieldKey, number> {
  const e = row.entry;
  return {
    bottlesOnHand:        e?.bottlesOnHand        ?? 0,
    kegsOnHand:           e?.kegsOnHand           ?? 0,
    togoBottles:          e?.togoBottles          ?? 0,
    togoKegs:             e?.togoKegs             ?? 0,
    retailBottles:        e?.retailBottles        ?? 0,
    retailKegs:           e?.retailKegs           ?? 0,
    transfersInBottles:   e?.transfersInBottles   ?? 0,
    transfersInKegs:      e?.transfersInKegs      ?? 0,
    transfersOutBottles:  e?.transfersOutBottles  ?? 0,
    transfersOutKegs:     e?.transfersOutKegs     ?? 0,
  };
}
