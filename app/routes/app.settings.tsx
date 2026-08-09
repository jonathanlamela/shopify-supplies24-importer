import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { authenticate } from "../shopify.server";
import { getSettings, saveSettings } from "../.server/supplies24/context";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);

  const cronUrl = `${new URL(request.url).origin}/api/supplies24/cron`;

  return {
    shop: session.shop,
    settings,
    cronUrl,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const downloadUrl = String(formData.get("downloadUrl") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (!downloadUrl) {
    return { ok: false, error: "L'URL di download è obbligatorio." };
  }

  const settings = await saveSettings(session.shop, {
    downloadUrl,
    apiKey: apiKey || crypto.randomUUID(),
  });

  return { ok: true, settings };
};

export default function SettingsPage() {
  const { settings, cronUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Impostazioni">
      <s-section heading="Credenziali Supplies24">
        {actionData?.ok && (
          <div className="message success">Impostazioni salvate.</div>
        )}
        {actionData?.error && (
          <div className="message error">{actionData.error}</div>
        )}

        <Form method="post" className="form">
          <div className="field">
            <label htmlFor="downloadUrl">URL Download - Supplies24</label>
            <input
              id="downloadUrl"
              name="downloadUrl"
              type="text"
              defaultValue={settings.downloadUrl ?? ""}
              placeholder="https://www.supplies24.it/export/listino.csv"
              required
            />
            <span className="hint">
              URL del file CSV del listino. Il file viene scaricato e importato
              durante la sincronizzazione.
            </span>
          </div>

          <div className="field">
            <label htmlFor="apiKey">Chiave API (token cron)</label>
            <input
              id="apiKey"
              name="apiKey"
              type="text"
              defaultValue={settings.apiKey ?? ""}
              placeholder="Inserisci una chiave o lascia vuoto per generararla"
            />
            <span className="hint">
              Token usato per autenticare le richieste all&apos;endpoint cron.
            </span>
          </div>

          <div className="actions">
            <s-button type="submit" variant="primary">
              Salva
            </s-button>
          </div>
        </Form>
      </s-section>

      <s-section heading="Cron (sincronizzazione automatica)">
        <p>
          Configura un job sul tuo provider (cron, GitHub Actions, ecc.) che
          chiama l&apos;endpoint sottostante via POST. La chiave API va passata
          nel body JSON come campo <code>token</code>.
        </p>
        <div className="code-box">
          <span>{cronUrl}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(cronUrl)}
          >
            Copia
          </button>
        </div>
        {settings.apiKey && (
          <div className="code-box" style={{ marginTop: "0.5rem" }}>
            <span>Token: {settings.apiKey}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(settings.apiKey!)}
            >
              Copia
            </button>
          </div>
        )}
        <p>
          Esempio:{" "}
          <code>
            {`curl -X POST ${cronUrl} -H "Content-Type: application/json" -d '{"token":"LA_TUA_CHIAVE","task":"full"}'`}
          </code>
        </p>
      </s-section>
    </s-page>
  );
}
