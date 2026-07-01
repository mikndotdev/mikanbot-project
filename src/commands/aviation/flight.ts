import { ApplicationCommandOptionType } from "discord.js";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";
import { resolveCallsign } from "@/lib/airlines";
import { fetchAirlabsFlight, fetchAirlineLogo } from "@/lib/airlabs";
import {
  buildFlightMessage,
  buildLoadingMessage,
  buildNoticeMessage,
  DEFAULT_ZOOM,
  fetchAircraft,
  fetchAircraftPhotos,
  renderMap,
  resolveFlightTracking,
  type FlightState,
} from "@/lib/flight";

const flightOptions = [
  {
    name: "code",
    description: "Flight number, e.g. AF188 or AFR188",
    type: ApplicationCommandOptionType.String,
    required: true,
    maxLength: 10,
  },
] as const;

export const flightConfig: SubcommandConfig<typeof flightOptions> = {
  name: "flight",
  description: "Track a flight's live position, route, photo and telemetry",
  options: flightOptions,
};

export const flightExecute: SubcommandExecuteFunction<typeof flightOptions> = async (
  interaction,
  options,
) => {
  const resolved = resolveCallsign(options.code);
  if ("error" in resolved) {
    return interaction.reply({ content: resolved.error, flags: "Ephemeral" });
  }
  const { callsign } = resolved;

  await interaction.reply(buildLoadingMessage(callsign));

  const [live, airlabs] = await Promise.all([
    fetchAircraft(callsign),
    fetchAirlabsFlight(callsign),
  ]);

  if (!live && !airlabs) {
    return interaction.editReply(
      buildNoticeMessage(
        `## ✈️ \`${callsign}\`\nNo flight found. The flight may not be airborne or tracked right now.`,
      ),
    );
  }

  const hex = (live?.hex ?? airlabs?.hex ?? "").trim();
  const reg = airlabs?.reg_number ?? live?.r ?? "";
  const airlineIcao = airlabs?.airline_icao ?? callsign.slice(0, 3);
  const tracking = resolveFlightTracking(live, airlabs);
  const state: FlightState = { callsign, hex, zoom: DEFAULT_ZOOM };

  const [photos, mapBuffer, logo] = await Promise.all([
    fetchAircraftPhotos(hex, reg),
    tracking
      ? renderMap(tracking.lat, tracking.lon, DEFAULT_ZOOM, tracking.heading)
      : Promise.resolve(null),
    fetchAirlineLogo(airlineIcao),
  ]);

  await interaction.editReply(
    buildFlightMessage({ airlabs, live, photos, photoIndex: 0, mapBuffer, logo, state }),
  );
};
