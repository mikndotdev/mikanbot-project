import { CommandInteraction } from "discord.js";

export default {
    name: "ping",
    description: "Replies with Pong!",
    cooldown: 0,
    isPremium: false,
    botPermissions: [],
    userPermissions: [],
    validations: [],
    slashCommand: {
        enabled: true,
        options: [],
    },
    interactionRun: (interaction: CommandInteraction) => {
        interaction.reply("Pong!");
    },
};
