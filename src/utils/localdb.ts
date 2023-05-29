/* eslint-disable no-underscore-dangle */

import PouchDB from 'pouchdb-node';
import { Attendee } from './types';

let attendeesDB: PouchDB.Database<Attendee>;

/**
 * Function to open a new connection to Attendees database.
 */
export function openAttendeesDatabase() {
  attendeesDB = new PouchDB<Attendee>('attendees_db');
}

/**
 * Function to close the current connection to Attendees database.
 */
export async function closeAttendeesDatabase() {
  if (attendeesDB) {
    await attendeesDB.close();
  }
}

/**
 * Function to delete all documents and destroy the Attendees database.
 */
export async function resetAttendeesDatabase() {
  try {
    await attendeesDB.info();
    await attendeesDB.destroy();
  } catch (error) {
    // NO-OP
  }
}

/**
 * Function to fetch all documents from the Attendees database.
 * @returns Attendees ID array retrieved from the database.
 */
export async function fetchAllAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0 ? result.rows.map((row) => row.doc?.discordID) : [];
}

/**
 * Function to fetch all documents with retroDone = true from the Attendees database.
 * @returns Attendees ID array retrieved from the database.
 */
export async function fetchRetroCompletedAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0
    ? result.rows.filter((row) => row.doc?.retroDone).map((row) => row.doc?.discordID)
    : [];
}

/**
 * Function to fetch all documents with retroDone = false from the Attendees database.
 * @returns Attendees ID array retrieved from the database.
 */
export async function fetchRetroNotCompletedAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0
    ? result.rows.filter((row) => !row.doc?.retroDone).map((row) => row.doc?.discordID)
    : [];
}

/**
 * Function to add multiple documents into the Attendees database.
 */
export async function bulkAddAttendees(attendees: string[]) {
  openAttendeesDatabase();

  const attendeesDocs: Attendee[] = attendees.map((attendee) => ({
    _id: attendee,
    discordID: attendee,
    retroDone: false,
  }));

  await attendeesDB.bulkDocs(attendeesDocs);
}

/**
 * Function to add multiple documents ignoring duplicates.
 * @param attendees Array of attendees to be added to the database.
 */
export async function insertAttendees(attendees: string[]) {
  openAttendeesDatabase();

  const currentlyStoredAttendees = await fetchAllAttendees();

  if (currentlyStoredAttendees.length === 0) {
    await bulkAddAttendees(attendees);
  } else {
    const newAttendees = attendees.filter(
      (attendee) => !currentlyStoredAttendees.includes(attendee),
    );

    await bulkAddAttendees(newAttendees);
  }
}

/**
 * Function to update retro status of a document from the Attendees database.
 */
export async function updateAttendeeRetroStatus(attendee: string) {
  openAttendeesDatabase();

  const attendeeDoc = await attendeesDB.get(attendee);
  attendeeDoc.retroDone = true;

  await attendeesDB.put(attendeeDoc);
}
