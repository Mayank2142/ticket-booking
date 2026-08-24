import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "CineBook — Movies & Live Events",
  description: "Discover movies and concerts, choose your seats, and get secure QR tickets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen flex-col bg-[#020806] text-white antialiased">
        <Nav />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 lg:px-6 lg:py-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
