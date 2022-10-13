import PouchDB from 'pouchdb-node';

type Attendee = { discordID: string; retroDone: boolean };

let attendeesDB: PouchDB.Database<Attendee>;

/**
 * Function to open a new connection to Attendees database.
 */
function openAttendeesDatabase() {
  attendeesDB = new PouchDB<Attendee>('attendees_db');
}

/**
 * Function to close the current connection to Attendees database.
 */
async function closeAttendeesDatabase() {
  if (attendeesDB) {
    await attendeesDB.close();
  }
}

/**
 * Function to delete all documents and destroy the Attendees database.
 */
async function resetAttendeesDatabase() {
  if (attendeesDB) {
    await attendeesDB.destroy();
  }
}

/**
 * Function to fetch all documents from the Attendees database.
 */
async function fetchAllAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0 ? result.rows.map((row) => row.doc?.discordID) : [];
}

/**
 * Function to fetch all documents with retroDone = true from the Attendees database.
 */
async function fetchRetroCompletedAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0
    ? result.rows.filter((row) => row.doc?.retroDone).map((row) => row.doc?.discordID)
    : [];
}

/**
 * Function to fetch all documents with retroDone = false from the Attendees database.
 */
async function fetchRetroNotCompletedAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0
    ? result.rows.filter((row) => !row.doc?.retroDone).map((row) => row.doc?.discordID)
    : [];
}

/**
 * Function to add multiple documents into the Attendees database.
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
 * Function to add multiple documents ignoring duplicates.
 * @param attendees Array of attendees to be added to the database.
 */
async function insertAttendees(attendees: string[]) {
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
async function updateAttendeeRetroStatus(attendee: string) {
  openAttendeesDatabase();

  const attendeeDoc = await attendeesDB.get(attendee);
  attendeeDoc.retroDone = true;

  await attendeesDB.put(attendeeDoc);
}

export {
  closeAttendeesDatabase,
  fetchAllAttendees,
  fetchRetroNotCompletedAttendees,
  fetchRetroCompletedAttendees,
  insertAttendees,
  openAttendeesDatabase,
  resetAttendeesDatabase,
  updateAttendeeRetroStatus,
};
