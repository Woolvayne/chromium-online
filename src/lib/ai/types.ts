/**
 * Einheitliches Provider-Interface für alle KI-Anbieter.
 * Neue Anbieter lassen sich durch eine weitere Implementierung
 * von AIProvider + Eintrag in registry.ts hinzufügen.
 */

export type ProviderId = "mistral" | "openai" | "qwen" | "compatible";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  usage?: UsageInfo;
  finishReason?: string;
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export type TokenCallback = (delta: string) => void;

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  models?: string[];
  error?: string;
}

export interface AIProviderConfig {
  provider: ProviderId;
  apiKey: string;
  baseUrl?: string | null;
  model: string;
}

export interface AIProvider {
  readonly id: ProviderId;
  readonly baseUrl: string;
  /** Führt eine Chat-Completion aus; streamt Tokens über onToken. */
  chat(params: ChatParams, onToken?: TokenCallback): Promise<ChatResult>;
  /** Prüft Erreichbarkeit + Key, liefert ggf. Modelle. */
  testConnection(): Promise<ConnectionTestResult>;
  /** Listet verfügbare Modelle des Anbieters. */
  listModels(): Promise<string[]>;
}
