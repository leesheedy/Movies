import crypto from "crypto";
import { ProviderContext } from "../types";

export interface ResolverStream {
  url: string;
  quality?: string;
  headers?: Record<string, string>;
}

export interface ProviderResolver {
  canHandle(url: string): boolean;
  resolve(embedUrl: string): Promise<ResolverStream[]>;
}

const MEGACLOUD_KEY_URL =
  "https://raw.githubusercontent.com/ryanwtf88/megacloud-keys/refs/heads/master/key.txt";
const FALLBACK_MEGACLOUD_KEY =
  "3709ad8892f413166b796a10c7fb86018bd1be1c7ae6f4d2cfc3fdc299cb3205";
const KEY_CACHE_DURATION_MS = 60 * 60 * 1000;

let cachedMegaCloudKey = FALLBACK_MEGACLOUD_KEY;
let cachedMegaCloudKeyAt = 0;

const extract = (pattern: RegExp, text: string): string => {
  const match = pattern.exec(text);
  return match?.[1] ?? "";
};

const ensureAbsoluteUrl = (url: string, baseUrl: string): string => {
  if (!url) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
};

const isHex = (value: string): boolean => /^[0-9a-f]+$/i.test(value);

const evpBytesToKey = (
  passphrase: string,
  salt: Buffer,
  keySize: number,
  ivSize: number
): { key: Buffer; iv: Buffer } => {
  let data = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (data.length < keySize + ivSize) {
    prev = crypto
      .createHash("md5")
      .update(Buffer.concat([prev, Buffer.from(passphrase), salt]))
      .digest();
    data = Buffer.concat([data, prev]);
  }
  return {
    key: data.slice(0, keySize),
    iv: data.slice(keySize, keySize + ivSize),
  };
};

