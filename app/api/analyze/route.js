import fs from 'fs';
import path from 'path';
import os from 'os';
import { NodeSSH } from 'node-ssh';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 });
    }

    // Datei temporär speichern
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tmpDir = os.tmpdir();
    const localFilePath = path.join(tmpDir, file.name);
    await fs.promises.writeFile(localFilePath, buffer);

    // SSH Konfiguration aus Environment Variables
    const SSH_HOST = process.env.SSH_HOST;
    const SSH_USER = process.env.SSH_USER || 'root';
    const SSH_PASSWORD = process.env.SSH_PASSWORD;
    const SSH_PORT = parseInt(process.env.SSH_PORT) || 2222;

    if (!SSH_HOST || !SSH_PASSWORD) {
      return new Response(JSON.stringify({ error: 'SSH_HOST or SSH_PASSWORD not set' }), { status: 500 });
    }

    const ssh = new NodeSSH();
    await ssh.connect({
      host: SSH_HOST,
      username: SSH_USER,
      password: SSH_PASSWORD,
      port: SSH_PORT
    });

    const remoteBase = `/home/container/ocr-project`;
    const remoteFile = `${remoteBase}/temp_upload.jpg`;
    const remoteVenv = `${remoteBase}/ocr-env`;
    const remoteScript = `${remoteBase}/scanner.py`;

    // Datei hochladen
    await ssh.putFile(localFilePath, remoteFile);

    // Python-Script remote ausführen
    const result = await ssh.execCommand(
      `cd ${remoteBase} && . ${remoteVenv}/bin/activate && python ${remoteScript} ${remoteFile}`
    );

    if (result.stderr) {
      console.error('Remote STDERR:', result.stderr);
      return new Response(JSON.stringify({ error: result.stderr }), { status: 500 });
    }

    return new Response(JSON.stringify({ result: result.stdout }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
