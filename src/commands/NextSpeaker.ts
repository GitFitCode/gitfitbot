/**
 * Slash command that randomly picks a user in the Check-Ins Channel when triggered.
 *
 * To trigger, type `/next-speaker` on the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client, ChannelType } from 'discord.js';
import { RETRO_FINISHED_MESSAGE, RETRO_NEXT_SPEAKER_MESSAGE } from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');
require('dotenv').config();
const config = require('gfc-vault-config');

const mainAttendeesList: string[] = [];
const attendeesCompletedRetroList: string[] = [];
let nextSpeaker = '';
let content = '';

/**
 * Function to pick the next attendee randonly.
 */
function setNextSpeaker() {
  // Pick a member randomly.
  const random = Math.floor(Math.random() * mainAttendeesList.length);
  nextSpeaker = mainAttendeesList[random];

  content = `<@${nextSpeaker}> ${RETRO_NEXT_SPEAKER_MESSAGE}`;

  // Add the speaker to attendeesCompletedRetroList.
  attendeesCompletedRetroList.push(nextSpeaker);
}

async function executeRun(interaction: CommandInteraction) {
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: '/next-speaker',
  });

  // Get the Check-Ins Channel instance.
  const voiceChannel = interaction.guild?.channels.cache.find(
    (channel) => channel.id === config.checkinsVoiceChannelId,
  );
  if (voiceChannel?.type !== ChannelType.GuildVoice) return;

  // Reset mainAttendeesList on every command call.
  mainAttendeesList.length = 0;

  if (voiceChannel.members.size !== 0) {
    // THERE ARE ATTENDEES IN THE CHANNEL

    // Get all currently connected members from the Check-Ins Channel.
    voiceChannel.members.forEach((member) => {
      mainAttendeesList.push(member.user.id);
    });

    // Check if the retro is just getting started (i.e. no one has provided their update yet).
    if (attendeesCompletedRetroList.length === 0) {
      // RETRO IS JUST GETTING STARTED; NO ATTENDEE HAS GIVEN AN UPDATE YET

      setNextSpeaker();
    } else {
      // RETRO ALREADY STARTED; ATLEAST 1 ATTENDEE HAS GIVEN THEIR UPDATE

      // Get difference between mainAttendeesList and attendeesCompletedRetroList.
      // https://stackoverflow.com/a/33034768
      const attendeesYetToSpeakList = mainAttendeesList.filter(
        (attendee) => !attendeesCompletedRetroList.includes(attendee),
      );

      // Check if the retro is over (i.e. all attendees have provided their update).
      if (attendeesYetToSpeakList.length === 0) {
        // RETRO IS FINISHED; ALL ATTENDEES HAVE PROVIDED THEIR UPDATE

        content = RETRO_FINISHED_MESSAGE;

        // Reset mainAttendeesList and attendeesCompletedRetroList.
        mainAttendeesList.length = 0;
        attendeesCompletedRetroList.length = 0;
      } else {
        // RETRO IS NOT FINISHED YET; ATLEAST 1 ATTENDEE YET TO PROVIDE THEIR UPDATE

        setNextSpeaker();
      }
    }

    await interaction.followUp({ ephemeral: true, content });
  } else {
    // THERE ARE NO ATTENDEES IN THE CHANNEL

    attendeesCompletedRetroList.length = 0;

    content = 'Error! No attendees in the checkins voice channel!';

    interaction.followUp({ ephemeral: true, content });
  }
  transaction.finish();
}

const NextSpeaker: SlashCommand = {
  name: 'next-speaker',
  description: 'Randomly picks a user in the Check-Ins Channel.',
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default NextSpeaker;
