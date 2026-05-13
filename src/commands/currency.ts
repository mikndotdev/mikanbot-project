import { EmbedBuilder, Colors, ApplicationCommandOptionType } from "discord.js";
import { createCommand } from "@/lib/command-builder";
import currencies from "@/currencies.json";

const currencyToName = async (code: string) => {
  return (currencies as Record<string, string>)[code];
};

export const currency = createCommand({
  name: "currency",
  description: "Convert between various currencies",
  cooldown: 3,
  isPremium: false,
})
  .option({
    name: "amount",
    description: "The amount you are converting",
    type: ApplicationCommandOptionType.Number,
    required: true,
  })
  .option({
    name: "from",
    description: "The currency you are converting from",
    type: ApplicationCommandOptionType.String,
    required: true,
  })
  .option({
    name: "to",
    description: "The currency you are converting to",
    type: ApplicationCommandOptionType.String,
    required: true,
  })
  .execute(async (interaction, options) => {
    const fromName = await currencyToName(options.from.toLowerCase());
    const toName = await currencyToName(options.to.toLowerCase());

    if (!fromName || !toName) {
      return interaction.reply({
        content:
          "Invalid currency codes. A list of valid codes can be found [here](<https://www.iban.com/currency-codes>)",
        flags: "Ephemeral",
      });
    }

    const data = await fetch(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${options.from.toLowerCase()}.json`,
    );
    const result = await data.json();

    const rates = result[options.from.toLowerCase()];

    const rate = rates[options.to.toLowerCase()];

    if (!rate) {
      return interaction.reply({
        content: `Conversion rate from ${fromName} to ${toName} not found.`,
        flags: "Ephemeral",
      });
    }

    const final = (options.amount * rate).toFixed(2);

    const embed = new EmbedBuilder()
      .setTitle("Currency Conversion")
      .setDescription(`**${options.amount} ${fromName}** is equal to **${final} ${toName}**`)
      .setFooter({
        text: `This data is not realtime, and is updated every 24 hours`,
      })
      .setColor(Colors.Green);

    await interaction.reply({ embeds: [embed] });
  });
