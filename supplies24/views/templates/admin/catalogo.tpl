<div class="admin-catalog-container"
    style="background:#fff;padding:20px;margin:20px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1);border-radius:8px;">
    <h2>Gestione catalogo</h2>

    <div id="catalog-buttons" style="margin-top:10px;"></div>

    <div id="catalog-status" style="margin-top:15px;font-weight:bold;">Nessun task in corso</div>

    <div id="catalog-progress-container"
        style="margin-top:10px;background:#e2e8f0;border-radius:4px;overflow:hidden;height:20px;display:none;">
        <div id="catalog-progress-bar" style="height:100%;background:#10B981;width:0%;transition:width 0.2s;"></div>
    </div>

    <div id="catalog-log" style="margin-top:10px;background:#f1f5f9;padding:10px;border-radius:4px;display:none;">
        <p>Aggiornati/Aggiunti: <span id="catalog-updated">0</span></p>
        <p>Eliminati: <span id="catalog-deleted">0</span></p>
    </div>
</div>

<script>
    const apiUrl = '{$apiUrl}'; // Smarty variable con URL backend
    const apiKey = '{$apiKey}'; // Smarty variable con token
</script>


{literal}
    <script>
        (() => {

            let taskInProgress = false;
            let updated = 0;
            let deleted = 0;

            const buttonsConfig = [
                { label: "Aggiorna catalogo", color: "#10B981", task: "aggiornaCatalogo" },
                { label: "Aggiorna tutti", color: "#F97316", task: "eseguiTutti" },
                { label: "Esegui fix categorie", color: "#3B82F6", task: "eseguiFixCategorie" },
                { label: "Importa immagini", color: "#8B5CF6", task: "importaImmagini" },
                { label: "Importa correlati", color: "#8B5CF6", task: "importaCorrelati" },
                { label: "Sistema immagini 404", color: "#EF4444", task: "sistemaImmagini404" },

            ];

            const container = document.getElementById('catalog-buttons');
            const statusEl = document.getElementById('catalog-status');
            const progressContainer = document.getElementById('catalog-progress-container');
            const progressBar = document.getElementById('catalog-progress-bar');
            const logEl = document.getElementById('catalog-log');
            const updatedEl = document.getElementById('catalog-updated');
            const deletedEl = document.getElementById('catalog-deleted');

            function createButtons() {
                buttonsConfig.forEach(btn => {
                    const b = document.createElement('button');
                    b.textContent = btn.label;
                    b.style.background = btn.color;
                    b.style.color = '#fff';
                    b.style.margin = '2px';
                    b.style.padding = '6px 12px';
                    b.style.border = 'none';
                    b.style.borderRadius = '4px';
                    b.style.cursor = 'pointer';
                    b.addEventListener('click', () => runTask(btn.task));
                    container.appendChild(b);
                });
            }

            async function apiRequest(task, data = {}) {
                const payload = { task, token: apiKey, ...data };
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error('Errore API');
                return res.json();
            }

            async function processQueue(queue, handler) {
                progressContainer.style.display = 'block';
                for (let i = 0; i < queue.length; i++) {
                    const item = queue[i];
                    statusEl.textContent = handler.status(item);
                    progressBar.style.width = `${((i+1)/queue.length)*100}%`;
                    await handler.action(item);
                }
                progressContainer.style.display = 'none';
            }

            async function runTask(taskName) {
                if (taskInProgress) return;
                taskInProgress = true;
                statusEl.textContent = 'Preparazione task...';
                logEl.style.display = 'none';
                updated = 0;
                deleted = 0;
                updatedEl.textContent = '0';
                deletedEl.textContent = '0';

                try {
                    switch (taskName) {



                        case 'aggiornaCatalogo':
                            statusEl.textContent = 'Download listino';
                            await apiRequest('downloadListino');

                            statusEl.textContent = 'Pulizia listino';
                            await apiRequest('clearListino');

                            statusEl.textContent = 'Calcolo ricarichi';
                            await apiRequest('calcolaRicarichi');

                            statusEl.textContent = 'Verifica aggiornamenti';
                            await apiRequest('verificaAggiornare');

                            statusEl.textContent = 'Verifica aggiunte';
                            await apiRequest('verificaAggiungere');

                            statusEl.textContent = 'Eliminazione prodotti orfani';
                            await apiRequest('eliminaOrfani');

                            statusEl.textContent = 'Preparazione aggiornamento';
                            var response = await apiRequest('getCoda');
                            var queue = response.coda || [];
                            updated = queue.length;
                            updatedEl.textContent = updated;

                            await processQueue(queue, {
                                status: (item) => `Elaborazione RowId: ${item.id}`,
                                action: (item) => apiRequest('processProduct', { product: item.id })
                            });

                            statusEl.textContent = 'Aggiornamento completato';

                            // Eliminazione outstock
                            const outstock = await apiRequest('getOutStock');
                            deleted = outstock.coda.length;
                            deletedEl.textContent = deleted;

                            await processQueue(outstock.coda, {
                                status: (item) => `Eliminazione prodotto id: ${item.id_product}`,
                                action: (item) => apiRequest('setOutStock', { product: item.id_product })
                            });

                            logEl.style.display = 'block';
                            break;

                        case 'eseguiTutti':
                            // simile a sopra: prendi getCodaCompleta e processQueue
                            const allQueue = (await apiRequest('getCodaCompleta')).coda || [];
                            await processQueue(allQueue, {
                                status: (item) => `Elaborazione RowId: ${item.id}`,
                                action: (item) => apiRequest('processProduct', { product: item.id })
                            });
                            statusEl.textContent = 'Aggiornamento totale completato';
                            break;

                        case 'eseguiFixCategorie':
                        case 'importaCorrelati':
                        case 'importaImmagini':
                        case 'sistemaImmagini404':
                            const taskMap = {
                                'eseguiFixCategorie': 'getAllProducts',
                                'importaCorrelati': 'getAllProducts',
                                'importaImmagini': 'getCodaImmagini',
                                'sistemaImmagini404': 'getCodaImmagini404',
                                'generaRamiCategorie': 'getCodaRami'
                            };
                            const queueTask = (await apiRequest(taskMap[taskName])).coda || [];
                            await processQueue(queueTask, {
                                status: (item) => `Elaborazione product id: ${item.id_product || item.id_image}`,
                                action: (item) => apiRequest(taskName.replace(/([A-Z])/g, '_$1')
                                    .toLowerCase(), {
                                        product: item.id_product,
                                        id_image: item.id_image,
                                        id_category: item.id_category
                                    })
                            });
                            statusEl.textContent = `${taskName} completato`;
                            break;

                        default:
                            statusEl.textContent = 'Task sconosciuto';
                    }
                } catch (err) {
                    console.error(err);
                    statusEl.textContent = 'Errore durante il task';
                } finally {
                    taskInProgress = false;
                }
            }

            createButtons();
        })();
    </script>
{/literal}
