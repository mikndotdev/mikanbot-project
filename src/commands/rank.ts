import { type CommandInteraction, AttachmentBuilder } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { start } from "../api/server";

const prisma = new PrismaClient();

function getLevelFromXP(xp: number): number {
    let level = 1;
    let xpRequired = 50; // XP required for level 2
    let totalXP = 0;

    while (xp >= totalXP + xpRequired) {
        totalXP += xpRequired;
        xpRequired *= 2; // Double the XP required for the next level
        level++;
    }

    return xpRequired;
}

function getXPfromLevel(level: number): number {
    let xp = 0;
    for (let i = 1; i < level; i++) {
        xp += 50 * 2 ** (i - 1);
    }
    return xp;
}

export default {
    name: "rank",
    description: "Check your rank!",
    cooldown: 0,
    isPremium: false,
    botPermissions: [],
    userPermissions: [],
    validations: [],
    slashCommand: {
        enabled: true,
        options: [],
    },
    interactionRun: async (interaction: CommandInteraction) => {
        const username = interaction.user.displayName;
        const avatar = `${interaction.user.displayAvatarURL()} + "?size=1024"`;
        const guildDB = await prisma.server.findUnique({
            where: {
                id: interaction.guild?.id,
            },
        });
        if (!guildDB?.levelsEnabled) {
            return interaction.reply("Levels are disabled in this server");
        }
        await interaction.reply("<a:loading:1272805571585642506>");
        const userDb = await prisma.user.findUnique({
            where: {
                id: interaction.user.id,
            },
        });
        const uid = userDb?.mdUID
        const premium = userDb?.premium
        const bg = userDb?.levelCard

        const lvlDB = await prisma.guildLvl.findMany({
            where: {
                id: { startsWith: `${interaction.guild?.id}-` },
            },
            orderBy: {
                xp: "desc",
            },
        });

        const rank = lvlDB.findIndex((x) => x.id === `${interaction.guild?.id}-${interaction.user.id}`) + 1;

        const userLevel = lvlDB.find((x) => x.id === `${interaction.guild?.id}-${interaction.user.id}`);

        const level = userLevel?.level;
        const xp = userLevel?.xp;

        const xpRequired = getXPfromLevel(level + 1);

        const url = `${process.env.IMG_BACKEND}/level?level=${level}&username=${username}&currentXP=${xp}&totalXP=${xpRequired}&rank=${rank}&mdAcc=${uid !== "unlinked"}&premium=${premium}&avatar=${avatar}&bg=${bg}`;

        const response = await fetch(url);
        
        const buffer = Buffer.from(await response.arrayBuffer());

        const attachment = new AttachmentBuilder(buffer,{ name: "rank.png" });

        interaction.editReply({ content: "", files: [attachment] });
    },
};

