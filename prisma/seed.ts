import { EventType, Role, SeatStatus, SeatType } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { seatLabel } from "../src/lib/seats-label";

async function main() {
  const password = await bcrypt.hash("password123", 10);

  await db.user.upsert({
    where: { email: "admin@demo.com" },
    update: { emailVerifiedAt: new Date() },
    create: { email: "admin@demo.com", name: "Admin", password, role: Role.ADMIN, emailVerifiedAt: new Date() },
  });

  await db.user.upsert({
    where: { email: "organiser@demo.com" },
    update: { emailVerifiedAt: new Date() },
    create: { email: "organiser@demo.com", name: "Organiser", password, role: Role.ORGANISER, emailVerifiedAt: new Date() },
  });

  await db.user.upsert({
    where: { email: "customer@demo.com" },
    update: { emailVerifiedAt: new Date() },
    create: { email: "customer@demo.com", name: "Customer", password, role: Role.CUSTOMER, emailVerifiedAt: new Date() },
  });

  const baseCity = await upsertCity("Delhi NCR");
  const venue = await db.venue.upsert({
    where: { id: "seed-venue" },
    update: { city: "Delhi NCR", cityId: baseCity.id, address: "Central Arts District", auditorium: "Emerald Hall" },
    create: {
      id: "seed-venue",
      name: "City Arena",
      city: "Delhi NCR",
      cityId: baseCity.id,
      address: "Central Arts District",
      auditorium: "Emerald Hall",
      rows: 5,
      cols: 8,
    },
  });

  const premium = await db.seatCategory.upsert({
    where: { id: "seed-premium" },
    update: {},
    create: { id: "seed-premium", venueId: venue.id, name: "Premium", color: "#f59e0b" },
  });

  const standard = await db.seatCategory.upsert({
    where: { id: "seed-standard" },
    update: {},
    create: { id: "seed-standard", venueId: venue.id, name: "Standard", color: "#6366f1" },
  });

  const seatCount = await db.seat.count({ where: { venueId: venue.id } });
  if (!seatCount) {
    for (let row = 1; row <= 5; row++) {
      const categoryId = row <= 2 ? premium.id : standard.id;
      for (let col = 1; col <= 8; col++) {
        await db.seat.create({
          data: {
            venueId: venue.id,
            categoryId,
            row,
            col,
            label: seatLabel(row, col),
          },
        });
      }
    }
  }
  await configureAccessibleLayout(venue.id, 5, 8);

  const organiser = await db.user.findUnique({ where: { email: "organiser@demo.com" } });
  if (!organiser) return;

  const content = await db.content.upsert({
    where: { identityKey: "concert:summer-concert:english:live" },
    update: {},
    create: {
      identityKey: "concert:summer-concert:english:live",
      title: "Summer Concert",
      type: "CONCERT",
      description: "An immersive live music night with arena-scale production.",
      language: "English",
      format: "Live",
      genre: "Pop",
      durationMinutes: 180,
      certificate: "ALL",
    },
  });
  const baseAuditorium = await db.auditorium.upsert({
    where: { venueId_name: { venueId: venue.id, name: "Emerald Hall" } },
    update: { rows: 5, cols: 8 },
    create: { venueId: venue.id, name: "Emerald Hall", rows: 5, cols: 8 },
  });

  const existingEvent = await db.show.findFirst({ where: { title: "Summer Concert" } });
  if (existingEvent) {
    await db.show.update({ where: { id: existingEvent.id }, data: { contentId: content.id, auditoriumId: baseAuditorium.id } });
  } else {
    const seats = await db.seat.findMany({ where: { venueId: venue.id } });
    const event = await db.show.create({
      data: {
        title: "Summer Concert",
        type: "CONCERT",
        description: "Live music night",
        contentId: content.id,
        venueId: venue.id,
        auditoriumId: baseAuditorium.id,
        date: "2030-09-15",
        time: "19:30",
        organiserId: organiser.id,
        prices: {
          create: [
            { categoryId: premium.id, price: 1200 },
            { categoryId: standard.id, price: 600 },
          ],
        },
      },
    });

    await db.showSeat.createMany({
      data: seats.map((seat) => ({
        eventId: event.id,
        seatId: seat.id,
        status: seat.isBlocked ? SeatStatus.UNAVAILABLE : SeatStatus.AVAILABLE,
        unavailableReason: seat.isBlocked ? "Blocked auditorium position" : null,
      })),
    });
  }
  await db.showSeat.updateMany({
    where: { event: { venueId: venue.id }, status: SeatStatus.AVAILABLE, seat: { isBlocked: true } },
    data: { status: SeatStatus.UNAVAILABLE, unavailableReason: "Blocked auditorium position" },
  });

  const showcase = [
    {
      identityKey: "movie:dune-part-two:english:imax-70mm",
      title: "Dune: Part Two",
      type: EventType.MOVIE,
      description: "Paul Atreides unites with Chani and the Fremen while seeking revenge against those who destroyed his family.",
      language: "English",
      format: "IMAX 70MM",
      genre: "Sci-Fi · Adventure",
      durationMinutes: 166,
      certificate: "U/A 16+",
      posterUrl: "/images/stitch/dune-part-two.jpg",
      date: "2026-10-03",
      time: "19:45",
      prices: [850, 350],
      venue: { id: "seed-pvr-vegas", name: "PVR Vegas IMAX", city: "Delhi NCR", address: "Vegas Mall, Dwarka", auditorium: "IMAX Laser" },
    },
    {
      identityKey: "movie:oppenheimer:english:imax-70mm",
      title: "Oppenheimer: 70mm",
      type: EventType.MOVIE,
      description: "Christopher Nolan's epic portrait of J. Robert Oppenheimer, presented in authentic large-format cinema.",
      language: "English",
      format: "IMAX 70MM",
      genre: "Historical Drama",
      durationMinutes: 180,
      certificate: "U/A 16+",
      posterUrl: "/images/stitch/oppenheimer.jpg",
      date: "2026-10-03",
      time: "18:30",
      prices: [900, 450],
      venue: { id: "seed-forum-koramangala", name: "Forum Koramangala", city: "Bengaluru", address: "Hosur Road, Koramangala", auditorium: "70mm Film Auditorium" },
    },
    {
      identityKey: "movie:kalki-2898-ad:hindi:dolby-3d",
      title: "Kalki 2898 AD",
      type: EventType.MOVIE,
      description: "A mythic science-fiction epic presented with dual-laser 3D and spatial Dolby Atmos audio.",
      language: "Hindi",
      format: "Dolby Atmos 3D",
      genre: "Mythological Sci-Fi",
      durationMinutes: 181,
      certificate: "U/A 16+",
      posterUrl: "/images/stitch/kalki-2898-ad.jpg",
      date: "2026-10-04",
      time: "20:00",
      prices: [650, 280],
      venue: { id: "seed-inox-meenakshi", name: "INOX Meenakshi", city: "Bengaluru", address: "Bannerghatta Road", auditorium: "Dolby Cinema" },
    },
    {
      identityKey: "movie:interstellar-10th-anniversary:english:imax-laser",
      title: "Interstellar: 10th Anniversary",
      type: EventType.MOVIE,
      description: "The science-fiction classic returns with an IMAX laser presentation and remastered Hans Zimmer score.",
      language: "English",
      format: "IMAX Laser",
      genre: "Sci-Fi Classic",
      durationMinutes: 169,
      certificate: "U/A 13+",
      posterUrl: "/images/stitch/interstellar.jpg",
      date: "2026-10-04",
      time: "17:15",
      prices: [1000, 500],
      venue: { id: "seed-cinepolis-nexus", name: "Cinepolis Nexus", city: "Bengaluru", address: "Shantiniketan Mall", auditorium: "Classic IMAX" },
    },
    {
      identityKey: "concert:coldplay-music-of-the-spheres:english:live",
      title: "Coldplay: Music of the Spheres",
      type: EventType.CONCERT,
      description: "A stadium-scale live production with a circular stage, synchronized light show, and priority waitlist allocation.",
      language: "English",
      format: "Stadium Live",
      genre: "Pop · Alternative",
      durationMinutes: 180,
      certificate: "ALL",
      posterUrl: "/images/stitch/coldplay.jpg",
      date: "2030-11-15",
      time: "18:00",
      prices: [35000, 3500],
      venue: { id: "seed-dy-patil", name: "DY Patil Stadium", city: "Mumbai", address: "Nerul, Navi Mumbai", auditorium: "360° Circular Stage" },
    },
    {
      identityKey: "concert:ar-rahman-symphony:english:live",
      title: "A.R. Rahman: Symphony Live",
      type: EventType.CONCERT,
      description: "A.R. Rahman performs with a 90-piece orchestra in a cinematic open-air symphony.",
      language: "English",
      format: "Orchestral Live",
      genre: "Symphony · Film Music",
      durationMinutes: 150,
      certificate: "ALL",
      posterUrl: "/images/stitch/ar-rahman.jpg",
      date: "2030-11-16",
      time: "19:00",
      prices: [4800, 1800],
      venue: { id: "seed-palace-grounds", name: "Palace Grounds", city: "Bengaluru", address: "Vasanth Nagar", auditorium: "Grand Lawn" },
    },
    {
      identityKey: "concert:diljit-dil-luminati:punjabi:live",
      title: "Diljit Dosanjh: Dil-Luminati Tour",
      type: EventType.CONCERT,
      description: "A high-energy stadium tour with gold and fan-pit inventory and instant seat locking.",
      language: "Punjabi",
      format: "Stadium Live",
      genre: "Punjabi Pop",
      durationMinutes: 165,
      certificate: "ALL",
      posterUrl: "/images/stitch/diljit.jpg",
      date: "2030-12-02",
      time: "19:30",
      prices: [8500, 4200],
      venue: { id: "seed-jln-stadium", name: "JLN Stadium", city: "Delhi NCR", address: "Lodhi Road", auditorium: "Gold & Fan Pit" },
    },
  ];

  for (const item of showcase) {
    const city = await upsertCity(item.venue.city);
    const itemVenue = await db.venue.upsert({
      where: { id: item.venue.id },
      update: { ...item.venue, cityId: city.id, rows: 5, cols: 8 },
      create: { ...item.venue, cityId: city.id, rows: 5, cols: 8 },
    });
    const auditorium = await db.auditorium.upsert({
      where: { venueId_name: { venueId: itemVenue.id, name: item.venue.auditorium } },
      update: { rows: 5, cols: 8 },
      create: { venueId: itemVenue.id, name: item.venue.auditorium, rows: 5, cols: 8 },
    });
    const premiumCategory = await db.seatCategory.upsert({
      where: { id: `${item.venue.id}-premium` },
      update: { name: item.type === EventType.CONCERT ? "VIP" : "Premium", color: "#22d3ee" },
      create: { id: `${item.venue.id}-premium`, venueId: itemVenue.id, name: item.type === EventType.CONCERT ? "VIP" : "Premium", color: "#22d3ee" },
    });
    const standardCategory = await db.seatCategory.upsert({
      where: { id: `${item.venue.id}-standard` },
      update: { name: item.type === EventType.CONCERT ? "General" : "Standard", color: "#8b7cff" },
      create: { id: `${item.venue.id}-standard`, venueId: itemVenue.id, name: item.type === EventType.CONCERT ? "General" : "Standard", color: "#8b7cff" },
    });

    const venueSeats = await db.seat.findMany({ where: { venueId: itemVenue.id } });
    if (!venueSeats.length) {
      for (let row = 1; row <= itemVenue.rows; row++) {
        for (let col = 1; col <= itemVenue.cols; col++) {
          await db.seat.create({
            data: {
              venueId: itemVenue.id,
              categoryId: row <= 2 ? premiumCategory.id : standardCategory.id,
              row,
              col,
              label: seatLabel(row, col),
            },
          });
        }
      }
    }
    await configureAccessibleLayout(itemVenue.id, itemVenue.rows, itemVenue.cols);

    const itemContent = await db.content.upsert({
      where: { identityKey: item.identityKey },
      update: {
        title: item.title,
        description: item.description,
        language: item.language,
        format: item.format,
        genre: item.genre,
        durationMinutes: item.durationMinutes,
        certificate: item.certificate,
        posterUrl: item.posterUrl,
      },
      create: {
        identityKey: item.identityKey,
        title: item.title,
        type: item.type,
        description: item.description,
        language: item.language,
        format: item.format,
        genre: item.genre,
        durationMinutes: item.durationMinutes,
        certificate: item.certificate,
        posterUrl: item.posterUrl,
      },
    });

    const savedEvent = await db.show.findFirst({ where: { title: item.title, venueId: itemVenue.id } });
    const itemEvent = savedEvent
      ? await db.show.update({
          where: { id: savedEvent.id },
          data: { contentId: itemContent.id, auditoriumId: auditorium.id, description: item.description, date: item.date, time: item.time, type: item.type },
        })
      : await db.show.create({
          data: {
            title: item.title,
            type: item.type,
            description: item.description,
            contentId: itemContent.id,
            venueId: itemVenue.id,
            auditoriumId: auditorium.id,
            date: item.date,
            time: item.time,
            organiserId: organiser.id,
          },
        });

    await db.categoryPrice.upsert({
      where: { eventId_categoryId: { eventId: itemEvent.id, categoryId: premiumCategory.id } },
      update: { price: item.prices[0] },
      create: { eventId: itemEvent.id, categoryId: premiumCategory.id, price: item.prices[0] },
    });
    await db.categoryPrice.upsert({
      where: { eventId_categoryId: { eventId: itemEvent.id, categoryId: standardCategory.id } },
      update: { price: item.prices[1] },
      create: { eventId: itemEvent.id, categoryId: standardCategory.id, price: item.prices[1] },
    });

    const allVenueSeats = await db.seat.findMany({ where: { venueId: itemVenue.id }, select: { id: true, isBlocked: true } });
    const existingShowSeats = new Set((await db.showSeat.findMany({ where: { eventId: itemEvent.id }, select: { seatId: true } })).map((seat) => seat.seatId));
    const missingSeats = allVenueSeats.filter((seat) => !existingShowSeats.has(seat.id));
    if (missingSeats.length) {
      await db.showSeat.createMany({ data: missingSeats.map((seat) => ({
        eventId: itemEvent.id,
        seatId: seat.id,
        status: seat.isBlocked ? SeatStatus.UNAVAILABLE : SeatStatus.AVAILABLE,
        unavailableReason: seat.isBlocked ? "Blocked auditorium position" : null,
      })) });
    }
    await db.showSeat.updateMany({
      where: { eventId: itemEvent.id, status: SeatStatus.AVAILABLE, seat: { isBlocked: true } },
      data: { status: SeatStatus.UNAVAILABLE, unavailableReason: "Blocked auditorium position" },
    });
  }

  console.log("Seed complete");
}

