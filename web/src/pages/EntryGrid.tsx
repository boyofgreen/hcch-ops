import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EntryRow, type Location } from "../api";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const BOTTLE_GALLONS = 750 / 3785.411784;
const SIXTEL_GALLONS = 5.16;

function toGal(bottles: number, kegs: number) {
  return Math.round((bottles * BOTTLE_GALLONS + kegs * SIXTEL_GALLONS) * 100) / 100;
}

// Location IDs
const LOC_CIDER_HOUSE  = 1; // Comfort / CF / terracotta
const LOC_TASTING_ROOM = 2; // Castroville / CV / gold

// ─── Field definitions ────────────────────────────────────────────────────────

type EntryFieldKey =
  | "bottlesOnHand" | "kegsOnHand"
  | "togoBottles"   | "togoKegs"
  | "retailBottles" | "retailKegs"
  | "transfersInBottles"  | "transfersInKegs"
  | "transfersOutBottles" | "transfersOutKegs";

const ALL_FIELD_COLUMNS: { key: EntryFieldKey; label: string }[] = [
  { key: "bottlesOnHand",       label: "On Hand (btl)" },
  { key: "kegsOnHand",          label: "On Hand (keg)" },
  { key: "retailBottles",       label: "Sales (btl)" },
  { key: "retailKegs",          label: "Sales (keg)" },
  { key: "togoBottles",         label: "To-Go (btl)" },
  { key: "togoKegs",            label: "To-Go (keg)" },
  { key: "transfersInBottles",  label: "Xfer In (btl)" },
  { key: "transfersInKegs",     label: "Xfer In (keg)" },
  { key: "transfersOutBottles", label: "Xfer Out (btl)" },
  { key: "transfersOutKegs",    label: "Xfer Out (keg)" },
];

const HIDDEN_FIELDS: Record<number, EntryFieldKey[]> = {
  [LOC_CIDER_HOUSE]:  ["togoKegs", "transfersInBottles", "transfersInKegs"],
  [LOC_TASTING_ROOM]: ["togoKegs", "kegsOnHand", "retailBottles", "retailKegs", "transfersOutBottles", "transfersOutKegs"],
};

const LABEL_OVERRIDES: Record<number, Partial<Record<EntryFieldKey, string>>> = {
  [LOC_TASTING_ROOM]: { transfersInKegs: "Xfer In / On-Prem" },
};

function columnsForLocation(locationId: number) {
  const hidden    = new Set(HIDDEN_FIELDS[locationId] ?? []);
  const overrides = LABEL_OVERRIDES[locationId] ?? {};
  return ALL_FIELD_COLUMNS
    .filter((c) => !hidden.has(c.key))
    .map((c) => overrides[c.key] ? { ...c, label: overrides[c.key]! } : c);
}

function colGallons(key: EntryFieldKey, count: number): number {
  const isKeg = key === "kegsOnHand" || key.endsWith("Kegs");
  return Math.round(count * (isKeg ? SIXTEL_GALLONS : BOTTLE_GALLONS) * 100) / 100;
}

// ─── Compliance calculations ──────────────────────────────────────────────────

function sumField(rows: EntryRow[], key: EntryFieldKey): number {
  return rows.reduce((s, r) => s + ((r.entry?.[key] as number | undefined) ?? 0), 0);
}

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
  const adjustedBottleSales   = Math.round((startingInventory + transferInBottlesGal - endingInventory) * 100) / 100;
  const directSalesOnPremise  = toGal(0, sumField(current, "transfersInKegs"));
  const transfer              = toGal(sumField(current, "transfersInBottles"), sumField(current, "transfersInKegs"));
  return { startingInventory, endingInventory, directSalesOffPremise, adjustedBottleSales, directSalesOnPremise, transfer };
}

// ─── Location filter type ─────────────────────────────────────────────────────

type LocFilter = "both" | "cv" | "cf";

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { year: number; month: number };

