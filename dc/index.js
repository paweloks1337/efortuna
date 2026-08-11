require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");

const sheets = require("./sheets");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const REJECT_REASONS = ["Błędny kupon", "Zły link", "Nieprawidłowe punkty", "Złamanie regulaminu"];

const STATUS_META = {
  OCZEKUJE: { color: 0xf5a623, label: "🟡 Oczekuje na weryfikację" },
  ZAAKCEPTOWANY: { color: 0x27c285, label: "🟢 Zaakceptowany" },
  ODRZUCONY: { color: 0xff4b5c, label: "🔴 Odrzucony" },
};

// ---------- Pomocnicze: budowanie embeda + przycisków ----------

function buildTicketEmbed(t) {
  const meta = STATUS_META[t.status] || STATUS_META.OCZEKUJE;
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`🎫 KUPON #${t.id}`)
    .addFields(
      { name: "👤 Gracz", value: `<@${t.discordId}>`, inline: true },
      { name: "📌 Status", value: meta.label, inline: true },
      { name: "🔗 Link do kuponu", value: t.link },
      {
        name: "⭐ Punkty",
        value:
          t.finalPoints !== t.declaredPoints
            ? `~~${t.declaredPoints} pkt~~ → **${t.finalPoints} pkt** (korekta)`
            : `**${t.finalPoints} pkt**`,
      }
    )
    .setFooter({ text: t.date });

  if (t.status === "ODRZUCONY" && t.reason) {
    embed.addFields({ name: "🚫 Powód odrzucenia", value: t.reason });
  }

  return embed;
}

function buildActionRow(t) {
  const disabled = t.status !== "OCZEKUJE";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`t:approve:${t.id}`)
      .setLabel("Zatwierdź")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`t:reject:${t.id}`)
      .setLabel("Odrzuć")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`t:correct:${t.id}`)
      .setLabel("Korekta punktów")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

async function refreshTicketMessage(interactionOrMessage, ticket) {
  const payload = { embeds: [buildTicketEmbed(ticket)], components: [buildActionRow(ticket)] };
  if (interactionOrMessage.update) {
    await interactionOrMessage.update(payload);
  } else {
    await interactionOrMessage.edit(payload);
  }
}

