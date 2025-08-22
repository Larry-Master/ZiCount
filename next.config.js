/** next.config.mjs */
const nextConfig = {
  reactStrictMode: true,

  // NOTE: Do NOT include `swcMinify` in Next 15 — it's removed.
  //
  // Opt-out of automatic Server Components bundling for native/node-only deps.
  // This causes Next to `require()` them at runtime (Node) instead of
  // trying to bundle their native .node files with Webpack.
  serverExternalPackages: [
    // adjust this list to match the packages that cause native/binary .node errors
    'ssh2',
    'cpu-features',
    'node-ssh',
    'ssh2-sftp-client'
  ],

  // If you still use the `webpack` hook for any edge-case customizations,
  // you can keep it here — but it's optional for this problem.
};

export default nextConfig;
