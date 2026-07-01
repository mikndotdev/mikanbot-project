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
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import type { AirlabsFleet, AirlabsFlight, AirlabsLive } from "@/lib/airlabs";
import { resolveAircraftName } from "@/lib/aircraft";

const PIN_URL = "https://cdn.mikn.dev/bot-assets/mikanbot/plane-pin.png";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const PHOTOS_BASE = "https://api.planespotters.net/pub/photos";
const PLANESPOTTERS_UA = "mikanbot/1.0 (+https://mikn.dev)";

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

export interface PlaneState {
  reg: string;
  zoom: number;
}

export type FlightAction = "photo" | "zoomin" | "zoomout";

export async function fetchAircraft(callsign: string): Promise<Aircraft | null> {
  try {
    const res = await fetch(
      `https://api.airplanes.live/v2/callsign/${encodeURIComponent(callsign)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { ac?: Aircraft[] };
    if (!data.ac || data.ac.length === 0) return null;
    return data.ac[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchPhotos(hex: string): Promise<Photo[]> {
  return fetchPlanespotters("hex", hex);
}

export async function fetchPhotosByReg(reg: string): Promise<Photo[]> {
  return fetchPlanespotters("reg", reg);
}

export async function fetchAircraftPhotos(
  hex: string | null | undefined,
  reg: string | null | undefined,
): Promise<Photo[]> {
  const h = (hex ?? "").trim();
  if (h) {
    const photos = await fetchPhotos(h);
    if (photos.length > 0) return photos;
  }
  const r = (reg ?? "").trim();
  if (r) return fetchPhotosByReg(r);
  return [];
}

async function fetchPlanespotters(kind: "hex" | "reg", value: string): Promise<Photo[]> {
  if (!value) return [];
  try {
    const res = await fetch(`${PHOTOS_BASE}/${kind}/${encodeURIComponent(value.toLowerCase())}`, {
      headers: { "User-Agent": PLANESPOTTERS_UA, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`planespotters ${kind}/${value} → HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { photos?: Photo[] };
    return data.photos ?? [];
  } catch (error) {
    console.error("planespotters fetch failed:", error);
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

export interface Tracking {
  lat: number;
  lon: number;
  heading: number | null;
}

function liveAirborne(ac: Aircraft): boolean {
  if (ac.alt_baro === "ground") return false;
  if (typeof ac.alt_baro === "number") return ac.alt_baro > 0;
  return true;
}

function airlabsAirborne(status: string | undefined, alt: number | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  if (s === "en-route") return true;
  if (s === "landed" || s === "scheduled" || s === "cancelled") return false;
  return typeof alt === "number" && alt > 0;
}

export function resolveFlightTracking(
  live: Aircraft | null,
  airlabs: AirlabsFlight | null,
): Tracking | null {
  if (live && liveAirborne(live)) {
    const pos = getPosition(live);
    if (pos) return { lat: pos.lat, lon: pos.lon, heading: getHeading(live) };
  }
  if (
    airlabs &&
    typeof airlabs.lat === "number" &&
    typeof airlabs.lng === "number" &&
    airlabsAirborne(airlabs.status, airlabs.alt)
  ) {
    return {
      lat: airlabs.lat,
      lon: airlabs.lng,
      heading: typeof airlabs.dir === "number" ? airlabs.dir : null,
    };
  }
  return null;
}

export function resolvePlaneTracking(live: AirlabsLive | null): Tracking | null {
  if (
    live &&
    typeof live.lat === "number" &&
    typeof live.lng === "number" &&
    airlabsAirborne(live.status, live.alt)
  ) {
    return {
      lat: live.lat,
      lon: live.lng,
      heading: typeof live.dir === "number" ? live.dir : null,
    };
  }
  return null;
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

export function encodePlaneId(action: FlightAction, state: PlaneState): string {
  return `plane:${action}:${state.reg}:${state.zoom}`;
}

export function decodePlaneId(
  customId: string,
): { action: FlightAction; state: PlaneState } | null {
  const parts = customId.split(":");
  if (parts.length !== 4 || parts[0] !== "plane") return null;
  const action = parts[1] as FlightAction;
  if (action !== "photo" && action !== "zoomin" && action !== "zoomout") return null;
  const zoom = Number(parts[3]);
  if (!Number.isFinite(zoom)) return null;
  return { action, state: { reg: parts[2] ?? "", zoom } };
}

interface Telemetry {
  altFt: number | "ground" | null;
  speedKt: number | null;
  heading: number | null;
  squawk: string | null;
}

function telemetryFromLive(ac: Aircraft): Telemetry {
  const alt = ac.alt_baro;
  const speed = ac.gs ?? ac.tas ?? ac.ias;
  return {
    altFt: alt === "ground" ? "ground" : typeof alt === "number" ? alt : null,
    speedKt: typeof speed === "number" ? Math.round(speed) : null,
    heading: getHeading(ac),
    squawk: ac.squawk ?? null,
  };
}

function telemetryFromAirlabs(f: AirlabsFlight): Telemetry {
  return {
    altFt: typeof f.alt === "number" ? Math.round(f.alt * 3.28084) : null,
    speedKt: typeof f.speed === "number" ? Math.round(f.speed / 1.852) : null,
    heading: typeof f.dir === "number" ? f.dir : null,
    squawk: null,
  };
}

function hasTelemetry(t: Telemetry): boolean {
  return t.altFt !== null || t.speedKt !== null || t.heading !== null;
}

function fmtAlt(t: Telemetry): string {
  if (t.altFt === "ground") return "On ground";
  return typeof t.altFt === "number" ? `${t.altFt.toLocaleString("en-US")} ft` : "—";
}

function fmtSpeed(t: Telemetry): string {
  return typeof t.speedKt === "number" ? `${t.speedKt} kt` : "—";
}

function fmtHeading(t: Telemetry): string {
  return typeof t.heading === "number" ? `${Math.round(t.heading)}°` : "—";
}

function addHeader(
  container: ContainerBuilder,
  title: string,
  subtitle: string | null,
  hasLogo: boolean,
): void {
  const content = subtitle ? `${title}\n${subtitle}` : title;
  if (hasLogo) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL("attachment://logo.png")),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }
}

function addPhotoBlock(
  container: ContainerBuilder,
  photos: Photo[],
  photoIndex: number,
  label: string,
  buttonId: string,
): Photo | undefined {
  const photo = photos[photoIndex];
  const src = photo?.thumbnail_large?.src ?? photo?.thumbnail?.src;
  if (src) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(src).setDescription(label),
      ),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId)
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
  return photo;
}

