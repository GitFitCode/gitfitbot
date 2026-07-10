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
import { getProjectDigestResponse, getVoiceDigestResponse } from './openAI';
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

// --- Voice-session digests (#81) -------------------------------------------
// Same Sonnet-backed pipeline as project digests, applied to the final
// speaker-labeled transcript assembled at /voice stop.

export interface VoiceDigestMeta {
  channelName: string;
  startedAt: Date;
  endedAt: Date;
  participants: string[];
}

// Minimum spoken content (speaker-line text, labels stripped) before a digest
// is worth an LLM call.
const VOICE_DIGEST_MIN_CONTENT_CHARS = 200;
// Same input budget buildTranscriptText uses for channel-dump digests.
const VOICE_DIGEST_MAX_CHARS = 120_000;
// Matches "[HH:MM:SS] username: text" (timestamp optional) transcript lines.
const SPEAKER_LINE_RE = /^(?:\[[^\]]*\]\s*)?([^:\n]{1,64}):\s*(\S.*)$/;
// Matches the "**username:**" block headers of the live-caption fallback
// transcript, whose spoken lines follow unprefixed.
const SPEAKER_HEADER_RE = /^\*\*[^:\n]{1,64}:\*\*$/;

/**
 * Extracts the spoken content of a transcript: text after "name:" on labeled
 * lines, plus unprefixed lines inside a "**name:**" block. Returns null when
 * the transcript contains no speaker-labeled lines at all.
 */
function extractSpokenContent(transcript: string): string | null {
  const lines = transcript
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let sawSpeaker = false;
  let inSpeakerBlock = false;
  const spoken: string[] = [];
  for (const line of lines) {
    if (SPEAKER_HEADER_RE.test(line)) {
      sawSpeaker = true;
      inSpeakerBlock = true;
      continue;
    }
    const m = line.match(SPEAKER_LINE_RE);
    if (m) {
      sawSpeaker = true;
      inSpeakerBlock = false;
      spoken.push(m[2]);
      continue;
    }
    if (inSpeakerBlock) {
      spoken.push(line);
    }
  }

  return sawSpeaker ? spoken.join(' ') : null;
}

/**
 * Digests a finished voice session's speaker-labeled transcript into TL;DR,
 * key discussion points, decisions, and action items (with owners when the
 * transcript makes ownership attributable).
 *
 * Returns null WITHOUT calling the LLM when the transcript is empty/trivial:
 * no speaker-labeled lines, or under ~200 characters of actual spoken content.
 *
 * digest.ts has no chunk+reduce path (channel dumps are truncated to a single
 * window), so oversized transcripts are truncated from the MIDDLE — head and
 * tail kept — with the truncation noted in the digest input.
 */
export async function generateVoiceDigest(
  transcript: string,
  meta: VoiceDigestMeta,
): Promise<string | null> {
  const spokenContent = extractSpokenContent(transcript);
  if (spokenContent === null || spokenContent.length < VOICE_DIGEST_MIN_CONTENT_CHARS) {
    return null;
  }

  let body = transcript;
  if (body.length > VOICE_DIGEST_MAX_CHARS) {
    const half = Math.floor(VOICE_DIGEST_MAX_CHARS / 2);
    const omitted = body.length - VOICE_DIGEST_MAX_CHARS;
    body =
      `${body.slice(0, half)}\n\n` +
      `[NOTE: transcript truncated in the MIDDLE to fit the model context — ~${omitted} characters omitted; the beginning and end of the call are kept]\n\n` +
      `${body.slice(-half)}`;
  }

  const input =
    `Voice call metadata:\n` +
    `- Channel: ${meta.channelName}\n` +
    `- Started: ${meta.startedAt.toISOString()}\n` +
    `- Ended: ${meta.endedAt.toISOString()}\n` +
    `- Participants: ${meta.participants.join(', ') || 'unknown'}\n\n` +
    `Here is the speaker-labeled transcript of the call:\n\n${body}`;

  return getVoiceDigestResponse(input);
}

/**
 * Builds the embed + full-transcript .md attachment for a voice-session
 * digest, matching the /project-digest output style.
 */
export function buildVoiceDigestPayload(
  digest: string,
  meta: VoiceDigestMeta,
  fullTranscriptMd: string,
) {
  const durationMin = Math.round((meta.endedAt.getTime() - meta.startedAt.getTime()) / 60000);
  const footerParts = [
    `~${durationMin} min`,
    `${meta.participants.length} participant(s)`,
    'full transcript attached',
  ];

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`📋 Voice Digest — ${meta.channelName}`.slice(0, 256))
    .setDescription(
      digest.length > EMBED_DESCRIPTION_LIMIT
        ? `${digest.slice(0, EMBED_DESCRIPTION_LIMIT - 60)}\n\n*…full digest attached below.*`
        : digest,
    )
    .setFooter({ text: footerParts.join(' · ') })
    .setTimestamp(meta.endedAt);

  const attachment = new AttachmentBuilder(Buffer.from(fullTranscriptMd, 'utf8'), {
    name: `${fileSlug(meta.channelName)}-voice-transcript.md`,
  });

  return { embeds: [embed], files: [attachment] };
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