function isAdmin(interaction) {
  if (!process.env.ADMIN_ROLE_ID) return true; // brak konfiguracji roli = nie blokuj (dev)
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

async function dmUser(discordId, content) {
  try {
    const user = await client.users.fetch(discordId);
    await user.send(content);
  } catch {
    // użytkownik ma zablokowane DM — pomijamy bez wyjątku
  }
}

function today() {
  return new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------- Komendy ----------

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "dodajkupon") return handleDodajKupon(interaction);
      if (interaction.commandName === "ranking") return handleRanking(interaction);
    }
    if (interaction.isButton()) return handleButton(interaction);
    if (interaction.isStringSelectMenu()) return handleSelect(interaction);
    if (interaction.isModalSubmit()) return handleModal(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: "⚠️ Wystąpił błąd. Spróbuj ponownie.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

async function handleDodajKupon(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const link = interaction.options.getString("link");
  const points = interaction.options.getInteger("punkty");
  const id = await sheets.getNextTicketId();
  const date = today();

  await sheets.addTicket({
    id,
    discordId: interaction.user.id,
    nick: interaction.user.username,
    link,
    points,
    date,
  });

  const ticket = {
    id,
    discordId: interaction.user.id,
    link,
    declaredPoints: points,
    finalPoints: points,
    status: "OCZEKUJE",
    reason: null,
    date,
  };

  const targetChannel = process.env.SUBMIT_CHANNEL_ID
    ? await client.channels.fetch(process.env.SUBMIT_CHANNEL_ID)
    : interaction.channel;

  await targetChannel.send({ embeds: [buildTicketEmbed(ticket)], components: [buildActionRow(ticket)] });
  await interaction.editReply(`✅ Zgłoszenie #${id} wysłane do weryfikacji.`);
}

async function handleRanking(interaction) {
  await interaction.deferReply();
  const ranking = await sheets.getRanking();

  if (ranking.length === 0) {
    return interaction.editReply("Brak zaakceptowanych kuponów w rankingu.");
  }

  const lines = ranking
    .slice(0, 15)
    .map((r, i) => `**${i + 1}.** ${r.nick} — ${r.points} pkt`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x1e6ec8)
    .setTitle("🏆 Ranking Mistrzostw Typerów")
    .setDescription(lines);

  await interaction.editReply({ embeds: [embed] });
}

// ---------- Przyciski ----------

async function handleButton(interaction) {
  const [, action, ticketId] = interaction.customId.split(":");
  const id = parseInt(ticketId, 10);

  if (!isAdmin(interaction)) {
    return interaction.reply({ content: "⛔ Nie masz uprawnień do weryfikacji kuponów.", ephemeral: true });
  }

  if (action === "approve") {
    const t = await sheets.approveTicket(id);
    if (!t) return interaction.reply({ content: "Nie znaleziono kuponu.", ephemeral: true });

    const updated = { ...t, status: "ZAAKCEPTOWANY" };
    await refreshTicketMessage(interaction, updated);
    await dmUser(t.discordId, `✅ Twój kupon #${id} został zaakceptowany — **+${t.finalPoints} pkt** do rankingu!`);
    return;
  }

  if (action === "reject") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`t:rejectselect:${id}`)
      .setPlaceholder("Wybierz powód odrzucenia")
      .addOptions(REJECT_REASONS.map((r) => ({ label: r, value: r })).concat([{ label: "Inny powód (wpisz)", value: "custom" }]));

    return interaction.reply({
      content: `Podaj powód odrzucenia kuponu #${id}:`,
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
  }

  if (action === "correct") {
    const t = await sheets.getTicket(id);
    const modal = new ModalBuilder().setCustomId(`t:correctmodal:${id}`).setTitle(`Korekta punktów #${id}`);
    const input = new TextInputBuilder()
      .setCustomId("points")
      .setLabel(`Nowa liczba punktów (było: ${t.finalPoints})`)
      .setStyle(TextInputStyle.Short)
      .setValue(String(t.finalPoints))
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }
}

// ---------- Select menu (powód odrzucenia) ----------

async function handleSelect(interaction) {
  const [, , ticketId] = interaction.customId.split(":");
  const id = parseInt(ticketId, 10);
  const value = interaction.values[0];

  if (value === "custom") {
    const modal = new ModalBuilder().setCustomId(`t:rejectmodal:${id}`).setTitle(`Powód odrzucenia #${id}`);
    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Podaj powód odrzucenia")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  await finalizeRejection(interaction, id, value);
}

// ---------- Modale (własny powód / korekta) ----------

async function handleModal(interaction) {
  const [, kind, ticketId] = interaction.customId.split(":");
  const id = parseInt(ticketId, 10);

  if (kind === "rejectmodal") {
    const reason = interaction.fields.getTextInputValue("reason");
    return finalizeRejection(interaction, id, reason);
  }

  if (kind === "correctmodal") {
    const raw = interaction.fields.getTextInputValue("points");
    const newPoints = parseInt(raw, 10);
    if (isNaN(newPoints) || newPoints < 0) {
      return interaction.reply({ content: "Podaj poprawną liczbę punktów.", ephemeral: true });
    }
    const t = await sheets.correctTicketPoints(id, newPoints);
    if (!t) return interaction.reply({ content: "Nie znaleziono kuponu.", ephemeral: true });

    const updated = { ...t, finalPoints: newPoints };
    // Modal otwarty z przycisku — oryginalna wiadomość z ticketem dostępna jako interaction.message
    if (interaction.message) {
      await interaction.message.edit({ embeds: [buildTicketEmbed(updated)], components: [buildActionRow(updated)] });
    }
    await interaction.reply({ content: `✏️ Punkty kuponu #${id} zmienione na ${newPoints} pkt.`, ephemeral: true });
    await dmUser(t.discordId, `✏️ Twój kupon #${id} został skorygowany — nowa liczba punktów: **${newPoints} pkt**.`);
  }
}

async function finalizeRejection(interaction, id, reason) {
  const t = await sheets.rejectTicket(id, reason);
  if (!t) return interaction.reply({ content: "Nie znaleziono kuponu.", ephemeral: true });

  const updated = { ...t, status: "ODRZUCONY", reason };

  // Wiadomość z ticketem jest dostępna przez interaction.message (bo select/modal
  // powstały z przycisku na tej wiadomości).
  if (interaction.message) {
    await interaction.message.edit({ embeds: [buildTicketEmbed(updated)], components: [buildActionRow(updated)] });
  }

  const replyFn = interaction.replied || interaction.deferred ? interaction.followUp.bind(interaction) : interaction.reply.bind(interaction);
  await replyFn({ content: `❌ Kupon #${id} odrzucony (${reason}).`, ephemeral: true });
  await dmUser(t.discordId, `❌ Twój kupon #${id} został odrzucony.\nPowód: **${reason}**`);
}

client.once("ready", async () => {
  await sheets.ensureSheetReady();
  console.log(`🤖 Zalogowano jako ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
