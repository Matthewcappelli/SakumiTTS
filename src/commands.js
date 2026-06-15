import { ChannelType, SlashCommandBuilder } from "discord.js";

const voiceOption = (option) =>
  option
    .setName("voice")
    .setDescription("ElevenLabs voice name or ID")
    .setAutocomplete(true)
    .setRequired(false);

export const commands = [
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join your current voice channel."),
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Leave the current voice channel."),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Speak text in your voice channel with ElevenLabs.")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Text to say")
        .setRequired(true)
        .setMaxLength(Number(process.env.MAX_TTS_CHARS ?? 500)),
    )
    .addStringOption(voiceOption),
  new SlashCommandBuilder()
    .setName("setvoice")
    .setDescription("Set the server default ElevenLabs voice.")
    .addStringOption((option) => voiceOption(option).setRequired(true)),
  new SlashCommandBuilder()
    .setName("voices")
    .setDescription("List available ElevenLabs voices."),
  new SlashCommandBuilder()
    .setName("readchat")
    .setDescription("Read messages from voice channel text chat.")
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Turn voice text chat reading on or off")
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Text channel to read from")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("ttsstatus")
    .setDescription("Show TTS read-chat settings and the last read-chat event."),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop speaking and clear the queue."),
].map((command) => command.toJSON());
