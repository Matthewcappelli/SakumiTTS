import "dotenv/config";
import { Readable } from "node:stream";
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Client, Events, GatewayIntentBits } from "discord.js";
import ffmpegPath from "ffmpeg-static";
import { findVoice, listVoices, synthesizeSpeech, voiceAutocomplete } from "./elevenlabs.js";
import {
  getGuildVoice,
  getReadChatChannel,
  isReadChatEnabled,
  loadStore,
  setGuildVoice,
  setReadChatEnabled,
} from "./store.js";

if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const { DISCORD_TOKEN } = process.env;
const MAX_TTS_CHARS = Number(process.env.MAX_TTS_CHARS ?? 500);

if (!DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const guildAudio = new Map();
const missingVoiceWarnings = new Set();

function getAudioState(guildId) {
  let state = guildAudio.get(guildId);

  if (!state) {
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    state = {
      player,
      queue: [],
      playing: false,
    };

    player.on(AudioPlayerStatus.Idle, () => {
      state.playing = false;
      void playNext(guildId);
    });

    player.on("error", (error) => {
      console.error(`Audio player error in guild ${guildId}:`, error);
      state.playing = false;
      void playNext(guildId);
    });

    guildAudio.set(guildId, state);
  }

  return state;
}

async function ensureConnectionForChannel(voiceChannel) {
  let connection = getVoiceConnection(voiceChannel.guild.id);

  if (connection && connection.joinConfig.channelId !== voiceChannel.id) {
    connection.destroy();
    connection = null;
  }

  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });
  }

  connection.subscribe(getAudioState(voiceChannel.guild.id).player);
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  return connection;
}

async function ensureConnection(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    throw new Error("Join a voice channel first.");
  }

  return ensureConnectionForChannel(voiceChannel);
}

async function playNext(guildId) {
  const state = getAudioState(guildId);

  if (state.playing || state.queue.length === 0) {
    return;
  }

  const item = state.queue.shift();
  const connection = getVoiceConnection(guildId);

  if (!connection) {
    return;
  }

  state.playing = true;
  const resource = createAudioResource(Readable.from(item.audio), {
    inputType: StreamType.Arbitrary,
  });
  state.player.play(resource);
}

async function enqueueSpeech(interaction, text, voiceInput) {
  if (text.length > MAX_TTS_CHARS) {
    throw new Error(`Please keep TTS under ${MAX_TTS_CHARS} characters.`);
  }

  await ensureConnection(interaction);

  const defaultVoice = getGuildVoice(interaction.guildId);
  const chosenVoice = await findVoice(voiceInput ?? defaultVoice);

  if (!chosenVoice) {
    throw new Error("Pick a voice with `/setvoice` or use the `voice` option on `/say`.");
  }

  const audio = await synthesizeSpeech(text, chosenVoice.id);
  const state = getAudioState(interaction.guildId);
  state.queue.push({ audio, voice: chosenVoice });
  await playNext(interaction.guildId);

  return chosenVoice;
}

async function enqueueVoiceChannelSpeech(guild, voiceChannel, text) {
  if (text.length > MAX_TTS_CHARS) {
    return null;
  }

  const defaultVoice = getGuildVoice(guild.id);
  const chosenVoice = await findVoice(defaultVoice);

  if (!chosenVoice) {
    if (!missingVoiceWarnings.has(guild.id)) {
      console.warn(`Read chat is enabled in guild ${guild.id}, but no default voice is set.`);
      missingVoiceWarnings.add(guild.id);
    }

    return null;
  }

  await ensureConnectionForChannel(voiceChannel);

  const audio = await synthesizeSpeech(text, chosenVoice.id);
  const state = getAudioState(guild.id);
  state.queue.push({ audio, voice: chosenVoice });
  await playNext(guild.id);

  return chosenVoice;
}

