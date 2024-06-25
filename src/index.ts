import { deployCommands } from "./deploy";
import { setPresence } from "./presence";
import { handleCommand } from "./handlers/command";
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
    console.log(`Received command: ${interaction.commandName}`);
    await handleCommand(interaction);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

});

client.on("guildCreate", async (guild) => {
    
});


client.login(process.env.BOT_TOKEN);
