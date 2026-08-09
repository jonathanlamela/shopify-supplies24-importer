import prisma from "../../db.server";

export interface AppSettings {
  shop: string;
  downloadUrl: string | null;
  apiKey: string | null;
  publicationIds: string[];
}

function parsePublicationIds(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function getSettings(shop: string): Promise<AppSettings> {
  const setting = await prisma.supplies24Setting.findUnique({ where: { shop } });
  return {
    shop,
    downloadUrl: setting?.downloadUrl ?? null,
    apiKey: setting?.apiKey ?? null,
    publicationIds: parsePublicationIds(setting?.publicationIds ?? null),
  };
}

export async function saveSettings(
  shop: string,
  data: { downloadUrl?: string; apiKey?: string; publicationIds?: string[] },
): Promise<AppSettings> {
  const setting = await prisma.supplies24Setting.upsert({
    where: { shop },
    update: {
      ...(data.downloadUrl !== undefined ? { downloadUrl: data.downloadUrl } : {}),
      ...(data.apiKey !== undefined ? { apiKey: data.apiKey } : {}),
      ...(data.publicationIds !== undefined
        ? { publicationIds: JSON.stringify(data.publicationIds) }
        : {}),
    },
    create: {
      shop,
      downloadUrl: data.downloadUrl ?? null,
      apiKey: data.apiKey ?? null,
      publicationIds: data.publicationIds ? JSON.stringify(data.publicationIds) : null,
    },
  });

  return {
    shop,
    downloadUrl: setting.downloadUrl,
    apiKey: setting.apiKey,
    publicationIds: parsePublicationIds(setting.publicationIds),
  };
}

