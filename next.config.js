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
  
  // Image optimization configuration for receipt handling
  images: {
    domains: ['localhost'],     // Allow images from localhost during development
    unoptimized: true,         // Disable optimization for faster dev builds
  },
  
  // Environment variables accessible on client-side
  env: {
    OCR_REMOTE_URL: process.env.OCR_REMOTE_URL,   // External OCR service endpoint (if used)
    MONGODB_URI: process.env.MONGODB_URI,         // Database connection string
  }
}

module.exports = nextConfig
