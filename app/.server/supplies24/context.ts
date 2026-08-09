import shopify, { sessionStorage } from "../../shopify.server";
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

/**
 * Recupera una sessione offline (access token a lungo termine) per il negozio.
 * Usata dai job in background / cron che non arrivano da Shopify.
 */
export async function getOfflineSession(shop: string) {
  const sessions = await sessionStorage.findSessionsByShop(shop);
  const offline = sessions.find((session) => !session.isOnline) ?? sessions[0];
  return offline ?? null;
}

/**
 * Costruisce un client GraphQL Admin a partire da una sessione.
 * Usato dagli endpoint che non passano da authenticate.admin (es. cron).
 */
export function buildGraphqlClient(session: Awaited<ReturnType<typeof getOfflineSession>>) {
  if (!session) {
    throw new Error("Sessione non trovata per il negozio");
  }
  return new shopify.api.clients.Graphql({ session });
}
