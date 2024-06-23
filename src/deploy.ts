import { REST, Routes } from "discord.js";
import fs from "node:fs";
import path from "node:path";

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN || "");

export function deployCommands() {
    (async () => {
        try {
            console.log("Started refreshing application (/) commands.");

            const commands = [];
            const commandFiles = fs
                .readdirSync("./src/commands")
                .filter((file) => file.endsWith(".ts"));

            for (const file of commandFiles) {
                const command = await import(
                    path.resolve(`./src/commands/${file}`)
                );
                commands.push(command.default);
            }

            for (const command of commands) {
                if (command.slashCommand.enabled) {
                    console.log(`Registering ${command.name} command`);

                    const commandData = {
                        name: command.name,
                        description: command.description,
                        options: command.slashCommand.options,
                    };

                    await rest.put(
                        Routes.applicationCommands(process.env.BOT_ID || ""),
                        { body: [commandData] },
                    );
                }
            }

            console.log("Successfully reloaded application (/) commands.");
        } catch (error) {
            console.error(error);
        }
    })();
}
