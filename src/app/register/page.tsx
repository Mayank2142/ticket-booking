"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, setToken } from "@/lib/client";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const data = await api<{ token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          role: form.get("role"),
        }),
      });
      setToken(data.token);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <div className="card mx-auto grid max-w-4xl overflow-hidden lg:grid-cols-[1.1fr_.9fr]">
      <div className="flex flex-col justify-center p-7 sm:p-10">
        <p className="section-kicker">Join CineBook</p>
        <h1 className="section-title">Create your account</h1>
        <p className="mt-2 text-sm muted">Reserve exact seats, receive QR passes, and never miss a cancellation.</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block space-y-2 text-sm"><span className="muted">Full name</span><input name="name" required autoComplete="name" placeholder="Your name" className="input w-full" /></label>
          <label className="block space-y-2 text-sm"><span className="muted">Email address</span><input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="input w-full" /></label>
          <label className="block space-y-2 text-sm"><span className="muted">Password</span><input name="password" type="password" minLength={8} required autoComplete="new-password" placeholder="At least 8 characters" className="input w-full" /></label>
          <label className="block space-y-2 text-sm"><span className="muted">I want to</span><select name="role" className="input w-full"><option value="CUSTOMER">Book tickets</option><option value="ORGANISER">Create and manage events</option></select></label>
          {error && <p className="message" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary w-full">Create account</button>
        </form>
        <p className="mt-6 text-sm muted">Already a member? <Link href="/login" className="font-semibold text-emerald-300 hover:text-emerald-200">Log in</Link></p>
      </div>
      <div className="relative hidden min-h-[650px] lg:block">
        <Image src="/images/cinema-hero.png" alt="A premium theatre at night" fill priority className="object-cover object-[70%_center]" sizes="340px" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06100b] via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-8"><p className="label">Live availability</p><p className="mt-2 text-2xl font-bold">Pick the view. Own the moment.</p></div>
      </div>
    </div>
  );
}
