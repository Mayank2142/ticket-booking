import { randomBytes } from "node:crypto";
import { Role } from "@/generated/prisma/client";
import { db, serializableTransaction } from "./db";
import { hashPassword } from "./auth";
import { normalizeEmail } from "./validation";
import { FirebaseAuthError, type FirebasePrincipal } from "./firebase-auth";

export async function exchangeFirebaseIdentity(principal: FirebasePrincipal, linkingUserId?: string) {
  if (!principal.uid || !principal.emailVerified || !["google.com", "password"].includes(principal.provider)) {
    throw new FirebaseAuthError("Verify your email with Google or Firebase email/password before continuing.", 403);
  }
  const email = normalizeEmail(principal.email);
  if (linkingUserId && (Date.now() / 1000 - principal.authTime > 300 || principal.authTime > Date.now() / 1000 + 60)) {
    throw new FirebaseAuthError("Sign in to Google again before linking your account.");
  }
  if (await db.backgroundJob.findUnique({ where: { dedupeKey: `firebase-delete:${principal.uid}` }, select: { id: true } })) {
    throw new FirebaseAuthError("This Firebase identity has been deleted from CineBook.", 403);
  }
  const generatedPassword = await hashPassword(randomBytes(48).toString("base64url"));
  return serializableTransaction(async (tx) => {
    const linked = await tx.user.findUnique({ where: { firebaseUid: principal.uid } });
    if (linked) {
      if (linked.email !== email || (linkingUserId && linkingUserId !== linked.id)) throw new FirebaseAuthError("This identity belongs to another CineBook account.", 409);
      return linked;
    }
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      if (linkingUserId !== existing.id) throw new FirebaseAuthError("This email already has a CineBook account. Log in with its existing password, then link Google in Account settings.", 409);
      if (existing.firebaseUid) throw new FirebaseAuthError("A different Firebase identity is already linked.", 409);
      return tx.user.update({ where: { id: existing.id }, data: { firebaseUid: principal.uid, firebaseProvider: principal.provider, emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null } });
    }
    if (linkingUserId) throw new FirebaseAuthError("Use the same email as your signed-in CineBook account to link Google.", 409);
    return tx.user.create({ data: {
      email, name: principal.name?.trim().slice(0, 80) || email.split("@")[0],
      password: generatedPassword, passwordLoginEnabled: false, role: Role.CUSTOMER,
      firebaseUid: principal.uid, firebaseProvider: principal.provider, emailVerifiedAt: new Date(),
    } });
  });
}
