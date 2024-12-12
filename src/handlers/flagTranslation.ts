import { Translate } from "@google-cloud/translate/build/src/v2";
import { emojiCountryCode } from "country-code-emoji";
import { MessageReaction, Message, User, EmbedBuilder } from "discord.js";
import {
    setTranslationRatelimit,
    checkTranslationRatelimit,
} from "./ratelimit";
import { dmUser } from "../index.ts";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

function countryToLanguage(country: string): string | undefined {
    const languages = JSON.parse(fs.readFileSync("./countries.json", "utf-8"));
    const languageList = languages[country];
    if (!languageList) return undefined;
    return languageList.split(",")[0];
}

const translate = new Translate({
    key: process.env.GOOGLE_API_KEY as string,
});

const prisma = new PrismaClient();

export async function translateMessage(reaction: MessageReaction, user: User) {
    const country = emojiCountryCode(reaction.emoji.name as string);
    const language = countryToLanguage(country);
    if (!language) {
        console.error("Unsupported country code:", country);
        return;
    }
    const message = await reaction.message.fetch();
    const limited = await checkTranslationRatelimit("translate", user.id);
    if (limited) {
        message.reactions.removeAll();
        await dmUser(
            user.id,
            "MikanBot",
            "You are being ratelimited! Please wait a bit before translating another message. You can speed this up by becoming a premium user.",
        );
    }
    if (!message.content) {
        console.error("Message content is empty or undefined.");
        return;
    }
    message.react("<a:loading:1272805571585642506>");
    const result = await translate
        .translate(message.content, language)
        .catch((error) => {
            message.reactions.removeAll();
            message.react("❌");
            console.error("Translation error: ", error);
            return null;
        });
    if (!result) return;
    const [translation] = result;
    const embed = new EmbedBuilder()
        .setTitle("Translation to " + reaction.emoji.name)
        .setDescription(translation)
        .setColor("#FF7700")
        .setTimestamp();
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    message.reactions.removeAll();
    const userDb = await prisma.user.findUnique({
        where: {
            id: user.id,
        },
    });
    if (userDb?.premium) {
        setTranslationRatelimit("translate", user.id, 5);
    } else {
        setTranslationRatelimit("translate", user.id, 30);
    }
}
