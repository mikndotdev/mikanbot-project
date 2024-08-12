import { PrismaClient } from "@prisma/client";
import { type Guild, ChannelType, GuildChannel, Options } from "discord.js";

const prisma = new PrismaClient();

export async function initGuild(guild: Guild) {
    const guildDb = await prisma.server.findUnique({
        where: {
            id: guild.id,
        },
    });

    if (!guildDb) {
        await prisma.server.create({
            data: {
                id: guild.id,
            },
        });
    }

    const channel = await guild.channels.create({
        name: "bot-commands",
        type: ChannelType.GuildText,
    });
    const id = channel.id;
}
