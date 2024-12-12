import type { CommandInteraction } from "discord.js";

export default {
    name: "ping",
    description: "Replies with Pong!",
    cooldown: 5,
    isPremium: false,
    botPermissions: [],
    userPermissions: [],
    validations: [],
    slashCommand: {
        enabled: true,
        options: [],
    },
    interactionRun: async (interaction: CommandInteraction) => {
        const ping = Math.abs(Math.round(interaction.client.ws.ping));
        await interaction.reply("<a:loading:1272805571585642506>");
        const roundtrip = Math.abs(Date.now() - interaction.createdTimestamp);
        interaction.editReply(
            `API Latency: ${ping}ms\nRoundtrip: ${roundtrip}ms`,
        );
    },
};
