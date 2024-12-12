import { createClient } from "redis";
import { type CommandInteraction, type Message } from "discord.js";

const redis = createClient({
    url: process.env.REDIS_URL,
});

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
