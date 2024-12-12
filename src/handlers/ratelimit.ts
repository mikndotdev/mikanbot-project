import { createClient } from "redis";
import { type CommandInteraction } from "discord.js";

const redis = createClient({
    url: process.env.REDIS_URL,
});

export default function setRatelimit(type: string, interaction: CommandInteraction) {
    if (type == "msg") {

    }
}
