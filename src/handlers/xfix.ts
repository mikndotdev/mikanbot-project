import type { Message } from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const xfix = async (message: Message) => {
    const guildData = await prisma.server.findUnique({
        where: {
            id: message.guildId as string,
        },
    });

    if (!guildData?.xfix) return;

    const content = message.content;

    if (!content) return;

    const urlRegex = /https?:\/\/[^\s]+/g;

    let messageURL = content.match(urlRegex);

    if (!messageURL || messageURL.length === 0) return;

    let url = messageURL[0];

    if (url.split("/").length === 4) return;

    url = url
        .replace("https://x.com", "https://fixup.com")
        .replace("https://twitter.com", "https://twittpr.com");

    await message.suppressEmbeds(true);

    await message.reply({
        content: `[Enhanced embed](${url})`,
        allowedMentions: { repliedUser: false },
    });
};
