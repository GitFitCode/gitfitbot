/**
 * Shared digest engine: generate a post's digest, render it as a Discord embed
 * + attachment with correction/feedback buttons, and handle those interactions.
 *
 * Used by the /project-digest command and the button/modal handlers so the same
 * rendering + regeneration logic lives in one place.
 */

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextBasedChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import 'dotenv/config';
import { buildTranscriptText, condenseMessages, fetchAllMessages } from './channelDump';
import { DIGEST_INTERACTION } from './constants';
import { getProjectDigestResponse } from './openAI';
import { addDigestFeedback, listCorrections, upsertPostDigest } from './projectsDb';

const EMBED_DESCRIPTION_LIMIT = 4096;

const ADMIN_IDS = [process.env.ADMIN_1_DISCORD_ID, process.env.ADMIN_2_DISCORD_ID].filter(
  (id): id is string => Boolean(id),
);

type NamedChannel = TextBasedChannel & { name?: string | null; guildId?: string | null };

export interface DigestResult {
  channelName: string;
  digest: string;
  messageCount: number;
  truncated: boolean;
  saved: { id: string; linkedProjectId: string | null } | null;
  empty: boolean;
}

function fileSlug(name: string): string {
  return (
    name
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'project'
  );
}

/**
 * Fetches a post's full history, generates the digest (folding in any stored
 * author/admin corrections), persists it, and returns the result.
 */
export async function generateDigest(channel: NamedChannel, postId: string): Promise<DigestResult> {
  const channelName = String(channel.name ?? postId);
  const messages = await fetchAllMessages(channel);
  if (messages.length === 0) {
    return { channelName, digest: '', messageCount: 0, truncated: false, saved: null, empty: true };
  }

  const { text, truncated } = buildTranscriptText(condenseMessages(messages));
  const corrections = await listCorrections(postId);
  const digest = await getProjectDigestResponse(text, corrections);
  const saved = await upsertPostDigest({
    discordPostId: postId,
    guildId: channel.guildId ?? null,
    name: channelName,
    digest,
    messageCount: messages.length,
  });

  return { channelName, digest, messageCount: messages.length, truncated, saved, empty: false };
}

/** Builds the embed + .md attachment + correction/feedback buttons for a digest. */
export function buildDigestPayload(result: DigestResult, postId: string) {
  const { channelName, digest, messageCount, truncated, saved } = result;

  const footerParts = [`${messageCount} messages`];
  if (truncated) footerParts.push('truncated to recent context');
  if (saved) footerParts.push(saved.linkedProjectId ? 'linked to a project' : 'not yet linked');

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`📋 Project Digest — ${channelName}`.slice(0, 256))
    .setDescription(
      digest.length > EMBED_DESCRIPTION_LIMIT
        ? `${digest.slice(0, EMBED_DESCRIPTION_LIMIT - 60)}\n\n*…full digest attached below.*`
        : digest,
    )
    .setFooter({ text: `${footerParts.join(' · ')}${saved ? ' · 💾 saved' : ''}` })
    .setTimestamp();

  const attachment = new AttachmentBuilder(
    Buffer.from(`# Project Digest — ${channelName}\n\n${digest}\n`, 'utf8'),
    { name: `${fileSlug(channelName)}-digest.md` },
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${DIGEST_INTERACTION.CORRECT_BUTTON}:${postId}`)
      .setLabel('Suggest correction')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${DIGEST_INTERACTION.FEEDBACK_BUTTON}:${postId}`)
      .setLabel('Feedback')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], files: [attachment], components: [row] };
}

/** True if the user authored the post (thread owner) or is a configured admin. */
async function canCorrect(interaction: ButtonInteraction, postId: string): Promise<boolean> {
  if (ADMIN_IDS.includes(interaction.user.id)) {
    return true;
  }
  const channel = await interaction.client.channels.fetch(postId).catch(() => null);
  const ownerId = channel && 'ownerId' in channel ? (channel.ownerId ?? null) : null;
  return ownerId === interaction.user.id;
}

/** Handles the ✏️ correction / 💬 feedback buttons by opening the right modal. */
export async function handleDigestButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, postId] = interaction.customId.split(':');
  if (!postId) {
    return;
  }

  if (`digest:${action}` === DIGEST_INTERACTION.FEEDBACK_BUTTON) {
    const input = new TextInputBuilder()
      .setCustomId(DIGEST_INTERACTION.FEEDBACK_INPUT)
      .setLabel('Your feedback on this digest')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(300)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId(`${DIGEST_INTERACTION.FEEDBACK_MODAL}:${postId}`)
      .setTitle('Digest feedback')
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // Correction button — gated to the post author + admins.
  if (!(await canCorrect(interaction, postId))) {
    await interaction.reply({ ephemeral: true, content: DIGEST_INTERACTION.NOT_ALLOWED_MSG });
    return;
  }
  const input = new TextInputBuilder()
    .setCustomId(DIGEST_INTERACTION.CORRECTION_INPUT)
    .setLabel('What should the digest say instead?')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId(`${DIGEST_INTERACTION.CORRECT_MODAL}:${postId}`)
    .setTitle('Correct this digest')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

/** Handles correction/feedback modal submissions (and regenerates on correction). */
export async function handleDigestModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, type, postId] = interaction.customId.split(':');
  if (!postId) {
    return;
  }
  const userName = interaction.user.tag ?? interaction.user.username;

  // Community feedback — just record it.
  if (`digest:${type}` === DIGEST_INTERACTION.FEEDBACK_MODAL) {
    const content = interaction.fields.getTextInputValue(DIGEST_INTERACTION.FEEDBACK_INPUT);
    await addDigestFeedback({
      discordPostId: postId,
      discordUserId: interaction.user.id,
      userName,
      kind: 'feedback',
      content,
    });
    await interaction.reply({
      ephemeral: true,
      content: '💬 Thanks — your feedback was recorded.',
    });
    return;
  }

  // Author/admin correction — record it, then regenerate the digest in place.
  const content = interaction.fields.getTextInputValue(DIGEST_INTERACTION.CORRECTION_INPUT);
  await interaction.deferReply({ ephemeral: true });
  await addDigestFeedback({
    discordPostId: postId,
    discordUserId: interaction.user.id,
    userName,
    kind: 'correction',
    content,
  });

  const channel = await interaction.client.channels.fetch(postId).catch(() => null);
  if (!channel || !('messages' in channel)) {
    await interaction.editReply(
      'Correction saved, but I could not re-read the thread to regenerate.',
    );
    return;
  }

  const result = await generateDigest(channel as NamedChannel, postId);
  if (!result.empty && interaction.message) {
    const payload = buildDigestPayload(result, postId);
    await interaction.message.edit(payload).catch(() => null);
  }
  await interaction.editReply('✏️ Correction saved — digest updated.');
}
