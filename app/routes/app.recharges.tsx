import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const recharges = await prisma.supplies24Recharge.findMany({
    where: { shop: session.shop },
    orderBy: { min: "asc" },
  });

  return { recharges };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    const id = Number(formData.get("id"));
    await prisma.supplies24Recharge.deleteMany({
      where: { id, shop: session.shop },
    });
    return { ok: true, message: "Fascia eliminata." };
  }

  if (intent === "add") {
    const min = Number(formData.get("min"));
    const max = Number(formData.get("max"));
    const profit = Number(formData.get("profit"));

    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(profit)) {
      return { ok: false, error: "Valori non validi." };
    }
    if (max < min) {
      return { ok: false, error: "Il valore Max deve essere maggiore o uguale a Min." };
    }
    if (profit < 0) {
      return { ok: false, error: "La percentuale non può essere negativa." };
    }

    await prisma.supplies24Recharge.create({
      data: { shop: session.shop, min, max, profit },
    });
    return { ok: true, message: "Fascia aggiunta." };
  }

  return { ok: false, error: "Richiesta non valida." };
};

export default function RechargesPage() {
  const { recharges } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Ricarichi">
      <s-section heading="Gestione fasce di ricarico">
        {actionData?.ok && <div className="message success">{actionData.message}</div>}
        {actionData?.error && <div className="message error">{actionData.error}</div>}

        <p>
          Le fasce vengono applicate al prezzo all&apos;ingrosso del listino. Per
          ogni prodotto viene applicata la percentuale della fascia in cui rientra
          il prezzo all&apos;ingrosso.
        </p>

        <Form method="post" className="inline-form" style={{ marginBottom: "1.25rem" }}>
          <input type="hidden" name="intent" value="add" />
          <div className="field">
            <label htmlFor="min">Min</label>
            <input id="min" name="min" type="number" step="0.01" min="0" required />
          </div>
          <div className="field">
            <label htmlFor="max">Max</label>
            <input id="max" name="max" type="number" step="0.01" min="0" required />
          </div>
          <div className="field">
            <label htmlFor="profit">Percentuale %</label>
            <input id="profit" name="profit" type="number" step="0.01" min="0" required />
          </div>
          <s-button type="submit" variant="primary">
            Aggiungi fascia
          </s-button>
        </Form>

        {recharges.length === 0 ? (
          <p>Nessuna fascia configurata. Aggiungine una per applicare i ricarichi.</p>
        ) : (
          <div className="table-wrap">
            <s-table>
              <s-table-header>
                <s-table-header-row>
                  <s-table-cell>Min</s-table-cell>
                  <s-table-cell>Max</s-table-cell>
                  <s-table-cell>Percentuale</s-table-cell>
                  <s-table-cell>Azioni</s-table-cell>
                </s-table-header-row>
              </s-table-header>
              <s-table-body>
                {recharges.map((recharge) => (
                  <s-table-row key={recharge.id}>
                    <s-table-cell>{recharge.min.toFixed(2)}</s-table-cell>
                    <s-table-cell>{recharge.max.toFixed(2)}</s-table-cell>
                    <s-table-cell>{recharge.profit}%</s-table-cell>
                    <s-table-cell>
                      <Form method="post" className="row-actions">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={recharge.id} />
                        <s-button type="submit" tone="critical">
                          Elimina
                        </s-button>
                      </Form>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </div>
        )}
      </s-section>
    </s-page>
  );
}
