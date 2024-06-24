import { REST, Routes } from "discord.js";
import fs from "node:fs";
import path from "node:path";

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN || "");

export function deployCommands() {
    (async () => {
        try {
            console.log("Started refreshing application (/) commands.");

            const commandFiles = fs
                .readdirSync("./src/commands")
                .filter((file) => file.endsWith(".ts"));

            const commands = await Promise.all(
                commandFiles.map(async (file) => {
                    const command = await import(
                        path.resolve(`./src/commands/${file}`)
                    );
                    return command.default;
                }),
            );

            const commandDataArray = [];

            for (const command of commands) {
                if (command.slashCommand.enabled) {
                    console.log(
                        `Preparing ${command.name} command for registration`,
                    );

                    const commandData = {
                        name: command.name,
                        description: command.description,
                        options: command.slashCommand.options,
                    };

                    commandDataArray.push(commandData);
                }
            }

            console.log(`Registering all commands`);

            await rest.put(
                Routes.applicationCommands(process.env.BOT_ID || ""),
                { body: commandDataArray },
            );
        } catch (error) {
            console.error(
                "An error occurred while refreshing application commands:",
                error,
            );
        }
    })();
}
