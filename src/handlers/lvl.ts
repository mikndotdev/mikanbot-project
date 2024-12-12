import { PrismaClient } from "@prisma/client";
import { setMessageRatelimit, checkMessageRatelimit } from "./ratelimit.ts";
import type { Message } from "discord.js";
import { initGuild } from "./initGuild";

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

    return level;
}

export async function handleLevel(message: Message) {
    const lvlDB = await prisma.guildLvl.findUnique({
        where: {
            id: `${message.guild?.id}-${message.author.id}`,
        },
    });

    const guildDB = await prisma.server.findUnique({
        where: {
            id: message.guild?.id,
        },
    });

    if (!guildDB) {
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        await initGuild(message.guild!);
    }

    if (!guildDB?.levelsEnabled) {
        return console.log("Levels are disabled in this server");
    }

    if (!lvlDB) {
        await prisma.guildLvl.create({
            data: {
                id: `${message.guild?.id}-${message.author.id}`,
                xp: 1,
                level: 1,
            },
        });
    }

    const increment = Math.floor(Math.random() * 10) + 15;
    const levelMessage = guildDB?.levelsMessage;

    if (lvlDB) {
        const limited = await checkMessageRatelimit("msg", message);
        if (limited) return;
        const newXP = lvlDB.xp + increment;
        const level = getLevelFromXP(newXP);
        const lvlMessage = levelMessage
            ?.replace(/{user}/g, message.author.toString())
            .replace(/{level}/g, level.toString());
        if (lvlDB.level < level) {
            message.channel.send(
                lvlMessage ||
                    `Congratulations ${message.author.toString()}! You have leveled up to level ${level}!`,
            );
        }
        await prisma.guildLvl.update({
            where: {
                id: `${message.guild?.id}-${message.author.id}`,
            },
            data: {
                xp: newXP,
                level: level,
            },
        });
        setMessageRatelimit("msg", message);
    }
}
