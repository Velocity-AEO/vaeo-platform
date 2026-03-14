import { withSentryConfig } from '@sentry/nextjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo root is two levels up from apps/dashboard
const repoRoot = path.resolve(__dirname, '../../');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Include files outside apps/dashboard in Vercel's output file tracing
    outputFileTracingRoot: repoRoot,
  },
  webpack(config) {
    // Allow .js imports to resolve .ts files (ESM convention used in tools/)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
    };
    // When webpack processes files outside apps/dashboard (e.g. tools/, packages/),
    // it walks up from those files looking for node_modules — and never reaches
    // apps/dashboard/node_modules. Prepend it explicitly so all deps resolve.
    config.resolve.modules = [
      path.join(__dirname, 'node_modules'),
      'node_modules',
    ];
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: 'velocity-aeo',
  project: 'vaeo-platform',
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
