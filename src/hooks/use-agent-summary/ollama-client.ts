/**
 * Simple Ollama client for local LLM summarization
 */

const OLLAMA_URL = "http://localhost:11434";

export interface OllamaResponse {
  response: string;
  done: boolean;
}

/**
 * Generate a completion from Ollama
 */
export async function generateCompletion(
  model: string,
  prompt: string,
  options?: { timeout?: number },
): Promise<string> {
  const timeout = options?.timeout ?? 10000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = (await response.json()) as OllamaResponse;
    return data.response.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if Ollama is available
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
