<?php
require_once _PS_ROOT_DIR_ . "/config/config.inc.php";
require_once "product.php";
require_once "setOutStock.php";


function downloadListino()
{
    $db = Db::getInstance();

    $url = Configuration::get('SUPPLIES24_URL');
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $output = curl_exec($ch);

    if ($output) {
        $path = _PS_ROOT_DIR_ . "/supplies24/";
        if (!is_dir($path)) {
            mkdir($path);
        }

        $fh = fopen("$path/listino.csv", 'w');
        fwrite($fh, $output);
        fclose($fh);

        $db = Db::getInstance();

        $db->execute(
            "TRUNCATE TABLE " . _DB_PREFIX_ . "supplies24_offer"
        );

        $handle = fopen("$path/listino.csv", "r");

        fgetcsv($handle, null, ";");

        $rows = array();
        while (($data = fgetcsv($handle, null, ";")) !== FALSE) {

            $id = $data[0];
            $reference = $data[2];

            $ean = $data[3];
            $produttore = $data[1];


            $price = str_replace(",", ".", $data[6]);
            $wholesale_price = str_replace(",", ".", $data[6]);
            $description_short = trim($data[5]);
            $category_description = $description_short;

            $name = explode($reference, $data[5])[0] . "" . $reference;

            $category_description = str_replace("ORIGINAL", "", $category_description);
            $category_description = str_replace($produttore, "", $category_description);
            $category_description = trim($category_description);
            $categoria = explode($reference, $category_description)[0];

            $description_short = str_replace("ORIGINAL", "", $description_short);
            $description_short = str_replace("Seiten", "pagine", $description_short);
            $description_short = str_replace("~'", "capacità indicativa", $description_short);
            $description_short = trim($description_short);

            $name = str_replace("ORIGINAL", "", $name);
            $name = str_replace("Seiten", "pagine", $name);
            $name = str_replace("~'", "capacità indicativa", $name);
            $name = trim($name);

            $quantity = 0;
            if ($data[7] == "1") {
                $quantity = 15;
            }

            $internal_code = null;

            if ($ean != null) {
                $internal_code = "4-EA-" . $ean;
            } else if ($ean = null && $reference != null) {
                $internal_code = "4-MPN-" . $reference;
            }

            if ($internal_code) {
                array_push($rows, [
                    "id" => $id,
                    "internal_code" => pSQL($internal_code),
                    "reference" => pSQL($reference),
                    "ean13" => pSQL($ean),
                    "manufacturer" => pSQL($produttore),
                    "name" => pSQL($name),
                    "quantity" => $quantity,
                    "price" => $price,
                    "wholesale_price" => $wholesale_price,
                    "description_short" => pSQL($description_short),
                    "category" => pSQL($categoria),
                    "executed" => False
                ]);
            }
        }

        $db->insert(
            'supplies24_offer',
            $rows
        );

        $db->execute(
            "UPDATE " . _DB_PREFIX_ . "supplies24_offer set price=round(price/1.22,2)"
        );

        $db->execute(
            "update " . _DB_PREFIX_ . "supplies24_offer set category='Lettori di codici a barre' where name like '%Honeywell%'"
        );

        return [
            "status" => "success",
            "message" => "File scaricato e processato con successo."
        ];
    } else {
        return [
            "status" => "fail",
            "message" => "Errore nel download del file."
        ];
    }
}

function clearListino()
{

    $db = Db::getInstance();

    $db->execute(
        "DELETE FROM " . _DB_PREFIX_ . "supplies24_offer where price=0"
    );

    $db->execute(
        "DELETE FROM " . _DB_PREFIX_ . "supplies24_offer where reference LIKE \"%'%\""
    );

    $db->execute("DELETE FROM " . _DB_PREFIX_ . "supplies24_offer WHERE ean13 REGEXP '[a-zA-Z]' OR ean13='0'");

    $db->execute("DELETE FROM " . _DB_PREFIX_ . "supplies24_offer WHERE ean13 NOT REGEXP '^[0-9]*$'");

    $db->execute("DELETE FROM " . _DB_PREFIX_ . "supplies24_offer WHERE ean13='0000000000000'");

    $db->execute("UPDATE " . _DB_PREFIX_ . "supplies24_offer SET reference=REPLACE(reference,'=','') WHERE reference LIKE '%=%'");

    $db->execute("UPDATE " . _DB_PREFIX_ . "supplies24_offer SET reference=REPLACE(reference,'_',' ') WHERE reference REGEXP '[_]'");

    $db->execute("UPDATE " . _DB_PREFIX_ . "supplies24_offer SET reference=REPLACE(reference,'.','') WHERE reference REGEXP '[.]'");

    $db->execute("UPDATE " . _DB_PREFIX_ . "supplies24_offer SET reference=REPLACE(reference,'(','') WHERE reference REGEXP '[()]'");

    $db->execute("UPDATE " . _DB_PREFIX_ . "supplies24_offer SET reference=REPLACE(reference,')','') WHERE reference REGEXP '[)]'");

    return [
        "status" => "success",
        "message" => "Listino pulito con successo."
    ];
}

