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
      const embedUrl =
        payload.embedUrl ||
        buildVidsrcEmbedUrl({
          imdbId: payload.imdbId,
          type: payload.type ?? type,
          season: payload.season,
          episode: payload.episode,
        });

      if (!embedUrl) return [];

      const urls = await resolveVidsrcStreams(embedUrl, providerContext);
      return urls.map((streamUrl) => ({
        server: serverLabel,
        link: streamUrl,
        type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4",
        headers: {
          Referer: "https://cloudnestra.com/",
          Origin: "https://cloudnestra.com",
        },
      }));
    } catch (err) {
      console.error("vidsrc stream error", err);
      return [];
    }
  };
};

export const getStream = createVidsrcStream("vidsrc");
