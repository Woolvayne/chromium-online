import type { Page } from "playwright";
import { searchWeb } from "@/lib/search";
import type { ToolDefinition } from "@/lib/ai/types";
import {
  assertPublicUrl,
  navigateTo,
  type BrowserSession,
} from "./manager";

/**
 * Tool-System des Browser-Agenten.
 * Jedes Tool hat eine Risikostufe, die das Berechtigungssystem steuert:
 *  - read:      nur lesend, nie bestätigungspflichtig
 *  - navigate:  ungefährliche Navigation (mit Auto-Approve automatisch)
 *  - interact:  verändert Seitenzustand / gibt Daten ein → immer bestätigen,
 *               es sei denn der Nutzer erlaubt explizit Interaktionen
 */

export type RiskLevel = "read" | "navigate" | "interact";

export interface BrowserTool {
  risk: RiskLevel;
  definition: ToolDefinition;
}

const prop = (type: string, description: string, extra?: object) => ({
  type,
  description,
  ...extra,
});

export const BROWSER_TOOLS: BrowserTool[] = [
  {
    risk: "navigate",
    definition: {
      type: "function",
      function: {
        name: "navigate",
        description:
          "Öffnet eine URL im aktiven Browser-Tab. Auch Suchbegriffe sind erlaubt.",
        parameters: {
          type: "object",
          properties: {
            url: prop("string", "Vollständige URL (https://…) oder Suchbegriff"),
          },
          required: ["url"],
        },
      },
    },
  },
  {
    risk: "navigate",
    definition: {
      type: "function",
      function: {
        name: "go_back",
        description: "Navigiert im Verlauf zurück.",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    risk: "navigate",
    definition: {
      type: "function",
      function: {
        name: "reload_page",
        description: "Lädt die aktuelle Seite neu.",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    risk: "navigate",
    definition: {
      type: "function",
      function: {
        name: "scroll",
        description: "Scrollt die Seite nach oben oder unten.",
        parameters: {
          type: "object",
          properties: {
            direction: prop("string", "'up' oder 'down'", {
              enum: ["up", "down"],
            }),
            amount: prop("number", "Pixel (Standard: 700)"),
          },
          required: ["direction"],
        },
      },
    },
  },
  {
    risk: "read",
    definition: {
      type: "function",
      function: {
        name: "get_current_page",
        description: "Liefert URL und Titel des aktiven Tabs.",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    risk: "read",
    definition: {
      type: "function",
      function: {
        name: "get_page_text",
        description:
          "Extrahiert den sichtbaren Text der Seite (bereinigt, gekürzt).",
        parameters: {
          type: "object",
          properties: {
            maxChars: prop("number", "Max. Zeichen (Standard: 6000)"),
          },
        },
      },
    },
  },
  {
    risk: "read",
    definition: {
      type: "function",
      function: {
        name: "get_page_links",
        description: "Listet Links der Seite (Text + URL).",
        parameters: {
          type: "object",
          properties: { limit: prop("number", "Max. Anzahl (Standard: 50)") },
        },
      },
    },
  },
  {
    risk: "read",
    definition: {
      type: "function",
      function: {
        name: "get_interactive_elements",
        description:
          "Listet anklickbare/eingabefähige Elemente mit CSS-Selektoren. Nutze diese Selektoren für click_element und type_text.",
        parameters: {
          type: "object",
          properties: { limit: prop("number", "Max. Anzahl (Standard: 40)") },
        },
      },
    },
  },
  {
    risk: "interact",
    definition: {
      type: "function",
      function: {
        name: "click_element",
        description:
          "Klickt ein Element. Entweder CSS-Selektor (aus get_interactive_elements) oder sichtbarer Text angeben.",
        parameters: {
          type: "object",
          properties: {
            selector: prop("string", "CSS-Selektor des Elements"),
            text: prop("string", "Sichtbarer Text des Elements (Fallback)"),
          },
        },
      },
    },
  },
  {
    risk: "interact",
    definition: {
      type: "function",
      function: {
        name: "type_text",
        description:
          "Tippt Text in ein Eingabefeld (ersetzt vorhandenen Inhalt).",
        parameters: {
          type: "object",
          properties: {
            selector: prop("string", "CSS-Selektor des Eingabefelds"),
            text: prop("string", "Einzugebender Text"),
            submit: prop(
              "boolean",
              "Enter drücken nach der Eingabe (z. B. Suche absenden)"
            ),
          },
          required: ["text"],
        },
      },
    },
  },
  {
    risk: "read",
    definition: {
      type: "function",
      function: {
        name: "search_web",
        description:
          "Führt eine Websuche (DuckDuckGo) durch und liefert Ergebnisse mit Titel, URL und Snippet.",
        parameters: {
          type: "object",
          properties: { query: prop("string", "Suchanfrage") },
          required: ["query"],
        },
      },
    },
  },
  {
    risk: "read",
    definition: {
      type: "function",
      function: {
        name: "take_screenshot",
        description:
          "Erstellt einen Screenshot des aktuellen Tabs (wird dem Nutzer angezeigt).",
        parameters: { type: "object", properties: {} },
      },
    },
  },
];

export function riskOf(toolName: string): RiskLevel {
  return BROWSER_TOOLS.find((t) => t.definition.function.name === toolName)?.risk ?? "interact";
}

/** Menschenlesbare Beschreibung für die Bestätigungs-Karte. */
export function describeAction(
  toolName: string,
  args: Record<string, unknown>
): string {
  const s = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  switch (toolName) {
    case "navigate":
      return `Webseite öffnen: ${s(args.url)}`;
    case "go_back":
      return "Zur vorherigen Seite zurückkehren";
    case "reload_page":
      return "Seite neu laden";
    case "scroll":
      return `Seite ${args.direction === "up" ? "nach oben" : "nach unten"} scrollen`;
    case "click_element":
      return `Element anklicken: ${s(args.selector ?? args.text ?? "")}`;
    case "type_text":
      return `Text eingeben in ${s(args.selector ?? "Feld")}: „${s(args.text).slice(0, 60)}“${args.submit ? " und absenden" : ""}`;
    case "search_web":
      return `Websuche: ${s(args.query)}`;
    default:
      return `Aktion ausführen: ${toolName}`;
  }
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// DOM-Extraktion (läuft im Seitenkontext)
// ---------------------------------------------------------------------------

async function extractText(page: Page, maxChars: number): Promise<string> {
  const text = await page.evaluate(() => {
    const walker = document.body?.innerText ?? "";
    return walker.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  });
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… [gekürzt]` : text;
}

async function extractLinks(
  page: Page,
  limit: number
): Promise<Array<{ text: string; url: string }>> {
  return page.evaluate((max) => {
    const seen = new Set<string>();
    const out: Array<{ text: string; url: string }> = [];
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const url = (a as HTMLAnchorElement).href;
      if (!/^https?:/.test(url) || seen.has(url)) continue;
      seen.add(url);
      const text = (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      out.push({ text: text || url, url });
      if (out.length >= max) break;
    }
    return out;
  }, limit);
}

async function extractInteractive(
  page: Page,
  limit: number
): Promise<Array<{ tag: string; label: string; selector: string }>> {
  return page.evaluate((max) => {
    const cssPath = (el: Element): string => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.body && parts.length < 4) {
        const tag = node.tagName.toLowerCase();
        const parent: Element | null = node.parentElement;
        if (!parent) break;
        const sameTag = Array.from(parent.children).filter(
          (c) => c.tagName === node!.tagName
        );
        const idx = sameTag.indexOf(node) + 1;
        parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
        node = parent;
      }
      return parts.join(" > ");
    };
    const nodes = Array.from(
      document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], summary'
      )
    );
    const out: Array<{ tag: string; label: string; selector: string }> = [];
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (
        rect.width < 1 ||
        rect.height < 1 ||
        style.visibility === "hidden" ||
        style.display === "none"
      )
        continue;
      const anyEl = el as HTMLElement & { value?: string };
      const label = (
        anyEl.getAttribute("aria-label") ??
        anyEl.getAttribute("placeholder") ??
        anyEl.getAttribute("title") ??
        anyEl.value ??
        anyEl.textContent ??
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      out.push({
        tag: el.tagName.toLowerCase(),
        label: label || "(ohne Beschriftung)",
        selector: cssPath(el),
      });
      if (out.length >= max) break;
    }
    return out;
  }, limit);
}

async function pageInfo(page: Page) {
  return {
    url: page.url(),
    title: await page.title().catch(() => ""),
  };
}

// ---------------------------------------------------------------------------
// Tool-Ausführung
// ---------------------------------------------------------------------------

export async function executeBrowserTool(
  session: BrowserSession,
  name: string,
  rawArgs: Record<string, unknown>
): Promise<ToolResult> {
  const page = session.activePage();
  const needPage = !["search_web"].includes(name);
  if (needPage && !page) return { ok: false, summary: "Kein aktiver Tab vorhanden" };
  session.touch();

  try {
    switch (name) {
      case "navigate": {
        const url = String(rawArgs.url ?? "");
        const info = await navigateTo(session, url);
        return {
          ok: true,
          summary: `Geöffnet: ${info.title || info.url}`,
          data: info,
        };
      }
      case "go_back": {
        await page!.goBack({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
        const info = await pageInfo(page!);
        return { ok: true, summary: `Zurück zu: ${info.title || info.url}`, data: info };
      }
      case "reload_page": {
        await page!.reload({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
        return { ok: true, summary: "Seite neu geladen" };
      }
      case "scroll": {
        const amount = Number(rawArgs.amount ?? 700);
        const delta = rawArgs.direction === "up" ? -amount : amount;
        await page!.mouse.wheel(0, delta);
        await page!.waitForTimeout(350);
        return { ok: true, summary: `Gescrollt (${rawArgs.direction === "up" ? "hoch" : "runter"})` };
      }
      case "get_current_page": {
        const info = await pageInfo(page!);
        return { ok: true, summary: `${info.title} — ${info.url}`, data: info };
      }
      case "get_page_text": {
        const max = Math.min(Number(rawArgs.maxChars ?? 6000), 15000);
        const text = await extractText(page!, max);
        if (!text) return { ok: true, summary: "Die Seite enthält keinen sichtbaren Text.", data: "" };
        return {
          ok: true,
          summary: `Seitentext extrahiert (${text.length} Zeichen)`,
          data: text,
        };
      }
      case "get_page_links": {
        const limit = Math.min(Number(rawArgs.limit ?? 50), 120);
        const links = await extractLinks(page!, limit);
        return {
          ok: true,
          summary: `${links.length} Links gefunden`,
          data: links,
        };
      }
      case "get_interactive_elements": {
        const limit = Math.min(Number(rawArgs.limit ?? 40), 80);
        const elements = await extractInteractive(page!, limit);
        return {
          ok: true,
          summary: `${elements.length} interaktive Elemente gefunden`,
          data: elements,
        };
      }
      case "click_element": {
        const selector = typeof rawArgs.selector === "string" ? rawArgs.selector : "";
        const text = typeof rawArgs.text === "string" ? rawArgs.text : "";
        let clicked = "";
        if (selector) {
          await page!.click(selector, { timeout: 6_000 });
          clicked = selector;
        } else if (text) {
          await page!.getByText(text, { exact: false }).first().click({ timeout: 6_000 });
          clicked = `Text „${text}“`;
        } else {
          return { ok: false, summary: "Weder selector noch text angegeben" };
        }
        await page!.waitForLoadState("domcontentloaded", { timeout: 6_000 }).catch(() => undefined);
        const info = await pageInfo(page!);
        return { ok: true, summary: `Geklickt: ${clicked}`, data: info };
      }
      case "type_text": {
        const selector = typeof rawArgs.selector === "string" ? rawArgs.selector : "";
        const text = String(rawArgs.text ?? "");
        if (selector) {
          await page!.fill(selector, text, { timeout: 6_000 });
        } else {
          await page!.keyboard.insertText(text);
        }
        if (rawArgs.submit) {
          await page!.keyboard.press("Enter");
          await page!.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => undefined);
        }
        const info = await pageInfo(page!);
        return {
          ok: true,
          summary: `Text eingegeben („${text.slice(0, 40)}“)${rawArgs.submit ? " + abgesendet" : ""}`,
          data: info,
        };
      }
      case "search_web": {
        const query = String(rawArgs.query ?? "");
        const results = await searchWeb(query, 8);
        return {
          ok: true,
          summary: `${results.length} Suchergebnisse für „${query}“`,
          data: results,
        };
      }
      case "take_screenshot": {
        const info = await pageInfo(page!);
        return {
          ok: true,
          summary: `Screenshot erstellt (${info.title || info.url})`,
          data: info,
        };
      }
      default:
        return { ok: false, summary: `Unbekanntes Tool: ${name}` };
    }
  } catch (err) {
    return {
      ok: false,
      summary: `Fehler bei ${name}: ${(err as Error).message.slice(0, 300)}`,
    };
  }
}

export { assertPublicUrl };
