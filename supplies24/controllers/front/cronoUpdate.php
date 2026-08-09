<?php

require_once _PS_MODULE_DIR_ . "supplies24/libs/lib.php";

class Supplies24CronoUpdateModuleFrontController extends ModuleFrontController
{

    /** @var bool */
    public $ajax;


    public $auth = false;
    public $ssl = false;
    public $guestAllowed = true;


    public function init()
    {
        $this->page_name = 'job'; // page_name and body id

        $this->display_column_left = false;
        $this->display_column_right = false;

        parent::init();
    }

    public function initContent()
    {
        parent::initContent();

        // Header JSON
        header('Content-Type: application/json');

        // Controllo metodo
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405); // Method Not Allowed
            header('Content-Type: application/json');
            echo json_encode([
                'status' => 'fail',
                'message' => 'Method not allowed. Only POST requests are accepted.'
            ]);
            exit;
        }

        exit; // Importantissimo: termina subito l'esecuzione
    }

    public function postProcess()
    {
        $raw = file_get_contents('php://input');
        $json = json_decode($raw, true);

        $token = Configuration::get("SUPPLIES24_API_KEY");
        $request_token = $json["token"] ?? null;

        header('Content-Type: application/json');

        // Controlli preliminari
        if (!$request_token || $token != $request_token) {
            echo json_encode(["status" => "fail", "message" => "Accesso negato"]);
            exit;
        }

        $steps = [];

        $steps['download_listino'] = downloadListino();
        $steps['clear_listino'] = clearListino();
        $steps['calcola_ricarichi'] = calcolaRicarichi();
        $steps['verifica_aggiornare'] = verificaAggiornare();
        $steps['verifica_aggiungere'] = verificaAggiungere();

        $coda = getCoda()["coda"];

        // Modalità solo aggiornamento: salta la creazione di nuovi prodotti
        $prodotti = [];
        foreach ($coda as $item) {
            $prodotti[] = processProduct($item['id'], true);
        }
        $steps['prodotti'] = $prodotti;

        $coda_outstock = getOutStock()["coda"];

        $outstock = [];
        foreach ($coda_outstock as $item) {
            $outstock[] = setOutStock($item['id_product']);
        }
        $steps['outstock'] = $outstock;

        echo json_encode([
            "status" => "success",
            "message" => "Operazione completata (solo aggiornamento)",
            "steps" => $steps
        ]);
    }
}
