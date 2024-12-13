import { Translate } from "@google-cloud/translate/build/src/v2";
import { ImageAnnotatorClient } from "@google-cloud/vision";
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

const vision = new ImageAnnotatorClient({
    apiKey: process.env.GOOGLE_API_KEY as string,
});

const prisma = new PrismaClient();

export async function translateMessage(reaction: MessageReaction, user: User) {
    const server = reaction.message.guildId;
    const serverData = await prisma.server.findUnique({
        where: {
            id: server as string,
        },
    });
    if (!serverData?.flagTrans) return;
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
            "MikanBot Flag Translation",
            "You are being ratelimited! Please wait a bit before translating another message. You can speed this up by becoming a premium user.",
        );
        return;
    }
    if (!message.content && message.attachments.size === 0) {
        console.error("Message content is empty or undefined.");
        return;
    }
    message.react("<a:loading:1272805571585642506>");
    if (message.attachments.size > 0) {
        if (message.attachments.first()?.contentType?.startsWith("image")) {
            message.react("<:camera:1316791863172268132>");
            const attachment = message.attachments.first();
            if (!attachment) return;
            const visionResult = await vision.annotateImage({
                image: {
                    source: {
                        imageUri: attachment.url,
                    },
                },
                features: [{ type: "TEXT_DETECTION" }],
            });
            const [image] = visionResult;
            if (!image.textAnnotations) {
                message.reactions.removeAll();
                return message.react("❌");
            }
            const text = image.textAnnotations[0].description;
            const translationResult = await translate
                .translate(text, language)
                .catch((error) => {
                    message.reactions.removeAll();
                    message.react("❌");
                    return null;
                });
            if (!translationResult) return;
            const [translation] = translationResult;
            const embed = new EmbedBuilder()
                .setTitle("Translation to " + reaction.emoji.name)
                .setDescription(translation)
                .setColor("#FF7700")
                .setTimestamp();
            await message.reply({
                embeds: [embed],
                allowedMentions: { repliedUser: false },
            });
            message.reactions.removeAll();
            const userDb = await prisma.user.findUnique({
                where: {
                    id: user.id,
                },
            });
            if (userDb?.premium) {
                setTranslationRatelimit("translate", user.id, 10);
            } else {
                setTranslationRatelimit("translate", user.id, 60);
            }
        }
    }
    const translationResult = await translate
        .translate(message.content, language)
        .catch((error) => {
            message.reactions.removeAll();
            message.react("❌");
            return null;
        });
    if (!translationResult) return;
    const [translation] = translationResult;
    const embed = new EmbedBuilder()
        .setTitle("Translation to " + reaction.emoji.name)
        .setDescription(translation)
        .setColor("#FF7700")
        .setTimestamp();
    await message.reply({
        embeds: [embed],
        allowedMentions: { repliedUser: false },
    });
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
