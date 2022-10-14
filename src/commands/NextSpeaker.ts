/**
 * Slash command that randomly picks a user in the Check-Ins Channel when triggered.
 *
 * To trigger, type `/next-speaker` in the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client, ChannelType } from 'discord.js';
import {
  fetchAllAttendees,
  fetchRetroCompletedAttendees,
  fetchRetroNotCompletedAttendees,
  insertAttendees,
  resetAttendeesDatabase,
  RETRO_FINISHED_MESSAGE,
  RETRO_NEXT_SPEAKER_MESSAGE,
  updateAttendeeRetroStatus,
} from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');
require('dotenv').config();
const config = require('gfc-vault-config');

/**
 * Function to pick the next attendee randomly.
 * @param attendees Array of attendees from which to pick a random one.
 */
function getRandomAttendee(attendees: (string | undefined)[]) {
  const random = Math.floor(Math.random() * attendees.length);

  return attendees[random];
}

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: '/next-speaker',
  });

  // Get the Check-Ins Channel instance.
  const voiceChannel = interaction.guild?.channels.cache.find(
    (channel) => channel.id === config.checkinsVoiceChannelId,
  );
  if (voiceChannel?.type !== ChannelType.GuildVoice) return;

  if (voiceChannel.members.size !== 0) {
    // THERE IS AT LEAST 1 ATTENDEE IN THE CHANNEL

    let followUpMessageContent = '';

    // Get all currently connected members from the Check-Ins Channel and insert into the database.
    const connectedMembers = voiceChannel.members
      .filter((member) => !member.user.bot)
      .map((member) => member.user.id);
    await insertAttendees(connectedMembers);

    // Get all stored attendees.
    const allAttendees = await fetchAllAttendees();

    transaction.setData('total_attendees_count', allAttendees.length);
    transaction.setTag('total_attendees_count', allAttendees.length);

    // Get all attendees who have completed their retro.
    const attendeesCompletedRetro = await fetchRetroCompletedAttendees();

    // Check if the retro is just getting started (i.e. no one has provided their update yet).
    if (attendeesCompletedRetro.length === 0) {
      // RETRO IS JUST GETTING STARTED; NO ATTENDEE HAS PROVIDED AN UPDATE YET

      const nextSpeaker = getRandomAttendee(allAttendees) as string;

      followUpMessageContent = `<@${nextSpeaker}> ${RETRO_NEXT_SPEAKER_MESSAGE}`;

      // Update retro status of the attendee who just provided their update.
      await updateAttendeeRetroStatus(nextSpeaker);
    } else {
      // RETRO ALREADY STARTED; AT LEAST 1 ATTENDEE HAS PROVIDED THEIR UPDATE

      const attendeesYetToSpeakList = await fetchRetroNotCompletedAttendees();

      // Check if the retro is over (i.e. all attendees have provided their update).
      if (attendeesYetToSpeakList.length === 0) {
        // RETRO IS FINISHED; ALL ATTENDEES HAVE PROVIDED THEIR UPDATE

        followUpMessageContent = RETRO_FINISHED_MESSAGE;

        // Delete the database to clear out all data.
        await resetAttendeesDatabase();
      } else {
        // RETRO IS NOT FINISHED YET; AT LEAST 1 ATTENDEE YET TO PROVIDE THEIR UPDATE

        const nextSpeaker = getRandomAttendee(attendeesYetToSpeakList) as string;

        followUpMessageContent = `<@${nextSpeaker}> ${RETRO_NEXT_SPEAKER_MESSAGE}`;

        // Update retro status of the attendee who just provided their update.
        await updateAttendeeRetroStatus(nextSpeaker);
      }
    }

    await interaction.followUp({ ephemeral: true, content: followUpMessageContent });
  } else {
    // THERE ARE NO ATTENDEES IN THE CHANNEL

    // Delete the database to clear out all data.
    await resetAttendeesDatabase();

    const content = 'Error! No attendees in the checkins voice channel!';
    interaction.followUp({ ephemeral: true, content });
  }
  transaction.finish();
  Sentry.setUser(null);
}

const NextSpeaker: SlashCommand = {
  name: 'next-speaker',
  description: 'Randomly picks a user in the Check-Ins Channel.',
  run: async (_client: Client, interaction: CommandInteraction) => {
    try {
      await executeRun(interaction);
    } catch (error: any) {
      console.error(error);
      Sentry.captureException(error);
    }
  },
};

export default NextSpeaker;
