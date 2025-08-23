/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
  env: {
    OCR_REMOTE_URL: process.env.OCR_REMOTE_URL,
    MONGODB_URI: process.env.MONGODB_URI,
  }
}

module.exports = nextConfig
