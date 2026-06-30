import { ApplicationCommandOptionType } from "discord.js";
import { createCommand } from "@/lib/command-builder";
import { resolveCallsign } from "@/lib/airlines";
import {
  buildFlightMessage,
  buildLoadingMessage,
  buildNoticeMessage,
  DEFAULT_ZOOM,
  fetchAircraft,
  fetchPhotos,
  getHeading,
  getPosition,
  renderMap,
  type FlightState,
} from "@/lib/flight";

export const flight = createCommand({
  name: "flight",
  description: "Track a flight's live position, photo and telemetry",
  cooldown: 10,
  isPremium: false,
})
  .option({
    name: "code",
    description: "Flight number, e.g. AF188 or AFR188",
    type: ApplicationCommandOptionType.String,
    required: true,
    maxLength: 10,
  })
  .execute(async (interaction, options) => {
    const resolved = resolveCallsign(options.code);
    if ("error" in resolved) {
      return interaction.reply({ content: resolved.error, flags: "Ephemeral" });
    }
    const { callsign } = resolved;

    await interaction.reply(buildLoadingMessage(callsign));

    const aircraft = await fetchAircraft(callsign);
    if (!aircraft) {
      return interaction.editReply(
        buildNoticeMessage(
          `## ✈️ \`${callsign}\`\nNo flight found. The flight may not be airborne or tracked right now.`,
        ),
      );
    }

    const hex = (aircraft.hex ?? "").trim();
    const position = getPosition(aircraft);
    const state: FlightState = { callsign, hex, zoom: DEFAULT_ZOOM };

    const [photos, mapBuffer] = await Promise.all([
      fetchPhotos(hex),
      position
        ? renderMap(position.lat, position.lon, DEFAULT_ZOOM, getHeading(aircraft))
        : Promise.resolve(null),
    ]);

    await interaction.editReply(
      buildFlightMessage({ aircraft, photos, photoIndex: 0, mapBuffer, state }),
    );
  });
