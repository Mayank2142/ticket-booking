"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { api, setToken } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const data = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      setToken(data.token);
      router.replace(searchParams.get("next") || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="card mx-auto grid max-w-4xl overflow-hidden lg:grid-cols-[.9fr_1.1fr]">
      <div className="relative hidden min-h-[560px] lg:block">
        <Image src="/images/portal-poster.png" alt="A cinematic emerald portal" fill priority className="object-cover" sizes="380px" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06100b] via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-8"><p className="label">Welcome back</p><p className="mt-2 text-2xl font-bold">Your next great night is waiting.</p></div>
      </div>
      <div className="flex flex-col justify-center p-7 sm:p-10">
        <p className="section-kicker">Member access</p>
        <h1 className="section-title">Log in to CineBook</h1>
        <p className="mt-2 text-sm muted">Manage your tickets, seat holds and waitlist offers.</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block space-y-2 text-sm"><span className="muted">Email address</span><input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="input w-full" /></label>
          <label className="block space-y-2 text-sm"><span className="muted">Password</span><input name="password" type="password" required autoComplete="current-password" placeholder="Enter your password" className="input w-full" /></label>
          {error && <p className="message" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary w-full">Log in securely</button>
        </form>
        <p className="mt-6 text-sm muted">
          New to CineBook? <Link href="/register" className="font-semibold text-emerald-300 hover:text-emerald-200">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="muted text-sm">Loading...</p>}>
      <LoginForm />
    </Suspense>
  );
}
