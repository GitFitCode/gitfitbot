/* eslint-disable object-curly-newline */

import { config } from 'gfc-vault-config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { GFCEvent } from './types';
import { DELETED_COLUMN, EVENTS_TABLE, FIVE_DAYS_IN_MS, ID_DISCORD_COLUMN } from './constants';

let supabase: SupabaseClient<any, 'public', any>;

function openEventsDatabase() {
  if (!supabase) {
    supabase = createClient(config.supabaseURL, config.supabaseAnonKey);
  }
}

/**
 * Function to insert a new event into the Events database.
 * @param event Event to be inserted into the database.
 */
export async function insertEvent(event: GFCEvent): Promise<boolean> {
  openEventsDatabase();

  const { error } = await supabase.from(EVENTS_TABLE).insert(event);

  return !error;
}

/**
 * Function to retrieve a non-deleted event from the Events database.
 * @param id Discord ID of the event to be retrieved.
 * @returns Event retrieved from the database.
 */
export async function retrieveEvent(id: string): Promise<GFCEvent | null> {
  openEventsDatabase();

  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select()
    .eq(DELETED_COLUMN, false)
    .eq(ID_DISCORD_COLUMN, id);

  if (!error && data.length > 0) {
    const eventData = data[0];
    const event: GFCEvent = {
      name: eventData.name,
      description: eventData.description,
      id_discord: eventData.id_discord,
      url_discord: eventData.url_discord,
      id_gcal: eventData.id_gcal,
      url_gcal: eventData.url_gcal,
      status: eventData.status,
      type: eventData.type,
      starts_at: eventData.starts_at,
      ends_at: eventData.ends_at,
    };

    return event;
  }
  return null;
}

/**
 * Function to retrieve all non-deleted events from the Events database.
 * @returns All events from the Events database.
 */
export async function retrieveAllEvents(): Promise<GFCEvent[]> {
  openEventsDatabase();

  const { data, error } = await supabase.from(EVENTS_TABLE).select().eq(DELETED_COLUMN, false);

  if (!error && data.length > 0) {
    const events: GFCEvent[] = data.map((eventData) => {
      const event: GFCEvent = {
        name: eventData.name,
        description: eventData.description,
        id_discord: eventData.id_discord,
        url_discord: eventData.url_discord,
        id_gcal: eventData.id_gcal,
        url_gcal: eventData.url_gcal,
        status: eventData.status,
        type: eventData.type,
        starts_at: eventData.starts_at,
        ends_at: eventData.ends_at,
      };

      return event;
    });
    return events;
  }
  return [];
}

/**
 * Function to update an event in the Events database.
 * @param event Event to be updated in the database.
 */
export async function updateEvent(event: GFCEvent): Promise<boolean> {
  openEventsDatabase();

  const { error } = await supabase
    .from(EVENTS_TABLE)
    .update(event)
    .eq(ID_DISCORD_COLUMN, event.id_discord);

  return !error;
}

/**
 * Function to delete an event from the Events database.
 * @param event Event to be deleted from the database.
 */
export async function deleteEvent(event: GFCEvent): Promise<boolean> {
  openEventsDatabase();

  const { error } = await supabase
    .from(EVENTS_TABLE)
    .update({ deleted: true, deleted_at: new Date() })
    .eq(ID_DISCORD_COLUMN, event.id_discord);

  return !error;
}

/**
 * Function to keep the database connection alive so that
 * supabase does not close it after 7 days of inactivity.
 */
export async function keepDBAlive() {
  openEventsDatabase();

  async function selectZeroRows() {
    await supabase.from(EVENTS_TABLE).select().eq(DELETED_COLUMN, false).limit(0);
  }

  setInterval(selectZeroRows, FIVE_DAYS_IN_MS);
}
