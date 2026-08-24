/** @type {import('next').NextConfig} */

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "bindings",
      "@prisma/adapter-better-sqlite3",
    ],
  },
};

export default nextConfig;
