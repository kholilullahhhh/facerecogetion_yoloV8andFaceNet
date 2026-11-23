// Copies the MediaPipe vision WASM runtime into public/ so the browser can load
// it locally (no CDN). Runs automatically on `npm install` (postinstall).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(frontendRoot, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(frontendRoot, "public", "mediapipe", "wasm");

if (!existsSync(source)) {
  console.warn("[mediapipe] WASM runtime not found. Run `npm install` first.");
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("[mediapipe] WASM runtime copied to public/mediapipe/wasm");
