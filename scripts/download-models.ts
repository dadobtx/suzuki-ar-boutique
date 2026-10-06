import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '..', 'public', 'mediapipe');
interface ModelConfig {
  name: string;
  url: string;
  expectedHash: string | null;
}

const MODELS: ModelConfig[] = [
  {
    name: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
    expectedHash: '4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad',
  },
  {
    name: 'gesture_recognizer.task',
    url: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task',
    expectedHash: '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482',
  },
];

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

async function ensureModel(model: ModelConfig) {
  const destPath = path.join(MODELS_DIR, model.name);
  console.log(`[download-models] Checking ${destPath}...`);

  if (fs.existsSync(destPath)) {
    console.log(`[download-models] File ${model.name} exists. Verifying hash...`);
    const hash = await computeHash(destPath);
    console.log(`[download-models] ${model.name} current hash: ${hash}`);

    if (model.expectedHash && hash !== model.expectedHash) {
      console.log(
        `[download-models] Hash mismatch for ${model.name}! Expected ${model.expectedHash}. Redownloading...`,
      );
      fs.unlinkSync(destPath);
    } else {
      console.log(
        `[download-models] Hash verified or skipped for ${model.name}. Model is ready.`,
      );
      return;
    }
  }

  console.log(`[download-models] Downloading ${model.name} from ${model.url}...`);
  await downloadFile(model.url, destPath);

  const newHash = await computeHash(destPath);
  console.log(
    `[download-models] Download complete for ${model.name}. SHA-256: ${newHash}`,
  );
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

  for (const model of MODELS) {
    await ensureModel(model);
  }
}

main().catch((err) => {
  console.error('[download-models] Error:', err);
  process.exit(1);
});
