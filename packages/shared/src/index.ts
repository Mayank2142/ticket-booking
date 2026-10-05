/**
 * Transport-safe contracts shared by CineBook clients and servers.
 *
 * Keep this package framework independent: it must not import browser, HTTP
 * server, database, or application implementation modules.
 */
export type UserRole = "ADMIN" | "ORGANISER" | "CUSTOMER";
export type EventType = "MOVIE" | "CONCERT";
export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED" | "UNAVAILABLE";
export type SeatType = "STANDARD" | "WHEELCHAIR" | "COMPANION";
export type BookingStatus = "CONFIRMED" | "CANCELLED";
export type WaitlistStatus = "WAITING" | "OFFERED" | "FULFILLED" | "EXPIRED";
export type ShowStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "ARCHIVED";
export type DiscoverySort = "date" | "price-asc" | "price-desc" | "trending";

export type AuthUserDto = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type CustomerProfileDto = AuthUserDto & {
  reminderEmails: boolean;
  waitlistAlerts: boolean;
  emailVerifiedAt: string | null;
};

export type VenueCategoryDto = {
  id: string;
  name: string;
  color: string;
};

export type VenueDto = {
  id: string;
  name: string;
  city: string;
  address?: string | null;
  auditorium: string;
  rows: number;
  cols: number;
  archivedAt?: string | null;
  categories: VenueCategoryDto[];
  seats: Array<{
    categoryId: string;
    row: number;
    col: number;
    label: string;
    seatType: SeatType;
    aisleAfter: boolean;
    isBlocked: boolean;
    viewLabel?: string | null;
    viewScore?: number | null;
  }>;
  _count: { events: number };
  cityRecord?: { id: string; name: string; slug: string } | null;
  auditoriums?: Array<{ id: string; name: string; rows: number; cols: number; archivedAt?: string | null }>;
};

export type VenueOptionDto = Pick<VenueDto, "id" | "name" | "city" | "auditorium"> & {
  categories: Array<Pick<VenueCategoryDto, "id" | "name">>;
};

export type EventPriceDto = {
  categoryId?: string;
  price: number;
  category: { name: string };
};

export type EventSummaryDto = {
  id: string;
  contentId?: string | null;
  title: string;
  type: EventType;
  description?: string | null;
  language: string;
  format: string;
  genre: string;
  durationMinutes: number;
  certificate?: string | null;
  posterUrl?: string | null;
  releaseDate?: string | null;
  cast: string[];
  crew: string[];
  trailerUrl?: string | null;
  formats: string[];
  performers: string[];
  ageRule?: string | null;
  entryRule?: string | null;
  status: ShowStatus;
  trendingScore?: number;
  isFavourite: boolean;
  date: string;
  time: string;
  venue: { name: string; city: string; auditorium: string };
  organiser: { name: string };
  prices: EventPriceDto[];
};

export type DiscoveryOptionsDto = {
  cities: string[];
  genres: string[];
  venues: Array<{ id: string; name: string; city: string }>;
  languages: string[];
  formats: string[];
};

export type PaginatedEventsDto = {
  events: EventSummaryDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type EventDetailDto = Omit<EventSummaryDto, "venue" | "prices"> & {
  venue: {
    name: string;
    city: string;
    address?: string | null;
    auditorium: string;
    categories: VenueCategoryDto[];
  };
  prices: Array<Required<Pick<EventPriceDto, "categoryId" | "price">> & Pick<EventPriceDto, "category">>;
  showtimes: Array<{
    id: string;
    date: string;
    time: string;
    venue: { name: string; city: string; auditorium: string };
    startingPrice: number;
  }>;
};

export type ShowSeatDto = {
  seatId: string;
  status: SeatStatus;
  heldByMe: boolean;
  unavailableReason?: string | null;
  seat: {
    label: string;
    row: number;
    col: number;
    categoryId: string;
    category: { name: string; color: string };
    seatType: SeatType;
    aisleAfter: boolean;
    isBlocked: boolean;
    viewLabel?: string | null;
    viewScore?: number | null;
  };
};

export type SeatMapDto = {
  showSeats: ShowSeatDto[];
  layout: { rows: number; cols: number };
  availability: Record<string, number>;
};

export type WaitlistOfferDto = {
  seatId: string | null;
  seatLabel: string | null;
  categoryName: string;
  expiresAt: string | null;
};

export type WaitlistEntryDto = {
  id: string;
  position: number;
  status: WaitlistStatus;
  category: { id: string; name: string };
  offerToken?: string | null;
  offerExpiresAt?: string | null;
  offeredSeatId?: string | null;
  createdAt?: string;
  event?: {
    id: string;
    title: string;
    date: string;
    time: string;
    type: EventType;
    content?: { posterUrl: string | null } | null;
    venue: { name: string; city: string };
  };
};

export type BookingDto = {
  id: string;
  ref: string;
  status: BookingStatus;
  totalAmount: number;
  createdAt: string;
  event: {
    id: string;
    title: string;
    type: EventType;
    date: string;
    time: string;
    content?: { posterUrl: string | null } | null;
    venue: { name: string; city: string; auditorium: string };
  };
  seats: Array<{ seat: { label: string } }>;
};

export type BookingConfirmationDto = {
  ref: string;
  total: number;
  seats: string[];
  emailDelivered: boolean;
  emailMessage: string;
};

export type EventSalesSummaryDto = {
  event: { id?: string; title: string; date: string; time: string; status?: ShowStatus };
  totalBookings: number;
  revenue: number;
  byCategory: Array<{ category: string; booked: number; price: number }>;
  inventory?: { available: number; held: number; booked: number; unavailable: number; waitlisted: number };
  bookings?: Array<{
    id: string;
    ref: string;
    customer: { name: string; email: string };
    seats: string[];
    totalAmount: number;
    createdAt: string;
  }>;
};

export type ApiErrorDto = { error: string };
