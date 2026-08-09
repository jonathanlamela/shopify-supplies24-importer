import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getSettings } from "../.server/supplies24/context";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [settings, offerCount, rechargeCount, categoryMapCount, collectionMapCount, lastRun] =
    await Promise.all([
      getSettings(session.shop),
      prisma.supplies24Offer.count({ where: { shop: session.shop } }),
      prisma.supplies24Recharge.count({ where: { shop: session.shop } }),
      prisma.supplies24CategoryMap.count({ where: { shop: session.shop } }),
      prisma.supplies24CollectionMap.count({ where: { shop: session.shop } }),
      prisma.supplies24ImportRun.findFirst({
        where: { shop: session.shop },
        orderBy: { id: "desc" },
      }),
    ]);

  return {
    shop: session.shop,
    settings,
    offerCount,
    rechargeCount,
    categoryMapCount,
    collectionMapCount,
    lastRun,
  };
};

export default function Index() {
  const { settings, offerCount, rechargeCount, categoryMapCount, collectionMapCount, lastRun } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Supplies24 Importer">
      <s-section heading="Panoramica">
        <s-paragraph>
          Importa il catalogo Supplies24.it nel tuo negozio Shopify e gestisci
          prezzi, stock e collezioni automaticamente.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/settings">
            <s-button variant="primary">Configura</s-button>
          </s-link>
          <s-link href="/app/import">
            <s-button>Esegui importazione</s-button>
          </s-link>
        </s-stack>
      </s-section>

      <s-section heading="Stato">
        <s-unordered-list>
          <s-list-item>
            URL di download:{" "}
            {settings.downloadUrl ? "configurato" : "non configurato"}
          </s-list-item>
          <s-list-item>
            Prodotti nel listino: <strong>{offerCount}</strong>
          </s-list-item>
          <s-list-item>
            Fasce di ricarico: <strong>{rechargeCount}</strong>
          </s-list-item>
          <s-list-item>
            Categorie mappate (Shopify): <strong>{categoryMapCount}</strong>
          </s-list-item>
          <s-list-item>
            Categorie mappate (collezioni): <strong>{collectionMapCount}</strong>
          </s-list-item>
          {lastRun && (
            <s-list-item>
              Ultima esecuzione:{" "}
              {new Date(lastRun.startedAt).toLocaleString("it-IT", {
                dateStyle: "short",
                timeStyle: "short",
              })}{" "}
              ({lastRun.status})
            </s-list-item>
          )}
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