export default function EntryGrid({ year, month }: Props) {
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const [locFilter, setLocFilter] = useState<LocFilter>("both");

  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: api.locations });

  const cfLocation = locations?.find((l) => l.id === LOC_CIDER_HOUSE);
  const cvLocation = locations?.find((l) => l.id === LOC_TASTING_ROOM);

  // Fetch entries for both locations
  const { data: cfRows, isLoading: cfLoading } = useQuery({
    queryKey: ["entries", LOC_CIDER_HOUSE, year, month],
    queryFn: () => api.entries(LOC_CIDER_HOUSE, year, month),
    enabled: !!cfLocation,
  });
  const { data: cvRows, isLoading: cvLoading } = useQuery({
    queryKey: ["entries", LOC_TASTING_ROOM, year, month],
    queryFn: () => api.entries(LOC_TASTING_ROOM, year, month),
    enabled: !!cvLocation,
  });

  // Previous month for starting inventory
  const prevYear  = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;

  const { data: cfPrevRows } = useQuery({
    queryKey: ["entries", LOC_CIDER_HOUSE, prevYear, prevMonth],
    queryFn: () => api.entries(LOC_CIDER_HOUSE, prevYear, prevMonth),
    enabled: !!cfLocation,
  });
  const { data: cvPrevRows } = useQuery({
    queryKey: ["entries", LOC_TASTING_ROOM, prevYear, prevMonth],
    queryFn: () => api.entries(LOC_TASTING_ROOM, prevYear, prevMonth),
    enabled: !!cvLocation,
  });

  // Lock status for both
  const { data: cfLockData } = useQuery({
    queryKey: ["lock", LOC_CIDER_HOUSE, year, month],
    queryFn: () => api.lockStatus(LOC_CIDER_HOUSE, year, month),
    enabled: !!cfLocation,
  });
  const { data: cvLockData } = useQuery({
    queryKey: ["lock", LOC_TASTING_ROOM, year, month],
    queryFn: () => api.lockStatus(LOC_TASTING_ROOM, year, month),
    enabled: !!cvLocation,
  });

  const cfLocked = cfLockData?.locked ?? false;
  const cvLocked = cvLockData?.locked ?? false;

  const cfLockToggle = useMutation({
    mutationFn: () => cfLocked
      ? api.unlockMonth(LOC_CIDER_HOUSE, year, month)
      : api.lockMonth(LOC_CIDER_HOUSE, year, month),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lock", LOC_CIDER_HOUSE, year, month] }),
  });
  const cvLockToggle = useMutation({
    mutationFn: () => cvLocked
      ? api.unlockMonth(LOC_TASTING_ROOM, year, month)
      : api.lockMonth(LOC_TASTING_ROOM, year, month),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lock", LOC_TASTING_ROOM, year, month] }),
  });

  const save = useMutation({
    mutationFn: api.saveEntry,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["entries", vars.locationId, year, month] });
    },
  });

  function goMonth(delta: number) {
    let m = month + delta, y = year;
    if (m < 1)  { m = 12; y -= 1; }
    if (m > 12) { m = 1;  y += 1; }
    navigate(`/entry/${y}/${m}`);
  }

  const isLoading = cfLoading || cvLoading || !locations;

  if (isLoading) {
    return (
      <div style={{ padding: "40px 36px", fontFamily: "var(--sans)", color: "var(--ink-3)" }}>
        Loading…
      </div>
    );
  }

  // Partition rows by category
  const cfLow       = cfRows?.filter((r) => r.cider.category === "low")       ?? [];
  const cfSparkling = cfRows?.filter((r) => r.cider.category === "sparkling")  ?? [];
  const cvLow       = cvRows?.filter((r) => r.cider.category === "low")        ?? [];
  const cvSparkling = cvRows?.filter((r) => r.cider.category === "sparkling")  ?? [];

  const cfPrevLow       = cfPrevRows?.filter((r) => r.cider.category === "low")       ?? [];
  const cfPrevSparkling = cfPrevRows?.filter((r) => r.cider.category === "sparkling")  ?? [];
  const cvPrevLow       = cvPrevRows?.filter((r) => r.cider.category === "low")        ?? [];
  const cvPrevSparkling = cvPrevRows?.filter((r) => r.cider.category === "sparkling")  ?? [];

  const cfColumns = columnsForLocation(LOC_CIDER_HOUSE);
  const cvColumns = columnsForLocation(LOC_TASTING_ROOM);

  const showCF = locFilter === "both" || locFilter === "cf";
  const showCV = locFilter === "both" || locFilter === "cv";

  // Determine which lock toggle button to show based on filter
  const activeLockToggle = locFilter === "cv"
    ? { locked: cvLocked, toggle: () => cvLockToggle.mutate(), pending: cvLockToggle.isPending }
    : locFilter === "cf"
    ? { locked: cfLocked, toggle: () => cfLockToggle.mutate(), pending: cfLockToggle.isPending }
    : null; // "both" — show per-zone

  const now = new Date();

  return (
    <div className="hcc-entry-layout">
      {/* ── LEFT RAIL ── */}
      <aside className="hcc-entry-rail">
        {/* Month strip */}
        <MonthStrip year={year} activeMonth={month - 1} onSelect={(i) => {
          const now2 = new Date();
          const isFuture = year > now2.getFullYear() || (year === now2.getFullYear() && i > now2.getMonth());
          if (!isFuture) navigate(`/entry/${year}/${i + 1}`);
        }} onPrevYear={() => navigate(`/entry/${year - 1}/${month}`)}
           onNextYear={() => {
             if (year < now.getFullYear()) navigate(`/entry/${year + 1}/${month}`);
           }}
        />

        {/* Lock buttons for current filter */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(locFilter === "both" || locFilter === "cf") && cfLocation && (
            <button
              className={`hcc-btn sm ${cfLocked ? "gold" : "ghost"}`}
              onClick={() => cfLockToggle.mutate()}
              disabled={cfLockToggle.isPending}
            >
              {cfLocked ? "🔒" : "🔓"}
              <span style={{ color: "var(--terracotta)" }}>CF</span>
              {cfLocked ? " Locked" : " Lock Comfort"}
            </button>
          )}
          {(locFilter === "both" || locFilter === "cv") && cvLocation && (
            <button
              className={`hcc-btn sm ${cvLocked ? "gold" : "ghost"}`}
              onClick={() => cvLockToggle.mutate()}
              disabled={cvLockToggle.isPending}
            >
              {cvLocked ? "🔒" : "🔓"}
              <span style={{ color: "var(--gold-deep)" }}>CV</span>
              {cvLocked ? " Locked" : " Lock Castroville"}
            </button>
          )}
        </div>

        {/* Compliance calc panels — always both, regardless of location filter */}
        {cfLocation && (
          <CiderHouseCalc
            lowCurrent={cfLow}       lowPrev={cfPrevLow}
            sparklingCurrent={cfSparkling} sparklingPrev={cfPrevSparkling}
            month={month} year={year}
          />
        )}
        {cvLocation && (
          <TastingRoomCalc
            lowCurrent={cvLow}       lowPrev={cvPrevLow}
            sparklingCurrent={cvSparkling} sparklingPrev={cvPrevSparkling}
            month={month} year={year}
          />
        )}
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="hcc-entry-main">
        {/* Topbar */}
        <div className="hcc-topbar">
          <div>
            <div className="eyebrow">Operations · Monthly Entry</div>
            <h1>{MONTHS_LONG[month - 1]} {year}</h1>
            <div className="sub">
              Cider House &amp; Tasting Room · <em>monthly inventory</em>
            </div>
          </div>
          <div className="hcc-actions">
            <button className="hcc-btn ghost sm" onClick={() => goMonth(-1)}>← Prev</button>
            <button className="hcc-btn ghost sm" onClick={() => goMonth(1)}>Next →</button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="hcc-filterbar">
          <div className="tabs">
            <button
              className={locFilter === "both" ? "active" : ""}
              onClick={() => setLocFilter("both")}
            >
              Both Locations
            </button>
            <button
              className={locFilter === "cv" ? "active" : ""}
              onClick={() => setLocFilter("cv")}
            >
              <span className="loc-dot" style={{ width: 7, height: 7, background: "var(--gold)", borderRadius: "50%" }} />
              Castroville (CV)
            </button>
            <button
              className={locFilter === "cf" ? "active" : ""}
              onClick={() => setLocFilter("cf")}
            >
              <span className="loc-dot" style={{ width: 7, height: 7, background: "var(--terracotta)", borderRadius: "50%" }} />
              Comfort (CF)
            </button>
          </div>
        </div>

        {/* Entry zones */}
        <div className="hcc-content">
          {showCF && cfLocation && (
            <LocationZone
              locationCode="CF"
              locationName="Comfort · Cider House"
              zoneClass="zone cf"
              locked={cfLocked}
              rows={cfLow}
              sparklingRows={cfSparkling}
              columns={cfColumns}
              location={cfLocation}
              year={year} month={month}
              onSave={save.mutate}
              saving={save.isPending}
            />
          )}

          {showCV && cvLocation && (
            <LocationZone
              locationCode="CV"
              locationName="Castroville · Tasting Room"
              zoneClass="zone cv"
              locked={cvLocked}
              rows={cvLow}
              sparklingRows={cvSparkling}
              columns={cvColumns}
              location={cvLocation}
              year={year} month={month}
              onSave={save.mutate}
              saving={save.isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Location zone ────────────────────────────────────────────────────────────

function LocationZone(props: {
  locationCode: "CF" | "CV";
  locationName: string;
  zoneClass: string;
  locked: boolean;
  rows: EntryRow[];
  sparklingRows: EntryRow[];
  columns: { key: EntryFieldKey; label: string }[];
  location: Location;
  year: number;
  month: number;
  onSave: (payload: any) => void;
  saving: boolean;
}) {
  const { locationCode, locationName, zoneClass, locked, rows, sparklingRows, columns, location, year, month, onSave, saving } = props;
  const isCF = locationCode === "CF";

  return (
    <section className={zoneClass}>
      <header className="zone-head">
        <div className="left">
          <div>
            <div className="zone-tag">{locationCode} · Inventory</div>
            <h2>{locationName}</h2>
          </div>
        </div>
        <div className="zone-head right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {locked && (
            <span className="hcc-badge locked">🔒 Locked</span>
          )}
          {saving && (
            <span style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--sans)" }}>Saving…</span>
          )}
          <span
            className="hcc-chip"
            style={{
              background: isCF ? "rgba(182,90,60,0.1)" : "rgba(201,161,74,0.1)",
              color: isCF ? "var(--terracotta-deep)" : "var(--gold-deep)",
              borderColor: isCF ? "rgba(182,90,60,0.35)" : "rgba(201,161,74,0.4)",
            }}
          >
            {locationCode}
          </span>
        </div>
      </header>

      <div className="zone-body tight">
        {/* Low ABV table */}
        <div style={{ padding: "18px 0 0" }}>
          <div style={{
            padding: "0 24px 10px",
            fontFamily: "var(--sans)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase" as const,
            color: "var(--ink-mute)",
            fontWeight: 700,
          }}>
            Low ABV
          </div>
          <div style={{ overflowX: "auto" }}>
            <CategoryTable
              rows={rows}
              columns={columns}
              location={location}
              year={year} month={month}
              onSave={onSave}
              saving={saving}
              locked={locked}
            />
          </div>
        </div>

        {/* Sparkling table */}
        <div style={{ padding: "18px 0 0", borderTop: "1px solid var(--rule)" }}>
          <div style={{
            padding: "0 24px 10px",
            fontFamily: "var(--sans)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase" as const,
            color: "var(--ink-mute)",
            fontWeight: 700,
          }}>
            Sparkling
          </div>
          <div style={{ overflowX: "auto" }}>
            <CategoryTable
              rows={sparklingRows}
              columns={columns}
              location={location}
              year={year} month={month}
              onSave={onSave}
              saving={saving}
              locked={locked}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Compliance calc panels ───────────────────────────────────────────────────

type CalcRow = { label: string; value: number; derived?: boolean };

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
    <CalcPanel title="Cider House" subtitle="CF" tableClass="cf" month={month} year={year}>
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
    { label: "Starting Inventory",       value: c.startingInventory },
    { label: "Ending Inventory",         value: c.endingInventory },
    { label: "Direct Sales Off-Premise", value: c.directSalesOffPremise },
    { label: "Adjusted Bottle Sales",    value: c.adjustedBottleSales, derived: true },
    { label: "Direct Sales On-Premise",  value: c.directSalesOnPremise },
    { label: "Transfer",                 value: c.transfer },
  ];
  return (
    <CalcPanel title="Tasting Room" subtitle="CV" tableClass="cv" month={month} year={year}>
      <CalcBox title="Low ABV"   rows={mkRows(calcTastingRoomCategory(lowCurrent, lowPrev))} />
      <CalcBox title="Sparkling" rows={mkRows(calcTastingRoomCategory(sparklingCurrent, sparklingPrev))} />
    </CalcPanel>
  );
}

function CalcPanel({ title, subtitle, tableClass, month, year, children }: {
  title: string; subtitle: string; tableClass: string; month: number; year: number; children: ReactNode;
}) {
  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        padding: "0 2px 6px",
      }}>
        <span style={{
          fontFamily: "var(--sans)",
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase" as const,
          color: "var(--ink-mute)",
          fontWeight: 700,
        }}>
          {title}
        </span>
        <span style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.1em",
          color: tableClass === "cf" ? "var(--terracotta-deep)" : "var(--gold-deep)",
          fontWeight: 600,
          textTransform: "uppercase" as const,
        }}>
          {subtitle}
        </span>
      </div>
      <div className={`sidetable ${tableClass}`} style={{ marginBottom: 8 }}>
        <div className="head">
          <div className="t">TABC Compliance</div>
          <div className="sub">{MONTHS_SHORT[month - 1]} {year}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function CalcBox({ title, rows }: { title: string; rows: CalcRow[] }) {
  return (
    <>
      <div className="sec">{title}</div>
      {rows.map(({ label, value, derived }) => (
        <div key={label} className={`row ${derived ? "derived" : ""}`}>
          <span className="k">{label}</span>
          <span className="v">
            {value.toFixed(2)}
            <span className="unit">gal</span>
          </span>
        </div>
      ))}
    </>
  );
}

