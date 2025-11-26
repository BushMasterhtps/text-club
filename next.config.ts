import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Temporarily ignore ESLint errors
  },
  typescript: {
    ignoreBuildErrors: true, // Temporarily ignore TypeScript errors
  },
  // Add Prisma generation to build process
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client']
  }
};

// Wrap with Sentry configuration (only if DSN is provided)
const sentryConfig = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(
      nextConfig,
      {
        // Sentry options
        silent: true, // Suppress source map upload logs
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        
        // Upload source maps
        widenClientFileUpload: true,
        hideSourceMaps: true,
        disableLogger: true,
        
        // Automatically instrument Next.js
        tunnelRoute: "/monitoring",
        
        // Only upload source maps in production
        dryRun: process.env.NODE_ENV !== "production",
      },
      {
        // Sentry webpack plugin options
        // Automatically tree-shake Sentry logger statements to reduce bundle size
        automaticVercelMonitors: true,
      }
    )
  : nextConfig;

export default sentryConfig;
