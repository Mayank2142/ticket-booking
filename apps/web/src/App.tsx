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

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="events/:eventId" element={<EventPage />} />
        <Route element={<ProtectedRoute roles={["CUSTOMER"]} />}>
          <Route path="bookings" element={<BookingsPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={["ORGANISER", "ADMIN"]} />}>
          <Route path="organiser/events" element={<OrganiserEventsPage />} />
          <Route path="organiser/events/new" element={<NewEventPage />} />
          <Route path="organiser/events/:eventId" element={<OrganiserReportPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
          <Route path="admin/venues" element={<AdminVenuesPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
