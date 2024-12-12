import { createClient } from "redis";
import { type CommandInteraction, type Message } from "discord.js";

const redis = createClient({
    url: process.env.REDIS_URL,
});

await redis.connect();

export function setMessageRatelimit(type: string, message: Message) {
    if (type == "msg") {
        redis.set(
            `message:${message.guildId}:${message.author.id}`,
            `${message.guildId}`,
            { EX: 5 },
        );
    }
}

export async function checkMessageRatelimit(type: string, message: Message) {
    if (type == "msg") {
        const isLimited = await redis.get(
            `message:${message.guildId}:${message.author.id}`,
        );
        if (isLimited == `${message.guildId}`) {
            return true;
        } else {
            return false;
        }
    }
}

export function setCommandRatelimit(
    type: string,
    interaction: CommandInteraction,
    time: number,
    name: string,
) {
    if (type == "cmd") {
        redis.set(
            `command:${interaction.guildId}:${interaction.user.id}:${name}`,
            `${interaction.guildId}`,
            { EX: time },
        );
    }
}

export async function checkCommandRatelimit(
    type: string,
    interaction: CommandInteraction,
    name: string,
) {
    if (type == "cmd") {
        const isLimited = await redis.get(
            `command:${interaction.guildId}:${interaction.user.id}:${name}`,
        );
        if (isLimited == `${interaction.guildId}`) {
            return true;
        } else {
            return false;
        }
    }
}

export async function setTranslationRatelimit(
    type: string,
    user: string,
    time: number,
) {
    if (type == "translate") {
        redis.set(`translation:${user}`, `${user}`, { EX: time });
    }
}

export async function checkTranslationRatelimit(type: string, user: string) {
    if (type == "translate") {
        const isLimited = await redis.get(`translation:${user}`);
        if (isLimited == `${user}`) {
            return true;
        } else {
            return false;
        }
    }
}
