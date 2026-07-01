import { ApplicationCommandOptionType } from "discord.js";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";
import { fetchAirlineLogo, fetchFleet, fetchLiveByReg } from "@/lib/airlabs";
import {
  buildLoadingMessage,
  buildNoticeMessage,
  buildPlaneMessage,
  DEFAULT_ZOOM,
  fetchAircraftPhotos,
  renderMap,
  resolvePlaneTracking,
  type PlaneState,
} from "@/lib/flight";

const planeOptions = [
  {
    name: "reg",
    description: "Aircraft registration, e.g. F-HUVO or N732AN",
    type: ApplicationCommandOptionType.String,
    required: true,
    maxLength: 12,
  },
] as const;

export const planeConfig: SubcommandConfig<typeof planeOptions> = {
  name: "plane",
  description: "Look up an aircraft by its registration",
  options: planeOptions,
};

export const planeExecute: SubcommandExecuteFunction<typeof planeOptions> = async (
  interaction,
  options,
) => {
  const reg = options.reg.trim().toUpperCase();

  await interaction.reply(buildLoadingMessage(reg));

  const [fleet, live] = await Promise.all([fetchFleet(reg), fetchLiveByReg(reg)]);

  if (!fleet && !live) {
    return interaction.editReply(
      buildNoticeMessage(`## ✈️ \`${reg}\`\nNo aircraft found for that registration.`),
    );
  }

  const hex = (fleet?.hex ?? live?.hex ?? "").trim();
  const airlineIcao = fleet?.airline_icao ?? live?.airline_icao ?? null;
  const tracking = resolvePlaneTracking(live);
  const state: PlaneState = { reg, zoom: DEFAULT_ZOOM };

  const [photos, mapBuffer, logo] = await Promise.all([
    fetchAircraftPhotos(hex, reg),
    tracking
      ? renderMap(tracking.lat, tracking.lon, DEFAULT_ZOOM, tracking.heading)
      : Promise.resolve(null),
    fetchAirlineLogo(airlineIcao),
  ]);

  await interaction.editReply(
    buildPlaneMessage({ fleet, live, photos, photoIndex: 0, mapBuffer, logo, state }),
  );
};
