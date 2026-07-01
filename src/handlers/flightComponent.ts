import type { ButtonInteraction } from "discord.js";
import { fetchAirlabsFlight, fetchAirlineLogo } from "@/lib/airlabs";
import {
  applyZoom,
  buildFlightMessage,
  buildNoticeMessage,
  decodeId,
  fetchAircraft,
  fetchAircraftPhotos,
  renderMap,
  resolveFlightTracking,
} from "@/lib/flight";

export async function handleFlightComponent(interaction: ButtonInteraction) {
  const decoded = decodeId(interaction.customId);
  if (!decoded) return;
  const { action, state } = decoded;

  await interaction.deferUpdate();

  const [live, airlabs] = await Promise.all([
    fetchAircraft(state.callsign),
    fetchAirlabsFlight(state.callsign),
  ]);

  if (!live && !airlabs) {
    await interaction.editReply(
      buildNoticeMessage(
        `## ✈️ \`${state.callsign}\`\nSignal lost — this flight is no longer being tracked (it may have landed).`,
      ),
    );
    return;
  }

  const zoom = applyZoom(state.zoom, action);
  const hex = (live?.hex ?? airlabs?.hex ?? state.hex).trim();
  const reg = airlabs?.reg_number ?? live?.r ?? "";
  const airlineIcao = airlabs?.airline_icao ?? state.callsign.slice(0, 3);
  const tracking = resolveFlightTracking(live, airlabs);
  const newState = { callsign: state.callsign, hex, zoom };

  const [photos, mapBuffer, logo] = await Promise.all([
    fetchAircraftPhotos(hex, reg),
    tracking
      ? renderMap(tracking.lat, tracking.lon, zoom, tracking.heading)
      : Promise.resolve(null),
    fetchAirlineLogo(airlineIcao),
  ]);

  const photoIndex =
    action === "photo" && photos.length > 0 ? Math.floor(Math.random() * photos.length) : 0;

  await interaction.editReply(
    buildFlightMessage({ airlabs, live, photos, photoIndex, mapBuffer, logo, state: newState }),
  );
}
