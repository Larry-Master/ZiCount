import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'node:child_process';

const pythonPath = '/home/container/ocr-project/ocr-env/bin/python3';
const scriptPath = '/home/container/ocr-project/scanner.py';

async function runPythonOCR(imagePath) {
  return new Promise((resolve, reject) => {
    execFile(pythonPath, [scriptPath, imagePath], (error, stdout, stderr) => {
      if (error) return reject(error);
      if (stderr) console.error(stderr); // warnings go here
      try {
        const data = JSON.parse(stdout.toString().trim());
        resolve(data);
      } catch (e) {
        console.error("Python output:", stdout.toString());
        reject(new Error("Failed to parse JSON from Python output: " + e.message));
      }
    });
  });
}


export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.image) throw new Error('No image provided');

    const match = body.image.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URL format');

    const buffer = Buffer.from(match[2], 'base64');
    const tmpFile = path.join(os.tmpdir(), `upload_${Date.now()}.jpg`);
    await fs.writeFile(tmpFile, buffer);

    // Run Python OCR and get structured JSON
    const result = await runPythonOCR(tmpFile);

    await fs.unlink(tmpFile); // cleanup

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
