import { Client } from 'discord.js';
import guildMemberAdd from './guildMemberAdd';
import interactionCreate from './interactionCreate';
import messageCreate from './messageCreate';
import ready from './ready';

export function registerEventListeners(client: Client): void {
    guildMemberAdd(client);
    interactionCreate(client);
    messageCreate(client);
    ready(client);
}