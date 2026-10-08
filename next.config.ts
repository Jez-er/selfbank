import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 is a native module: keep it external so Next does not try to bundle the .node binding.
  serverExternalPackages: ["better-sqlite3", "node-cron"],
  // The app ships no bitmap images, so the optimizer (and its sharp binary)
  // would only add weight to the container.
  images: { unoptimized: true },
};

export default nextConfig;
