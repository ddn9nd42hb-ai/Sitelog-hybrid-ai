/**
 * Photo pipeline: a phone photo is 4-8 MB, which is both slow to send to the
 * cloud and too large for an on-device session. We downscale to 1280px JPEG.
 */
import type { PhotoRef } from "./types";

export const MAX_EDGE = 1280;
export const JPEG_QUALITY = 0.82;

export function fitsInOnDeviceBudget(photo: PhotoRef): boolean {
  return photo.dataUrl.length < 2_400_000;
}

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fileToPhoto(file: File): Promise<PhotoRef> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file is not an image.");
  }
  const dataUrl = await readAsDataUrl(file);
  const decoded = await loadBitmap(dataUrl);

  const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images.");
  ctx.drawImage(decoded.source, 0, 0, width, height);

  return {
    id: newId(),
    dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
    mimeType: "image/jpeg",
    width,
    height
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

async function loadBitmap(dataUrl: string): Promise<{ width: number; height: number; source: CanvasImageSource }> {
  if (typeof createImageBitmap === "function") {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  }
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not decode the image."));
    img.src = dataUrl;
  });
  return { width: img.naturalWidth, height: img.naturalHeight, source: img };
}