// ─── Category table ───────────────────────────────────────────────────────────

function CategoryTable(props: {
  rows: EntryRow[];
  columns: { key: EntryFieldKey; label: string }[];
  location: Location;
  year: number;
  month: number;
  onSave: (payload: any) => void;
  saving: boolean;
  locked: boolean;
}) {
  const { rows, columns, location, year, month, onSave, locked } = props;

  const totals = Object.fromEntries(
    columns.map((c) => [
      c.key,
      rows.reduce((sum, r) => sum + ((r.entry?.[c.key as keyof typeof r.entry] as number | undefined) ?? 0), 0),
    ])
  ) as Record<EntryFieldKey, number>;

  return (
    <table className="htable">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Cider</th>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <CiderRow
            key={`${r.cider.id}-${year}-${month}`}
            row={r}
            columns={columns}
            location={location}
            year={year} month={month}
            onSave={onSave}
            locked={locked}
          />
        ))}
      </tbody>
      <tfoot>
        <tr className="total-row">
          <td>Total</td>
          {columns.map((c) => (
            <td key={c.key}>{totals[c.key]}</td>
          ))}
        </tr>
        <tr>
          <td>Amount (gal)</td>
          {columns.map((c) => (
            <td key={c.key}>{colGallons(c.key, totals[c.key]).toFixed(2)}</td>
          ))}
        </tr>
      </tfoot>
    </table>
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
    <tr className={locked ? "locked-row" : ""}>
      <td>{row.cider.name}</td>
      {columns.map((c) => (
        <td key={c.key} style={{ padding: "8px 10px" }}>
          <input
            type="number"
            min={0}
            defaultValue={values[c.key]}
            onBlur={(e) => blur(c.key, e.target.value)}
            disabled={locked}
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

// ─── Month strip ──────────────────────────────────────────────────────────────

function MonthStrip({ year, activeMonth, onSelect, onPrevYear, onNextYear }: {
  year: number;
  activeMonth: number; // 0-indexed
  onSelect: (monthIndex: number) => void;
  onPrevYear: () => void;
  onNextYear: () => void;
}) {
  const now    = new Date();
  const nowY   = now.getFullYear();
  const nowM   = now.getMonth();

  return (
    <div className="monthstrip">
      <span className="yr">{year}</span>
      {MONTHS_SHORT.map((m, i) => {
        const future = year > nowY || (year === nowY && i > nowM);
        return (
          <span
            key={m}
            className={`m ${i === activeMonth ? "active" : ""} ${future ? "future" : ""}`}
            onClick={() => !future && onSelect(i)}
          >
            {m}
          </span>
        );
      })}
    </div>
  );
}