function calcolaRicarichi()
{

    $db = Db::getInstance();

    $ricarichi = $db->executeS("SELECT * FROM " . _DB_PREFIX_ . "supplies24_recharge");

    foreach ($ricarichi as $row) {

        $price_min = $row['min'];
        $price_max = $row['max'];
        $percentuale = $row['profit'] / 100;

        $query = "UPDATE " . _DB_PREFIX_ . "supplies24_offer SET price=price+(price*$percentuale) WHERE wholesale_price >= $price_min AND wholesale_price <= $price_max";

        $db->execute($query);
    }

    $db->execute("UPDATE " . _DB_PREFIX_ . "supplies24_offer SET price=round(price,2)");

    $db->execute("UPDATE " . _DB_PREFIX_ . "supplies24_offer SET wholesale_price=round(wholesale_price/1.22,3)");

    return [
        "status" => "success",
        "message" => "Ricarichi calcolati con successo."
    ];
}

function verificaAggiornare()
{
    $db = Db::getInstance();

    $db->execute("UPDATE " . _DB_PREFIX_ . "supplies24_offer SET executed=True");

    $query = "SELECT c.id FROM " . _DB_PREFIX_ . "supplies24_offer c
    left join " . _DB_PREFIX_ .  "product_supplier ps ON c.internal_code=ps.product_supplier_reference
    left join " . _DB_PREFIX_ .  "product p ON ps.id_product=p.id_product
    left join " . _DB_PREFIX_ .  "stock_available s ON ps.id_product=s.id_product
    WHERE
    c.price!=p.price
    OR c.quantity!=s.quantity";

    $ids = $db->executeS($query);

    $ids_to_update = array();
    foreach ($ids as $id) {

        array_push($ids_to_update, $id["id"]);
    }

    if (count($ids_to_update) > 0) {
        $db->update(
            "supplies24_offer",
            [
                "executed" => False
            ],
            "id in (" . implode(",", $ids_to_update) . ")"
        );
    }

    return [
        "count" => count($ids_to_update)
    ];
}

function verificaAggiungere()
{

    $result = Db::getInstance()->update("supplies24_offer", [
        "executed" => False
    ], "internal_code not in (SELECT product_supplier_reference FROM " . _DB_PREFIX_ . "product_supplier)");


    return [
        "status" => $result ? "success" : "fail",
        "message" => $result ? "Verifica completata" : "Errore durante la verifica"
    ];
}

function eliminaOrfani() {}

function getCoda()
{

    return [
        "coda" => Db::getInstance()->executeS("SELECT id  FROM " . _DB_PREFIX_ . "supplies24_offer where executed=False")
    ];
}

function getAllProducts()
{
    return Db::getInstance()->executeS("SELECT id_product FROM " . _DB_PREFIX_ . "product");
}

function getCodaImmagini()
{
    return Db::getInstance()->executeS("SELECT id_product FROM " . _DB_PREFIX_ . "product where id_product not in (select id_product from " . _DB_PREFIX_ . "image)");
}

function getCodaImmagini404()
{
    return Db::getInstance()->executeS("select id_image from " . _DB_PREFIX_ . "image");
}

function getCodaCompleta()
{
    return Db::getInstance()->executeS("SELECT id FROM " . _DB_PREFIX_ . "supplies24_offer");
}

function getCodaNomi()
{
    return [
        "coda" => Db::getInstance()->executeS("SELECT id_product FROM " . _DB_PREFIX_ . "product where ean13 is not null")
    ];
}

function normalizeReference($reference)
{
    if (!isset($reference)) {
        $reference = null;
    } else {
        if (strlen($reference) > 64) {
            $reference = substr($reference, 0, 63);
        }
    }
    $reference = sanitizeName($reference);

    return $reference;
}