async function configureAccessibleLayout(venueId: string, rows: number, cols: number) {
  await db.seat.updateMany({
    where: { venueId },
    data: { aisleAfter: false, isBlocked: false, seatType: SeatType.STANDARD },
  });
  await db.seat.updateMany({ where: { venueId, col: Math.floor(cols / 2) }, data: { aisleAfter: true } });
  await db.seat.updateMany({ where: { venueId, row: rows, col: 1 }, data: { seatType: SeatType.WHEELCHAIR, viewLabel: "Wide accessible view", viewScore: 4 } });
  await db.seat.updateMany({ where: { venueId, row: rows, col: 2 }, data: { seatType: SeatType.COMPANION, viewLabel: "Companion seat beside accessible space", viewScore: 4 } });
  await db.seat.updateMany({ where: { venueId, row: rows, col: cols }, data: { isBlocked: true, viewLabel: "Unavailable structural position", viewScore: null } });
  await db.seat.updateMany({ where: { venueId, row: { lte: Math.ceil(rows / 3) }, seatType: SeatType.STANDARD }, data: { viewLabel: "Close immersive view", viewScore: 4 } });
  await db.seat.updateMany({ where: { venueId, row: { gt: Math.ceil(rows / 3), lt: rows }, seatType: SeatType.STANDARD }, data: { viewLabel: "Balanced centre view", viewScore: 5 } });
}

async function upsertCity(name: string) {
  const slug = name.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return db.city.upsert({ where: { name }, update: { slug }, create: { name, slug } });
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
