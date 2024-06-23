import { deployCommands } from "./deploy";
import { setPresence } from "./presence";
import { Client, GatewayIntentBits } from "discord.js";
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.on("ready", () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    deployCommands();
    setPresence(client);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    try {
        console.log(`Received command: ${interaction.commandName}`);
        const commandModule = await import(
            `./commands/${interaction.commandName}.ts`
        );
        const command = commandModule.default;
        if (!command.slashCommand.enabled)
            return interaction.reply("This command is not enabled!");
        if (command.slashCommand.enabled) command.interactionRun(interaction);
    } catch (error) {
        console.error(error);
        interaction.reply({
            content: "There was an error while executing this command!",
            ephemeral: true,
        });
    }
});

client.login(process.env.BOT_TOKEN);