client.once(Events.ClientReady, async (readyClient) => {
  await loadStore();
  console.log(`Logged in as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused() ?? "";
      const choices = await voiceAutocomplete(String(focused));
      await interaction.respond(choices);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Use this bot inside a server.", ephemeral: true });
      return;
    }

    if (interaction.commandName === "join") {
      await interaction.deferReply({ ephemeral: true });
      await ensureConnection(interaction);
      await interaction.editReply("Joined your voice channel.");
      return;
    }

    if (interaction.commandName === "leave") {
      getVoiceConnection(interaction.guildId)?.destroy();
      guildAudio.delete(interaction.guildId);
      await interaction.reply({ content: "Left voice.", ephemeral: true });
      return;
    }

    if (interaction.commandName === "stop") {
      const state = getAudioState(interaction.guildId);
      state.queue = [];
      state.player.stop(true);
      await interaction.reply({ content: "Stopped TTS and cleared the queue.", ephemeral: true });
      return;
    }

    if (interaction.commandName === "voices") {
      await interaction.deferReply({ ephemeral: true });
      const voices = await listVoices({ force: true });
      const sample = voices
        .slice(0, 15)
        .map((voice) => `- ${voice.name} (${voice.category})`)
        .join("\n");
      await interaction.editReply(
        voices.length > 0
          ? `Found ${voices.length} voices. Start typing in a voice option to search.\n${sample}`
          : "No ElevenLabs voices were returned for this API key.",
      );
      return;
    }

    if (interaction.commandName === "readchat") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await setReadChatEnabled(interaction.guildId, enabled, interaction.channelId);
      const defaultVoice = getGuildVoice(interaction.guildId);
      await interaction.reply({
        content: enabled
          ? `Read chat is on for <#${interaction.channelId}>. I will only read messages from people who are in a voice channel.${defaultVoice ? "" : " Set a default voice with `/setvoice` before testing."}`
          : "Voice text chat reading is off.",
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "setvoice") {
      await interaction.deferReply({ ephemeral: true });
      const voiceInput = interaction.options.getString("voice", true);
      const voice = await findVoice(voiceInput);

      if (!voice) {
        await interaction.editReply("I could not find that voice. Try `/voices` or paste a voice ID.");
        return;
      }

      await setGuildVoice(interaction.guildId, voice.id);
      await interaction.editReply(`Default voice set to ${voice.name}.`);
      return;
    }

    if (interaction.commandName === "say") {
      await interaction.deferReply();
      const text = interaction.options.getString("text", true);
      const voiceInput = interaction.options.getString("voice", false);
      const voice = await enqueueSpeech(interaction, text, voiceInput);
      await interaction.editReply(`Speaking with ${voice.name}.`);
    }
  } catch (error) {
    console.error(error);
    const content = error instanceof Error ? error.message : "Something went wrong.";

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(content).catch(() => null);
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => null);
      }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.inGuild() || message.author.bot || !isReadChatEnabled(message.guildId)) {
      return;
    }

    const member = await message.guild.members.fetch(message.author.id);
    const configuredTextChannelId = getReadChatChannel(message.guildId);
    const isVoiceChannelTextChat =
      typeof message.channel.isVoiceBased === "function" && message.channel.isVoiceBased();
    const isConfiguredTextChannel = configuredTextChannelId === message.channelId;

    if (!isVoiceChannelTextChat && !isConfiguredTextChannel) {
      return;
    }

    const targetVoiceChannel = isVoiceChannelTextChat ? message.channel : member.voice.channel;

    if (!targetVoiceChannel) {
      return;
    }

    if (isVoiceChannelTextChat && member.voice.channelId !== message.channelId) {
      return;
    }

    const text = message.cleanContent.trim();

    if (!text) {
      console.warn(
        `Read chat saw a message in guild ${message.guildId}, but content was empty. Check Message Content Intent.`,
      );
      return;
    }

    await enqueueVoiceChannelSpeech(message.guild, targetVoiceChannel, text);
  } catch (error) {
    console.error("Could not read voice text chat message:", error);
  }
});

client.login(DISCORD_TOKEN);
