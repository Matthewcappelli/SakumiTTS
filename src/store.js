import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const STORE_PATH = path.join(DATA_DIR, "voice-settings.json");

let state = {
  guildDefaults: {},
  readChatEnabled: {},
};

export async function loadStore() {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    state = {
      ...state,
      ...JSON.parse(raw),
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not load ${STORE_PATH}:`, error);
    }
  }
}

export function getGuildVoice(guildId) {
  return state.guildDefaults[guildId] ?? null;
}

export function isReadChatEnabled(guildId) {
  return state.readChatEnabled[guildId] ?? false;
}

export async function setGuildVoice(guildId, voiceId) {
  state.guildDefaults[guildId] = voiceId;
  await saveStore();
}

export async function setReadChatEnabled(guildId, enabled) {
  state.readChatEnabled[guildId] = enabled;
  await saveStore();
}

async function saveStore() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(state, null, 2));
}
