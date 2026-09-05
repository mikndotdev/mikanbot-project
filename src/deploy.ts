import { REST, Routes } from "discord.js";
import * as Sentry from "@sentry/bun";
import { env } from "@/lib/env";
import { getAllCommands, getAllMessageCommands } from "@/commands";

const rest = new REST({ version: "10" }).setToken(env.BOT_TOKEN);

export function deployCommands() {
  (async () => {
    try {
      Sentry.logger.info("Started refreshing application (/) commands.");

      const commands = getAllCommands();

      const commandDataArray = [];

      for (const command of commands) {
        if (command.enabled) {
          Sentry.logger.debug(
            Sentry.logger.fmt`Preparing ${command.name} command for registration`,
          );

          const commandData = command.toJSON();

          commandDataArray.push(commandData);
        }
      }

      for (const command of getAllMessageCommands()) {
        if (command.enabled) {
          Sentry.logger.debug(
            Sentry.logger.fmt`Preparing ${command.name} message command for registration`,
          );

          commandDataArray.push(command.toJSON());
        }
      }

      Sentry.logger.info("Registering all commands");

      await rest.put(Routes.applicationCommands(env.BOT_ID), {
        body: commandDataArray,
      });
    } catch (error) {
      Sentry.captureException(error, { tags: { source: "deployCommands" } });
    }
  })();
}
