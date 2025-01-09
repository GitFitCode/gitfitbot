import fs from 'fs';
import path from 'path';

export const loadConfig = (serverId: string) => {
  const configPath = path.resolve(__dirname, `../../config/${serverId}.json`);
  console.log('configPath:', configPath);
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  throw new Error(`Configuration for server ${serverId} not found.`);
};