import {
    type CommandInteraction,
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    Colors,
    ApplicationCommandOptionType,
} from "discord.js";

const currencyToName = async (code: string) => {
    const data = await fetch(
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json",
    );
    const currencies = await data.json();
    return currencies[code];
};

export default {
    name: "currency",
    description: "Convert between various currencies",
    cooldown: 3,
    isPremium: false,
    botPermissions: [],
    userPermissions: [],
    validations: [],
    slashCommand: {
        enabled: true,
        options: [
            {
                name: "amount",
                description: "The amount you are converting",
                type: ApplicationCommandOptionType.Number,
                required: true,
            },
            {
                name: "from",
                description: "The currency you are converting from",
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: "to",
                description: "The currency you are converting to",
                type: ApplicationCommandOptionType.String,
                required: true,
            },
        ],
    },
    interactionRun: async (interaction: CommandInteraction) => {
        const amount = interaction.options.get("amount")?.value as number;
        const from = interaction.options.get("from")?.value as string;
        const to = interaction.options.get("to")?.value as string;

        const fromName = await currencyToName(from.toLowerCase());
        const toName = await currencyToName(to.toLowerCase());

        if (!fromName || !toName) {
            return interaction.reply({
                content:
                    "Invalid currency codes. A list of valid codes can be found [here](<https://www.iban.com/currency-codes>)",
                ephemeral: true,
            });
        }

        const data = await fetch(
            `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.json`,
        );
        const result = await data.json();

        const rates = result[from.toLowerCase()];

        const rate = rates[to.toLowerCase()];

        if (!rate) {
            return interaction.reply({
                content: `Conversion rate from ${fromName} to ${toName} not found.`,
                ephemeral: true,
            });
        }

        const final = amount * rate;

        const embed = new EmbedBuilder()
            .setTitle("Currency Conversion")
            .setDescription(
                `**${amount} ${fromName}** is equal to **${final} ${toName}**`,
            )
            .setFooter({
                text: `This data is not realtime, and is updated every 24 hours`,
            })
            .setColor(Colors.Green);

        await interaction.reply({ embeds: [embed] });
    },
};
