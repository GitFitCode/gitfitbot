/**
 * "voiceStateUpdate" event listener for the bot.
 *
 * Consent notice for /voice transcription sessions: when a user joins a voice
 * channel that has an active transcription session, send them a one-time
 * notice that the call is being transcribed/recorded (VC text chat first, DM
 * fallback) and how to opt out. Members present at session start are notified
 * by the /voice join flow itself using the same mechanism.
 */

import { Client, VoiceState } from 'discord.js';
import 'dotenv/config';
import { getActiveSessionChannel, notifyMidSessionJoiner } from '../commands/Voice';

export default (client: Client): void => {
  client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    // Only care about actually entering a channel (not mute/deafen/stream
    // changes within the same channel).
    if (!newState.channelId || newState.channelId === oldState.channelId) return;

    const activeChannelId = getActiveSessionChannel(newState.guild.id);
    if (!activeChannelId || newState.channelId !== activeChannelId) return;

    try {
      await notifyMidSessionJoiner(newState.guild.id, member);
    } catch (error) {
      console.warn('[VOICE] Failed to notify mid-session joiner:', error);
    }
  });
};