function normalizeEan($ean)
{
    if (!isset($ean) || $ean == "0000000000000") {
        $ean = null;
    } else {
        if (strlen($ean) > 13) {
            $ean = substr($ean, 0, 12);
        }
    }
    if ($ean == "0000000000000") {
        $ean = null;
    }

    return $ean;
}

function getOutStock()
{
    $db = Db::getInstance();

    $coda = $db->executeS("SELECT COUNT(*) as count FROM " . _DB_PREFIX_ . "supplies24_offer");


    if ($coda[0]['count'] > 0) {

        $items = $db->executeS(
            "
        SELECT ps.id_product
        FROM " . _DB_PREFIX_ . "product_supplier ps
        LEFT JOIN " . _DB_PREFIX_ . "stock_available s ON ps.id_product=s.id_product
        WHERE ps.product_supplier_reference not in (
            select internal_code from " . _DB_PREFIX_ . "supplies24_offer
        ) AND s.quantity > 0 AND ps.id_supplier=" . Configuration::get("SUPPLIES24_SUPPLIER_ID") . "
        "
        );

        return [
            "coda" => $items,
            "count" => count($items)
        ];
    } else {
        return [
            "coda" => [],
            "count" => 0
        ];
    }
}

function checkField($field, $num_char)
{
    if (strlen($field) > $num_char) {
        $field = substr($field, 0, $num_char - 1);
    }
    return $field;
}



function sanitizeName($string)
{
    $string = strip_tags($string);
    $string = preg_replace('/[<>;=#{}]*$/u', '', $string);
    $string = trim(preg_replace('/\s+/', ' ', $string));
    return $string;
}

function sanitizeRewrite($string)
{
    $string = strip_tags($string);
    $string = preg_replace('/[^a-zA-Z0-9\s]/', '', $string);
    return $string;
}

function sanitizeGenericName($string)
{
    $string = strip_tags($string);
    $string = preg_replace('/^[^<>{}]*$/u', '', $string);  // rimuove solo i caratteri vietati
    $string = trim(preg_replace('/\s+/', ' ', $string));
    return $string;
}


function getManufacturer($man_name)
{
    $str_query =
        "SELECT id_manufacturer FROM " .
        _DB_PREFIX_ .
        "manufacturer
   WHERE name LIKE '%" .
        $man_name .
        "%' LIMIT 1";
    $rs = Db::getInstance()->executeS($str_query);
    if (count($rs) >= 1) {
        $manufacturer = new Manufacturer($rs[0]["id_manufacturer"]);
    } else {
        $manufacturer = new Manufacturer();
        $manufacturer->name = ucwords($man_name);
        $manufacturer->active = 1;
        $manufacturer->add();
    }
    return $manufacturer;
}

function getToner24Img($ean)
{
    $urlSearch =
        "https://www.toner24.it/Handler/LiveSearch.ashx?queryString=" .
        $ean .
        "&action=&page=%2FCerca%2F";

    $searchSUPPLIES = json_decode(file_get_contents($urlSearch));

    if (count($searchSUPPLIES->article) > 0) {
        $item = $searchSUPPLIES->article[0];

        $urlImmagine = str_replace("/60/", "/500/", $item->ImageURL);

        return $urlImmagine;
    } else {
        return null;
    }
}


function setSupplierCarriers()
{
    $db = Db::getInstance();

    $ups_id = $db->getValue("SELECT id_reference FROM " . _DB_PREFIX_ . "carrier WHERE name='UPS' AND active=1 AND deleted=0");
    $dhl_id = $db->getValue("SELECT id_reference FROM " . _DB_PREFIX_ . "carrier WHERE name='DHL' AND active=1 AND deleted=0");

    $db->execute("DELETE FROM " . _DB_PREFIX_ . "product_carrier where id_product in (select id_product from " . _DB_PREFIX_ . "product where id_supplier=" . Configuration::get("SUPPLIES24_SUPPLIER_ID") . ")");

    $db->execute("INSERT INTO " . _DB_PREFIX_ . "product_carrier SELECT id_product, $ups_id,1 from " . _DB_PREFIX_ . "product where id_supplier=" . Configuration::get("SUPPLIES24_SUPPLIER_ID"));
    $db->execute("INSERT INTO " . _DB_PREFIX_ . "product_carrier SELECT id_product, $dhl_id,1 from " . _DB_PREFIX_ . "product where id_supplier=" . Configuration::get("SUPPLIES24_SUPPLIER_ID"));
}
