/* eslint-disable no-underscore-dangle */
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

/**
 * Function to insert a new event into the Events database.
 * @param event Event to be inserted into the database.
 */
export async function insertEvent(event: GFCEvent) {
  openEventsDatabase();

  await eventsDB.put(event);
}

/**
 * Function to retrieve an event from the Events database.
 * @param id ID of the event to be retrieved.
 * @returns Event retrieved from the database.
 */
export async function retrieveEvent(id: string): Promise<GFCEvent> {
  openEventsDatabase();

  const result = await eventsDB.get(id);
  const event: GFCEvent = {
    _id: result._id,
    name: result.name,
    description: result.description,
    id_discord: result.id_discord,
    url_discord: result.url_discord,
    id_gcal: result.id_gcal,
    url_gcal: result.url_gcal,
    status: result.status,
    type: result.type,
    starts_at: result.starts_at,
    ends_at: result.ends_at,
  };

  return event;
}

/**
 * Function to update an event in the Events database.
 * @param event Event to be updated in the database.
 */
export async function updateEvent(event: GFCEvent) {
  openEventsDatabase();

  const doc = await eventsDB.get(event.id_discord);
  doc.name = event.name;
  doc.description = event.description;
  doc.status = event.status;
  doc.starts_at = event.starts_at;
  doc.ends_at = event.ends_at;

  await eventsDB.put(doc);
}

/**
 * Function to delete an event from the Events database.
 * @param event Event to be deleted from the database.
 */
export async function deleteEvent(event: GFCEvent) {
  openEventsDatabase();

  const doc = await eventsDB.get(event.id_discord);
  await eventsDB.remove(doc);
}
