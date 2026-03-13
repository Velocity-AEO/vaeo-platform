import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
};

export default withSentryConfig(nextConfig, {
  org: 'velocity-aeo',
  project: 'vaeo-platform',
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
