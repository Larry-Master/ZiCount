import { parseGermanReceipt } from './ocrParser'
import sharp from 'sharp'

// Function to compress and optimize image for OCR
async function compressImageForOCR(buffer, originalMimeType) {
	try {
		// Get image metadata
		const metadata = await sharp(buffer).metadata()
		console.log('Original image:', { 
			width: metadata.width, 
			height: metadata.height, 
			format: metadata.format,
			size: buffer.length 
		})

		// Start with the original buffer
		let processedBuffer = buffer
		let quality = 85 // Start with high quality
		const maxSizeBytes = 1024 * 1024 // 1MB limit for OCR.space free tier

		// Convert to JPEG if it's not already (better compression and OCR compatibility)
		let sharpInstance = sharp(buffer)
			.jpeg({ quality, mozjpeg: true }) // Use mozjpeg for better compression
			.flatten({ background: { r: 255, g: 255, b: 255 } }) // White background for transparency

		// Optimize for OCR: enhance contrast and sharpness
		sharpInstance = sharpInstance
			.normalize() // Normalize contrast
			.sharpen({ sigma: 1, m1: 1, m2: 2 }) // Sharpen for better text recognition

		// If image is too large, resize it while maintaining aspect ratio
		if (metadata.width > 2048 || metadata.height > 2048) {
			sharpInstance = sharpInstance.resize(2048, 2048, { 
				fit: 'inside',
				withoutEnlargement: true
			})
		}

		// Process the image
		processedBuffer = await sharpInstance.toBuffer()

		// If still too large, reduce quality iteratively
		while (processedBuffer.length > maxSizeBytes && quality > 20) {
			quality -= 10
			console.log(`Image still too large (${Math.round(processedBuffer.length / 1024)}KB), reducing quality to ${quality}%`)
			
			processedBuffer = await sharp(buffer)
				.jpeg({ quality, mozjpeg: true })
				.flatten({ background: { r: 255, g: 255, b: 255 } })
				.normalize()
				.sharpen({ sigma: 1, m1: 1, m2: 2 })
				.resize(2048, 2048, { 
					fit: 'inside',
					withoutEnlargement: true
				})
				.toBuffer()
		}

		// If still too large, resize more aggressively
		if (processedBuffer.length > maxSizeBytes) {
			let maxDimension = 1536
			while (processedBuffer.length > maxSizeBytes && maxDimension > 512) {
				maxDimension -= 256
				console.log(`Still too large, resizing to max ${maxDimension}px`)
				
				processedBuffer = await sharp(buffer)
					.jpeg({ quality: Math.max(quality, 30), mozjpeg: true })
					.flatten({ background: { r: 255, g: 255, b: 255 } })
					.normalize()
					.sharpen({ sigma: 1, m1: 1, m2: 2 })
					.resize(maxDimension, maxDimension, { 
						fit: 'inside',
						withoutEnlargement: true
					})
					.toBuffer()
			}
		}

		const finalSize = Math.round(processedBuffer.length / 1024)
		console.log(`Image compressed: ${Math.round(buffer.length / 1024)}KB → ${finalSize}KB (quality: ${quality}%)`)

		// Convert to base64 data URL
		const base64 = processedBuffer.toString('base64')
		return `data:image/jpeg;base64,${base64}`

	} catch (error) {
		console.error('Image compression failed:', error)
		// Fallback: return original image as base64
		const base64 = buffer.toString('base64')
		const mimeType = originalMimeType || 'image/jpeg'
		return `data:${mimeType};base64,${base64}`
	}
}

