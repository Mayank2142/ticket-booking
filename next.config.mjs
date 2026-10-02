/** @type {import('next').NextConfig} */

const nextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "bindings",
    "@prisma/adapter-better-sqlite3",
    "@prisma/adapter-pg",
    "pg",
  ],
  async headers() {
    const scriptPolicy = process.env.NODE_ENV === "production"
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scriptPolicy}; connect-src 'self' https: wss:; upgrade-insecure-requests` },
    ];
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
