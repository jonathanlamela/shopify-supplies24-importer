import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getSettings } from "../.server/supplies24/context";
import type { ImportResult } from "../.server/supplies24/importer";

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await recoverStaleRuns(session.shop);

  const [settings, lastRuns, offerCount, categoryCount, rechargeCount] =
    await Promise.all([
      getSettings(session.shop),
      prisma.supplies24ImportRun.findMany({
        where: { shop: session.shop },
        orderBy: { id: "desc" },
        take: 10,
      }),
      prisma.supplies24Offer.count({ where: { shop: session.shop } }),
      prisma.supplies24Offer.groupBy({
        by: ["category"],
        where: { shop: session.shop },
      }),
      prisma.supplies24Recharge.count({ where: { shop: session.shop } }),
    ]);

  return {
    settings,
    lastRuns,
    offerCount,
    categoryCount: categoryCount.length,
    rechargeCount,
  };
};

function formatDate(date: string | Date | null | undefined) {
  if (!date) {
    return "—";
  }
  return new Date(date).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function parseSummary(summary: string | null) {
  if (!summary) {
    return null;
  }
  try {
    return JSON.parse(summary) as {
      counts?: {
        created?: number;
        updated?: number;
        skipped?: number;
        failed?: number;
        outOfStock?: number;
        total?: number;
      };
      errors?: string[];
    };
  } catch {
    return null;
  }
}

function getTokenFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("id_token");
  } catch {
    return null;
  }
}

async function getSessionToken(): Promise<string | null> {
  const shopifyGlobal = (window as unknown as {
    shopify?: { idToken?: () => Promise<string> };
  }).shopify;
  if (shopifyGlobal?.idToken) {
    try {
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 5_000),
      );
      const token = await Promise.race([shopifyGlobal.idToken(), timeout]);
      if (token) {
        console.warn("[import] token da window.shopify.idToken()");
        return token;
      }
    } catch {
      console.warn("[import] window.shopify.idToken() ha lanciato un errore");
    }
  } else {
    console.warn("[import] window.shopify.idToken non disponibile");
  }
  const fromUrl = getTokenFromUrl();
  if (fromUrl) {
    console.warn("[import] token fallback dall'URL");
  } else {
    console.warn("[import] nessun token disponibile (URL senza id_token)");
  }
  return fromUrl;
}

async function postJson(formData: FormData) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = await getSessionToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch("/api/supplies24/import", {
      method: "POST",
      body: formData,
      headers,
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (res.redirected || /^\s*</.test(text)) {
        console.warn("[import] risposta HTML inattesa", {
          status: res.status,
          tokenInviato: Boolean(token),
          snippet: text.slice(0, 160),
        });
        if (!token) {
          return {
            ok: false,
            message:
              "Sessione non valida: apri l'app dall'interno dell'amministrazione Shopify (app embedded) e riprova.",
          };
        }
        return {
          ok: false,
          message:
            "Il server ha risposto con HTML inatteso (probabilmente il tunnel/dev server è instabile). Riavvia il dev server (Ctrl+C poi 'shopify app dev') e riapri l'app dall'admin, poi riprova.",
        };
      }
      return {
        ok: false,
        message: `Risposta non valida dal server (HTTP ${res.status}).`,
      };
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "La richiesta ha impiegato troppo tempo (timeout)."
        : `Errore di rete: ${
            error instanceof Error ? error.message : String(error)
          }`;
    return { ok: false, message };
  } finally {
    clearTimeout(timeout);
  }
}

interface ProgressState {
  index: number;
  total: number;
  current: string;
  counts: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    outOfStock: number;
    total: number;
  };
  error?: string;
}

