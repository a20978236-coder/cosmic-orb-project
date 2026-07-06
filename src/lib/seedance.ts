/**
 * Seedance 2 Mini video generation, via muapi.ai.
 *
 * NOTE: unlike the chat/STT/TTS pipeline, this is a paid, metered API —
 * there is no free tier. Seedance 2 Mini runs about $0.073/sec of output
 * video. Get a key at https://muapi.ai/access-keys and set it as
 * SEEDANCE_V2_API_KEY in your environment.
 */

const MUAPI_BASE = "https://api.muapi.ai/api/v1";

// Seedance 2 Mini text-to-video endpoint (cheapest/fastest tier).
const T2V_ENDPOINT = `${MUAPI_BASE}/seedance-2-mini-text-to-video`;

export type VideoResolution = "480p" | "720p";

export type SubmitVideoParams = {
  prompt: string;
  aspect_ratio?: string;
  resolution?: VideoResolution;
  duration?: number;
};

export type VideoStatusResult =
  | { status: "processing" }
  | { status: "completed"; url: string }
  | { status: "failed"; error: string };

function getApiKey(): string {
  const key = process.env.SEEDANCE_V2_API_KEY;
  if (!key) {
    throw new Error(
      "Missing SEEDANCE_V2_API_KEY. Get a paid muapi.ai key at https://muapi.ai/access-keys and add it to your environment.",
    );
  }
  return key;
}

/** Kick off a text-to-video generation job. Returns muapi's request_id. */
export async function submitVideo({
  prompt,
  aspect_ratio = "16:9",
  resolution = "480p",
  duration = 5,
}: SubmitVideoParams): Promise<string> {
  const apiKey = getApiKey();

  const res = await fetch(T2V_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio,
      duration,
      quality: "basic",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Seedance submission failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { request_id?: string };
  if (!data.request_id) throw new Error("No request_id received from Seedance API");
  return data.request_id;
}

/** Poll a previously-submitted job for completion. */
export async function checkVideo(requestId: string): Promise<VideoStatusResult> {
  const apiKey = getApiKey();

  const res = await fetch(`${MUAPI_BASE}/predictions/${requestId}/result`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Seedance status check failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    status?: string;
    state?: string;
    outputs?: string[];
    output?: string | { urls?: { get?: string } };
    error?: string;
  };

  const status = data.status || data.state;

  if (status === "completed" || status === "succeeded") {
    const outputs = data.outputs || [];
    const url =
      outputs[0] ||
      (typeof data.output === "string" ? data.output : data.output?.urls?.get);
    if (!url) throw new Error("Seedance reported completion but returned no output URL");
    return { status: "completed", url };
  }

  if (status === "failed") {
    return { status: "failed", error: data.error || "Generation failed" };
  }

  return { status: "processing" };
}
