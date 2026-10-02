/**
 * Transport-safe contracts shared by the current UI and the planned React client.
 *
 * Keep this module framework independent: no Next.js, Prisma, Node.js, or browser
 * imports. The same definitions can therefore move into `packages/shared` when
 * the React + Express workspace is introduced in Phase 1.
 */

export type UserRole = "ADMIN" | "ORGANISER" | "CUSTOMER";
export type EventType = "MOVIE" | "CONCERT";
export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED";
export type BookingStatus = "CONFIRMED" | "CANCELLED";
export type WaitlistStatus = "WAITING" | "OFFERED" | "FULFILLED" | "EXPIRED";

export type AuthUserDto = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
  categories: VenueCategoryDto[];
  seats: { categoryId: string; row: number }[];
  _count: { events: number };
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
  isFavourite: boolean;
  date: string;
  time: string;
  venue: { name: string; city: string; auditorium: string };
  organiser: { name: string };
  prices: EventPriceDto[];
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
  seat: {
    label: string;
    row: number;
    col: number;
    categoryId: string;
    category: { name: string; color: string };
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
};

export type BookingDto = {
  id: string;
  ref: string;
  status: BookingStatus;
  totalAmount: number;
  event: {
    id: string;
    title: string;
    type: EventType;
    date: string;
    time: string;
    venue: { name: string };
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
  event: { title: string; date: string; time: string };
  totalBookings: number;
  revenue: number;
  byCategory: Array<{ category: string; booked: number; price: number }>;
};

export type ApiErrorDto = { error: string };
