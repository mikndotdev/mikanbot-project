import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";

const PIN_URL = "https://cdn.mikn.dev/bot-assets/mikanbot/plane-pin.png";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const AIRPLANES_BASE = "https://api.airplanes.live/v2";
const PHOTOS_BASE = "https://api.planespotters.net/pub/photos";

export const ZOOM_MIN = 3;
export const ZOOM_MAX = 15;
export const ZOOM_STEP = 2;
export const DEFAULT_ZOOM = 8;
const ACCENT = 0xff7700;
const LOADING_EMOJI = "<a:loading:1272805571585642506>";

export interface Aircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  alt_baro?: number | string;
  gs?: number;
  tas?: number;
  ias?: number;
  track?: number;
  true_heading?: number;
  mag_heading?: number;
  squawk?: string;
  lat?: number;
  lon?: number;
  rr_lat?: number;
  rr_lon?: number;
  lastPosition?: { lat?: number; lon?: number; seen_pos?: number };
  seen?: number;
  seen_pos?: number;
  [key: string]: unknown;
}

export interface Photo {
  thumbnail_large?: { src?: string };
  thumbnail?: { src?: string };
  link?: string;
  photographer?: string;
}

export interface FlightState {
  callsign: string;
  hex: string;
  zoom: number;
}

export type FlightAction = "photo" | "zoomin" | "zoomout";

