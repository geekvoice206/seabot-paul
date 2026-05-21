import { randomUUID } from "crypto";
import {
  BaseGuildTextChannel,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import {
  ChatInputCommandBuilder,
  ChatInputCommandUserOption,
  ChatInputCommandStringOption,
} from "@discordjs/builders";

import { Database } from "../../../utils/constants";
import { DatabaseCommand } from "../database/DatabaseCommand";
import { Warning } from "../../../models/DBModels";

enum SubCommands {
  ADD = "add",
  LIST = "list",
  REMOVE = "remove",
  CLEAR = "clear",
}

const THRESHOLDS = { TIMEOUT: 3, KICK: 5, BAN: 7 };
const TIMEOUT_MS = 60 * 60 * 1000;
const LOG_CHANNEL_IDS = ["1260089386108977163", "1507069322420420690"];

const userOption = new ChatInputCommandUserOption()
  .setName("user")
  .setDescription("Target user")
  .setRequired(true);

export default new DatabaseCommand<Warning>(Database.Containers.WARNINGS, {
  name: "warn",
  description: "Manage user warnings",
  help: "warn",
  builder: new ChatInputCommandBuilder()
    .setName("warn")
    .setDescription("Manage user warnings")
    .setDefaultMemberPermissions("0")
    .addSubcommands([
      (cmd) =>
        cmd
          .setName(SubCommands.ADD)
          .setDescription("Issue a warning to a user")
          .addUserOptions([userOption])
          .addStringOptions([
            new ChatInputCommandStringOption()
              .setName("reason")
              .setDescription("Reason for the warning")
              .setRequired(true),
          ]),
      (cmd) =>
        cmd
          .setName(SubCommands.LIST)
          .setDescription("View all warnings for a user")
          .addUserOptions([userOption]),
      (cmd) =>
        cmd
          .setName(SubCommands.REMOVE)
          .setDescription("Remove a specific warning by ID")
          .addStringOptions([
            new ChatInputCommandStringOption()
              .setName("id")
              .setDescription("Warning ID to remove")
              .setRequired(true),
          ]),
      (cmd) =>
        cmd
          .setName(SubCommands.CLEAR)
          .setDescription("Clear all warnings for a user")
          .addUserOptions([userOption]),
    ]),
  execute: handler,
});

async function handler(
  this: DatabaseCommand<Warning>,
  interaction: ChatInputCommandInteraction,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cmd = interaction.options.getSubcommand(true);

  if (cmd === SubCommands.ADD) {
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    const issuer = interaction.user;

    const warning: Warning = {
      id: randomUUID(),
      userId: target.id,
      username: target.username,
      issuedBy: issuer.id,
      issuedByUsername: issuer.username,
      reason,
      timestamp: new Date().toISOString(),
    };

    const saved = await this.connector.addItem(warning);

    const allWarnings = (await this.connector.listAll()) as Warning[];
    const userWarnings = allWarnings.filter((w: Warning) => w.userId === target.id);
    const count = userWarnings.length;

    try {
      const dm = await target.createDM();
      await dm.send(
        `You received a warning in **${interaction.guild?.name}**: ${reason}\nYou now have **${count}** warning${count === 1 ? "" : "s"}.`,
      );
    } catch {
      // user may have DMs disabled
    }

    let escalation = "";
    const guildMember = await interaction.guild?.members
      .fetch(target.id)
      .catch(() => null);
    if (guildMember) {
      if (count >= THRESHOLDS.BAN) {
        await guildMember.ban({
          reason: `Auto-ban: ${count} warnings. Last: ${reason}`,
        });
        escalation = `\n:hammer: User has been **banned** (${count} warnings).`;
      } else if (count >= THRESHOLDS.KICK) {
        await guildMember.kick(
          `Auto-kick: ${count} warnings. Last: ${reason}`,
        );
        escalation = `\n:boot: User has been **kicked** (${count} warnings).`;
      } else if (count >= THRESHOLDS.TIMEOUT) {
        await guildMember.timeout(
          TIMEOUT_MS,
          `Auto-timeout: ${count} warnings. Last: ${reason}`,
        );
        escalation = `\n:mute: User has been **timed out for 1 hour** (${count} warnings).`;
      }
    }

    const announcement =
      `⚠️ **Warning** | <@${target.id}> (${target.username})\n` +
      `**Reason:** ${reason}\n` +
      `**Issued by:** <@${issuer.id}>\n` +
      `**Total warnings:** ${count}` +
      escalation;

    for (const id of LOG_CHANNEL_IDS) {
      const ch = await interaction.guild?.channels.fetch(id).catch(() => null);
      if (ch instanceof BaseGuildTextChannel) {
        ch.send(announcement);
      }
    }

    return interaction.followUp(
      `Warning issued to **${target.username}**.\n` +
      `**Reason:** ${reason}\n` +
      `They now have **${count}** warning${count === 1 ? "" : "s"}.` +
      escalation,
    );
  }

  if (cmd === SubCommands.LIST) {
    const target = interaction.options.getUser("user", true);
    const allWarnings = (await this.connector.listAll()) as Warning[];
    const userWarnings = allWarnings.filter((w: Warning) => w.userId === target.id);

    if (!userWarnings.length) {
      return interaction.followUp(`**${target.username}** has no warnings.`);
    }

    const lines = userWarnings.map(
      (w: Warning, i: number) =>
        `${i + 1}. \`${w.id}\` — ${w.reason} (by <@${w.issuedBy}>, <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:R>)`,
    );

    return interaction.followUp(
      `**${target.username}** has **${userWarnings.length}** warning${userWarnings.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
    );
  }

  if (cmd === SubCommands.REMOVE) {
    const id = interaction.options.getString("id", true);
    const deleted = await this.connector.deleteItem(id);
    if (!deleted) {
      return interaction.followUp(`No warning found with ID \`${id}\`.`);
    }
    return interaction.followUp(`Warning \`${id}\` removed.`);
  }

  if (cmd === SubCommands.CLEAR) {
    const target = interaction.options.getUser("user", true);
    const allWarnings = (await this.connector.listAll()) as Warning[];
    const userWarnings = allWarnings.filter((w: Warning) => w.userId === target.id);

    if (!userWarnings.length) {
      return interaction.followUp(
        `**${target.username}** has no warnings to clear.`,
      );
    }

    await Promise.all(
      userWarnings.map((w: Warning) => w.id && this.connector.deleteItem(w.id)),
    );

    return interaction.followUp(
      `Cleared **${userWarnings.length}** warning${userWarnings.length === 1 ? "" : "s"} for **${target.username}**.`,
    );
  }

  return interaction.followUp("Unknown subcommand.");
}
