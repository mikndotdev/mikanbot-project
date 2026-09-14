import { ActivityType, type Client } from "discord.js";

export function setPresence(client: Client) {
  const serverCount = client.guilds.cache.size;
  client.user?.setPresence({
    activities: [
      {
        name: `over ${serverCount} servers`,
        type: ActivityType.Watching,
      },
    ],
    status: "idle",
  });
}