function addMapBlock(
  container: ContainerBuilder,
  mapBuffer: Buffer | null,
  zoom: number,
  zoomOutId: string,
  zoomInId: string,
): void {
  if (!mapBuffer) return;
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
        .setCustomId(zoomOutId)
        .setLabel("Zoom out")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(zoom <= ZOOM_MIN),
      new ButtonBuilder()
        .setCustomId(zoomInId)
        .setLabel("Zoom in")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(zoom >= ZOOM_MAX),
    ),
  );
}

function buildFiles(logo: Buffer | null, mapBuffer: Buffer | null): AttachmentBuilder[] {
  const files: AttachmentBuilder[] = [];
  if (logo) files.push(new AttachmentBuilder(logo, { name: "logo.png" }));
  if (mapBuffer) files.push(new AttachmentBuilder(mapBuffer, { name: "map.png" }));
  return files;
}

function noticeContainer(text: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

export function buildLoadingMessage(label: string) {
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [noticeContainer(`## ✈️ \`${label}\`\n${LOADING_EMOJI} Fetching data…`)],
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
  airlabs: AirlabsFlight | null;
  live: Aircraft | null;
  photos: Photo[];
  photoIndex: number;
  mapBuffer: Buffer | null;
  logo: Buffer | null;
  state: FlightState;
}

export function buildFlightMessage(args: BuildFlightArgs) {
  const { airlabs, live, photos, photoIndex, mapBuffer, logo, state } = args;

  const flightLabel =
    airlabs?.flight_iata ?? airlabs?.flight_icao ?? live?.flight?.trim() ?? state.callsign;
  const reg = airlabs?.reg_number ?? live?.r ?? null;
  const typeCode = airlabs?.aircraft_icao ?? live?.t ?? null;
  const type = resolveAircraftName(typeCode) ?? airlabs?.model ?? live?.desc ?? typeCode ?? null;
  const tracking = resolveFlightTracking(live, airlabs);

  const container = new ContainerBuilder().setAccentColor(ACCENT);

  const subtitle = [reg, type].filter(Boolean).join(" · ") || "Aircraft";
  addHeader(container, `## ✈️ ${flightLabel}`, subtitle, logo !== null);

  if (airlabs?.dep_iata || airlabs?.arr_iata) {
    const dep = airlabs.dep_iata
      ? `${airlabs.dep_city ?? airlabs.dep_name ?? airlabs.dep_iata} (${airlabs.dep_iata})`
      : "?";
    const arr = airlabs.arr_iata
      ? `${airlabs.arr_city ?? airlabs.arr_name ?? airlabs.arr_iata} (${airlabs.arr_iata})`
      : "?";
    const meta = [
      airlabs.status ? `Status: ${airlabs.status}` : null,
      airlabs.dep_time ? `Dep ${airlabs.dep_time}` : null,
      airlabs.arr_time ? `Arr ${airlabs.arr_time}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${dep} → ${arr}**${meta ? `\n${meta}` : ""}`),
    );
  }

  const liveTele = live ? telemetryFromLive(live) : null;
  const airlabsTele = airlabs ? telemetryFromAirlabs(airlabs) : null;
  const tele = liveTele && hasTelemetry(liveTele) ? liveTele : (airlabsTele ?? liveTele);
  if (tele) {
    let line = `**Altitude:** ${fmtAlt(tele)} **Speed:** ${fmtSpeed(tele)} **Heading:** ${fmtHeading(tele)}`;
    const extras: string[] = [];
    if (tele.squawk) extras.push(`**Squawk:** ${tele.squawk}`);
    extras.push(
      `**Position:** ${tracking ? `${tracking.lat.toFixed(3)}, ${tracking.lon.toFixed(3)}` : "unknown"}`,
    );
    line += `\n${extras.join(" ")}`;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(line));
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const photo = addPhotoBlock(
    container,
    photos,
    photoIndex,
    `Aircraft photo of ${reg ?? flightLabel}`,
    encodeId("photo", state),
  );
  addMapBlock(
    container,
    mapBuffer,
    state.zoom,
    encodeId("zoomout", state),
    encodeId("zoomin", state),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(attribution(photo, mapBuffer)),
  );

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [container],
    files: buildFiles(logo, mapBuffer),
    attachments: [],
  };
}

