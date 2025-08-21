import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NodeSSH } from 'node-ssh';

export const runtime = 'nodejs';

async function runClean(ssh, cmd, cwd) {
  // Use absolute /bin/bash and avoid reading profile files
  const escaped = cmd.replace(/(["\\$`])/g, '\\$1'); // simple escape for special chars
  const wrapped = `/bin/bash --noprofile --norc -c "${escaped}"`;
  return ssh.execCommand(wrapped, cwd ? { cwd } : {});
}

export async function POST(req) {
  let ssh = null;
  const tmpDir = os.tmpdir();

  try {
    // --- Handle uploaded file ---
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded.' }), { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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
    const wrapperScript = `${remoteBase}/run_ocr.sh`;

    // Ensure remote dirs exist
    await runClean(ssh, `mkdir -p '${remoteUploads}' '${remoteOutputDir}'`);
    console.log('Ensured remote directories exist.');

    // Upload file (SFTP)
    console.log(`Uploading ${localFilePath} -> ${remoteFile}`);
    await ssh.putFile(localFilePath, remoteFile);
    console.log('Upload complete.');

    // Prepare local/remote JSON paths
    const baseName = path.parse(remoteFile).name;
    // after you've uploaded the file with ssh.putFile(localFilePath, remoteFile)
    const remoteItems = `${remoteOutputDir}/${baseName}_items.json`;
    const localItems = path.join(tmpDir, `${baseName}_items.json`);

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// Poll for the file using SFTP (getFile) — avoids execCommand entirely
async function waitForRemoteFile(getFileFn, remotePath, localPath, {
  timeoutMs = 120_000,   // total wait time
  intervalMs = 1500,     // initial interval
  maxIntervalMs = 10_000 // backoff cap
} = {}) {
  const start = Date.now();
  let interval = intervalMs;

  while (Date.now() - start < timeoutMs) {
    try {
      // Try to download. If successful, return (we assume file is ready)
      await getFileFn(localPath, remotePath);
      return true;
    } catch (err) {
      // Common errors: ENOENT (file not yet created), permission, etc.
      // Optionally inspect err.message to bail early on non-retryable errors.
      // exponential backoff with jitter
      const jitter = Math.floor(Math.random() * 300);
      await sleep(interval + jitter);
      interval = Math.min(maxIntervalMs, Math.round(interval * 1.4));
      continue;
    }
  }
  return false;
}

// usage:
const got = await waitForRemoteFile(ssh.getFile.bind(ssh), remoteItems, localItems, {
  timeoutMs: 180_000, intervalMs: 1000, maxIntervalMs: 8000
});
if (!got) {
  // helpful debug: try to read last_run.log if exists
  try {
    const remoteLog = `${remoteOutputDir}/last_run.log`;
    const localLog = path.join(tmpDir, `${baseName}_last_run.log`);
    await ssh.getFile(localLog, remoteLog);
    const l = await fs.readFile(localLog, 'utf8');
    console.warn('Downloaded last_run.log (snippet):', l.slice(0, 4000));
  } catch (_) { /* ignore */ }

  throw new Error(`Timeout waiting for remote JSON at ${remoteItems}`);
}


    // If we got here, localItems exists — parse it
    const content = await fs.readFile(localItems, 'utf8');
    const itemsJson = JSON.parse(content);
    const statLocal = await fs.stat(localItems);
    const processedSize = statLocal.size;

    // --- Cleanup ---
    try { await runClean(ssh, `rm -f '${remoteFile}'`); } catch (e) { console.warn('Failed to remove remote upload', e.message); }
    try { await fs.rm(localFilePath, { force: true }); } catch (_) {}
    try { await fs.rm(localItems, { force: true }); } catch (_) {}

    // --- Response ---
    const responsePayload = {
      items: itemsJson.items || [],
      itemCount: itemsJson.itemCount != null ? itemsJson.itemCount : (itemsJson.items?.length || 0),
      text: itemsJson.text || null,
      originalImageSize: buffer.length,
      processedImageSize: processedSize,
      debug: { ocrEngine: 'paddleocr', remoteItems }
    };

    return new Response(JSON.stringify(responsePayload), { status: 200 });

  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  } finally {
    try { if (ssh?.isConnected()) ssh.dispose(); } catch (_) {}
  }
}
