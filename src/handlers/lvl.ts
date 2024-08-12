import { PrismaClient } from "@prisma/client";
import type { Message } from "discord.js";

const prisma = new PrismaClient();
const messageLimit = new Map();

export async function handleLevel(message: Message) {
    const lvlDB = prisma.guildLvl.findUnique({
        where: {
            id: `${message.guild?.id}-${message.author.id}`,
        },
    });

    if (!lvlDB) {
        await prisma.guildLvl.create({
            data: {
                id: `${message.guild?.id}-${message.author.id}`,
                xp: "0",
                level: "0",
            },
        });
    }

    //@ts-ignore
    const xp = lvlDB?.xp;
    //@ts-ignore
    const lvl = lvlDB?.level;
}
