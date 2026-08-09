import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  prepareImport,
  stepImport,
  finalizeImport,
} from "../.server/supplies24/importer";
import type { GraphqlLike } from "../.server/supplies24/shopify";

const STALE_RUN_MS = 5 * 60 * 1000;

async function recoverStaleRuns(shop: string) {
  const stale = new Date(Date.now() - STALE_RUN_MS);
  await prisma.supplies24ImportRun.updateMany({
    where: { shop, status: "running", updatedAt: { lt: stale } },
    data: {
      status: "error",
      finishedAt: new Date(),
      summary: JSON.stringify({
        errors: ["Esecuzione interrotta (nessuna attività recente)."],
      }),
    },
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const graphql = admin as unknown as GraphqlLike;
  const shop = session.shop;

  if (intent === "start") {
    const mode =
      String(formData.get("mode") ?? "full") === "update" ? "update" : "full";

    await recoverStaleRuns(shop);

    const active = await prisma.supplies24ImportRun.findFirst({
      where: { shop, status: "running" },
    });
    if (active) {
      return Response.json({
        ok: false,
        message: "Un'importazione è già in corso.",
      });
    }

    const run = await prisma.supplies24ImportRun.create({
      data: { shop, mode, status: "running" },
    });

    try {
      const prepared = await prepareImport(shop, mode, graphql, {
        runId: run.id,
      });
      return Response.json({
        ok: true,
        runId: run.id,
        mode: prepared.mode,
        total: prepared.total,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.supplies24ImportRun.update({
        where: { id: run.id },
        data: {
          status: "error",
          finishedAt: new Date(),
          summary: JSON.stringify({ errors: [message] }),
        },
      });
      return Response.json({ ok: false, message });
    }
  }

  if (intent === "step") {
    const runId = Number(formData.get("runId"));
    const index = Number(formData.get("index"));
    return Response.json(await stepImport(shop, runId, index, graphql));
  }

  if (intent === "finish") {
    const runId = Number(formData.get("runId"));
    return Response.json(await finalizeImport(shop, runId, graphql));
  }

  return Response.json({ ok: false, message: "Richiesta non valida." });
};
