import type { ButtonInteraction } from "discord.js";
import { fetchAirlineLogo, fetchFleet, fetchLiveByReg } from "@/lib/airlabs";
import {
  applyZoom,
  buildNoticeMessage,
  buildPlaneMessage,
  decodePlaneId,
  fetchAircraftPhotos,
  renderMap,
  resolvePlaneTracking,
} from "@/lib/flight";

export async function handlePlaneComponent(interaction: ButtonInteraction) {
  const decoded = decodePlaneId(interaction.customId);
  if (!decoded) return;
  const { action, state } = decoded;

  await interaction.deferUpdate();

  const [fleet, live] = await Promise.all([fetchFleet(state.reg), fetchLiveByReg(state.reg)]);

  if (!fleet && !live) {
    await interaction.editReply(
      buildNoticeMessage(`## ✈️ \`${state.reg}\`\nNo aircraft found for that registration.`),
    );
    return;
  }

  const zoom = applyZoom(state.zoom, action);
  const hex = (fleet?.hex ?? live?.hex ?? "").trim();
  const airlineIcao = fleet?.airline_icao ?? live?.airline_icao ?? null;
  const tracking = resolvePlaneTracking(live);
  const newState = { reg: state.reg, zoom };

  const [photos, mapBuffer, logo] = await Promise.all([
    fetchAircraftPhotos(hex, state.reg),
    tracking
      ? renderMap(tracking.lat, tracking.lon, zoom, tracking.heading)
      : Promise.resolve(null),
    fetchAirlineLogo(airlineIcao),
  ]);

  const photoIndex =
    action === "photo" && photos.length > 0 ? Math.floor(Math.random() * photos.length) : 0;

  await interaction.editReply(
    buildPlaneMessage({ fleet, live, photos, photoIndex, mapBuffer, logo, state: newState }),
  );
}
