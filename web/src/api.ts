export type Location = { id: number; name: string; slug: string; tabcLicense: string | null };
export type Cider = { id: number; name: string; category: "low" | "sparkling"; active: boolean; sortOrder: number };
export type MonthlyEntry = {
  id: number;
  locationId: number;
  ciderId: number;
  year: number;
  month: number;
  bottlesOnHand: number;
  kegsOnHand: number;
  togoBottles: number;
  togoKegs: number;
  retailBottles: number;
  retailKegs: number;
  transfersInBottles: number;
  transfersInKegs: number;
  transfersOutBottles: number;
  transfersOutKegs: number;
  notes: string | null;
};
export type EntryRow = { cider: Cider; entry: MonthlyEntry | null };

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type LockStatus = { locked: boolean; lockedAt: string | null };

export const api = {
  locations: () => jsonFetch<Location[]>("/api/locations"),
  lockStatus: (locationId: number, year: number, month: number) =>
    jsonFetch<LockStatus>(`/api/locks?locationId=${locationId}&year=${year}&month=${month}`),
  lockMonth: (locationId: number, year: number, month: number) =>
    jsonFetch<LockStatus>("/api/locks", { method: "PUT", body: JSON.stringify({ locationId, year, month }) }),
  unlockMonth: (locationId: number, year: number, month: number) =>
    jsonFetch<LockStatus>("/api/locks", { method: "DELETE", body: JSON.stringify({ locationId, year, month }) }),
  ciders: () => jsonFetch<Cider[]>("/api/ciders"),
  createCider: (body: { name: string; category: "low" | "sparkling" }) =>
    jsonFetch<Cider>("/api/ciders", { method: "POST", body: JSON.stringify(body) }),
  updateCider: (id: number, body: Partial<Pick<Cider, "name" | "category" | "active" | "sortOrder">>) =>
    jsonFetch<Cider>(`/api/ciders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCider: (id: number) =>
    fetch(`/api/ciders/${id}`, { method: "DELETE" }).then((r) => { if (!r.ok && r.status !== 204) throw new Error(`${r.status}`); }),
  entries: (locationId: number, year: number, month: number) =>
    jsonFetch<EntryRow[]>(`/api/entries?locationId=${locationId}&year=${year}&month=${month}`),
  saveEntry: (body: Partial<MonthlyEntry> & { locationId: number; ciderId: number; year: number; month: number }) =>
    jsonFetch<MonthlyEntry>("/api/entries", { method: "PUT", body: JSON.stringify(body) }),
  monthlyReport: (locationId: number, year: number, month: number) =>
    jsonFetch<MonthlyReport>(`/api/reports/monthly?locationId=${locationId}&year=${year}&month=${month}`),
};

export type CategorySummary = {
  startBottles: number; startKegs: number;
  endBottles: number; endKegs: number;
  togoBottles: number; togoKegs: number;
  retailBottles: number; retailKegs: number;
  transfersInBottles: number; transfersInKegs: number;
  transfersOutBottles: number; transfersOutKegs: number;
  startGallons: number; endGallons: number;
  togoGallons: number; retailGallons: number;
  transfersInGallons: number; transfersOutGallons: number;
};

export type MonthlyReport = {
  location: Location;
  year: number;
  month: number;
  conversions: { sixtelGallons: number; bottleGallons: number };
  categories: Record<"low" | "sparkling", CategorySummary>;
  rows: Array<{ cider: Cider } & Omit<CategorySummary, "startGallons" | "endGallons" | "togoGallons" | "retailGallons" | "transfersInGallons" | "transfersOutGallons">>;
};
