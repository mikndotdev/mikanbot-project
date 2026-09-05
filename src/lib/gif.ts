import type { Message } from "discord.js";
import * as Sentry from "@sentry/bun";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";

const MAX_EDGE = 1024;
const MAX_IMAGES = 4;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i;

export interface ImageSource {
  url: string;
  contentType: string | null;
  size: number | null;
}

export function collectImageSources(message: Message): ImageSource[] {
  const attachments = [...message.attachments.values()]
    .filter(
      (attachment) =>
        attachment.contentType?.startsWith("image/") ?? IMAGE_EXTENSIONS.test(attachment.name),
    )
    .map((attachment) => ({
      url: attachment.url,
      contentType: attachment.contentType,
      size: attachment.size,
    }));

  if (attachments.length > 0) return attachments.slice(0, MAX_IMAGES);

  const embedded: ImageSource[] = [];

  for (const embed of message.embeds) {
    const asset = embed.image ?? embed.thumbnail;
    if (asset?.url) embedded.push({ url: asset.url, contentType: null, size: null });
  }

  return embedded.slice(0, MAX_IMAGES);
}

export async function downloadImage(source: ImageSource): Promise<Buffer> {
  if (source.size !== null && source.size > MAX_INPUT_BYTES) {
    throw new Error(`Image is too large (${source.size} bytes)`);
  }

  const response = await fetch(source.url);

  if (!response.ok) {
    throw new Error(`Image download failed with HTTP ${response.status}`);
  }

  const declared = Number(response.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > MAX_INPUT_BYTES) {
    throw new Error(`Image is too large (${declared} bytes)`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength > MAX_INPUT_BYTES) {
    throw new Error(`Image is too large (${buffer.byteLength} bytes)`);
  }

  return buffer;
}

export async function toGif(input: Buffer): Promise<Buffer> {
  if (input.subarray(0, 4).toString("latin1") === "GIF8") return input;

  const { default: sharp } = await import("sharp");

  return sharp(input, { animated: true })
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .gif()
    .toBuffer();
}

export async function uploadGif(userId: string, gif: Buffer, timestamp: number): Promise<string> {
  const base = env.STORAGE_PUBLIC_BASE_URL;

  if (!base) throw new Error("STORAGE_PUBLIC_BASE_URL is not configured");

  const path = `mikanbot-conversions/${userId}/${timestamp}.gif`;

  await storage.upload(path, new Uint8Array(gif), {
    contentType: "image/gif",
    cacheControl: "public, max-age=31536000, immutable",
  });

  Sentry.logger.debug("Uploaded converted GIF", { path, bytes: gif.byteLength, userId });

  return `${base.replace(/\/+$/, "")}/${path}`;
}

export async function convertImageToGif(
  userId: string,
  source: ImageSource,
  timestamp: number,
): Promise<string> {
  const input = await downloadImage(source);
  const gif = await toGif(input);

  return uploadGif(userId, gif, timestamp);
}
