/* eslint-disable import/no-extraneous-dependencies */

import * as Sentry from '@sentry/node';
import { calendar_v3, google } from 'googleapis';
import { GaxiosResponse } from 'gaxios/build/src';

type GCalEventDetails = { eventID: string; eventLink: string };

const SCOPES: string[] = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];
const GOOGLE_PRIVATE_KEY_FILE = './service.json';
const GOOGLE_CALENDAR_ID = 'gitfitbot@gitfitcode.com';

const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_PRIVATE_KEY_FILE,
  scopes: SCOPES,
  clientOptions: {
    subject: GOOGLE_CALENDAR_ID,
  },
});

const calendar = google.calendar({ version: 'v3', auth });

function addHoursToDate(date: Date, hours: number): Date {
  const dateToMilliseconds = date.getTime();
  const addedHour = dateToMilliseconds + 60 * 60 * 1000 * hours;
  return new Date(addedHour);
}

async function createEvent(
  summary: string,
  description: string,
  date: Date,
): Promise<GCalEventDetails> {
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
        { method: 'popup', minutes: 5 },
      ],
    },
  };

  let result: GaxiosResponse<calendar_v3.Schema$Event>;

  const eventDetails: GCalEventDetails = { eventID: '', eventLink: '' };

  try {
    result = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      requestBody: event,
    });

    eventDetails.eventID = result.data.id ?? '';
    eventDetails.eventLink = result.data.htmlLink ?? '';

    console.log('Event created successfully!');
  } catch (error: any) {
    Sentry.captureException(error);
    console.error(error);
  }

  return eventDetails;
}

// eslint-disable-next-line import/prefer-default-export
export { createEvent };
