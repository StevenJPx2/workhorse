import { customType } from "drizzle-orm/sqlite-core";

/**
 * Custom date column that stores as TEXT but returns as Date object.
 * Format: "YYYY-MM-DD HH:MM:SS" (SQLite datetime format)
 */
export const dateText = customType<{ data: Date; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value: Date): string {
    return value.toISOString().replace("T", " ").slice(0, 19);
  },
  fromDriver(value: string): Date {
    return new Date(value.replace(" ", "T") + "Z");
  },
});

/**
 * Custom nullable date column that stores as TEXT but returns as Date | null.
 */
export const nullableDateText = customType<{ data: Date | null; driverData: string | null }>({
  dataType() {
    return "text";
  },
  toDriver(value: Date | null): string | null {
    return value ? value.toISOString().replace("T", " ").slice(0, 19) : null;
  },
  fromDriver(value: string | null): Date | null {
    return value ? new Date(value.replace(" ", "T") + "Z") : null;
  },
});
