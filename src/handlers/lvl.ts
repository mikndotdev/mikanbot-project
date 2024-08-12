import { PrismaClient } from "@prisma/client";
import type { Message } from "discord.js";

const prisma = new PrismaClient();

const cooldown = 5000;

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

    if (lvlDB) {
        const newXP = lvlDB.xp + increment;
        const currentCooldown = lvlDB.cooldown;
        if (currentCooldown > new Date()) return;
        const cooldownTime = new Date(Date.now() + cooldown);
        const level = getLevelFromXP(newXP);
        if (lvlDB.level < level) {
            message.channel.send(
                `Congratulations ${message.author}, you have leveled up to level ${level}!`,
            );
        }
        await prisma.guildLvl.update({
            where: {
                id: `${message.guild?.id}-${message.author.id}`,
            },
            data: {
                xp: newXP,
                level: level,
                cooldown: cooldownTime,
            },
        });
    }
}