/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable no-confusing-arrow */
/* eslint-disable operator-linebreak */
/* eslint-disable import/no-extraneous-dependencies */

import * as fs from 'fs';
import * as Sentry from '@sentry/node';
import { path } from 'app-root-path';
import { GaxiosResponse } from 'gaxios/build/src';
import { calendar_v3, auth, calendar } from '@googleapis/calendar';
import { Client } from 'discord.js';
import { GCalEventDetails, GFCEvent } from './types';

require('@sentry/tracing');

const SCOPES: string[] = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];
const GOOGLE_PRIVATE_KEY_FILE = './configurations/service.json';
const GOOGLE_CALENDAR_ID = 'gitfitbot@gitfitcode.com';
const GITFITBOT_NAME = 'gitfitbot';
const GOOGLE_TEST_CALENDAR_ID =
  'c_13f4e50a9628c836dc0f03febe1d8fd4fc67ff197913d2fb8caffa0e89062f14@group.calendar.google.com';

const googleAuth = new auth.GoogleAuth({
  keyFile: GOOGLE_PRIVATE_KEY_FILE,
  scopes: SCOPES,
  clientOptions: {
    subject: GOOGLE_CALENDAR_ID,
  },
});

const googleCalendar = calendar({ version: 'v3', auth: googleAuth });

const serviceFileExists = () => fs.existsSync(`${path}/configurations/service.json`);

const getCalendarID = (botName: string) =>
  botName === GITFITBOT_NAME ? GOOGLE_CALENDAR_ID : GOOGLE_TEST_CALENDAR_ID;

/**
 * Function to check if an event exists in Google Calendar.
 * @param gCalEventDetails GCalEventDetails
 * @param client Discord client
 */
async function checkIfGCalEventExists(
  gCalEventDetails: GCalEventDetails,
  client: Client,
): Promise<boolean> {
  const botName = client?.user?.username.toLowerCase() ?? '';

  try {
    await googleCalendar.events.get({
      calendarId: getCalendarID(botName),
      eventId: gCalEventDetails.eventID,
    });

    return true;
  } catch (error: any) {
    return false;
  }
}

/**
 * Function to create a new event in Google Calendar.
 * @param summary Event summary
 * @param description Event description
 * @param startDate Event start date
 * @param endDate Event end date
 * @param client Discord client
 * @Event Google Calendar event ID and link
 */
export async function createGCalEvent(
  summary: string,
  description: string,
  startDate: Date,
  endDate: Date,
  client: Client,
): Promise<GCalEventDetails> {
  const eventDetails: GCalEventDetails = { eventID: '', eventLink: '' };

  if (serviceFileExists()) {
    const event: calendar_v3.Schema$Event = {
      summary,
      location: 'GitFitCode Discord',
      description,
      start: {
        dateTime: startDate.toISOString(),
      },
      end: {
        dateTime: endDate.toISOString(),
      },
      // TODO we can have some default attendees
      // attendees: [{ email: 'lpage@example.com' }, { email: 'sbrin@example.com' }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 5 },
        ],
      },
    };

    let result: GaxiosResponse<calendar_v3.Schema$Event>;
    const botName = client?.user?.username.toLowerCase() ?? '';

    try {
      result = await googleCalendar.events.insert({
        calendarId: getCalendarID(botName),
        requestBody: event,
      });

      eventDetails.eventID = result.data.id ?? '';
      eventDetails.eventLink = result.data.htmlLink ?? '';
    } catch (error: any) {
      Sentry.captureException(error);
      console.error(error);
    }
  }

  return eventDetails;
}

/**
 * Function to update an existing event in Google Calendar.
 * @param event GFCEvent
 * @param gCalEventDetails GCalEventDetails
 * @param client Discord client
 */
export async function updateGCalEvent(
  event: GFCEvent,
  gCalEventDetails: GCalEventDetails,
  client: Client,
) {
  const botName = client?.user?.username.toLowerCase() ?? '';

  const eventBody: calendar_v3.Schema$Event = {
    summary: event.name,
    location: 'GitFitCode Discord',
    description: event.description,
    start: {
      dateTime: new Date(event.starts_at).toISOString(),
    },
    end: {
      dateTime: new Date(event.ends_at).toISOString(),
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 30 },
        { method: 'popup', minutes: 5 },
      ],
    },
  };

  try {
    await googleCalendar.events.update({
      calendarId: getCalendarID(botName),
      eventId: gCalEventDetails.eventID,
      requestBody: eventBody,
    });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error(error);
  }
}

/**
 * Function to delete an existing event in Google Calendar.
 * @param gCalEventDetails GCalEventDetails
 * @param client Discord client
 */
export async function deleteGCalEvent(gCalEventDetails: GCalEventDetails, client: Client) {
  const botName = client?.user?.username.toLowerCase() ?? '';

  if (await checkIfGCalEventExists(gCalEventDetails, client)) {
    try {
      await googleCalendar.events.delete({
        calendarId: getCalendarID(botName),
        eventId: gCalEventDetails.eventID,
      });
    } catch (error: any) {
      Sentry.captureException(error);
      console.error(error);
    }
  }
}
