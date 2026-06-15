# Railway ElevenLabs TTS Discord Bot

Discord slash-command TTS bot that joins a voice channel, calls ElevenLabs for speech, and plays the generated audio. Voice selection is built in through Discord autocomplete.

## Commands

- `/join` - join your current voice channel.
- `/leave` - disconnect from voice.
- `/say text voice` - speak text with an optional ElevenLabs voice. The `voice` option autocompletes from your ElevenLabs account.
- `/setvoice voice` - save a default voice for the server.
- `/voices search` - show account voices and shared ElevenLabs library voices.
- `/readchat enabled channel` - turn on reading messages from a text channel. The bot only reads messages from users currently connected to a voice channel.
- `/ttsstatus` - show read-chat settings and the last read-chat event.
- `/ttstest` - speak a test line in your current voice channel.
- `/stop` - stop the current audio and clear the queue.

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `ELEVENLABS_API_KEY`.
3. Optional: set `DISCORD_GUILD_ID` to one test server for instant slash-command updates.
4. Install and deploy commands:

```bash
npm install
npm run deploy:commands
npm start
```

## Railway setup

1. Push this folder to GitHub.
2. Create a Railway service from the repo.
3. Add these variables in Railway:

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
ELEVENLABS_API_KEY
```

Optional Railway variables:

```text
DISCORD_GUILD_ID
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
MAX_TTS_CHARS=500
```

Railway will run:

```bash
npm run deploy:commands && npm start
```

## Discord bot permissions

In the Discord Developer Portal, enable these bot settings:

- Server Members Intent is not required.
- Message Content Intent is required for `/readchat enabled:true`.
- Add the bot with `applications.commands`, `bot`, `Connect`, and `Speak`.

## Reading voice channel text chat

Run this once in your server:

```text
/readchat enabled:true channel:#your-text-channel
```

Pick a normal text channel for `channel`, not the voice channel chat. After that, when someone types in that text channel, the bot reads the message only if that person is currently inside a voice channel. Use this to turn it off:

```text
/readchat enabled:false
```

If it does not read messages, run:

```text
/ttstest
/ttsstatus
```

If `/ttstest` speaks but chat messages do not, the voice/audio path works and the issue is the read channel, Message Content Intent, or bot channel permissions. If the last read-chat event says Discord sent empty content, turn on Message Content Intent in the Discord Developer Portal and restart Railway.

## ElevenLabs notes

The bot uses the current ElevenLabs REST API: `GET /v2/voices` and `GET /v1/shared-voices` to populate choices, then `POST /v1/text-to-speech/:voice_id` to generate audio. Your API key and ElevenLabs plan control which voices can actually be used for speech.

If autocomplete cannot reach ElevenLabs, you can paste a raw `voice_id` into the `voice` option.

Autocomplete searches both your account voices and shared ElevenLabs voices. Free ElevenLabs plans may not be allowed to use shared/library voices through the API. If Railway logs show `paid_plan_required`, choose a non-library voice from your account or upgrade ElevenLabs.
