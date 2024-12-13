import { start } from "./api/server";
import { deployCommands } from "./deploy";
import { setPresence } from "./presence";
import { handleCommand } from "./handlers/command";
import { handleLevel } from "./handlers/lvl";
import { translateMessage } from "./handlers/flagTranslation";
import { xfix } from "./handlers/xfix.ts";
import { emojiCountryCode } from "country-code-emoji";
import {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    MessageReaction,
    type User,
} from "discord.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

export async function dmUser(id: string, provider: string, message: string) {
    const user = client.users.cache.get(id);
    if (!user) return;

    const embed = new EmbedBuilder()
        .setTitle(`System Message from ${provider}`)
        .setDescription(message)
        .setColor("#FF7700")
        .setTimestamp();

    try {
        await user.send({ embeds: [embed] });
    } catch (e) {
        return e;
    }
}

client.on("ready", () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    deployCommands();
    setPresence(client);
});

client.on("messageReactionAdd", async (reaction: MessageReaction, user) => {
    if (user.bot) return;
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error(
                "Something went wrong when fetching the message: ",
                error,
            );
            return;
        }
    }
    try {
        if (emojiCountryCode(reaction.emoji.name as string)) {
            await translateMessage(reaction, user as User);
        }
    } catch (error) {
        return;
    }
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.isCommand()) {
        console.log(`Received command: ${interaction.commandName}`);
        try {
            await handleCommand(interaction);
        } catch (e) {
            console.error(e);
        }
    }
    if (interaction.isButton()) {
        console.log(`Received button: ${interaction.customId}`);
    }
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    console.log("Received message!");
    handleLevel(message);
    if (
        message.content.startsWith("https://x.com/") ||
        message.content.startsWith("https://twitter.com/")
    ) {
        xfix(message);
    }
});

client.on("guildCreate", async (guild) => {});

client.login(process.env.BOT_TOKEN);
start();
