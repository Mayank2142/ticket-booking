import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { BookingsPage } from "./pages/BookingsPage";
import { EventPage } from "./pages/EventPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AdminVenuesPage } from "./pages/AdminVenuesPage";
import { NewEventPage } from "./pages/NewEventPage";
import { OrganiserEventsPage } from "./pages/OrganiserEventsPage";
import { OrganiserReportPage } from "./pages/OrganiserReportPage";
import { CataloguePage } from "./pages/CataloguePage";
import { AccountPage } from "./pages/AccountPage";
import { BookingDetailsPage } from "./pages/BookingDetailsPage";
import { WaitlistPage } from "./pages/WaitlistPage";
import { OrganiserEditPage } from "./pages/OrganiserEditPage";
import { OrganiserReportsPage } from "./pages/OrganiserReportsPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { SavedPage } from "./pages/SavedPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="movies" element={<CataloguePage type="MOVIE" />} />
        <Route path="live-events" element={<CataloguePage type="CONCERT" />} />
        <Route path="search" element={<CataloguePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="events/:eventId" element={<EventPage />} />
        <Route element={<ProtectedRoute roles={["CUSTOMER"]} />}>
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="bookings/:bookingId" element={<BookingDetailsPage />} />
          <Route path="waitlist" element={<WaitlistPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="saved" element={<SavedPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={["ORGANISER", "ADMIN"]} />}>
          <Route path="organiser/events" element={<OrganiserEventsPage />} />
          <Route path="organiser/events/new" element={<NewEventPage />} />
          <Route path="organiser/events/:eventId" element={<OrganiserReportPage />} />
          <Route path="organiser/events/:eventId/edit" element={<OrganiserEditPage />} />
          <Route path="organiser/reports" element={<OrganiserReportsPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
          <Route path="admin" element={<AdminDashboardPage />} />
          <Route path="admin/venues" element={<AdminVenuesPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
