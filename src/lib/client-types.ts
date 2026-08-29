/** Gemeinsame Typen für die Client-Komponenten (müssen JSON-serialisierbar sein). */

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  loading: boolean;
}

export interface BrowserState {
  activeTabId: string;
  tabs: TabInfo[];
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
}

export interface ActivityItem {
  id: string;
  text: string;
  state: "running" | "done" | "error";
}

export interface ApprovalItem {
  approvalId: string;
  tool: string;
  description: string;
}

export interface ConsoleLog {
  ts: number;
  type: string;
  text: string;
}

export interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ProviderStatus {
  label: string;
  model: string;
} 
