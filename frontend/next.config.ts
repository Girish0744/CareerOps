import type { NextConfig } from "next";
import path from "path";

const careerOpsRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // Next dev blocks cross-origin requests to /_next/* dev assets. Opening the
  // app on the "Network" URL it prints (a LAN or link-local IP) therefore 403s
  // the JS chunks, so React never hydrates and every page sticks on its
  // server-rendered loading state. Allow private ranges only; these are not
  // routable from the internet, and this applies in dev mode only.
  allowedDevOrigins: ['169.254.*.*', '192.168.*.*', '10.*.*.*', '172.16.*.*'],
  outputFileTracingRoot: careerOpsRoot,
  outputFileTracingExcludes: {
    "/*": ["frontend/next.config.ts"],
    "/api/**/*": ["frontend/next.config.ts"],
  },
  turbopack: {
    root: careerOpsRoot,
  },
};

export default nextConfig;
