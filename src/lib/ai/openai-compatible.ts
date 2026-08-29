import type {
  AIProvider,
  AIProviderConfig,
  ChatParams,
  ChatResult,
  ConnectionTestResult,
  ProviderId,
  TokenCallback,
  ToolCall,
  UsageInfo,
} from "./types";

/**
 * Generischer Client für OpenAI-kompatible Chat-Completions-APIs.
 * Wird von allen Anbietern genutzt (Mistral, OpenAI, Qwen/DashScope,
 * Ollama, OpenRouter, LM Studio, ...), da alle dasselbe
 * /chat/completions-Format + SSE-Streaming unterstützen.
 *
 * Sicherheit: API-Keys verlassen den Server nie; Fehlermeldungen
 * enthalten keine Secrets.
 */

interface StreamToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: StreamToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    readonly id: ProviderId,
    cfg: AIProviderConfig,
    defaultBaseUrl: string
  ) {
    const raw = (cfg.baseUrl?.trim() || defaultBaseUrl).replace(/\/+$/, "");
    this.baseUrl = raw.endsWith("/v1") ? raw : `${raw}/v1`;
    this.apiKey = cfg.apiKey;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async chat(params: ChatParams, onToken?: TokenCallback): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.4,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools;
      body.tool_choice = "auto";
    }
    if (params.maxTokens) body.max_tokens = params.maxTokens;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (err) {
      throw new ProviderError(
        0,
        `Anbieter nicht erreichbar (${this.baseUrl}): ${(err as Error).message}`
      );
    }

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new ProviderError(
        res.status,
        `API-Fehler ${res.status}: ${detail.slice(0, 400) || res.statusText}`
      );
    }

    // SSE-Stream parsen (OpenAI-Chunk-Format, robust über Chunk-Grenzen hinweg)
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finishReason: string | undefined;
    let usage: UsageInfo | undefined;
    const toolCalls = new Map<number, ToolCall>();

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(payload) as StreamChunk;
      } catch {
        return; // unvollständiges/unkritisches Fragment ignorieren
      }
      if (chunk.error?.message) {
        throw new ProviderError(400, chunk.error.message);
      }
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) {
        content += choice.delta.content;
        onToken?.(choice.delta.content);
      }
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const existing = toolCalls.get(tc.index) ?? {
          id: tc.id ?? `call_${tc.index}_${Date.now()}`,
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.function.name += tc.function.name;
        if (tc.function?.arguments)
          existing.function.arguments += tc.function.arguments;
        toolCalls.set(tc.index, existing);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleLine(line);
      }
    }
    if (buffer.trim()) handleLine(buffer);

    return {
      content,
      toolCalls: [...toolCalls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, v]) => v)
        .filter((t) => t.function.name),
      usage,
      finishReason,
    };
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new ProviderError(res.status, `HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    return (json.data ?? [])
      .map((m) => m.id)
      .filter((v): v is string => Boolean(v))
      .sort();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      const models = await this.listModels();
      return { ok: true, latencyMs: Date.now() - started, models };
    } catch {
      // Manche Endpunkte (z. B. Ollama-Einstellungen) liefern /models anders:
      // Fallback über eine minimale Chat-Anfrage.
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            model: "ping",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        // 400/404 = Server erreichbar + Auth akzeptiert (Modell evtl. unbekannt)
        const ok = res.status < 500 && res.status !== 401 && res.status !== 403;
        return {
          ok,
          latencyMs: Date.now() - started,
          error: ok
            ? undefined
            : res.status === 401 || res.status === 403
              ? "Authentifizierung fehlgeschlagen – API-Key prüfen."
              : `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          error: (err as Error).message,
        };
      }
    }
  }
}
