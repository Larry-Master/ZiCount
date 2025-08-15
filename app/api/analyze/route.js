import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { parseGermanReceipt } from './ocrParser.js'

const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY
const MAX_FILE_SIZE = 1024 * 1024 // 1MB in bytes
const OCR_SPACE_URL = 'https://api.ocr.space/parse/image'

// OCR.space API call function - optimized for receipt text extraction
async function callOCRSpace(imageBuffer) {
  try {
    const formData = new FormData()
    const blob = new Blob([imageBuffer], { type: 'image/png' })
    
    formData.append('file', blob, 'receipt.png')
    formData.append('apikey', OCR_SPACE_API_KEY)
    formData.append('language', 'ger') // German language
    formData.append('isOverlayRequired', 'false')
    formData.append('detectOrientation', 'true') // Auto-rotate if needed
    formData.append('isTable', 'true') // Optimized for table/receipt structure
    formData.append('scale', 'true') // Internal upscaling for better results
    formData.append('OCREngine', '2') // Engine 2 for better German text recognition
    formData.append('filetype', 'PNG')

    console.log('Calling OCR.space API with optimized settings...')

    const response = await fetch(OCR_SPACE_URL, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`OCR API request failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    
    if (result.IsErroredOnProcessing) {
      throw new Error(result.ErrorMessage || 'OCR processing failed')
    }

    const parsedText = result.ParsedResults?.[0]?.ParsedText || ''
    console.log('OCR result length:', parsedText.length)
    console.log('OCR confidence/orientation:', result.ParsedResults?.[0]?.TextOrientation || 'unknown')
    
    // Log first 200 chars of OCR result for debugging
    console.log('OCR preview:', parsedText.substring(0, 200) + '...')
    
    return {
      text: parsedText,
      confidence: result.ParsedResults?.[0]?.TextOrientation || 0
    }
  } catch (error) {
    console.error('OCR.space API error:', error)
    throw error
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image')

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    console.log('Processing image:', imageFile.name, imageFile.type, `${(imageFile.size / 1024).toFixed(1)}KB`)

    // Convert file to buffer
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer())

    // Enhanced image preprocessing for better OCR accuracy
    let processedImageBuffer = imageBuffer
    
    if (imageBuffer.length > MAX_FILE_SIZE) {
      console.log('Image too large, compressing with quality optimization...')
      
      // Multi-step compression approach
      const compressionRatio = MAX_FILE_SIZE / imageBuffer.length
      let targetQuality = Math.max(70, Math.min(95, compressionRatio * 120))
      
      processedImageBuffer = await sharp(imageBuffer)
        .resize(2800, null, { 
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3 // Better quality scaling
        })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.0, m1: 1.0, m2: 2.0 }) // Enhanced sharpening
        .linear(1.2, -(128 * 1.2) + 128) // Increase contrast
        .png({ 
          quality: Math.round(targetQuality), 
          compressionLevel: 9, 
          progressive: true,
          palette: true
        })
        .toBuffer()
        
      // If still too large, use JPEG with aggressive compression
      if (processedImageBuffer.length > MAX_FILE_SIZE) {
        console.log('Still too large, using JPEG compression...')
        targetQuality = 65
        processedImageBuffer = await sharp(imageBuffer)
          .resize(2400, null, { withoutEnlargement: true })
          .grayscale()
          .normalize()
          .sharpen()
          .linear(1.3, -(128 * 1.3) + 128)
          .jpeg({ 
            quality: targetQuality, 
            progressive: true,
            mozjpeg: true
          })
          .toBuffer()
      }
        
      console.log(`Compressed from ${(imageBuffer.length / 1024).toFixed(1)}KB to ${(processedImageBuffer.length / 1024).toFixed(1)}KB`)
    } else {
      // Optimal preprocessing for images under size limit
      processedImageBuffer = await sharp(imageBuffer)
        .resize(3200, null, { 
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3
        })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.0, m1: 1.0, m2: 2.0 })
        .linear(1.1, -(128 * 1.1) + 128) // Slight contrast boost
        .png({ compressionLevel: 6 })
        .toBuffer()
        
      // If preprocessing made it too large, compress it down
      if (processedImageBuffer.length > MAX_FILE_SIZE * 0.9) {
        const targetSize = Math.floor(MAX_FILE_SIZE * 0.85)
        const ratio = targetSize / processedImageBuffer.length
        const quality = Math.max(70, Math.min(90, ratio * 100))
        
        processedImageBuffer = await sharp(processedImageBuffer)
          .png({ quality: Math.round(quality), compressionLevel: 9 })
          .toBuffer()
      }
        
      console.log(`Preprocessed image: ${(processedImageBuffer.length / 1024).toFixed(1)}KB`)
    }

    // Perform OCR
    console.log('Running OCR analysis...')
    const ocrResult = await callOCRSpace(processedImageBuffer)

    if (!ocrResult?.text) {
      throw new Error('OCR failed to extract text from image')
    }

    // Parse the receipt with enhanced parser
    console.log('Parsing receipt data...')
    const parsed = parseGermanReceipt(ocrResult.text)
    
    console.log('Final parsing results:', {
      itemCount: parsed.itemCount,
      total: parsed.total,
      sampleItems: parsed.items.slice(0, 3).map(item => `${item.name}: €${item.price}`)
    })

    return NextResponse.json({
      success: true,
      text: ocrResult.text,
      confidence: ocrResult.confidence,
      items: parsed.items,
      total: parsed.total,
      itemCount: parsed.itemCount,
      processedImageSize: `${(processedImageBuffer.length / 1024).toFixed(0)}KB`
    })

  } catch (error) {
    console.error('Receipt analysis error:', error)
    return NextResponse.json({ 
      error: 'Failed to analyze receipt: ' + error.message 
    }, { status: 500 })
  }
}
