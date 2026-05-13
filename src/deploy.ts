import { REST, Routes } from "discord.js";
import { env } from "@/lib/env";
import { getAllCommands } from "@/commands";

const rest = new REST({ version: "10" }).setToken(env.BOT_TOKEN);

export function deployCommands() {
  (async () => {
    try {
      console.log("Started refreshing application (/) commands.");

      const commands = getAllCommands();

      const commandDataArray = [];

      for (const command of commands) {
        if (command.enabled) {
          console.log(`Preparing ${command.name} command for registration`);

          const commandData = command.toJSON();

          commandDataArray.push(commandData);
        }
      }

      console.log(`Registering all commands`);

      await rest.put(Routes.applicationCommands(env.BOT_ID), {
        body: commandDataArray,
      });
    } catch (error) {
      console.error("An error occurred while refreshing application commands:", error);
    }
  })();
}
