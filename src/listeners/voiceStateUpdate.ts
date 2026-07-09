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
import {
  getActiveSessionChannel,
  handleVoiceChannelLeave,
  notifyMidSessionJoiner,
} from '../commands/Voice';

export default (client: Client): void => {
  client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    // Ignore mute/deafen/stream changes within the same channel.
    if (newState.channelId === oldState.channelId) return;

    const activeChannelId = getActiveSessionChannel(newState.guild.id);
    if (!activeChannelId) return;

    // User left the session's voice channel: finalize their continuous
    // recording chunk so the audio captured so far is intact on disk (#79).
    if (oldState.channelId === activeChannelId && newState.channelId !== activeChannelId) {
      try {
        handleVoiceChannelLeave(newState.guild.id, member.id);
      } catch (error) {
        console.warn('[VOICE] Failed to close recording for leaving member:', error);
      }
    }

    // User joined the session's voice channel: one-time consent notice.
    if (newState.channelId === activeChannelId) {
      try {
        await notifyMidSessionJoiner(newState.guild.id, member);
      } catch (error) {
        console.warn('[VOICE] Failed to notify mid-session joiner:', error);
      }
    }
  });
};
