/**
 * Image Compression Utilities for ZiCount
 * 
 * Centralized image processing utilities to handle compression, resizing,
 * and optimization for receipt images across the application.
 * 
 * Features:
 * - Canvas-based image compression with quality control
 * - Automatic size optimization for storage constraints
 * - Support for different target sizes (thumbnails vs storage)
 * - Fallback handling for compression failures
 */

/**
 * Compress an image file for database storage with configurable options
 * 
 * @param {File} file - Original image file
 * @param {Object} options - Compression options
 * @param {number} options.targetBytes - Target file size in bytes (default: 3MB)
 * @param {number} options.maxDimension - Maximum width/height (default: 2048)
 * @param {number} options.minQuality - Minimum JPEG quality (default: 0.6)
 * @returns {Promise<File>} Compressed image file
 */
export const compressImageForStorage = (file, options = {}) => {
  const targetBytes = options.targetBytes || 3 * 1024 * 1024; // 3MB
  const maxDimension = options.maxDimension || 2048;
  const minQuality = options.minQuality || 0.6;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = async () => {
      try {
        let { width, height } = img;

        // Resize to maxDimension maintaining aspect ratio
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Iteratively try qualities until under targetBytes or minQuality reached
        let quality = 0.8;
        let blob = await canvasToBlob(canvas, 'image/jpeg', quality);

        while (blob && blob.size > targetBytes && quality > minQuality) {
          quality = Math.max(minQuality, quality - 0.1);
          blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        }

        // If still too large, attempt further scaling
        if (blob && blob.size > targetBytes && Math.max(canvas.width, canvas.height) > 640) {
          const scaleFactor = Math.sqrt(targetBytes / blob.size) * 0.9;
          const newW = Math.max(1, Math.floor(canvas.width * scaleFactor));
          const newH = Math.max(1, Math.floor(canvas.height * scaleFactor));
          
          const canvas2 = document.createElement('canvas');
          canvas2.width = newW;
          canvas2.height = newH;
          const ctx2 = canvas2.getContext('2d');
          ctx2.drawImage(img, 0, 0, newW, newH);
          
          quality = Math.max(minQuality, quality - 0.05);
          blob = await canvasToBlob(canvas2, 'image/jpeg', quality);
        }

        const outName = (file.name || 'upload').replace(/\.[^/.]+$/, '') + '.jpg';
        const compressedFile = new File([blob], outName, { 
          type: 'image/jpeg', 
          lastModified: Date.now() 
        });

        URL.revokeObjectURL(objectUrl);
        resolve(compressedFile);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = objectUrl;
  });
};

/**
 * Create a thumbnail from a data URL for UI preview purposes
 * 
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {number} maxWidth - Maximum width for thumbnail (default: 1024)
 * @param {number} quality - JPEG quality (default: 0.75)
 * @returns {Promise<string>} Thumbnail data URL
 */
export const createThumbnailFromDataUrl = (dataUrl, maxWidth = 1024, quality = 0.75) => {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(img.width * scale));
        canvas.height = Math.max(1, Math.floor(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const thumb = canvas.toDataURL('image/jpeg', quality);
        resolve(thumb);
      };
      img.onerror = () => reject(new Error('Image load failed for thumbnail'));
      img.src = dataUrl;
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Create a preview image from a file for UI display
 * 
 * @param {File} file - Image file
 * @param {number} maxWidth - Maximum preview width (default: 1024)
 * @returns {Promise<string>} Preview data URL
 */
export const createPreviewFromFile = (file, maxWidth = 1024) => {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const scale = Math.min(1, maxWidth / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(resizedDataUrl);
        };
        img.onerror = () => reject(new Error('Failed to process image for preview'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Helper function to promisify canvas.toBlob
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {string} type - Image MIME type
 * @param {number} quality - Image quality
 * @returns {Promise<Blob>} Canvas blob
 */
const canvasToBlob = (canvas, type, quality) => {
  return new Promise(resolve => {
    canvas.toBlob(resolve, type, quality);
  });
};