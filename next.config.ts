import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone-Output für schlanke Docker-Images
  output: "standalone",
  // Playwright läuft ausschließlich serverseitig und wird nicht gebündelt
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
