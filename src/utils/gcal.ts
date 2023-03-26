/* eslint-disable operator-linebreak */
/* eslint-disable import/no-extraneous-dependencies */

import * as fs from 'fs';
import * as Sentry from '@sentry/node';
import { path } from 'app-root-path';
import { GaxiosResponse } from 'gaxios/build/src';
import { calendar_v3, auth, calendar } from '@googleapis/calendar';
import { Client } from 'discord.js';

type GCalEventDetails = { eventID: string; eventLink: string };

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

function addHoursToDate(date: Date, hours: number): Date {
  const dateToMilliseconds = date.getTime();
  const addedHour = dateToMilliseconds + 60 * 60 * 1000 * hours;
  return new Date(addedHour);
}

async function createEvent(
  summary: string,
  description: string,
  date: Date,
  client: Client,
): Promise<GCalEventDetails> {
  const eventDetails: GCalEventDetails = { eventID: '', eventLink: '' };

  if (serviceFileExists()) {
    const event: calendar_v3.Schema$Event = {
      summary,
      location: 'GitFitCode Discord',
      description,
      start: {
        dateTime: date.toISOString(),
      },
      end: {
        dateTime: addHoursToDate(date, 1).toISOString(),
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
    const botName = client?.user?.username.toLowerCase();

    try {
      result = await googleCalendar.events.insert({
        calendarId: botName === GITFITBOT_NAME ? GOOGLE_CALENDAR_ID : GOOGLE_TEST_CALENDAR_ID,
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

async function updateEvent() {
  googleCalendar.events.update({
    calendarId: '',
    eventId: '',
    requestBody: {},
  });
}

export { createEvent, updateEvent };