export interface BuildPlaneArgs {
  fleet: AirlabsFleet | null;
  live: AirlabsLive | null;
  photos: Photo[];
  photoIndex: number;
  mapBuffer: Buffer | null;
  logo: Buffer | null;
  state: PlaneState;
}

export function buildPlaneMessage(args: BuildPlaneArgs) {
  const { fleet, live, photos, photoIndex, mapBuffer, logo, state } = args;

  const reg = fleet?.reg_number ?? live?.reg_number ?? state.reg;
  const typeCode = fleet?.icao ?? live?.aircraft_icao ?? null;
  const type = resolveAircraftName(typeCode) ?? fleet?.model ?? typeCode ?? "Unknown aircraft";

  const container = new ContainerBuilder().setAccentColor(ACCENT);

  addHeader(container, `## ✈️ ${reg}`, type, logo !== null);

  const specs = [
    fleet?.manufacturer ? `**Manufacturer:** ${fleet.manufacturer}` : null,
    fleet?.icao || fleet?.iata
      ? `**Type:** ${[fleet?.icao, fleet?.iata].filter(Boolean).join("/")}`
      : null,
    typeof fleet?.age === "number"
      ? `**Age:** ${fleet.age} yrs${fleet.built ? ` (${fleet.built})` : ""}`
      : null,
    fleet?.engine_count && fleet?.engine
      ? `**Engines:** ${fleet.engine_count}× ${fleet.engine}`
      : null,
    fleet?.airline_icao ? `**Airline:** ${fleet.airline_icao}` : null,
  ].filter(Boolean);
  if (specs.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(specs.join("\n")));
  }

  if (live && (live.dep_iata || live.arr_iata)) {
    const num = live.flight_iata ?? live.flight_icao ?? "";
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Now flying:** ${num} ${live.dep_iata ?? "?"} → ${live.arr_iata ?? "?"}${live.status ? ` · ${live.status}` : ""}`,
      ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# Not currently airborne."),
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const photo = addPhotoBlock(
    container,
    photos,
    photoIndex,
    `Aircraft photo of ${reg}`,
    encodePlaneId("photo", state),
  );
  addMapBlock(
    container,
    mapBuffer,
    state.zoom,
    encodePlaneId("zoomout", state),
    encodePlaneId("zoomin", state),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(attribution(photo, mapBuffer)),
  );

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [container],
    files: buildFiles(logo, mapBuffer),
    attachments: [],
  };
}

function attribution(photo: Photo | undefined, mapBuffer: Buffer | null): string {
  const parts: string[] = [];
  if (photo?.photographer) parts.push(`Photo © ${photo.photographer}`);
  parts.push(photo?.link ? `[planespotters.net](${photo.link})` : "planespotters.net");
  parts.push("data: airlabs.co & airplanes.live");
  if (mapBuffer) parts.push("map © OpenStreetMap");
  return `-# ${parts.join(" · ")}`;
}
