/**
 * Receipt Upload Hook
 * 
 * Custom hook for handling file upload, validation, and Google Cloud Storage
 * integration. Separates upload logic from main page component.
 */

import { useState, useCallback } from 'react';
import { validateFile } from '@/lib/utils/fileValidation';
import { createPreviewFromFile, createThumbnailFromDataUrl } from '@/lib/utils/imageCompression';

export const useReceiptUpload = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;

    // Validate file
    const validation = validateFile(file, 'upload');
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      console.warn('File validation warnings:', validation.warnings);
    }

    // Keep original file for upload
    setSelectedImage(file);
    setImagePreview(null);
    setError(null);

    // Create preview
    try {
      const preview = await createPreviewFromFile(file);
      setImagePreview(preview);
    } catch (previewErr) {
      console.warn('Preview generation failed:', previewErr);
      // Fallback to direct data URL
      try {
        const reader = new FileReader();
        reader.onload = (e) => setImagePreview(e.target.result);
        reader.readAsDataURL(file);
      } catch (fallbackErr) {
        console.error('Preview fallback failed:', fallbackErr);
      }
    }
  }, []);

  const uploadToGCS = useCallback(async (file) => {
    try {
      const response = await fetch('/api/get-upload-url', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to get upload URL');
      
      const { uploadUrl, gcsUrl } = await response.json();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      if (!uploadResponse.ok) throw new Error('Failed to upload file');

      return gcsUrl;
    } catch (err) {
      throw new Error(`Upload failed: ${err.message}`);
    }
  }, []);

  const analyzeReceipt = useCallback(async (receiptData) => {
    if (!selectedImage) {
      setError('Please select an image first');
      return null;
    }

    const validation = validateFile(selectedImage, 'upload');
    if (!validation.isValid) {
      setError(validation.error);
      return null;
    }

    setAnalyzing(true);
    setError(null);

    try {
      // Upload to GCS first
      const gcsUrl = await uploadToGCS(selectedImage);
      const publicUrl = gcsUrl.replace('gs://', 'https://storage.googleapis.com/');

      // Send GCS URL to analysis API
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gcsUrl }),
      });

      const text = await response.text();
      let data;
      try { 
        data = JSON.parse(text); 
      } catch { 
        data = { raw: text }; 
      }

      if (!response.ok) {
        if (response.status === 413 || text.includes('FUNCTION_PAYLOAD_TOO_LARGE')) {
          throw new Error('Image file is too large for processing. Please try taking a new photo with lower resolution or use image editing software to reduce the file size to under 4MB.');
        }
        throw new Error(data.error || data.raw || `Request failed: ${response.status}`);
      }

      // Handle image optimization for storage
      let imageUrlToStore = publicUrl;
      if (data.imageBase64) {
        try {
          const estimatedBytes = Math.floor((data.imageBase64.length * 3) / 4);
          const MAX_BYTES = 4 * 1024 * 1024;
          
          if (estimatedBytes > MAX_BYTES) {
            const thumb = await createThumbnailFromDataUrl(data.imageBase64, 1024, 0.75);
            imageUrlToStore = thumb;
          } else {
            imageUrlToStore = data.imageBase64;
          }
        } catch (errEstimate) {
          console.warn('Failed to evaluate imageBase64 size:', errEstimate);
          imageUrlToStore = data.imageBase64;
        }
      }

      const receipt = {
        name: receiptData.title,
        uploadedBy: receiptData.paidBy,
        imageUrl: imageUrlToStore,
        items: (data.items || []).map((item, idx) => ({
          id: `item_${Date.now()}_${idx}`,
          name: item.name,
          price: typeof item.price === 'object' ? item.price.value : item.price,
          priceEUR: typeof item.price === 'object' ? item.price.value : item.price,
          confidence: item.confidence,
          tags: ['detected'],
          claimedBy: null,
          claimedAt: null
        })),
        discounts: data.discounts || [],
        totalAmount: data.totalAmount,
        participants: receiptData.participants,
        text: data.text
      };

      // Handle GCS deletion warnings
      if (data.deletedFromGCS === false) {
        setError('Hinweis: Temporäre Datei konnte in Google Cloud nicht gelöscht werden. Bitte prüfen Sie die Bucket-Aufbewahrungsrichtlinien.');
      }

      return receipt;
    } catch (err) {
      setError(err.message || 'Unknown error');
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, [selectedImage, uploadToGCS]);

  const clearSelection = useCallback(() => {
    setSelectedImage(null);
    setImagePreview(null);
    setError(null);
  }, []);

  return {
    selectedImage,
    imagePreview,
    analyzing,
    error,
    handleFile,
    analyzeReceipt,
    clearSelection
  };
};