import type {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  PermissionResolvable,
} from "discord.js";

export type CommandOptionType =
  | ApplicationCommandOptionType.String
  | ApplicationCommandOptionType.Integer
  | ApplicationCommandOptionType.Number
  | ApplicationCommandOptionType.Boolean
  | ApplicationCommandOptionType.User
  | ApplicationCommandOptionType.Channel
  | ApplicationCommandOptionType.Role
  | ApplicationCommandOptionType.Mentionable
  | ApplicationCommandOptionType.Attachment;

export type CommandOption = {
  name: string;
  description: string;
  type: CommandOptionType;
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  autocomplete?: boolean;
  nameLocalizations?: Record<string, string>;
  descriptionLocalizations?: Record<string, string>;
};

export type SerializedOption = Record<string, unknown>;

export type SubcommandOption = {
  name: string;
  description: string;
  type: ApplicationCommandOptionType.Subcommand;
  options?: CommandOption[];
  nameLocalizations?: Record<string, string>;
  descriptionLocalizations?: Record<string, string>;
};

export type SubcommandGroupOption = {
  name: string;
  description: string;
  type: ApplicationCommandOptionType.SubcommandGroup;
  subcommands: SubcommandOption[];
};

type OptionTypeToTS<T extends CommandOptionType> = T extends ApplicationCommandOptionType.String
  ? string
  : T extends ApplicationCommandOptionType.Integer
    ? number
    : T extends ApplicationCommandOptionType.Number
      ? number
      : T extends ApplicationCommandOptionType.Boolean
        ? boolean
        : T extends ApplicationCommandOptionType.User
          ? string
          : T extends ApplicationCommandOptionType.Channel
            ? string
            : T extends ApplicationCommandOptionType.Role
              ? string
              : T extends ApplicationCommandOptionType.Mentionable
                ? string
                : T extends ApplicationCommandOptionType.Attachment
                  ? string
                  : never;

type InferSingleOption<TOption extends CommandOption> = TOption extends {
  required: true;
}
  ? OptionTypeToTS<TOption["type"]>
  : OptionTypeToTS<TOption["type"]> | undefined;

export type InferOptionTypes<T extends readonly CommandOption[]> = {
  [K in T[number] as K["name"]]: InferSingleOption<K>;
};

export type AutocompleteChoice = { name: string; value: string | number };

export interface AutocompleteContext<TOptions extends readonly CommandOption[] = []> {
  name: string;
  value: string;
  options: Partial<InferOptionTypes<TOptions>>;
  subcommand: string | null;
}

export type AutocompleteResolver<TOptions extends readonly CommandOption[] = []> = (
  interaction: AutocompleteInteraction,
  ctx: AutocompleteContext<TOptions>,
) => Promise<AutocompleteChoice[]> | AutocompleteChoice[];

export type AutocompleteHandlers<TOptions extends readonly CommandOption[] = []> = Partial<
  Record<TOptions[number]["name"], AutocompleteResolver<TOptions>>
>;

export type AutocompleteHandlerMap = Record<string, AutocompleteResolver<any>>;

export type CommandExecuteFunction<TOptions extends readonly CommandOption[] = []> = (
  interaction: ChatInputCommandInteraction,
  options: InferOptionTypes<TOptions>,
) => Promise<unknown> | unknown;

export type SubcommandExecuteFunction<TOptions extends readonly CommandOption[] = []> = (
  interaction: ChatInputCommandInteraction,
  options: InferOptionTypes<TOptions>,
) => Promise<unknown> | unknown;

export interface BaseCommandConfig {
  name: string;
  description: string;
  nameLocalizations?: Record<string, string>;
  descriptionLocalizations?: Record<string, string>;
  cooldown?: number;
  premiumCooldown?: number;
  isPremium?: boolean;
  botPermissions?: PermissionResolvable[];
  userPermissions?: PermissionResolvable[];
  enabled?: boolean;
}

export interface CommandConfig<
  TOptions extends readonly CommandOption[] = [],
> extends BaseCommandConfig {
  options?: TOptions;
}

export interface SubcommandConfig<TOptions extends readonly CommandOption[] = []> {
  name: string;
  description: string;
  options?: TOptions;
  nameLocalizations?: Record<string, string>;
  descriptionLocalizations?: Record<string, string>;
}

export interface Command<TOptions extends readonly CommandOption[] = []> {
  name: string;
  description: string;
  cooldown: number;
  premiumCooldown?: number;
  isPremium: boolean;
  botPermissions: PermissionResolvable[];
  userPermissions: PermissionResolvable[];
  enabled: boolean;
  options: TOptions | SubcommandOption[] | SubcommandGroupOption[];
  autocomplete?: AutocompleteHandlerMap;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown> | unknown;
  toJSON: () => {
    name: string;
    description: string;
    options: SerializedOption[];
    name_localizations?: Record<string, string>;
    description_localizations?: Record<string, string>;
  };
}

export interface CommandWithSubcommands {
  name: string;
  description: string;
  cooldown: number;
  premiumCooldown?: number;
  isPremium: boolean;
  botPermissions: PermissionResolvable[];
  userPermissions: PermissionResolvable[];
  enabled: boolean;
  subcommands: Record<
    string,
    SubcommandOption & {
      execute: SubcommandExecuteFunction<any>;
      autocomplete?: AutocompleteHandlerMap;
    }
  >;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown> | unknown;
  toJSON: () => {
    name: string;
    description: string;
    options: SerializedOption[];
    name_localizations?: Record<string, string>;
    description_localizations?: Record<string, string>;
  };
}

export interface MessageCommandConfig {
  name: string;
  cooldown?: number;
  premiumCooldown?: number;
  isPremium?: boolean;
  botPermissions?: PermissionResolvable[];
  userPermissions?: PermissionResolvable[];
  enabled?: boolean;
}

export type MessageCommandExecuteFunction = (
  interaction: MessageContextMenuCommandInteraction,
) => Promise<unknown> | unknown;

export interface MessageCommand {
  name: string;
  cooldown: number;
  premiumCooldown?: number;
  isPremium: boolean;
  botPermissions: PermissionResolvable[];
  userPermissions: PermissionResolvable[];
  enabled: boolean;
  execute: MessageCommandExecuteFunction;
  toJSON: () => {
    name: string;
    type: ApplicationCommandType.Message;
  };
}
