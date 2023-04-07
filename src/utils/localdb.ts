import PouchDB from 'pouchdb-node';
import { Attendee, GFCEvent } from './types';

let attendeesDB: PouchDB.Database<Attendee>;
let eventsDB: PouchDB.Database<GFCEvent>;

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
 */
export async function fetchAllAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0 ? result.rows.map((row) => row.doc?.discordID) : [];
}

/**
 * Function to fetch all documents with retroDone = true from the Attendees database.
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

/**
 * Function to open a new connection to Events database.
 */
export function openEventsDatabase() {
  eventsDB = new PouchDB<GFCEvent>('events_db');
}

/**
 * Function to close the current connection to Events database.
 */
export async function closeEventsDatabase() {
  if (eventsDB) {
    await eventsDB.close();
  }
}

/**
 * Function to delete all documents and destroy the Events database.
 */
export async function resetEventsDatabase() {
  try {
    await eventsDB.info();
    await eventsDB.destroy();
  } catch (error) {
    // NO-OP
  }
}

export async function insertEvent(event: GFCEvent) {
  console.log('EVENT CREATED in db');
  console.log(event);
  openEventsDatabase();

  await eventsDB.put(event);
}

export async function retrieveEvent(
  id: string,
): Promise<GFCEvent & PouchDB.Core.IdMeta & PouchDB.Core.GetMeta> {
  openEventsDatabase();

  const result = await eventsDB.get(id);

  return result;
}

export async function updateEvent(event: GFCEvent) {
  console.log('EVENT UPDATED in db');
  console.log(event);
  openEventsDatabase();

  const doc = await eventsDB.get(event.id_discord);
  doc.name = event.name;
  doc.description = event.description;
  doc.status = event.status;
  doc.starts_at = event.starts_at;
  doc.ends_at = event.ends_at;

  await eventsDB.put(doc);
}

export async function deleteEvent(event: GFCEvent) {
  console.log('EVENT DELETED from db');
  console.log(event);
  openEventsDatabase();

  const doc = await eventsDB.get(event.id_discord);
  await eventsDB.remove(doc);
}
