import prisma from "../../db.server";

export interface AppSettings {
  shop: string;
  downloadUrl: string | null;
  apiKey: string | null;
}

export async function getSettings(shop: string): Promise<AppSettings> {
  const setting = await prisma.supplies24Setting.findUnique({ where: { shop } });
  return {
    shop,
    downloadUrl: setting?.downloadUrl ?? null,
    apiKey: setting?.apiKey ?? null,
  };
}

export async function saveSettings(
  shop: string,
  data: { downloadUrl?: string; apiKey?: string },
): Promise<AppSettings> {
  const setting = await prisma.supplies24Setting.upsert({
    where: { shop },
    update: {
      ...(data.downloadUrl !== undefined ? { downloadUrl: data.downloadUrl } : {}),
      ...(data.apiKey !== undefined ? { apiKey: data.apiKey } : {}),
    },
    create: {
      shop,
      downloadUrl: data.downloadUrl ?? null,
      apiKey: data.apiKey ?? null,
    },
  });

  return {
    shop,
    downloadUrl: setting.downloadUrl,
    apiKey: setting.apiKey,
  };
}

