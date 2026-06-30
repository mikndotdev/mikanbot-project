import type { ButtonInteraction } from "discord.js";
import {
  applyZoom,
  buildFlightMessage,
  buildNoticeMessage,
  decodeId,
  fetchAircraft,
  fetchPhotos,
  getHeading,
  getPosition,
  renderMap,
} from "@/lib/flight";

export async function handleFlightComponent(interaction: ButtonInteraction) {
  const decoded = decodeId(interaction.customId);
  if (!decoded) return;
  const { action, state } = decoded;

  await interaction.deferUpdate();

  const aircraft = await fetchAircraft(state.callsign);
  if (!aircraft) {
    await interaction.editReply(
      buildNoticeMessage(
        `## ✈️ \`${state.callsign}\`\nSignal lost — this flight is no longer being tracked (it may have landed).`,
      ),
    );
    return;
  }

  const zoom = applyZoom(state.zoom, action);
  const hex = (aircraft.hex ?? state.hex).trim();
  const newState = { callsign: state.callsign, hex, zoom };
  const position = getPosition(aircraft);

  const [photos, mapBuffer] = await Promise.all([
    fetchPhotos(hex),
    position
      ? renderMap(position.lat, position.lon, zoom, getHeading(aircraft))
      : Promise.resolve(null),
  ]);

  const photoIndex =
    action === "photo" && photos.length > 0 ? Math.floor(Math.random() * photos.length) : 0;

  await interaction.editReply(
    buildFlightMessage({ aircraft, photos, photoIndex, mapBuffer, state: newState }),
  );
}
