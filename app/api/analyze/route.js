import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NodeSSH } from 'node-ssh';

export const runtime = 'nodejs';

export async function POST(req) {
  let ssh = null;

  try {
    // --- Handle uploaded file ---
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded.' }), { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tmpDir = os.tmpdir();
    const localFilePath = path.join(tmpDir, file.name);
    await fs.writeFile(localFilePath, buffer);
    console.log(`Saved uploaded file to ${localFilePath}`);

    // --- SSH connection parameters ---
    const SSH_HOST = process.env.SSH_HOST;
    const SSH_USER = process.env.SSH_USER || 'root';
    const SSH_PASSWORD = process.env.SSH_PASSWORD;
    const SSH_KEY = process.env.SSH_KEY_PATH; // optional
    const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

    if (!SSH_HOST || (!SSH_PASSWORD && !SSH_KEY)) {
      return new Response(JSON.stringify({ error: 'SSH_HOST or authentication not set.' }), { status: 500 });
    }

    ssh = new NodeSSH();
    const connectOptions = { host: SSH_HOST, username: SSH_USER, port: SSH_PORT };
    if (SSH_KEY) {
      connectOptions.privateKey = SSH_KEY;
    } else {
      connectOptions.password = SSH_PASSWORD;
    }
    await ssh.connect(connectOptions);
    console.log(`Connected to ${SSH_HOST}`);

    // --- Remote paths ---
    const remoteBase = '/home/container/ocr-project';
    const remoteUploads = `${remoteBase}/uploads`;
    const remoteOutputDir = `${remoteBase}/output`;
    const remoteFile = `${remoteUploads}/${file.name}`;
    const remoteVenv = `${remoteBase}/ocr-env`;
    const remoteScript = `${remoteBase}/scanner.py`;

    // Ensure remote dirs exist
    await ssh.execCommand(`/bin/bash -c "mkdir -p '${remoteUploads}' '${remoteOutputDir}'"`, { pty: true });
    console.log('Ensured remote directories exist.');

    // Upload file
    console.log(`Uploading ${localFilePath} -> ${remoteFile}`);
    await ssh.putFile(localFilePath, remoteFile);
    console.log('Upload complete.');

    // --- Remote JSON path ---
    const baseName = path.parse(remoteFile).name;
    let remoteItems = `${remoteOutputDir}/${baseName}_items.json`;
    const localItems = path.join(tmpDir, `${baseName}_items.json`);

    console.log("🔍 Expecting JSON at:", remoteItems);
    console.log("📥 Will download to local temp:", localItems);

    // --- Check if JSON already exists ---
const checkRes = await ssh.execCommand(
  `/bin/bash -c "[ -f '${remoteItems}' ] && echo EXISTS || echo MISSING"`,
  { pty: true }
);
console.log('Check result:', checkRes.stdout.trim());

if (checkRes.stdout.trim() === "EXISTS") {
  console.log(`✅ Found existing JSON at ${remoteItems}, skipping OCR.`);
} else {
  console.log("⚡ JSON not found, running OCR...");

  // Execute OCR script safely inside else
  const command = `'${remoteVenv}/bin/python' '${remoteScript}' '${remoteFile}'`;
  console.log("Executing remote command:", command);

  const runRes = await ssh.execCommand(
    `/bin/bash -c "${command}"`,
    { cwd: remoteBase, pty: true }
  );
  console.log("Remote stdout:", runRes.stdout);
  console.log("Remote stderr:", runRes.stderr);

  // Optional: parse JSON path from Python stdout if different
  const match = runRes.stdout.match(/Saved .*_items\.json to: (.+)/);
  if (match?.[1]) {
    remoteItems = match[1];
    console.log("🔄 Adjusted remote JSON path from Python stdout:", remoteItems);
  }
}

    // Download the items JSON
    await ssh.getFile(localItems, remoteItems);
    const content = await fs.readFile(localItems, 'utf8');
    const itemsJson = JSON.parse(content);
    const statLocal = await fs.stat(localItems);
    const processedSize = statLocal.size;

    // --- Cleanup ---
    try { await ssh.execCommand(`/bin/bash -c "rm -f '${remoteFile}'"`, { pty: true }); } catch (e) { console.warn('Failed to remove remote upload', e.message); }
    try { await fs.rm(localFilePath, { force: true }); } catch (_) { }
    try { await fs.rm(localItems, { force: true }); } catch (_) { }

    // --- Response ---
    const responsePayload = {
      items: itemsJson.items || [],
      itemCount: itemsJson.itemCount != null ? itemsJson.itemCount : (itemsJson.items?.length || 0),
      text: itemsJson.text || null,
      originalImageSize: buffer.length,
      processedImageSize: processedSize,
      debug: { ocrEngine: 'paddleocr' }
    };

    return new Response(JSON.stringify(responsePayload), { status: 200 });

  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  } finally {
    try { if (ssh?.isConnected()) ssh.dispose(); } catch (_) { }
  }
}
