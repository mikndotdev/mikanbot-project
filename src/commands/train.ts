import { createCommandWithSubcommands } from "@/lib/command-builder";
import { findAutocomplete, findConfig, findExecute } from "@/commands/train/find";
import { setAutocomplete, setConfig, setExecute } from "@/commands/train/set";
import { clearConfig, clearExecute } from "@/commands/train/clear";
import { meConfig, meExecute } from "@/commands/train/me";
import { userConfig, userExecute } from "@/commands/train/user";
import { delaysAutocomplete, delaysConfig, delaysExecute } from "@/commands/train/delays";
import { lineAutocomplete, lineConfig, lineExecute } from "@/commands/train/line";
import { stationAutocomplete, stationConfig, stationExecute } from "@/commands/train/station";
import { crossAutocomplete, crossConfig, crossExecute } from "@/commands/train/cross";
import {
  formationAutocomplete,
  formationConfig,
  formationExecute,
} from "@/commands/train/formation";
import { vehicleAutocomplete, vehicleConfig, vehicleExecute } from "@/commands/train/vehicle";
import { mapAutocomplete, mapConfig, mapExecute } from "@/commands/train/map";

export const train = createCommandWithSubcommands({
  name: "train",
  description: "日本の列車情報",
  descriptionLocalizations: { ja: "日本の列車情報" },
  cooldown: 10,
})
  .subcommand(findConfig, findExecute, findAutocomplete)
  .subcommand(setConfig, setExecute, setAutocomplete)
  .subcommand(clearConfig, clearExecute)
  .subcommand(meConfig, meExecute)
  .subcommand(userConfig, userExecute)
  .subcommand(lineConfig, lineExecute, lineAutocomplete)
  .subcommand(delaysConfig, delaysExecute, delaysAutocomplete)
  .subcommand(stationConfig, stationExecute, stationAutocomplete)
  .subcommand(crossConfig, crossExecute, crossAutocomplete)
  .subcommand(formationConfig, formationExecute, formationAutocomplete)
  .subcommand(vehicleConfig, vehicleExecute, vehicleAutocomplete)
  .subcommand(mapConfig, mapExecute, mapAutocomplete)
  .build();
