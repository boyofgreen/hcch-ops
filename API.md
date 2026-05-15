# HCCC Ops REST API Reference

**Base URL:** `https://hccc-ops.azurewebsites.net`  
No authentication required.  
All request/response bodies are JSON. Set `Content-Type: application/json` on writes.

---

## Reference IDs

**Locations** (fixed, never change):

| ID | Name |
|----|------|
| 1 | Cider House |
| 2 | Tasting Room |

**Months** are plain integers (1 = January … 12 = December).

---

## Locations

### List locations
```
GET /api/locations
```
```json
[
  { "id": 1, "name": "Cider House" },
  { "id": 2, "name": "Tasting Room" }
]
```

---

## Ciders

### List all ciders
```
GET /api/ciders
```
```json
[
  { "id": 3, "name": "Blueberry Buckle", "category": "low", "active": true, "sortOrder": 0 },
  { "id": 7, "name": "Honey Crisp", "category": "sparkling", "active": true, "sortOrder": 0 }
]
```
`category` is always `"low"` or `"sparkling"`.

### Add a cider
```
POST /api/ciders
```
```json
{ "name": "Peach Fuzz", "category": "low" }
```
Returns `201` + the created cider object.

### Update a cider
```
PATCH /api/ciders/:id
```
```json
{ "active": false }
```
Any combination of `name`, `category`, `active`, `sortOrder` — all optional.

### Delete a cider
```
DELETE /api/ciders/:id
```
Returns `204 No Content`. **Warning:** deletes all historical entries for that cider too.

---

## Monthly Entries

Each cider × location × month has one entry row.

### Read a month's entries
```
GET /api/entries?locationId=1&year=2026&month=4
```
Returns one object per active cider. `entry` is `null` if nothing has been entered yet:
```json
[
  {
    "cider": { "id": 3, "name": "Blueberry Buckle", "category": "low" },
    "entry": {
      "id": 42,
      "locationId": 1,
      "ciderId": 3,
      "year": 2026,
      "month": 4,
      "bottlesOnHand": 24,
      "kegsOnHand": 2,
      "togoBottles": 0,
      "togoKegs": 0,
      "retailBottles": 12,
      "retailKegs": 0,
      "transfersInBottles": 0,
      "transfersInKegs": 0,
      "transfersOutBottles": 0,
      "transfersOutKegs": 0,
      "notes": null,
      "updatedAt": "2026-04-15T18:32:00.000Z"
    }
  },
  {
    "cider": { "id": 7, "name": "Honey Crisp", "category": "sparkling" },
    "entry": null
  }
]
```

### Write / update an entry
```
PUT /api/entries
```
**Upsert** — creates the row if it doesn't exist, updates it if it does.
Omitted numeric fields default to `0`.

```json
{
  "locationId": 1,
  "ciderId": 3,
  "year": 2026,
  "month": 4,
  "bottlesOnHand": 24,
  "kegsOnHand": 2,
  "togoBottles": 0,
  "togoKegs": 0,
  "retailBottles": 12,
  "retailKegs": 0,
  "transfersInBottles": 0,
  "transfersInKegs": 0,
  "transfersOutBottles": 0,
  "transfersOutKegs": 0,
  "notes": "Moved 1 keg from CH to TR"
}
```
Returns the saved entry row.

**⚠️ Locked months return `423`:**
```json
{ "error": "This month is locked. Unlock it before making changes." }
```

### Entry field reference

| Field | Meaning |
|-------|---------|
| `bottlesOnHand` | Ending inventory — 750 ml bottles |
| `kegsOnHand` | Ending inventory — sixtel kegs (5.16 gal) |
| `togoBottles` / `togoKegs` | To-go sales |
| `retailBottles` / `retailKegs` | On-premise retail sales |
| `transfersInBottles` / `transfersInKegs` | Received from other location |
| `transfersOutBottles` / `transfersOutKegs` | Sent to other location |

---

## Month Locks

Locked months reject any `PUT /api/entries` with a `423`.
Jan, Feb, and Mar 2026 are pre-locked for both locations.

### Check if a month is locked
```
GET /api/locks?locationId=1&year=2026&month=3
```
```json
{ "locked": true, "lockedAt": "2026-05-15T02:19:07.388Z" }
```

### Lock a month
```
PUT /api/locks
```
```json
{ "locationId": 1, "year": 2026, "month": 4 }
```
```json
{ "locked": true, "lockedAt": "2026-05-15T..." }
```

### Unlock a month
```
DELETE /api/locks
```
```json
{ "locationId": 1, "year": 2026, "month": 3 }
```
```json
{ "locked": false, "lockedAt": null }
```

---

## Report Summary

Pre-aggregated totals by category with gallon conversions already calculated.
Use this for TABC report numbers rather than summing entries yourself.

```
GET /api/reports/monthly?locationId=1&year=2026&month=4
```
```json
{
  "location": { "id": 1, "name": "Cider House" },
  "year": 2026,
  "month": 4,
  "conversions": {
    "sixtelGallons": 5.16,
    "bottleGallons": 0.19813
  },
  "categories": {
    "low": {
      "startBottles": 48,  "startKegs": 3,
      "endBottles": 24,    "endKegs": 2,
      "togoBottles": 6,    "togoKegs": 0,
      "retailBottles": 18, "retailKegs": 1,
      "transfersInBottles": 0,  "transfersInKegs": 0,
      "transfersOutBottles": 0, "transfersOutKegs": 0,
      "startGallons": 24.95,   "endGallons": 14.99,
      "togoGallons": 1.19,     "retailGallons": 8.74,
      "transfersInGallons": 0, "transfersOutGallons": 0
    },
    "sparkling": { "..." : "same shape" }
  },
  "rows": [ "...per-cider detail rows..." ]
}
```

**Note on `startBottles` / `startKegs`:** the report derives these from the
*previous* month's `bottlesOnHand` / `kegsOnHand`, so you don't need to track
opening inventory separately — just enter ending inventory each month.

---

## Typical Workflow for Entering a Month

```
# 1. Get the cider list to find cider IDs
GET /api/ciders

# 2. Read current entries to see what's already there
GET /api/entries?locationId=1&year=2026&month=4

# 3. Write each cider's numbers (one PUT per cider)
PUT /api/entries
{ "locationId": 1, "ciderId": 3, "year": 2026, "month": 4,
  "bottlesOnHand": 24, "kegsOnHand": 2, "retailBottles": 12, ... }

# 4. Lock the month when done
PUT /api/locks
{ "locationId": 1, "year": 2026, "month": 4 }

# 5. Pull the report summary to verify numbers
GET /api/reports/monthly?locationId=1&year=2026&month=4
```

---

## Gallon Conversions

| Unit | Gallons |
|------|---------|
| 750 ml bottle | 0.19813 |
| Sixtel keg | 5.16 |

Formula: `gallons = (bottles × 0.19813) + (kegs × 5.16)`
