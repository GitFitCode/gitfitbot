import PouchDB from 'pouchdb-node';
import { Attendee } from './types';

let attendeesDB: PouchDB.Database<Attendee>;

interface Setting {
  _id: string;
  value: string;
}

let settingsDB: PouchDB.Database<Setting>;

/** Opens (once) a small key/value database for persisted bot settings. */
function openSettingsDatabase() {
  if (!settingsDB) {
    settingsDB = new PouchDB<Setting>('settings_db');
  }
}

/**
 * Reads a persisted setting by key.
 *
 * @param {string} key - The setting key.
 * @returns {Promise<string | undefined>} The stored value, or undefined if unset.
 */
export async function getSetting(key: string): Promise<string | undefined> {
  openSettingsDatabase();
  try {
    const doc = await settingsDB.get(key);
    return doc.value;
  } catch {
    return undefined;
  }
}

/**
 * Persists a setting by key (upsert).
 *
 * @param {string} key - The setting key.
 * @param {string} value - The value to store.
 */
export async function setSetting(key: string, value: string): Promise<void> {
  openSettingsDatabase();
  try {
    const doc = await settingsDB.get(key);
    await settingsDB.put({ ...doc, value });
  } catch {
    await settingsDB.put({ _id: key, value });
  }
}

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
