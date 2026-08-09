<?php

require_once _PS_MODULE_DIR_ . "supplies24/libs/lib.php";

class Supplies24JobModuleFrontController extends ModuleFrontController
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
        $task = $json["task"] ?? null;

        header('Content-Type: application/json');

        // Controlli preliminari
        if (!$request_token || $token != $request_token) {
            echo json_encode(["status" => "fail", "message" => "Accesso negato"]);
            exit;
        }

        if (!$task) {
            echo json_encode(["status" => "fail", "message" => "Richiesta non valida"]);
            exit;
        }

        // Definisci i task supportati e le funzioni associate
        $tasks = [
            "setOutStock" => fn() => setOutStock($json["product"]),
            "processProduct" => fn() => processProduct($json["product"]),
            "downloadListino" => fn() => downloadListino(),
            "clearListino" => fn() => clearListino(),
            "calcolaRicarichi" => fn() => calcolaRicarichi(),
            "verificaAggiornare" => fn() => verificaAggiornare(),
            "verificaAggiungere" => fn() => verificaAggiungere(),
            "eliminaOrfani" => fn() => eliminaOrfani(),
            "getCoda" => fn() => getCoda(),
            "getCodaNomi" => fn() => getCodaNomi(),
            "getOutStock" => fn() => getOutStock(),
            "setSupplierCarriers"   => fn() => setSupplierCarriers(),
        ];

        // Esegui task se esiste
        if (array_key_exists($task, $tasks)) {
            $result = $tasks[$task]();

            // Se il task ritorna già dati, includili nella risposta
            if ($result === null) {
                echo json_encode([
                    "status" => "success",
                    "task" => $task,
                    "message" => "Operazione completata"
                ]);
            } else {
                echo json_encode(array_merge([
                    "status" => "success",
                    "task" => $task
                ], $result));
            }
        } else {
            http_response_code(500);
            echo json_encode([
                "status" => "fail",
                "task" => $task,
                "message" => "Task non riconosciuto"
            ]);
        }
    }
}
