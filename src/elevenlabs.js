const API_BASE = "https://api.elevenlabs.io";
const DEFAULT_MODEL = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const VOICE_CACHE_MS = 5 * 60 * 1000;

let cachedVoices = [];
let cachedAt = 0;

function getApiKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY.");
  }
  return apiKey;
}

async function elevenFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "xi-api-key": getApiKey(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message = getElevenLabsErrorMessage(response.status, detail);
    throw new Error(message);
  }

  return response;
}

function getElevenLabsErrorMessage(status, detail) {
  try {
    const parsed = JSON.parse(detail);
    const error = parsed.detail ?? parsed;
    const code = error.code ?? parsed.code;
    const message = error.message ?? parsed.message;

    if (status === 402 || code === "paid_plan_required") {
      return "ElevenLabs rejected that voice because it requires a paid plan. Pick a non-library voice from your account, or upgrade ElevenLabs.";
    }

    if (message) {
      return `ElevenLabs API ${status}: ${message}`;
    }
  } catch {
    // Fall back to the raw response below.
  }

  return `ElevenLabs API ${status}: ${detail || "request failed"}`;
}

export async function listVoices({ force = false } = {}) {
  if (!force && cachedVoices.length > 0 && Date.now() - cachedAt < VOICE_CACHE_MS) {
    return cachedVoices;
  }

  const response = await elevenFetch("/v2/voices");
  const data = await response.json();

  cachedVoices = (data.voices ?? [])
    .filter((voice) => voice.voice_id && voice.name)
    .map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      category: voice.category ?? "voice",
      description: voice.description ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cachedAt = Date.now();

  return cachedVoices;
}

export async function findVoice(input) {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toLowerCase();
  const voices = await listVoices();

  return (
    voices.find((voice) => voice.id === input.trim()) ??
    voices.find((voice) => voice.name.toLowerCase() === normalized) ??
    voices.find((voice) => voice.name.toLowerCase().includes(normalized)) ??
    null
  );
}

export async function voiceAutocomplete(focusedValue) {
  const normalized = focusedValue.toLowerCase();
  const voices = await listVoices();

  return voices
    .filter((voice) => {
      return (
        voice.name.toLowerCase().includes(normalized) ||
        voice.id.toLowerCase().includes(normalized)
      );
    })
    .slice(0, 25)
    .map((voice) => ({
      name: `${voice.name} (${voice.category})`.slice(0, 100),
      value: voice.id,
    }));
}

export async function synthesizeSpeech(text, voiceId) {
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT ?? DEFAULT_OUTPUT_FORMAT;
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_MODEL;
  const searchParams = new URLSearchParams({ output_format: outputFormat });

  const response = await elevenFetch(
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}?${searchParams}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
    },
  );

  return Buffer.from(await response.arrayBuffer());
}
