import { Stream, ProviderContext } from "../types";
import { buildVidsrcEmbedUrl, resolveVidsrcStreams } from "./vidsrcUtils";

const parsePayload = (value: string): Record<string, any> => {
  try {
    return JSON.parse(value);
  } catch {
    return { imdbId: value };
  }
};

export const createVidsrcStream = (serverLabel: string) => {
  return async ({
    link,
    type,
    providerContext,
  }: {
    link: string;
    type: string;
    providerContext: ProviderContext;
  }): Promise<Stream[]> => {
    try {
      const payload = parsePayload(link);
      const resolvedType = payload.type ?? type;
      const embedUrl =
        payload.embedUrl ||
        buildVidsrcEmbedUrl({
          imdbId: payload.imdbId,
          type: resolvedType,
          season: payload.season,
          episode: payload.episode,
        });

      const candidates = embedUrl ? [embedUrl] : [];

      if (resolvedType === "movie" && payload.imdbId) {
        const fallbackMovieUrl = `https://vidsrc-embed.ru/embed/movie/${payload.imdbId}`;
        if (!candidates.includes(fallbackMovieUrl)) {
          candidates.push(fallbackMovieUrl);
        }
      }

      for (const candidate of candidates) {
        const urls = await resolveVidsrcStreams(candidate, providerContext);
        if (urls.length > 0) {
          return urls.map((streamUrl) => ({
            server: serverLabel,
            link: streamUrl,
            type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4",
            headers: {
              Referer: "https://cloudnestra.com/",
              Origin: "https://cloudnestra.com",
            },
          }));
        }
      }

      return [];
    } catch (err) {
      console.error("vidsrc stream error", err);
      return [];
    }
  };
};

export const getStream = createVidsrcStream("vidsrc");
