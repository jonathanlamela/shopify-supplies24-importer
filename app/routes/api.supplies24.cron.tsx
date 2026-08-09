import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { runImport, type ImportResult } from "../.server/supplies24/importer";
import type { GraphqlLike } from "../.server/supplies24/shopify";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleCron(token: string | null, task: string) {
  if (!token) {
    return jsonResponse(
      { status: "fail", message: "Token mancante" },
      401,
    );
  }

  const setting = await prisma.supplies24Setting.findFirst({
    where: { apiKey: token },
  });

  if (!setting) {
    return jsonResponse(
      { status: "fail", message: "Accesso negato" },
      401,
    );
  }

  let admin: GraphqlLike;
  try {
    const context = await unauthenticated.admin(setting.shop);
    admin = context.admin as unknown as GraphqlLike;
  } catch {
    return jsonResponse(
      { status: "fail", message: "Sessione non trovata per il negozio" },
      500,
    );
  }

  const result: ImportResult = await runImport({
    shop: setting.shop,
    mode: task === "update" ? "update" : "full",
    graphql: admin,
  });

  return jsonResponse(result, result.status === "success" ? 200 : 500);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return handleCron(
    url.searchParams.get("token"),
    url.searchParams.get("task") ?? "full",
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return jsonResponse(
      { status: "fail", message: "Method not allowed. Only POST requests are accepted." },
      405,
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { token?: string; task?: string }
    | null;

  return handleCron(body?.token ?? null, body?.task ?? "full");
};
