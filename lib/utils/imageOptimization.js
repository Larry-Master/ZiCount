/**
 * Smart Image Optimization for OCR
 * 
 * Reduces file size while maintaining quality for OCR processing.
 * This is different from compression - it optimizes specifically for text recognition.
 */

/**
 * Optimizes an image for OCR processing by:
 * - Reducing dimensions if too large (maintains aspect ratio)
 * - Converting to JPEG with optimal quality for OCR
 * - Keeping text readability as priority
 * 
 * @param {File} file - The image file to optimize
 * @param {Object} options - Optimization options
 * @param {number} options.maxDimension - Maximum width/height (default: 2048)
 * @param {number} options.quality - JPEG quality for OCR (default: 0.9)
 * @param {number} options.maxFileSize - Target max file size in MB (default: 4)
 * @returns {Promise<File>} Optimized image file
 */
export const optimizeImageForOCR = (file, options = {}) => {
  const { maxDimension = 2048, quality = 0.9, maxFileSize = 4 } = options;
  
  return new Promise((resolve, reject) => {
    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    // If file is already small enough, return as-is
    const maxBytes = maxFileSize * 1024 * 1024;
    if (file.size <= maxBytes) {
      resolve(file);
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      try {
        let { width, height } = img;
        
        // Only reduce dimensions if they're too large
        // Keep as much detail as possible for OCR
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            if (width > maxDimension) {
              height = (height * maxDimension) / width;
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = (width * maxDimension) / height;
              height = maxDimension;
            }
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw image with high quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Try different quality levels until we get under the size limit
        const tryCompress = (currentQuality) => {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to optimize image'));
              return;
            }

            // If still too large and we can reduce quality further, try again
            if (blob.size > maxBytes && currentQuality > 0.7) {
              tryCompress(currentQuality - 0.1);
              return;
            }

            const optimizedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            
            console.log(`Image optimized for OCR: ${Math.round(file.size / 1024)}KB → ${Math.round(optimizedFile.size / 1024)}KB`);
            resolve(optimizedFile);
          }, 'image/jpeg', currentQuality);
        };
        
        tryCompress(quality);
        
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for optimization'));
    };
    
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Checks if a file needs optimization for Vercel deployment
 * @param {File} file - The file to check
 * @param {number} maxSize - Maximum size in MB (default: 4 for Vercel)
 * @returns {boolean} True if file needs optimization
 */
export const needsOptimization = (file, maxSize = 4) => {
  return file.size > (maxSize * 1024 * 1024);
};