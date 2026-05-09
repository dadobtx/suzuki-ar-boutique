import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '..', 'public', 'mediapipe');
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

// We export this so the worker can report it to DiagPage
export const POSE_MODEL_VERSION = '0.10.18-full-float16';

// Known SHA-256 for the float16 full model (if it changes, update this or set to null to bypass strict check)
// Set to null initially to allow the first download to print the actual hash.
const EXPECTED_HASH: string | null = null;

async function computeHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (response.headers.location) {
            return downloadFile(response.headers.location, dest)
              .then(resolve)
              .catch(reject);
          }
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

async function main() {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  // Copy MediaPipe wasm runtime files from node_modules to public
  const WASM_SRC = path.join(
    __dirname,
    '..',
    'node_modules',
    '@mediapipe',
    'tasks-vision',
    'wasm',
  );
  const WASM_DEST = path.join(MODELS_DIR, 'wasm');

  if (!fs.existsSync(WASM_SRC)) {
    console.error('[download-models] node_modules wasm not found at:', WASM_SRC);
    console.error('[download-models] Run "npm install" first.');
    process.exit(1);
  }

  if (!fs.existsSync(WASM_DEST)) {
    fs.mkdirSync(WASM_DEST, { recursive: true });
  }

  const wasmFiles = fs.readdirSync(WASM_SRC);
  for (const file of wasmFiles) {
    const src = path.join(WASM_SRC, file);
    const dest = path.join(WASM_DEST, file);
    fs.copyFileSync(src, dest);
  }
  console.log(`[download-models] Copied ${wasmFiles.length} wasm files to ${WASM_DEST}`);

  const destPath = path.join(MODELS_DIR, 'pose_landmarker_full.task');

  console.log(`[download-models] Checking ${destPath}...`);

  if (fs.existsSync(destPath)) {
    console.log(`[download-models] File exists. Verifying hash...`);
    const hash = await computeHash(destPath);
    console.log(`[download-models] Current hash: ${hash}`);

    if (EXPECTED_HASH && hash !== EXPECTED_HASH) {
      console.log(
        `[download-models] Hash mismatch! Expected ${EXPECTED_HASH}. Redownloading...`,
      );
      fs.unlinkSync(destPath);
    } else {
      console.log(`[download-models] Hash verified or skipped. Model is ready.`);
      return;
    }
  }

  console.log(`[download-models] Downloading from ${POSE_MODEL_URL}...`);
  await downloadFile(POSE_MODEL_URL, destPath);

  const newHash = await computeHash(destPath);
  console.log(`[download-models] Download complete. SHA-256: ${newHash}`);
}

main().catch((err) => {
  console.error('[download-models] Error:', err);
  process.exit(1);
});
