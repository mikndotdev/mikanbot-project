import * as Sentry from "@sentry/bun";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ElesiteMapTrack, ElesiteMapTrain } from "@/lib/elesite";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const WIDTH = 900;
const HEIGHT = 600;
const TRACK_COLOR = "#1E88E5CC";
const TRACK_WIDTH = 4;
const DOT_SIZE = 18;
const MAX_TRAINS = 60;

function dotSvg(color: string): string {
  const fill = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#FF7700";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DOT_SIZE}" height="${DOT_SIZE}" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5"/></svg>`;
}

export async function renderTrainMap(
  tracks: ElesiteMapTrack[],
  trains: ElesiteMapTrain[],
): Promise<Buffer | null> {
  const created: string[] = [];
  try {
    const { default: StaticMaps } = await import("staticmaps");
    const map = new StaticMaps({ width: WIDTH, height: HEIGHT, tileUrl: TILE_URL });

    let drew = false;
    for (const track of tracks) {
      const coords = (track.points ?? [])
        .filter((p) => Array.isArray(p) && p.length === 2)
        .map(([lat, lng]) => [lng, lat] as [number, number]);
      if (coords.length < 2) continue;
      map.addLine({ coords, color: TRACK_COLOR, width: TRACK_WIDTH });
      drew = true;
    }
    if (!drew) return null;

    const byColor = new Map<string, string>();
    const plotted = trains
      .filter((t) => typeof t.lat === "number" && typeof t.lng === "number")
      .slice(0, MAX_TRAINS);

    for (const train of plotted) {
      const color = train.color ?? "#FF7700";
      let path = byColor.get(color);
      if (!path) {
        path = join(tmpdir(), `mikanbot-train-${randomUUID()}.svg`);
        await writeFile(path, dotSvg(color));
        created.push(path);
        byColor.set(color, path);
      }
      map.addMarker({
        coord: [train.lng as number, train.lat as number],
        img: path,
        width: DOT_SIZE,
        height: DOT_SIZE,
        drawWidth: DOT_SIZE,
        drawHeight: DOT_SIZE,
        offsetX: DOT_SIZE / 2,
        offsetY: DOT_SIZE / 2,
      });
    }

    await map.render();
    return await map.image.buffer("image/png");
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "trainMap" } });
    return null;
  } finally {
    for (const path of created) {
      await unlink(path).catch(() => undefined);
    }
  }
}
