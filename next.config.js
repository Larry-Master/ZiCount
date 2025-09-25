/**
 * Next.js Configuration for ZiCount Receipt Analyzer
 * 
 * Configuration settings for the Next.js application including:
 * - React Strict Mode for development warnings
 * - Image optimization settings for receipt images
 * - Environment variable exposure to client-side code
 * - Build and runtime optimizations
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React Strict Mode for better development experience
  reactStrictMode: true,
  
  // Image optimization configuration
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
  
  // Netlify deployment configuration
  trailingSlash: true,
  
  // Exclude Netlify functions from Next.js processing
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
  
  // Environment variables accessible on client-side
  env: {
    OCR_REMOTE_URL: process.env.OCR_REMOTE_URL,
    MONGODB_URI: process.env.MONGODB_URI,
  }
}

module.exports = nextConfig