export default function ImportPage() {
  const { settings, lastRuns, offerCount, categoryCount, rechargeCount } =
    useLoaderData<typeof loader>();

  const [phase, setPhase] = useState<
    "idle" | "preparing" | "running" | "done" | "error"
  >("idle");
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const startImport = async (mode: "full" | "update") => {
    if (phase !== "idle") {
      return;
    }
    setPhase("preparing");
    setResult(null);
    setProgress(null);

    const startForm = new FormData();
    startForm.set("intent", "start");
    startForm.set("mode", mode);

    const start = await postJson(startForm);
    if (!start.ok) {
      setResult({ status: "fail", message: start.message, steps: {} });
      setPhase("error");
      return;
    }

    setPhase("running");
    setProgress({
      index: 0,
      total: start.total,
      current: "",
      counts: {
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        outOfStock: 0,
        total: start.total,
      },
    });

    for (let i = 0; i < start.total; i++) {
      const stepForm = new FormData();
      stepForm.set("intent", "step");
      stepForm.set("runId", String(start.runId));
      stepForm.set("index", String(i));

      const step = await postJson(stepForm);
      if (step.message) {
        setResult({
          status: "fail",
          message: step.message,
          steps: { runId: start.runId },
        });
        setPhase("error");
        return;
      }
      if (!step.ok && (step.error === "Esecuzione non in corso." || step.error === "Fine coda.")) {
        setResult({
          status: "fail",
          message: step.error,
          steps: { runId: start.runId },
        });
        setPhase("error");
        return;
      }

      setProgress({
        index: i + 1,
        total: step.total ?? start.total,
        current: step.current ?? "",
        counts: step.counts ?? progress?.counts,
        error: step.error,
      });
    }

    const finishForm = new FormData();
    finishForm.set("intent", "finish");
    finishForm.set("runId", String(start.runId));

    const finish = (await postJson(finishForm)) as ImportResult;
    setResult(finish);
    setPhase(finish.status === "success" ? "done" : "error");
    if (finish.status === "success") {
      window.location.reload();
    }
  };

  const running = phase === "preparing" || phase === "running";
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.index / progress.total) * 100)
      : 0;

  return (
    <s-page heading="Importazione">
      <s-section heading="Sincronizzazione catalogo">
        {!settings.downloadUrl && (
          <div className="message error">
            L&apos;URL di download non è configurato.{" "}
            <Link to="/app/settings">Vai alle impostazioni</Link>.
          </div>
        )}

        {phase === "done" && result?.status === "success" && (
          <div className="message success">
            {result.message}: {offerCount} righe nel listino,{" "}
            {categoryCount} categorie, {rechargeCount} fasce di ricarico. Creati{" "}
            {result.steps?.created ?? 0}, aggiornati {result.steps?.updated ?? 0},
            fuori stock {result.steps?.outOfStock ?? 0}.
          </div>
        )}
        {phase === "error" && (
          <div className="message error">
            {result?.message ?? progress?.error ?? "Errore durante l'importazione."}
          </div>
        )}

        <p>
          La sincronizzazione scarica il listino e importa i prodotti{" "}
          <strong>uno alla volta</strong>, mostrando l&apos;avanzamento. Può
          richiedere parecchi minuti in base alla dimensione del catalogo.
        </p>

        <div className="actions">
          <button
            type="button"
            onClick={() => startImport("full")}
            disabled={running || !settings.downloadUrl}
          >
            Importazione completa
          </button>
          <button
            type="button"
            onClick={() => startImport("update")}
            disabled={running || !settings.downloadUrl}
          >
            Solo aggiornamento
          </button>
        </div>

        {phase === "preparing" && (
          <div className="message" style={{ marginTop: "1.25rem" }}>
            Download del listino e preparazione della coda...
          </div>
        )}

        {phase === "running" && progress && (
          <div className="progress-box" style={{ marginTop: "1.25rem" }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <p>
              Prodotto <strong>{progress.index}</strong> di{" "}
              <strong>{progress.total}</strong> ({percent}%)
            </p>
            {progress.current && (
              <p className="progress-current">
                In elaborazione: {progress.current}
              </p>
            )}
            <p>
              Creati: <strong>{progress.counts.created}</strong> · Aggiornati:{" "}
              <strong>{progress.counts.updated}</strong> · Saltati:{" "}
              <strong>{progress.counts.skipped}</strong> · Errori:{" "}
              <strong>{progress.counts.failed}</strong>
            </p>
          </div>
        )}
      </s-section>

      <s-section heading="Ultime esecuzioni">
        {lastRuns.length === 0 ? (
          <p>Nessuna esecuzione registrata.</p>
        ) : (
          <div className="table-wrap">
            <s-table>
              <s-table-header>
                <s-table-header-row>
                  <s-table-cell>ID</s-table-cell>
                  <s-table-cell>Modalità</s-table-cell>
                  <s-table-cell>Stato</s-table-cell>
                  <s-table-cell>Inizio</s-table-cell>
                  <s-table-cell>Fine</s-table-cell>
                  <s-table-cell>Risultato</s-table-cell>
                </s-table-header-row>
              </s-table-header>
              <s-table-body>
                {lastRuns.map((run) => {
                  const summary = parseSummary(run.summary);
                  return (
                    <s-table-row key={run.id}>
                      <s-table-cell>{run.id}</s-table-cell>
                      <s-table-cell>{run.mode}</s-table-cell>
                      <s-table-cell>{run.status}</s-table-cell>
                      <s-table-cell>{formatDate(run.startedAt)}</s-table-cell>
                      <s-table-cell>{formatDate(run.finishedAt)}</s-table-cell>
                      <s-table-cell>
                        {summary?.counts
                          ? `+${summary.counts.created ?? 0} / ~${summary.counts.updated ?? 0} / ✗${summary.counts.failed ?? 0}`
                          : "—"}
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          </div>
        )}
      </s-section>
    </s-page>
  );
}
