import {
    type CommandInteraction,
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    Colors,
} from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default {
    name: "mikandev",
    description: "Manage your MikanDev account",
    cooldown: 3,
    isPremium: false,
    botPermissions: [],
    userPermissions: [],
    validations: [],
    slashCommand: {
        enabled: true,
        options: [],
    },
    interactionRun: async (interaction: CommandInteraction) => {
        const userDb = await prisma.user.findUnique({
            where: {
                id: interaction.user.id,
            },
        });
        const uid = userDb?.mdUID;

        if (uid === "unlinked") {
            const embed = new EmbedBuilder()
                .setTitle("MikanDev Account")
                .setDescription("You haven't linked your MikanDev account yet!")
                .setColor(Colors.Red);
            const button = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel("Link Account")
                .setURL(
                    `https://mikn.dev/account/link?app=mikanbot&discord=${interaction.user.id}`,
                );

            const row = new ActionRowBuilder().addComponents(button);

            await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true,
            });
        }
        if (uid !== "unlinked") {
            const embed = new EmbedBuilder()
                .setTitle("MikanDev Account")
                .setDescription(
                    `You have linked your MikanDev account with UID: ${uid}`,
                )
                .setColor(Colors.Green);
            await interaction.reply({ embeds: [embed] });
        }
    },
};
