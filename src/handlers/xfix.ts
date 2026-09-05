import { Translate } from "@google-cloud/translate/build/src/v2";
import type { Message } from "discord.js";
import * as Sentry from "@sentry/bun";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const translate = new Translate({
  key: env.GOOGLE_API_KEY,
});

const extractPostID = (url: string): string | null => {
  return url.match(/\/status\/(\d+)/)?.[1] ?? null;
};

const appendLocale = (url: string, locale: string): string => {
  try {
    const parsed = new URL(url);
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/${locale}`;
    return parsed.toString();
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "xfixLocale" }, extra: { url, locale } });
    return url;
  }
};

const fetchPostText = async (postID: string): Promise<string | null> => {
  try {
    const response = await fetch(`https://api.fxtwitter.com/2/status/${postID}`);

    if (!response.ok) {
      Sentry.logger.warn("fxtwitter lookup failed", { postID, status: response.status });
      return null;
    }

    const data = (await response.json()) as { status?: { text?: string } | null };

    return data.status?.text ?? null;
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "xfixLookup" }, extra: { postID } });
    return null;
  }
};

const detectLanguage = async (text: string): Promise<string | null> => {
  try {
    const [detection] = await translate.detect(text);
    const language = Array.isArray(detection) ? detection[0]?.language : detection?.language;

    return language?.toLowerCase() ?? null;
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "xfixTranslate" } });
    return null;
  }
};

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

  const messageURL = content.match(urlRegex);

  if (!messageURL || messageURL.length === 0) return;

  let url = messageURL[0];

  if (url.split("/").length === 4) return;

  url = url
    .replace("https://x.com", "https://fixupx.com")
    .replace("https://twitter.com", "https://twittpr.com");

  await message.suppressEmbeds(true).catch((error) => {
    Sentry.logger.warn("xfix could not suppress embeds", {
      messageId: message.id,
      guildId: message.guildId,
      reason: error instanceof Error ? error.message : String(error),
    });
  });

  if (guildData.xfixAutoTranslate) {
    const postID = extractPostID(url);
    const postText = postID ? await fetchPostText(postID) : null;

    if (postText) {
      const preferredLocale = guildData.preferredLocale.toLowerCase();
      const postLanguage = await detectLanguage(postText);

      if (postLanguage && postLanguage !== preferredLocale) {
        url = appendLocale(url, preferredLocale);
      }
    }
  }

  await message.reply({
    content: `[Enhanced embed](${url})`,
    allowedMentions: { repliedUser: false },
  });
};
