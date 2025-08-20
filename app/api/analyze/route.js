// Importiere 'promises' aus 'fs' für moderne, Promise-basierte Dateisystemoperationen
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NodeSSH } from 'node-ssh';

// Definiert die Laufzeitumgebung als Node.js
export const runtime = 'nodejs';

export async function POST(req) {
  let ssh = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file uploaded. Please ensure a file is provided in the form data.' }),
        { status: 400 }
      );
    }

    // Konvertiere ArrayBuffer → Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Temporäre lokale Datei
    const tmpDir = os.tmpdir();
    const localFilePath = path.join(tmpDir, file.name);
    console.log(`Saving uploaded file to temporary path: ${localFilePath}`);
    await fs.writeFile(localFilePath, buffer);

    // SSH-Konfiguration
    const SSH_HOST = process.env.SSH_HOST;
    const SSH_USER = process.env.SSH_USER || 'root';
    const SSH_PASSWORD = process.env.SSH_PASSWORD;
    const SSH_PORT = parseInt(process.env.SSH_PORT) || 2222;

    if (!SSH_HOST || !SSH_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'SSH_HOST or SSH_PASSWORD environment variables are not set.' }),
        { status: 500 }
      );
    }

    ssh = new NodeSSH();
    console.log(`Attempting to connect to SSH host: ${SSH_HOST}:${SSH_PORT} with user: ${SSH_USER}`);
    await ssh.connect({ host: SSH_HOST, username: SSH_USER, password: SSH_PASSWORD, port: SSH_PORT });
    console.log('Successfully connected to SSH.');

    // Remote-Pfade
    const remoteBase = `/home/container/ocr-project`;
    const remoteFile = `${remoteBase}/uploads/${file.name}`; // Corrected line
    const remoteVenv = `${remoteBase}/ocr-env`;
    const remoteScript = `${remoteBase}/scanner.py`;

    // Upload
    console.log(`Uploading local file '${localFilePath}' to remote path '${remoteFile}'`);
    await ssh.putFile(localFilePath, remoteFile);
    console.log('File uploaded successfully.');

    // Remote-Script ausführen
    const command = `cd ${remoteBase} && . ${remoteVenv}/bin/activate && python ${remoteScript} ${remoteFile}`;
    console.log(`Executing remote command: ${command}`);
    const result = await ssh.execCommand(command);
    console.log('Remote command execution finished.');
    console.log("Remote STDOUT:", result.stdout);
    console.log("Remote STDERR:", result.stderr);

    // Lokale Temp-Datei sofort löschen
    try {
      await fs.unlink(localFilePath);
      console.log(`Successfully deleted local temporary file: ${localFilePath}`);
    } catch (unlinkErr) {
      console.warn(`Could not delete local temporary file '${localFilePath}':`, unlinkErr.message);
    }

    // Output-Dateien holen
    const remoteOutputDir = `${remoteBase}/output`;
    const baseName = path.parse(remoteFile).name;
    const remoteItems = `${remoteOutputDir}/${baseName}_ocr_0.json`;
    const localItems = path.join(tmpDir, `${baseName}_ocr_0.json`);

    let itemsJson = null;
    let processedSize = null;

    try {
      await ssh.getFile(localItems, remoteItems);
      const content = await fs.readFile(localItems, 'utf8');
      itemsJson = JSON.parse(content);
      const statLocal = await fs.stat(localItems);
      processedSize = statLocal.size;
    } catch (err) {
      console.error("Failed to fetch items.json:", err.message);

      // Debug: check output dir contents
      const ls = await ssh.execCommand(`ls -lh ${remoteOutputDir}`);
      console.log("Files currently in output dir:", ls.stdout);

      return new Response(
        JSON.stringify({ error: 'No output JSON found', raw: result.stdout, stderr: result.stderr }),
        { status: 500 }
      );
    }

    // Jetzt erst Remote-Upload-Datei löschen
    try {
      await ssh.execCommand(`rm ${remoteFile}`);
      console.log(`Successfully deleted remote temporary file: ${remoteFile}`);
    } catch (rmErr) {
      console.warn(`Could not delete remote temporary file '${remoteFile}':`, rmErr.message);
    }

    const responsePayload = {
      items: itemsJson.items || [],
      itemCount: (itemsJson.items && itemsJson.items.length) || 0,
      total: itemsJson.total != null ? itemsJson.total : null,
      text: itemsJson.text || null,
      originalImageSize: buffer.length,
      processedImageSize: processedSize,
      debug: { ocrEngine: 'paddleocr' }
    };

    return new Response(JSON.stringify(responsePayload), { status: 200 });

  } catch (err) {
    console.error('An unhandled error occurred:', err);
    return new Response(JSON.stringify({ error: `Server error: ${err.message}` }), { status: 500 });
  } finally {
    if (ssh && ssh.isConnected()) {
      ssh.dispose();
      console.log('SSH connection closed.');
    }
  }
}