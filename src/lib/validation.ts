import { EventType, Role, ShowStatus } from "@/generated/prisma/client";

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
  city: string;
  address?: string;
  auditorium: string;
  rows: number;
  cols: number;
  categories: VenueCategoryInput[];
};

export function validateVenueInput(body: unknown): VenueInput {
  if (!body || typeof body !== "object") throw new ValidationError("Invalid venue data");
  const input = body as Record<string, unknown>;
  const name = validateName(input.name, "Venue name");
  const city = input.city === undefined ? "Delhi" : validateName(input.city, "City");
  const auditorium = input.auditorium === undefined
    ? "Main Auditorium"
    : validateName(input.auditorium, "Auditorium");
  const address = typeof input.address === "string" ? input.address.trim() : undefined;
  if (address && address.length > 200) throw new ValidationError("Address is too long");
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

  return { name, city, address: address || undefined, auditorium, rows, cols, categories };
}

export type EventInput = {
  title: string;
  type: EventType;
  description?: string;
  language: string;
  format: string;
  genre: string;
  durationMinutes: number;
  certificate?: string;
  releaseDate?: string;
  castNames: string;
  crewNames: string;
  trailerUrl?: string;
  formats: string;
  performerNames: string;
  ageRule?: string;
  entryRule?: string;
  status: ShowStatus;
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

  const language = input.language === undefined ? "Hindi" : validateName(input.language, "Language");
  const format = input.format === undefined
    ? (input.type === EventType.MOVIE ? "2D" : "Live")
    : validateName(input.format, "Format");
  const genre = input.genre === undefined
    ? (input.type === EventType.MOVIE ? "Cinema" : "Music")
    : validateName(input.genre, "Genre");
  const durationMinutes = input.durationMinutes === undefined
    ? (input.type === EventType.MOVIE ? 150 : 180)
    : Number(input.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 600) {
    throw new ValidationError("Duration must be between 15 and 600 minutes");
  }
  const certificate = typeof input.certificate === "string" ? input.certificate.trim().toUpperCase() : undefined;
  if (certificate && !/^[A-Z0-9+ -]{1,12}$/.test(certificate)) {
    throw new ValidationError("Certificate must be 1 to 12 letters or numbers");
  }
  const releaseDate = optionalDate(input.releaseDate, "release date");
  const castNames = listField(input.castNames, "Cast");
  const crewNames = listField(input.crewNames, "Crew");
  const performerNames = listField(input.performerNames, "Performers");
  const formats = listField(input.formats, "Formats") || format;
  const trailerUrl = optionalUrl(input.trailerUrl, "Trailer URL");
  const ageRule = optionalText(input.ageRule, "Age rule", 200);
  const entryRule = optionalText(input.entryRule, "Entry rule", 300);
  const status = Object.values(ShowStatus).includes(input.status as ShowStatus) ? input.status as ShowStatus : ShowStatus.PUBLISHED;

  return {
    title,
    type: input.type,
    description: description || undefined,
    language,
    format,
    genre,
    durationMinutes,
    certificate: certificate || undefined,
    releaseDate,
    castNames,
    crewNames,
    trailerUrl,
    formats,
    performerNames,
    ageRule,
    entryRule,
    status,
    venueId: input.venueId,
    date: input.date,
    time: input.time,
    prices,
  };
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > maxLength) throw new ValidationError(`${label} is too long`);
  return value.trim();
}

function listField(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new ValidationError(`${label} must be text`);
  const items = value.split(/[|,]/).map((item) => item.trim()).filter(Boolean);
  if (items.length > 30 || items.some((item) => item.length > 80)) throw new ValidationError(`${label} contains too many or overly long entries`);
  return items.join("|");
}

function optionalDate(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`Enter a valid ${label}`);
  return value;
}

function optionalUrl(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 500) throw new ValidationError(`${label} is invalid`);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw new ValidationError(`${label} must be an HTTP or HTTPS URL`);
  }
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
