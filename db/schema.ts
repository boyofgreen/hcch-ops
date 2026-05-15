import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  tabcLicense: text("tabc_license"),
});

export const ciders = sqliteTable("ciders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  category: text("category").notNull(), // 'low' | 'sparkling'
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const monthlyEntries = sqliteTable(
  "monthly_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    ciderId: integer("cider_id")
      .notNull()
      .references(() => ciders.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    bottlesOnHand: integer("bottles_on_hand").notNull().default(0),
    kegsOnHand: integer("kegs_on_hand").notNull().default(0),
    togoBottles: integer("togo_bottles").notNull().default(0),
    togoKegs: integer("togo_kegs").notNull().default(0),
    retailBottles: integer("retail_bottles").notNull().default(0),
    retailKegs: integer("retail_kegs").notNull().default(0),
    transfersInBottles: integer("transfers_in_bottles").notNull().default(0),
    transfersInKegs: integer("transfers_in_kegs").notNull().default(0),
    transfersOutBottles: integer("transfers_out_bottles").notNull().default(0),
    transfersOutKegs: integer("transfers_out_kegs").notNull().default(0),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    uniq: uniqueIndex("monthly_entries_unique").on(t.locationId, t.ciderId, t.year, t.month),
    locMonth: index("monthly_entries_loc_month").on(t.locationId, t.year, t.month),
  })
);

export const monthlyLocks = sqliteTable(
  "monthly_locks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    lockedAt: text("locked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    uniq: uniqueIndex("monthly_locks_unique").on(t.locationId, t.year, t.month),
  })
);

export type Location = typeof locations.$inferSelect;
export type Cider = typeof ciders.$inferSelect;
export type MonthlyEntry = typeof monthlyEntries.$inferSelect;
export type NewMonthlyEntry = typeof monthlyEntries.$inferInsert;
