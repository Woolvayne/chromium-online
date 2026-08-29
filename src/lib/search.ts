/**
 * Schlüssellose Websuche über das DuckDuckGo-HTML-Endpoint.
 * Wird dem Agenten als `search_web`-Tool zur Verfügung gestellt.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, "")
    .trim();
}

export async function searchWeb(
  query: string,
  limit = 8
): Promise<WebSearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Suche fehlgeschlagen (HTTP ${res.status})`);
  const html = await res.text();

  const results: WebSearchResult[] = [];
  const blockRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null && results.length < limit) {
    let href = decodeEntities(match[1]);
    // DuckDuckGo leitet über //duckduckgo.com/l/?uddg=<url> weiter
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    results.push({
      title: decodeEntities(match[2]),
      url: href,
      snippet: "",
    });
  }

  // Snippets ungefähr zuordnen
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let i = 0;
  while ((match = snippetRe.exec(html)) !== null && i < results.length) {
    results[i].snippet = decodeEntities(match[1]).slice(0, 280);
    i += 1;
  }
  return results;
}
