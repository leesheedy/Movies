import { ProviderContext } from "../types";

const toAbsoluteUrl = (url: string, base: string): string => {
  if (!url) return url;
  if (url.startsWith("//")) return `https:${url}`;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
};

const extractFirst = (pattern: RegExp, text: string): string => {
  const match = pattern.exec(text);
  return match?.[1] ?? "";
};

export const buildVidsrcEmbedUrl = ({
  imdbId,
  type,
  season,
  episode,
}: {
  imdbId?: string;
  type?: string;
  season?: string | number;
  episode?: string | number;
}): string => {
  if (!imdbId) return "";
  if (type === "series" && season && episode) {
    return `https://vidsrc-embed.ru/embed/tv/${imdbId}/${season}-${episode}`;
  }
  return `https://vidsrc.to/embed/movie/${imdbId}`;
};

export const resolveVidsrcStreams = async (
  embedUrl: string,
  providerContext: ProviderContext
): Promise<string[]> => {
  if (!embedUrl) return [];

  const { axios, commonHeaders } = providerContext;
  const embedRes = await axios.get(embedUrl, {
    headers: {
      ...commonHeaders,
      Referer: embedUrl,
      "User-Agent": "Mozilla/5.0",
    },
  });
  const embedHtml = String(embedRes.data || "");
  const iframeSrc =
    extractFirst(/id=["']player_iframe["'][^>]*src=["']([^"']+)/i, embedHtml) ||
    extractFirst(/src=["'](\/\/cloudnestra\.com\/rcp\/[^"]+)/i, embedHtml);

  if (!iframeSrc) return [];

  const rcpUrl = toAbsoluteUrl(iframeSrc, embedUrl);
  const rcpRes = await axios.get(rcpUrl, {
    headers: {
      ...commonHeaders,
      Referer: embedUrl,
      "User-Agent": "Mozilla/5.0",
    },
  });
  const rcpHtml = String(rcpRes.data || "");
  const prorcpPath =
    extractFirst(/src:\s*'([^']+prorcp[^']+)'/i, rcpHtml) ||
    extractFirst(/src:\s*"([^"]+prorcp[^"]+)"/i, rcpHtml);

  if (!prorcpPath) return [];

  const prorcpUrl = toAbsoluteUrl(prorcpPath, rcpUrl);
  const prorcpRes = await axios.get(prorcpUrl, {
    headers: {
      ...commonHeaders,
      Referer: rcpUrl,
      "User-Agent": "Mozilla/5.0",
    },
  });
  const prorcpHtml = String(prorcpRes.data || "");
  const fileValue =
    extractFirst(/file\s*:\s*"([^"]+)"/i, prorcpHtml) ||
    extractFirst(/file\s*:\s*'([^']+)'/i, prorcpHtml);

  if (!fileValue) return [];

  const hostSuffix = new URL(rcpUrl).hostname;
  const replaced = fileValue.replace(/\{v\d+\}/g, hostSuffix);
  const parts = replaced
    .split(/\s+or\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => toAbsoluteUrl(part, prorcpUrl));

  return Array.from(new Set(parts));
};
