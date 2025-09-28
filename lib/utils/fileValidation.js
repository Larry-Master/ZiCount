/**
 * File Validation Utilities for ZiCount
 * 
 * Centralized file validation with consistent limits and error messages
 * across different contexts (upload, analysis, manual entry).
 */

// File size limits in bytes
export const FILE_SIZE_LIMITS = {
  UPLOAD_MAX: 20 * 1024 * 1024,      // 20MB for direct uploads
  API_MAX: 10 * 1024 * 1024,         // 10MB for API processing  
  ANALYSIS_MAX: 4 * 1024 * 1024,     // 4MB for Document AI
  STORAGE_TARGET: 3 * 1024 * 1024    // 3MB target for database storage
};

// Supported file types
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
];

export const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];

/**
 * Validate file for upload context
 * 
 * @param {File} file - File to validate
 * @param {string} context - Validation context ('upload', 'api', 'analysis', 'storage')
 * @returns {Object} { isValid: boolean, error: string|null, warnings: string[] }
 */
export const validateFile = (file, context = 'upload') => {
  const result = {
    isValid: true,
    error: null,
    warnings: []
  };

  // Check if file exists
  if (!file) {
    result.isValid = false;
    result.error = 'No file provided';
    return result;
  }

  // Get size limit for context
  const sizeLimit = FILE_SIZE_LIMITS[`${context.toUpperCase()}_MAX`] || FILE_SIZE_LIMITS.UPLOAD_MAX;
  
  // Validate file size
  if (file.size > sizeLimit) {
    const sizeMB = Math.round(file.size / 1024 / 1024);
    const limitMB = Math.round(sizeLimit / 1024 / 1024);
    
    result.isValid = false;
    result.error = `Image too large (${sizeMB}MB). Maximum size is ${limitMB}MB. ` +
      'Try taking a new photo with lower resolution or use image editing software to reduce the file size.';
    return result;
  }

  // Validate file type
  const isValidType = SUPPORTED_MIME_TYPES.includes(file.type) || 
                     SUPPORTED_EXTENSIONS.some(ext => file.name?.toLowerCase().endsWith(ext));
  
  if (!isValidType) {
    result.isValid = false;
    result.error = `Unsupported file type. Please use: ${SUPPORTED_EXTENSIONS.join(', ')}`;
    return result;
  }

  // Add warnings for potentially problematic files
  if (file.size > 4 * 1024 * 1024) {
    result.warnings.push('⚠️ Large file - may cause upload issues or slow processing');
  }

  if (file.type === 'image/heic' || file.type === 'image/heif') {
    result.warnings.push('HEIC/HEIF format detected - will be converted to JPEG for compatibility');
  }

  return result;
};

/**
 * Format file size for display
 * 
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted size string
 */
export const formatFileSize = (bytes, decimals = 1) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Get validation error message for specific contexts
 * 
 * @param {string} context - Validation context
 * @param {number} fileSize - File size in bytes
 * @returns {string} Context-specific error message
 */
export const getContextualErrorMessage = (context, fileSize) => {
  const sizeMB = Math.round(fileSize / 1024 / 1024);
  
  switch (context) {
    case 'analysis':
      return `Image too large (${sizeMB}MB) for OCR processing. Please reduce to under 4MB for optimal analysis results.`;
    case 'api':
      return `Image too large (${sizeMB}MB) for API processing. Maximum size is 10MB.`;
    case 'storage':
      return `Image too large (${sizeMB}MB) for database storage. Target size is 3MB or less.`;
    default:
      return `Image too large (${sizeMB}MB). Please use an image smaller than 20MB.`;
  }
};