const decryptOpenSsl = (encrypted: Buffer, passphrase: string): string => {
  if (encrypted.length < 16 || encrypted.slice(0, 8).toString() !== "Salted__") {
    throw new Error("Invalid OpenSSL payload");
  }
  const salt = encrypted.slice(8, 16);
  const data = encrypted.slice(16);
  const { key, iv } = evpBytesToKey(passphrase, salt, 32, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
};

const decryptWithKeyMaterial = (encrypted: Buffer, key: string): string => {
  const keyBuffer = isHex(key)
    ? Buffer.from(key, "hex")
    : crypto.createHash("sha256").update(key).digest();
  const iv = encrypted.slice(0, 16);
  const data = encrypted.slice(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
};

const decryptMegaCloud = (encrypted: string, key: string): any[] => {
  const trimmed = encrypted.trim();
  if (!trimmed) return [];

  try {
    const direct = JSON.parse(trimmed);
    if (Array.isArray(direct)) return direct;
  } catch {
    // not JSON yet, continue
  }

  const buffer = Buffer.from(trimmed, "base64");
  const attempts: Array<() => string> = [
    () => decryptOpenSsl(buffer, key),
    () => decryptWithKeyMaterial(buffer, key),
    () => {
      const zeroIv = Buffer.alloc(16, 0);
      const keyBuffer = isHex(key)
        ? Buffer.from(key, "hex")
        : crypto.createHash("sha256").update(key).digest();
      const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, zeroIv);
      return Buffer.concat([
        decipher.update(buffer),
        decipher.final(),
      ]).toString("utf8");
    },
  ];

  for (const attempt of attempts) {
    try {
      const decrypted = attempt();
      if (!decrypted) continue;
      const parsed = JSON.parse(decrypted);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try next decrypt strategy
    }
  }

  return [];
};

const getMegaCloudKey = async (
  providerContext: ProviderContext
): Promise<string> => {
  const now = Date.now();
  if (cachedMegaCloudKey && now - cachedMegaCloudKeyAt < KEY_CACHE_DURATION_MS) {
    return cachedMegaCloudKey;
  }

  try {
    const res = await providerContext.axios.get(MEGACLOUD_KEY_URL, {
      timeout: 5000,
    });
    const key = String(res.data || "").trim();
    if (key) {
      cachedMegaCloudKey = key;
      cachedMegaCloudKeyAt = now;
      return key;
    }
  } catch (error) {
    console.warn("MegaCloud key fetch failed, using cached key.", error);
  }

  return cachedMegaCloudKey;
};

export class MegaCloudResolver implements ProviderResolver {
  constructor(private providerContext: ProviderContext) {}

  canHandle(url: string): boolean {
    return url.includes("megacloud") || url.includes("mcloud");
  }

  async resolve(embedUrl: string): Promise<ResolverStream[]> {
    const { axios } = this.providerContext;
    const html = await axios.get(embedUrl, {
      headers: {
        Referer: embedUrl,
        "User-Agent": "Mozilla/5.0",
      },
    });

    const fileId =
      extract(/data-id=["'](.*?)["']/, html.data) ||
      extract(/data-id\s*=\s*(\d+)/, html.data);

    if (!fileId) {
      return [];
    }

    const apiUrl = `https://megacloud.tv/embed-2/ajax/e-1/getSources?id=${fileId}`;
    const ajaxHeaders = {
      "X-Requested-With": "XMLHttpRequest",
      Referer: embedUrl,
      "User-Agent": "Mozilla/5.0",
    };
    const json = await axios.get(apiUrl, { headers: ajaxHeaders });
    const payload = json.data || {};

    const sources = payload.encrypted
      ? decryptMegaCloud(payload.sources, await getMegaCloudKey(this.providerContext))
      : payload.sources;

    if (!Array.isArray(sources)) return [];

    return sources
      .filter((source: any) => source?.file)
      .map((source: any) => ({
        url: source.file,
        quality: source.label || "auto",
        headers: {
          Referer: embedUrl,
          Origin: new URL(embedUrl).origin,
        },
      }));
  }
}

export class UpCloudResolver implements ProviderResolver {
  constructor(private providerContext: ProviderContext) {}

  canHandle(url: string): boolean {
    return url.includes("upcloud");
  }

  async resolve(embedUrl: string): Promise<ResolverStream[]> {
    const { axios } = this.providerContext;
    const html = await axios.get(embedUrl, {
      headers: {
        Referer: embedUrl,
        "User-Agent": "Mozilla/5.0",
      },
    });
    const sourcesJson = extract(
      /sources\s*:\s*(\[[\s\S]*?\])\s*[\},]/,
      html.data
    );
    if (!sourcesJson) return [];

    const sources = JSON.parse(sourcesJson);
    if (!Array.isArray(sources)) return [];

    return sources
      .filter((source: any) => source?.file)
      .map((source: any) => ({
        url: source.file,
        quality: source.label || "auto",
        headers: {
          Referer: embedUrl,
          Origin: new URL(embedUrl).origin,
        },
      }));
  }
}

export class AKCloudResolver implements ProviderResolver {
  constructor(
    private providerContext: ProviderContext,
    private megaCloudResolver: MegaCloudResolver
  ) {}

  canHandle(url: string): boolean {
    return url.includes("akcloud");
  }

  async resolve(embedUrl: string): Promise<ResolverStream[]> {
    const { axios } = this.providerContext;
    const html = await axios.get(embedUrl, {
      headers: {
        Referer: embedUrl,
        "User-Agent": "Mozilla/5.0",
      },
    });
    const iframeSrc = extract(/iframe[^>]+src=["'](.*?)["']/, html.data);
    if (!iframeSrc) return [];

    const resolvedIframe = ensureAbsoluteUrl(iframeSrc, embedUrl);
    return this.megaCloudResolver.resolve(resolvedIframe);
  }
}

export const createAutoResolver = (providerContext: ProviderContext) => {
  const megaCloudResolver = new MegaCloudResolver(providerContext);
  const resolvers: ProviderResolver[] = [
    megaCloudResolver,
    new UpCloudResolver(providerContext),
    new AKCloudResolver(providerContext, megaCloudResolver),
  ];

  return async function autoResolve(embedUrl: string): Promise<ResolverStream[]> {
    for (const resolver of resolvers) {
      if (resolver.canHandle(embedUrl)) {
        const streams = await resolver.resolve(embedUrl);
        if (streams.length) return streams;
      }
    }
    return [];
  };
};
