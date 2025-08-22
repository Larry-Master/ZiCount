import path from 'path';
/** @type {import('next').NextConfig} */

  const nextConfig = {
  webpack(config, { isServer }) {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    // map '@' to project root for cleaner imports
    config.resolve.alias['@'] = path.resolve(process.cwd());

    // Return the modified config
    return config;
  },

  // Enable mobile-friendly viewport
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;