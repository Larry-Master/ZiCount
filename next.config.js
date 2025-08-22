/** next.config.mjs */
const nextConfig = {
  reactStrictMode: true,

  serverExternalPackages: [
    // adjust this list to match the packages that cause native/binary .node errors
    'ssh2',
    'cpu-features',
    'node-ssh',
    'ssh2-sftp-client'
  ],


};

export default nextConfig;
