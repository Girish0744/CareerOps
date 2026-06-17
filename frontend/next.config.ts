import type { NextConfig } from "next";
import path from "path";

const careerOpsRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
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
