import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { getWaitlistOffer } from "@/lib/seats";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return err("Token required");

  const user = await getUser(req);
  const offer = await getWaitlistOffer(token, user?.id);
  if (!offer) return err("Invalid or expired offer", 404);

  return ok({ offer, requiresLogin: !user });
}
