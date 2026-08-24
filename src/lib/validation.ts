import { EventType, Role } from "@/generated/prisma/client";

export class ValidationError extends Error {}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") throw new ValidationError("Email is required");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ValidationError("Enter a valid email address");
  }
  return email;
}

export function validateName(value: unknown, label = "Name") {
  if (typeof value !== "string") throw new ValidationError(`${label} is required`);
  const name = value.trim();
  if (name.length < 2 || name.length > 80) {
    throw new ValidationError(`${label} must be between 2 and 80 characters`);
  }
  return name;
}

export function validatePassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ValidationError("Password must be between 8 and 128 characters");
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new ValidationError("Password must contain at least one letter and one number");
  }
  return value;
}

export function validateRegistrationRole(value: unknown): Role {
  return value === Role.ORGANISER ? Role.ORGANISER : Role.CUSTOMER;
}

export type VenueCategoryInput = {
  name: string;
  color: string;
  rows: number[];
};

export type VenueInput = {
  name: string;
  rows: number;
  cols: number;
  categories: VenueCategoryInput[];
};

export function validateVenueInput(body: unknown): VenueInput {
  if (!body || typeof body !== "object") throw new ValidationError("Invalid venue data");
  const input = body as Record<string, unknown>;
  const name = validateName(input.name, "Venue name");
  const rows = Number(input.rows);
  const cols = Number(input.cols);

  if (!Number.isInteger(rows) || rows < 1 || rows > 50) {
    throw new ValidationError("Rows must be a whole number between 1 and 50");
  }
  if (!Number.isInteger(cols) || cols < 1 || cols > 50) {
    throw new ValidationError("Columns must be a whole number between 1 and 50");
  }
  if (!Array.isArray(input.categories) || input.categories.length < 1 || input.categories.length > 10) {
    throw new ValidationError("Add between 1 and 10 seat categories");
  }

  const usedNames = new Set<string>();
  const usedRows = new Set<number>();
  const categories = input.categories.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      throw new ValidationError(`Category ${index + 1} is invalid`);
    }
    const category = raw as Record<string, unknown>;
    const categoryName = validateName(category.name, `Category ${index + 1} name`);
    const nameKey = categoryName.toLowerCase();
    if (usedNames.has(nameKey)) throw new ValidationError("Category names must be unique");
    usedNames.add(nameKey);

    const color = typeof category.color === "string" ? category.color.trim() : "";
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new ValidationError(`${categoryName} must have a valid hex colour`);
    }
    if (!Array.isArray(category.rows) || category.rows.length === 0) {
      throw new ValidationError(`${categoryName} must contain at least one row`);
    }

    const categoryRows = category.rows.map(Number);
    const localRows = new Set<number>();
    for (const row of categoryRows) {
      if (!Number.isInteger(row) || row < 1 || row > rows) {
        throw new ValidationError(`${categoryName} contains an out-of-range row`);
      }
      if (localRows.has(row) || usedRows.has(row)) {
        throw new ValidationError(`Row ${row} is assigned more than once`);
      }
      localRows.add(row);
      usedRows.add(row);
    }

    return { name: categoryName, color: color.toLowerCase(), rows: categoryRows.sort((a, b) => a - b) };
  });

  const missingRows = Array.from({ length: rows }, (_, index) => index + 1).filter((row) => !usedRows.has(row));
  if (missingRows.length) {
    throw new ValidationError(`Every row needs a category. Missing: ${missingRows.join(", ")}`);
  }

  return { name, rows, cols, categories };
}

export type EventInput = {
  title: string;
  type: EventType;
  description?: string;
  venueId: string;
  date: string;
  time: string;
  prices: { categoryId: string; price: number }[];
};

export function validateEventInput(body: unknown): EventInput {
  if (!body || typeof body !== "object") throw new ValidationError("Invalid event data");
  const input = body as Record<string, unknown>;
  const title = validateName(input.title, "Event title");
  if (input.type !== EventType.MOVIE && input.type !== EventType.CONCERT) {
    throw new ValidationError("Event type must be MOVIE or CONCERT");
  }
  if (typeof input.venueId !== "string" || !input.venueId.trim()) {
    throw new ValidationError("Venue is required");
  }
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new ValidationError("Enter a valid event date");
  }
  if (typeof input.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    throw new ValidationError("Enter a valid event time");
  }
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  const eventDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  const exactDate =
    eventDate.getFullYear() === year &&
    eventDate.getMonth() === month - 1 &&
    eventDate.getDate() === day &&
    eventDate.getHours() === hour &&
    eventDate.getMinutes() === minute;
  if (!exactDate || eventDate.getTime() <= Date.now()) {
    throw new ValidationError("Event date and time must be in the future");
  }
  if (!Array.isArray(input.prices) || input.prices.length === 0) {
    throw new ValidationError("Add a price for every seat category");
  }

  const categoryIds = new Set<string>();
  const prices = input.prices.map((raw) => {
    if (!raw || typeof raw !== "object") throw new ValidationError("Invalid category price");
    const price = raw as Record<string, unknown>;
    if (typeof price.categoryId !== "string" || !price.categoryId) {
      throw new ValidationError("Category is required for every price");
    }
    if (categoryIds.has(price.categoryId)) throw new ValidationError("Each category can only have one price");
    categoryIds.add(price.categoryId);
    const amount = Number(price.price);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      throw new ValidationError("Prices must be greater than zero and no more than 1,000,000");
    }
    return { categoryId: price.categoryId, price: Math.round(amount * 100) / 100 };
  });

  const description = typeof input.description === "string" ? input.description.trim() : undefined;
  if (description && description.length > 2000) throw new ValidationError("Description is too long");

  return {
    title,
    type: input.type,
    description: description || undefined,
    venueId: input.venueId,
    date: input.date,
    time: input.time,
    prices,
  };
}

export function validateSeatIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new ValidationError("Select between 1 and 10 seats");
  }
  if (value.some((id) => typeof id !== "string" || !id)) {
    throw new ValidationError("Invalid seat selection");
  }
  const unique = Array.from(new Set<string>(value));
  if (unique.length !== value.length) throw new ValidationError("Duplicate seats are not allowed");
  return unique;
}