// Simple Next.js route to proxy an image to OCR.space and parse German receipts
export async function POST(req) {
	try {
		const apiKey = process.env.OCR_SPACE_API_KEY
		if (!apiKey) {
			return new Response(JSON.stringify({ error: 'OCR_SPACE_API_KEY is not set in environment' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
		}

		const contentType = (req.headers.get('content-type') || '').toLowerCase()

		let imageBuffer = null
		let originalMimeType = 'image/jpeg'

		if (contentType.includes('application/json')) {
			const body = await req.json()
			if (!body.image) throw new Error('No image field in JSON body')
			
			// Extract base64 data from data URL
			const match = body.image.match(/^data:([^;]+);base64,(.+)$/)
			if (!match) throw new Error('Invalid data URL format')
			
			originalMimeType = match[1]
			imageBuffer = Buffer.from(match[2], 'base64')
		} else if (contentType.includes('multipart/form-data')) {
			const form = await req.formData()
			const file = form.get('image')
			if (!file) throw new Error('No file field named "image" found in form data')

			imageBuffer = Buffer.from(await file.arrayBuffer())
			originalMimeType = file.type || 'image/jpeg'
		} else {
			// try to parse text body as JSON
			const text = await req.text()
			try {
				const j = JSON.parse(text)
				if (!j.image) throw new Error('No image field in JSON body')
				
				const match = j.image.match(/^data:([^;]+);base64,(.+)$/)
				if (!match) throw new Error('Invalid data URL format')
				
				originalMimeType = match[1]
				imageBuffer = Buffer.from(match[2], 'base64')
			} catch (e) {
				throw new Error('Could not parse request body as JSON or extract image data')
			}
		}

		if (!imageBuffer) {
			return new Response(JSON.stringify({ error: 'No image provided. Send JSON { image: dataUrl } or multipart/form-data with field "image".' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		// Compress and optimize the image for OCR
		console.log('Compressing image for OCR...')
		const base64Image = await compressImageForOCR(imageBuffer, originalMimeType)

		// Prepare form data for OCR.space
		const fd = new FormData()
		fd.append('apikey', apiKey)
		fd.append('language', 'ger')
		fd.append('isOverlayRequired', 'false')
		fd.append('OCREngine', '2')
		fd.append('base64Image', base64Image)

		const ocrResp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd })
		const ocrJson = await ocrResp.json()

		if (!ocrJson) throw new Error('Empty response from OCR provider')

		// Check for OCR errors
		if (ocrJson.OCRExitCode > 1) {
			throw new Error(`OCR failed: ${ocrJson.ErrorMessage || 'Unknown OCR error'}`)
		}

		const parsedText = (ocrJson.ParsedResults || []).map(p => p.ParsedText || '').join('\n')

		// Log the OCR text for debugging
		console.log('OCR Text extracted:', parsedText.substring(0, 200) + '...')

		// Clean OCR text to remove common OCR spacing/line-break artifacts
		function cleanOcrText(text) {
			if (!text) return ''
			// Normalize line endings and trim whitespace
			let t = text.replace(/\r/g, '')
			// Replace common OCR-inserted spaces inside numbers (e.g. "4, 69" → "4,69" or "1 234" → "1234")
			t = t.replace(/(\d)\s+([,.])\s*(\d)/g, '$1$2$3')
			t = t.replace(/(\d)\s+(?=\d{3}(\D|$))/g, '')
			// Collapse multiple spaces into single space, but keep line breaks for parser heuristics
			t = t.split('\n').map(line => line.replace(/\s{2,}/g, ' ').trim()).filter(Boolean).join('\n')
			// Remove weird non-printable characters
			t = t.replace(/[\u200B-\u200F\uFEFF]/g, '')
			return t
		}

		const cleanedText = cleanOcrText(parsedText || '')

		// Run local German receipt parsing on cleaned text
		const parsed = parseGermanReceipt(cleanedText)

		const result = {
			...parsed,
			text: parsedText,
			ocrRaw: ocrJson,
			originalImageSize: imageBuffer.length,
			processedImageSize: base64Image.length,
			debug: {
				ocrEngine: '2', // We explicitly use engine 2
				ocrExitCode: ocrJson.OCRExitCode,
				textLength: parsedText.length,
				hasText: parsedText.length > 0,
				compressionRatio: Math.round((1 - base64Image.length / imageBuffer.length) * 100)
			}
		}

		return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
	} catch (err) {
		return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}
