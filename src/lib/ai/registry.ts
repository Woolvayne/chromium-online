import { OpenAICompatibleProvider } from "./openai-compatible";
import type { AIProvider, AIProviderConfig, ProviderId } from "./types";

/**
 * Provider-Registry: Alle unterstützten Anbieter mit Standardwerten.
 * Neue Anbieter = neuer Eintrag hier (solange OpenAI-kompatibel)
 * oder neue AIProvider-Implementierung.
 */

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  description: string;
  defaultBaseUrl: string;
  requiresBaseUrl: boolean;
  defaultModel: string;
  suggestedModels: string[];
  keyPlaceholder: string;
  docsUrl: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  mistral: {
    id: "mistral",
    label: "Mistral AI",
    description: "Offizielle Mistral-API (La Plateforme) mit Tool-Calling.",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    requiresBaseUrl: false,
    defaultModel: "mistral-small-latest",
    suggestedModels: [
      "mistral-small-latest",
      "mistral-medium-latest",
      "mistral-large-latest",
      "open-mistral-nemo",
      "codestral-latest",
    ],
    keyPlaceholder: "••••••••••••••••",
    docsUrl: "https://console.mistral.ai/",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "Offizielle OpenAI-API (GPT-Modelle) mit Tool-Calling.",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresBaseUrl: false,
    defaultModel: "gpt-4o-mini",
    suggestedModels: [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1-mini",
      "gpt-4.1",
      "o4-mini",
    ],
    keyPlaceholder: "sk-…",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  qwen: {
    id: "qwen",
    label: "Qwen (Alibaba)",
    description: "Qwen-Modelle über DashScope im OpenAI-kompatiblen Modus.",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    requiresBaseUrl: false,
    defaultModel: "qwen-plus",
    suggestedModels: [
      "qwen-plus",
      "qwen-turbo",
      "qwen-max",
      "qwen3-32b",
      "qwen3-14b",
    ],
    keyPlaceholder: "sk-…",
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio/",
  },
  compatible: {
    id: "compatible",
    label: "OpenAI-kompatibel",
    description:
      "Beliebiger OpenAI-kompatibler Endpunkt (Ollama, OpenRouter, LM Studio, vLLM, …).",
    defaultBaseUrl: "",
    requiresBaseUrl: true,
    defaultModel: "",
    suggestedModels: [],
    keyPlaceholder: "API-Key oder beliebiger Platzhalter (z. B. bei Ollama)",
    docsUrl: "",
  },
};

export function createProvider(cfg: AIProviderConfig): AIProvider {
  const meta = PROVIDERS[cfg.provider];
  if (!meta) throw new Error(`Unbekannter Anbieter: ${cfg.provider}`);
  if (meta.requiresBaseUrl && !cfg.baseUrl?.trim()) {
    throw new Error(
      `${meta.label}: Eine Base URL ist erforderlich (z. B. http://localhost:11434/v1).`
    );
  }
  return new OpenAICompatibleProvider(
    cfg.provider,
    cfg,
    meta.defaultBaseUrl || "http://localhost:11434/v1"
  );
}

/** Fallback-Provider aus Umgebungsvariablen, falls keine Konfiguration gespeichert ist. */
export function envFallbackConfig(): AIProviderConfig | null {
  const apiKey = process.env.DEFAULT_AI_API_KEY;
  const provider = (process.env.DEFAULT_AI_PROVIDER ?? "mistral") as ProviderId;
  if (!apiKey || !PROVIDERS[provider]) return null;
  return {
    provider,
    apiKey,
    baseUrl: process.env.DEFAULT_AI_BASE_URL || null,
    model:
      process.env.DEFAULT_AI_MODEL || PROVIDERS[provider].defaultModel || "",
  };
}
