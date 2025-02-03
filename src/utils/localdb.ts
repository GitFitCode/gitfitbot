import PouchDB from 'pouchdb-node';
import { Attendee } from './types';

let attendeesDB: PouchDB.Database<Attendee>;

/**
 * Opens a new connection to the Attendees database.
 */
export function openAttendeesDatabase() {
  attendeesDB = new PouchDB<Attendee>('attendees_db');
}

/**
 * Closes the current connection to the Attendees database.
 */
async function closeAttendeesDatabase() {
  if (attendeesDB) {
    await attendeesDB.close();
  }
}

/**
 * Deletes all documents and destroys the Attendees database.
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
 * Fetches all documents from the Attendees database.
 *
 * @returns {Promise<(string | undefined)[]>} A promise that resolves to an array of attendee IDs retrieved from the database.
 */
export async function fetchAllAttendees(): Promise<(string | undefined)[]> {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0 ? result.rows.map((row) => row.doc?.discordID) : [];
}

/**
 * Fetches all documents with retroDone set to true from the Attendees database.
 *
 * @returns {Promise<(string | undefined)[]>} A promise that resolves to an array of attendee IDs with retroDone set to true.
 */
export async function fetchRetroCompletedAttendees(): Promise<(string | undefined)[]> {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0
    ? result.rows.filter((row) => row.doc?.retroDone).map((row) => row.doc?.discordID)
    : [];
}

/**
 * Fetches all documents with retroDone set to false from the Attendees database.
 *
 * @returns {Promise<(string | undefined)[]>} A promise that resolves to an array of attendee IDs with retroDone set to false.
 */
export async function fetchRetroNotCompletedAttendees(): Promise<(string | undefined)[]> {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0
    ? result.rows.filter((row) => !row.doc?.retroDone).map((row) => row.doc?.discordID)
    : [];
}

/**
 * Adds multiple documents into the Attendees database.
 *
 * @param {string[]} attendees - An array of attendee IDs to be added to the database.
 */
async function bulkAddAttendees(attendees: string[]) {
  openAttendeesDatabase();

  const attendeesDocs: Attendee[] = attendees.map((attendee) => ({
    _id: attendee,
    discordID: attendee,
    retroDone: false,
  }));

  await attendeesDB.bulkDocs(attendeesDocs);
}

/**
 * Inserts new attendees into the database.
 * If the database is empty, all attendees are added.
 * If the database already has some attendees, only new attendees are added.
 *
 * @param {string[]} attendees - An array of attendees to be inserted.
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
 * Updates the retrospective status of an attendee in the database.
 * The function sets the 'retroDone' field of the attendee document to true.
 *
 * @param {string} attendee - The name of the attendee whose status is to be updated.
 */
export async function updateAttendeeRetroStatus(attendee: string) {
  openAttendeesDatabase();

  const attendeeDoc = await attendeesDB.get(attendee);
  attendeeDoc.retroDone = true;

  await attendeesDB.put(attendeeDoc);
}
