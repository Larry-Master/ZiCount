/** next.config.mjs */
const nextConfig = {
  reactStrictMode: true,
  
  // Optimize for Vercel deployment
  experimental: {
    serverComponentsExternalPackages: ['ssh2', 'node-ssh', 'ssh2-sftp-client'],
  },
  
  serverExternalPackages: [
    // adjust this list to match the packages that cause native/binary .node errors
    'ssh2',
    'cpu-features', 
    'node-ssh',
    'ssh2-sftp-client'
  ],

  // Webpack optimization for Vercel
  webpack: (config, { isServer, dev }) => {
    if (!isServer && !dev) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: -10,
            chunks: 'all',
          },
        },
      };
    }
    return config;
  },

  // Output settings for static export compatibility
  trailingSlash: false,
  
  // Image optimization for Vercel
  images: {
    domains: [],
    unoptimized: false,
  },
};

export default nextConfig;