export async function fetchAircraft(callsign: string): Promise<Aircraft | null> {
  try {
    const res = await fetch(`${AIRPLANES_BASE}/callsign/${encodeURIComponent(callsign)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { ac?: Aircraft[] };
    if (!data.ac || data.ac.length === 0) return null;
    return data.ac[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchPhotos(hex: string): Promise<Photo[]> {
  if (!hex) return [];
  try {
    const res = await fetch(`${PHOTOS_BASE}/hex/${encodeURIComponent(hex)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { photos?: Photo[] };
    return data.photos ?? [];
  } catch {
    return [];
  }
}

export function getPosition(ac: Aircraft): { lat: number; lon: number } | null {
  if (typeof ac.lat === "number" && typeof ac.lon === "number") {
    return { lat: ac.lat, lon: ac.lon };
  }
  if (
    ac.lastPosition &&
    typeof ac.lastPosition.lat === "number" &&
    typeof ac.lastPosition.lon === "number"
  ) {
    return { lat: ac.lastPosition.lat, lon: ac.lastPosition.lon };
  }
  if (typeof ac.rr_lat === "number" && typeof ac.rr_lon === "number") {
    return { lat: ac.rr_lat, lon: ac.rr_lon };
  }
  return null;
}

export function getHeading(ac: Aircraft): number | null {
  const heading = ac.track ?? ac.true_heading ?? ac.mag_heading;
  return typeof heading === "number" ? heading : null;
}

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

export function applyZoom(zoom: number, action: FlightAction): number {
  if (action === "zoomin") return clampZoom(zoom + ZOOM_STEP);
  if (action === "zoomout") return clampZoom(zoom - ZOOM_STEP);
  return clampZoom(zoom);
}

const PIN_DRAW_SIZE = 44;
const PIN_HEADING_OFFSET = 90;
let pinBufferPromise: Promise<Buffer | null> | null = null;

function getPinBuffer(): Promise<Buffer | null> {
  if (!pinBufferPromise) {
    pinBufferPromise = (async () => {
      try {
        const res = await fetch(PIN_URL);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
  }
  return pinBufferPromise;
}

export async function renderMap(
  lat: number,
  lon: number,
  zoom: number,
  heading: number | null = null,
): Promise<Buffer | null> {
  let markerPath: string | null = null;
  try {
    const { default: StaticMaps } = await import("staticmaps");
    const map = new StaticMaps({ width: 800, height: 400, tileUrl: TILE_URL });

    const basePin = await getPinBuffer();
    if (basePin) {
      const { default: sharp } = await import("sharp");
      let pipeline = sharp(basePin);
      if (heading !== null) {
        pipeline = pipeline.rotate(heading - PIN_HEADING_OFFSET, {
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        });
      }

      markerPath = join(tmpdir(), `mikanbot-pin-${randomUUID()}.png`);
      const info = await pipeline.png().toFile(markerPath);

      map.addMarker({
        coord: [lon, lat],
        img: markerPath,
        width: info.width,
        height: info.height,
        drawWidth: PIN_DRAW_SIZE,
        drawHeight: PIN_DRAW_SIZE,
        offsetX: PIN_DRAW_SIZE / 2,
        offsetY: PIN_DRAW_SIZE / 2,
      });
    }

    await map.render([lon, lat], clampZoom(zoom));
    return await map.image.buffer("image/png");
  } catch (error) {
    console.error("Flight map render failed:", error);
    return null;
  } finally {
    if (markerPath) {
      await unlink(markerPath).catch(() => {});
    }
  }
}

export function encodeId(action: FlightAction, state: FlightState): string {
  return `flight:${action}:${state.callsign}:${state.hex}:${state.zoom}`;
}

export function decodeId(customId: string): { action: FlightAction; state: FlightState } | null {
  const parts = customId.split(":");
  if (parts.length !== 5 || parts[0] !== "flight") return null;
  const action = parts[1] as FlightAction;
  if (action !== "photo" && action !== "zoomin" && action !== "zoomout") return null;
  const zoom = Number(parts[4]);
  if (!Number.isFinite(zoom)) return null;
  return {
    action,
    state: { callsign: parts[2] ?? "", hex: parts[3] ?? "", zoom },
  };
}

function formatAltitude(alt: Aircraft["alt_baro"]): string {
  if (alt === "ground") return "On ground";
  if (typeof alt === "number") return `${alt.toLocaleString("en-US")} ft`;
  return "—";
}

function formatSpeed(ac: Aircraft): string {
  const speed = ac.gs ?? ac.tas ?? ac.ias;
  return typeof speed === "number" ? `${Math.round(speed)} kt` : "—";
}

function formatHeading(ac: Aircraft): string {
  const heading = getHeading(ac);
  return heading === null ? "—" : `${Math.round(heading)}°`;
}

function noticeContainer(text: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

export function buildLoadingMessage(callsign: string) {
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [
      noticeContainer(`## ✈️ Tracking \`${callsign}\`\n${LOADING_EMOJI} Fetching flight data…`),
    ],
  };
}

export function buildNoticeMessage(text: string) {
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [noticeContainer(text)],
    attachments: [],
  };
}

export interface BuildFlightArgs {
  aircraft: Aircraft;
  photos: Photo[];
  photoIndex: number;
  mapBuffer: Buffer | null;
  state: FlightState;
}

export function buildFlightMessage(args: BuildFlightArgs) {
  const { aircraft: ac, photos, photoIndex, mapBuffer, state } = args;
  const position = getPosition(ac);
  const callsignDisplay = (ac.flight ?? state.callsign).trim() || state.callsign;
  const typeLine = [ac.desc, ac.t].filter(Boolean).join(" · ") || "Unknown aircraft";

  const container = new ContainerBuilder().setAccentColor(ACCENT);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ✈️ ${callsignDisplay}${ac.r ? ` (${ac.r})` : ""}\n${typeLine}`,
    ),
  );

  const telemetry =
    `**Altitude:** ${formatAltitude(ac.alt_baro)} **Speed:** ${formatSpeed(ac)} **Heading:** ${formatHeading(ac)}\n` +
    `**Squawk:** ${ac.squawk ?? "—"} **Position:** ${position ? `${position.lat.toFixed(3)}, ${position.lon.toFixed(3)}` : "unknown"}`;
  const seen = typeof ac.seen_pos === "number" ? ac.seen_pos : ac.seen;
  const seenLine = typeof seen === "number" ? `\n-# Updated ${Math.round(seen)}s ago` : "";
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(telemetry + seenLine));

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const photo = photos[photoIndex];
  const photoSrc = photo?.thumbnail_large?.src ?? photo?.thumbnail?.src;

  if (photoSrc) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(photoSrc)
          .setDescription(`Aircraft photo of ${ac.r ?? callsignDisplay}`),
      ),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeId("photo", state))
          .setLabel("Randomize photo")
          .setEmoji("🔀")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(photos.length < 2),
      ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# No photo available for this aircraft."),
    );
  }

  if (mapBuffer) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL("attachment://map.png")
          .setDescription("Current position"),
      ),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeId("zoomout", state))
          .setLabel("Zoom out")
          .setEmoji("➖")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(state.zoom <= ZOOM_MIN),
        new ButtonBuilder()
          .setCustomId(encodeId("zoomin", state))
          .setLabel("Zoom in")
          .setEmoji("➕")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(state.zoom >= ZOOM_MAX),
      ),
    );
  } else if (position) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# Map unavailable right now."),
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
  );
  const attribution: string[] = [];
  if (photo?.photographer) attribution.push(`Photo © ${photo.photographer}`);
  attribution.push(photo?.link ? `[planespotters.net](${photo.link})` : "planespotters.net");
  attribution.push("data: airplanes.live");
  if (mapBuffer) attribution.push("map © OpenStreetMap");
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${attribution.join(" · ")}`),
  );

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [container],
    files: mapBuffer ? [new AttachmentBuilder(mapBuffer, { name: "map.png" })] : [],
    attachments: [],
  };
}
