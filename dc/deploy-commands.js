require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("dodajkupon")
    .setDescription("Zgłoś kupon do weryfikacji")
    .addStringOption((opt) =>
      opt.setName("link").setDescription("Link do kuponu (np. z eFortuny)").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("punkty").setDescription("Zadeklarowana liczba punktów").setRequired(true).setMinValue(0)
    ),

  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Pokaż aktualny ranking Mistrzostw Typerów"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    // Rejestracja na jednym serwerze (natychmiastowa) — dobre do developmentu.
    // Do rejestracji globalnej (do 1h propagacji) zamień na Routes.applicationCommands(clientId).
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );
    console.log("✅ Komendy zarejestrowane.");
  } catch (err) {
    console.error(err);
  }
})();
