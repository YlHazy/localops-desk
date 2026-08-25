import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "src", "assets", "localops-desktop-icon-master.png");
const buildDir = join(root, "build");
const pngPath = join(buildDir, "icon.png");
const icoPath = join(buildDir, "icon.ico");

const sourceMetadata = await sharp(source).metadata();
if (sourceMetadata.width !== sourceMetadata.height || (sourceMetadata.width ?? 0) < 512) {
  throw new Error("Desktop icon master must be a square image at least 512px wide.");
}

await mkdir(buildDir, { recursive: true });
await sharp(source)
  .resize(256, 256, { fit: "cover", kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9, palette: false })
  .toFile(pngPath);

const ico = await pngToIco(pngPath, { interpolation: "bicubicInterpolation" });
await writeFile(icoPath, ico);

const pngMetadata = await sharp(pngPath).metadata();
const icoHeader = (await readFile(icoPath)).subarray(0, 6);
if (pngMetadata.width !== 256 || pngMetadata.height !== 256 || icoHeader.readUInt16LE(2) !== 1 || icoHeader.readUInt16LE(4) !== 4) {
  throw new Error("Generated Windows desktop icons did not pass format validation.");
}

console.log(`Desktop icons ready: PNG ${pngMetadata.width}x${pngMetadata.height}, ICO ${icoHeader.readUInt16LE(4)} sizes.`);
