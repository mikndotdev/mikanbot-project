import { createCommandWithSubcommands } from "@/lib/command-builder";
import { flightConfig, flightExecute } from "@/commands/aviation/flight";
import { planeConfig, planeExecute } from "@/commands/aviation/plane";

export const aviation = createCommandWithSubcommands({
  name: "aviation",
  description: "Flight and aircraft information",
  cooldown: 10,
})
  .subcommand(flightConfig, flightExecute)
  .subcommand(planeConfig, planeExecute)
  .build();
