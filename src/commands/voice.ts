import { createCommandWithSubcommands } from "@/lib/command-builder";
import { joinConfig, joinExecute } from "@/commands/voice/join";
import { leaveConfig, leaveExecute } from "@/commands/voice/leave";

export const voice = createCommandWithSubcommands({
  name: "voice",
  description: "Make the bot join or leave a voice channel",
  cooldown: 5,
})
  .subcommand(joinConfig, joinExecute)
  .subcommand(leaveConfig, leaveExecute)
  .build();
