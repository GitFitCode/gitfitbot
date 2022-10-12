import PouchDB from 'pouchdb-node';

type Attendee = { discordID: string; retroDone: boolean };

let attendeesDB: PouchDB.Database<Attendee>;

function openAttendeesDatabase() {
  attendeesDB = new PouchDB<Attendee>('attendees_db');
}

async function closeAttendeesDatabase() {
  if (attendeesDB) {
    await attendeesDB.close();
  }
}

async function resetAttendeesDatabase() {
  if (attendeesDB) {
    await attendeesDB.destroy();
  }
}

async function fetchAllAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0 ? result.rows.map((row) => row.doc?.discordID) : [];
}

async function fetchRetroCompletedAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0
    ? result.rows.filter((row) => row.doc?.retroDone).map((row) => row.doc?.discordID)
    : [];
}

async function fetchRetroNotCompletedAttendees() {
  openAttendeesDatabase();

  const result = await attendeesDB.allDocs({ include_docs: true });

  return result.rows.length > 0
    ? result.rows.filter((row) => !row.doc?.retroDone).map((row) => row.doc?.discordID)
    : [];
}

async function bulkAddAttendees(attendees: string[]) {
  openAttendeesDatabase();

  const attendeesDocs: Attendee[] = attendees.map((attendee) => ({
    _id: attendee,
    discordID: attendee,
    retroDone: false,
  }));

  await attendeesDB.bulkDocs(attendeesDocs);
}

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
