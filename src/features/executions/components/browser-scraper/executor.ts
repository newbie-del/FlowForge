import { load } from "cheerio";
import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { browserScraperNodeChannel } from "@/inngest/channels/browser-scraper-node";

type SelectorExtractType = "text" | "html" | "attr";
type BrowserScraperMode = "simple_fetch" | "html_scrape" | "extract_data";

type BrowserScraperSelector = {
  key?: string;
  selector?: string;
  extract?: SelectorExtractType;
  attr?: string;
  multiple?: boolean;
};

type BrowserScraperNodeData = {
  variableName?: string;
  url?: string;
  method?: "GET" | "POST";
  mode?: BrowserScraperMode;
  requestBody?: string;
  headersJson?: string;
  userAgent?: "default" | "chrome" | "firefox" | "custom";
  customUserAgent?: string;
  timeoutMs?: number;
  followRedirects?: boolean;
  selectors?: BrowserScraperSelector[];
};

const userAgentByPreset = {
  default:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) FlowforgeBot/1.0",
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  firefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
  custom: "",
} as const;

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);
  return safeString;
});

function parseHeaders(
  headersJson: string | undefined,
  context: Record<string, unknown>,
) {
  if (!headersJson?.trim()) return {};
  try {
    const parsed = JSON.parse(headersJson) as Record<string, unknown>;
    return Object.entries(parsed).reduce(
      (acc, [key, value]) => {
        if (typeof value === "string") {
          acc[key] = Handlebars.compile(value)(context);
        } else {
          acc[key] = String(value);
        }
        return acc;
      },
      {} as Record<string, string>,
    );
  } catch {
    throw new NonRetriableError(
      "BROWSER/SCRAPER node headers JSON is invalid.",
    );
  }
}

function extractSelectorValue(
  $: ReturnType<typeof load>,
  config: BrowserScraperSelector,
) {
  const selector = String(config.selector ?? "").trim();
  if (!selector) {
    throw new NonRetriableError("BROWSER/SCRAPER selector cannot be empty.");
  }
  const key = String(config.key ?? "").trim();
  if (!key) {
    throw new NonRetriableError(
      "BROWSER/SCRAPER selector key cannot be empty.",
    );
  }

  const matches = $(selector);
  if (matches.length === 0) {
    throw new NonRetriableError(
      `BROWSER/SCRAPER selector not found for key "${key}" (${selector}).`,
    );
  }

  const extract = config.extract ?? "text";
  const isMultiple = Boolean(config.multiple);
  const attrName = String(config.attr ?? "").trim();

  if (isMultiple) {
    return matches
      .toArray()
      .map((element) => {
        const item = $(element);
        if (extract === "html") return item.html() ?? "";
        if (extract === "attr") return item.attr(attrName) ?? "";
        return item.text().trim();
      })
      .filter((value) => value !== "");
  }

  const first = matches.first();
  if (extract === "html") return first.html() ?? "";
  if (extract === "attr") return first.attr(attrName) ?? "";
  return first.text().trim();
}

export const browserScraperExecutor: NodeExecutor<
  BrowserScraperNodeData
> = async ({ data, nodeId, context, step, publish }) => {
  await publish(
    browserScraperNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const variableName = String(data.variableName ?? "scraperResult").trim();
    const mode: BrowserScraperMode = (data.mode ??
      "simple_fetch") as BrowserScraperMode;
    const method = data.method === "POST" ? "POST" : "GET";
    const followRedirects = data.followRedirects ?? true;
    const timeoutMs = Number(data.timeoutMs ?? 15000);
    const rawUrl = String(data.url ?? "").trim();
    const compiledUrl = rawUrl ? Handlebars.compile(rawUrl)(context) : "";
    const userAgentPreset = data.userAgent ?? "default";
    const userAgent =
      userAgentPreset === "custom"
        ? String(data.customUserAgent ?? "").trim()
        : userAgentByPreset[userAgentPreset];

    if (!variableName) {
      throw new NonRetriableError(
        "BROWSER/SCRAPER node variableName is required.",
      );
    }
    if (!compiledUrl) {
      throw new NonRetriableError("BROWSER/SCRAPER node URL is required.");
    }
    try {
      new URL(compiledUrl);
    } catch {
      throw new NonRetriableError("BROWSER/SCRAPER node URL is invalid.");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
      throw new NonRetriableError(
        "BROWSER/SCRAPER node timeout must be between 1000 and 120000 ms.",
      );
    }

    const headers = parseHeaders(data.headersJson, context);
    if (userAgent) {
      headers["User-Agent"] = userAgent;
    }

    const responsePayload = await step.run(
      `browser-scraper-${nodeId}`,
      async () => {
        const requestBody =
          method === "POST" && typeof data.requestBody === "string"
            ? Handlebars.compile(data.requestBody)(context)
            : undefined;

        const response = await ky(compiledUrl, {
          method,
          timeout: timeoutMs,
          redirect: followRedirects ? "follow" : "manual",
          throwHttpErrors: false,
          headers,
          body: requestBody?.trim() ? requestBody : undefined,
        });

        if (response.status === 403 || response.status === 429) {
          throw new NonRetriableError(
            `BROWSER/SCRAPER request blocked by target site (status ${response.status}).`,
          );
        }
        if (!response.ok) {
          throw new NonRetriableError(
            `BROWSER/SCRAPER request failed with status ${response.status}.`,
          );
        }

        const html = await response.text();
        const $ = load(html);
        const title = $("title").first().text().trim();
        const pageText = $("body").text().replace(/\s+/g, " ").trim();
        const links = $("a[href]")
          .toArray()
          .map((node) => $(node).attr("href") ?? "")
          .filter(Boolean);
        const listItems = $("li")
          .toArray()
          .map((node) => $(node).text().trim())
          .filter(Boolean);

        const selectorsOutput: Record<string, unknown> = {};
        if (mode === "extract_data") {
          const selectors = Array.isArray(data.selectors) ? data.selectors : [];
          if (selectors.length === 0) {
            throw new NonRetriableError(
              "BROWSER/SCRAPER extract mode requires at least one selector.",
            );
          }
          for (const selectorConfig of selectors) {
            const key = String(selectorConfig.key ?? "").trim();
            selectorsOutput[key] = extractSelectorValue($, selectorConfig);
          }
        }

        if (mode === "simple_fetch") {
          return {
            url: compiledUrl,
            status: response.status,
            html,
          };
        }

        if (mode === "html_scrape") {
          return {
            url: compiledUrl,
            status: response.status,
            title,
            text: pageText,
            links,
            listItems,
            html,
          };
        }

        return {
          url: compiledUrl,
          status: response.status,
          title,
          text: pageText,
          links,
          listItems,
          extracted: selectorsOutput,
          html,
        };
      },
    );

    await publish(
      browserScraperNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return {
      ...context,
      [variableName]: responsePayload,
    };
  } catch (error) {
    await publish(
      browserScraperNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
