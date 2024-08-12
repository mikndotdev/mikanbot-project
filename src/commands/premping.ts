import type { CommandInteraction } from "discord.js";

export default {
    name: "premping",
    description: "Ping but its premium!",
    cooldown: 0,
    isPremium: true,
    botPermissions: [],
    userPermissions: [],
    validations: [],
    slashCommand: {
        enabled: true,
        options: [],
    },
    interactionRun: async (interaction: CommandInteraction) => {
        const ping = Math.abs(Math.round(interaction.client.ws.ping));
        await interaction.reply("Loading...");
        const roundtrip = Math.abs(Date.now() - interaction.createdTimestamp);
        interaction.editReply(
            `API Latency: ${ping}ms\nRoundtrip: ${roundtrip}ms`,
        );
    },
};
