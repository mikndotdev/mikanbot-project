import { Translate } from "@google-cloud/translate/build/src/v2";
import type { Message } from "discord.js";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const translate = new Translate({
  key: env.GOOGLE_API_KEY,
});

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
    .replace("https://x.com", "https://fixupx.com")
    .replace("https://twitter.com", "https://twittpr.com");

  await message.suppressEmbeds(true);

  if (guildData.xfixAutoTranslate) {
    const postID = url.split("/").pop();
    const postDataRes = await fetch(`https://api.fxtwitter.com/2/status/${postID}`);
    const postData = await postDataRes.json();
    const postText = postData.status.text;

    const preferredLocale = guildData.preferredLocale.toLowerCase();

    if (postText) {
      const [detection] = await translate.detect(postText);
      const postLanguage = (
        Array.isArray(detection) ? detection[0]?.language : detection?.language
      )?.toLowerCase();

      if (postLanguage && postLanguage !== preferredLocale) {
        url = `${url}/${preferredLocale}`;
      }
    }

    await message.reply({
      content: `[Enhanced embed](${url})`,
      allowedMentions: { repliedUser: false },
    });
  } else {
    await message.reply({
      content: `[Enhanced embed](${url})`,
      allowedMentions: { repliedUser: false },
    });
  }
};
