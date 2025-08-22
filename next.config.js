import path from 'path';
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Add webpack configuration to handle native modules
  webpack: (config, { isServer }) => {
    // Only apply this change on the server-side build
    if (isServer) {
      config.externals.push({
        'cpu-features': 'cpu-features',
        // sshcrypto.node is a native module that depends on the platform
        './crypto/build/Release/sshcrypto.node': 'sshcrypto.node',
      });
    }
  // Add path alias for '@' to map to project root for cleaner imports
  config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['@'] = path.resolve(process.cwd());
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