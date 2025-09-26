import formidable from 'formidable';

/**
 * Parse multipart form data containing file uploads
 * @param {Object} req - Next.js request object
 * @param {Object} options - Optional formidable configuration
 * @returns {Promise} Promise resolving to parsed fields and files
 */
export function parseFormData(req, options = {}) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024, // 20MB limit
      keepExtensions: true,
      ...options
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}