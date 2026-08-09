<?php



function processProduct($id, $skipCreate = false)
{
  $db = Db::getInstance();
  $rs = $db->executeS(
    "SELECT * FROM " . _DB_PREFIX_ . "supplies24_offer WHERE id=$id LIMIT 1"
  );
  $data = $rs[0];
  $ean = normalizeEan($data["ean13"]);
  $reference = normalizeReference($data["reference"]);

  $data["manufacturer"] = ucwords(strtolower($data["manufacturer"]));

  $query = "SELECT id_product FROM " . _DB_PREFIX_ . "product_supplier WHERE product_supplier_reference = '" . $data["internal_code"] . "'";
  $id_product = $db->getValue($query);

  if ($id_product) {
    return updateProduct($data, $id_product);
  } elseif ($skipCreate) {
    return [
      "status" => "skipped",
      "message" => "Creazione saltata (modalità solo aggiornamento)",
      "data" => $data
    ];
  } else {
    return createProduct($data, $ean, $reference);
  }
}

function createProduct($data, $ean, $reference)
{

  $db = Db::getInstance();

  $product = new Product();

  $product->ean13 = $ean;
  $product->reference = $reference;
  $langs = Language::getLanguages(false);

  // Cerca la scheda per EAN
  $query_params = [
    "UserName" => "puntoclassic",
    "lang" => "it",
    "GTIN" => $ean
  ];
  $url_scheda = "https://live.icecat.biz/api/?" . http_build_query($query_params);
  $scheda = json_decode(file_get_contents($url_scheda));

  ///Se è stata trovata la scheda usa il name e le descrizioni da lì
  if ($scheda) {
    $name_icecat = $scheda->data->GeneralInfo->Title;
    if ($name_icecat) {
      $data["name"] = $name_icecat;
    }

    $descriptionIcecat =
      $scheda->data->GeneralInfo->SummaryDescription->ShortSummaryDescription;
    if ($descriptionIcecat) {
      $data["description_short"] = $descriptionIcecat;
    }

    $descriptionLungaIcecat =
      $scheda->data->GeneralInfo->SummaryDescription->LongSummaryDescription;
    if ($descriptionLungaIcecat) {
      $data["description"] = $descriptionIcecat;
    }
  }

  //Se il nome è vuoto usa il reference
  if (empty($data["name"])) {
    $data["name"] = $data["reference"];
  }


  // Imposta il campo nome
  if (!empty($data["name"])) {
    foreach ($langs as $lang) {
      $name_sanitized = sanitizeName($data["name"]);

      $product->name[$lang["id_lang"]] = checkField($name_sanitized, 128);
      $product->link_rewrite[$lang["id_lang"]] = Tools::str2url(
        checkField($name_sanitized, 128)
      );
      $product->meta_title[$lang["id_lang"]] = Tools::safeOutput(
        checkField($name_sanitized, 70)
      );
    }
  }

  // Imposta la descrizione
  if (!empty($data["description"])) {
    foreach ($langs as $lang) {
      $description_sanitized = sanitizeGenericName($data["description"]);
      $product->description[$lang["id_lang"]] = $description_sanitized;
    }
  }

  //Imposta la descrizione breve
  if (!empty($data["description_short"])) {
    foreach ($langs as $lang) {

      $description_short_sanitized = sanitizeGenericName($data["description_short"]);

      $product->description_short[$lang["id_lang"]] = "<p>" . checkField(
        $description_short_sanitized,
        256
      ) . "</p>";
      $product->meta_description[$lang["id_lang"]] = checkField($description_short_sanitized, 160);
    }
  }

  // Imposta la marca
  $manufacturer = null;
  if (!empty($data["manufacturer"])) {
    $manufacturer = getManufacturer($data["manufacturer"]);
  }
  if ($manufacturer != null) {
    $product->id_manufacturer = $manufacturer->id;
  }

  //Parametri per il negozio
  $product->out_of_stock = 2;
  $product->id_tax_rules_group = 1;
  $product->id_shop_default = Configuration::get("PS_SHOP_DEFAULT");


  //Imposta il prezzo di vendita e il prezzo di acquisto
  $product->price = round($data["price"], 2);
  $product->wholesale_price = round($data["wholesale_price"], 2);

  // Crea il prodotto
  if ($product->add()) {

    //Se il nome era vuoto eliminalo
    if (count($product->name) == 0) {
      $product->delete();
      return [
        "status" => "failed",
        "reason" => "Creazione fallita: problema nel name",
        "data" => $data
      ];
    }

    //Associa il fornitore
    $distributore = Configuration::get("SUPPLIES24_SUPPLIER_ID");
    $associated_suppliers = ProductSupplier::getSupplierCollection(
      $product->id
    );
    $suppliers_to_associate = [];
    foreach ($associated_suppliers as $key => $associated_supplier) {
      if (
        !in_array($associated_supplier->id_supplier, $suppliers_to_associate)
      ) {
        $associated_supplier->delete();
        unset($associated_suppliers[$key]);
      }
    }
    $data_supplier = new ProductSupplier();
    $data_supplier->id_product = $product->id;
    $data_supplier->id_product_attribute = 0;
    $data_supplier->id_supplier = Configuration::get("SUPPLIES24_SUPPLIER_ID");
    $data_supplier->product_supplier_price_te = $data["wholesale_price"];
    $data_supplier->product_supplier_reference = $data["internal_code"];
    $data_supplier->add();
    $product->id_supplier = Configuration::get("SUPPLIES24_SUPPLIER_ID");
    $product->supplier_reference = $data["internal_code"];

    $distributore_obj = new Supplier($distributore);
    $distributore_obj->associateTo($product->id_shop_list);


    //Associa categoria
    $category = new Category(Configuration::get("PS_HOME_CATEGORY"));
    $product->id_category_default = $category->id;
    $product->category[] .= $category->id;
    $cat = new Category($category->id);
    //Se c'è la scheda da icecat
    if ($scheda) {
      //Prendi il nome
      $category_name = $scheda->data->GeneralInfo->Category->Name->Value;
      if ($category_name) {
        // Cerca una categoria che si chiama esattamente così
        $existing_category_id = $db->getValue(
          "SELECT id_category FROM " .
            _DB_PREFIX_ .
            'supplies24_category WHERE category_text="' . pSQL($category_name) . '"'
        );
        //Se c'è usala
        if ($existing_category_id) {
          $cat = new Category($existing_category_id);
          $product->id_category_default = $cat->id;
        } else {
          //Se non c'è creala
          $cat = new Category();
          $cat->id_parent = Configuration::get("PS_HOME_CATEGORY");
          $cat->name[$lang["id_lang"]] = $category_name;
          $cat->link_rewrite[$lang["id_lang"]] = Tools::str2url($category_name);
          $cat->save();
          //Associa questa categoria al prodotto
          $product->id_category_default = $cat->id;
          //Memorizza questa categoria sulla tabella category per abbinarla dopo
          $db->insert("supplies24_category", [
            "id_category" => $cat->id,
            "category_text" => pSQL($category_name)
          ]);
          //Salva le modifiche
          $product->save();
        }
      }
    } else if ($data["category"] != "") {
      //C'è la categoria nel listino
      $category_name = trim($data["category"]);
      //Cerca una categoria che si chiama esattamente così
      $existing_category_id = $db->getValue(
        "SELECT id_category FROM " .
          _DB_PREFIX_ .
          'supplies24_category WHERE category_text="' . $category_name . '"'
      );

      // Se esiste usala
      if ($existing_category_id) {
        $cat = new Category($existing_category_id);
        $product->id_category_default = $cat->id;
      } else {
        // Creala se non esiste
        $cat = new Category();
        $cat->id_parent = Configuration::get("PS_HOME_CATEGORY");
        $cat->name[$lang["id_lang"]] = substr($category_name, 0, 128);
        $cat->link_rewrite[$lang["id_lang"]] = Tools::str2url($category_name);
        $cat->save();
        //Associa il prodotto a questa categoria
        $product->id_category_default = $cat->id;
        //Memorizza questa categoria sulla tabella category per abbinarla dopo
        $db->insert("supplies24_category", [
          "id_category" => $cat->id,
          "category_text" => pSQL($data["category"])
        ]);
        //Salva le modifiche
        $product->save();
      }
    }

    //Abbina il prodotto a tutte le sue categorie padre
    $parents = $cat->getParentsCategories();
    foreach ($parents as $p) {
      if (
        $p["id_parent"] != Configuration::get("PS_ROOT_CATEGORY") &&
        $p["id_category"] != $product->id_category_default
      ) {
        $product->category[] = $p["id_category"];
      }
    }
    $product->category[] = $product->id_category_default;
    try {
      $product->updateCategories(array_map("intval", $product->category));
    } catch (Exception $e) {
    }

    //Aggiorna stock
    StockAvailable::setQuantity(
      $product->id,
      null,
      $data["quantity"],
      null
    );
    $product->save();

    //Immagine prodotto
    $image_url = null;
    if ($scheda) {
      $image_url  = $scheda->data->Image->Pic500x500;
      if (!$image_url) {
        $image_url  = $scheda->data->Image->HighPic;
      }
    } else {
      $urlSearch =
        "https://www.toner24.it/Handler/LiveSearch.ashx?queryString=" .
        $ean .
        "&action=&page=%2FCerca%2F";
      $searchSUPPLIES = json_decode(file_get_contents($urlSearch));
      if ($searchSUPPLIES && count($searchSUPPLIES->article) > 0) {
        $toner24Img = getToner24Img($product->ean13);
        if ($toner24Img) {
          $image_url  = $toner24Img;
        }
      }
    }
    if ($image_url) {
      $shops = Shop::getShops(true, null, true);
      $image = new Image();
      $image->id_product = $product->id;
      $image->position = Image::getHighestPosition($product->id) + 1;
      $image->cover = true;
      foreach ($langs as $lang) {
        $image->legend[$lang["id_lang"]] = checkField($data["name"], 127);
      }
      $image->add();
      $image->associateTo($shops);
      if (
        !ImageManagerCore::copyImg($product->id, $image->id,  $image_url, "products", true)
      ) {
        $image->delete();
      }
    }

    //Indice di ricerca
    Search::indexation(false, $product->id);

    //Processo completato
    if ($product->id != null) {
      return [
        "status" => "success",
        "message" => "Creazione completata con id " . $product->id,
        "data" => $data,
        "icecatData" => $scheda != null
      ];
    }
  } else {
    return [
      "status" => "fail",
      "message" => "Creazione fallita",
      "data" => $data,
      "icecatData" => $scheda != null
    ];
  }
}

function updateProduct($data, $id)
{

  $db = Db::getInstance();

  // Carica solo i dati necessari con query diretta
  $product_data = $db->getRow(
    "SELECT price, reference, ean13 FROM " . _DB_PREFIX_ . "product WHERE id_product=" . (int)$id
  );

  if (!$product_data) {
    return [
      "status" => "fail",
      "message" => "Prodotto non trovato"
    ];
  }

  $original_price = $product_data["price"];

  // Carica stock con query diretta
  $stock_data = $db->getRow(
    "SELECT quantity FROM " . _DB_PREFIX_ . "stock_available WHERE id_product=" . (int)$id
  );
  $original_stock = $stock_data ? $stock_data["quantity"] : 0;

  // Aggiorna prezzo e prezzo all'ingrosso con query diretta
  $db->update("product", [
    "price" => $data["price"],
    "wholesale_price" => $data["wholesale_price"]
  ], "id_product=" . (int)$id);


  $db->update("stock_available", [
    "quantity" => $data["quantity"]
  ], "id_product=" . (int)$id);

  $db->update("product_shop", [
    "price" => $data["price"],
    "wholesale_price" => $data["wholesale_price"]
  ], "id_product=" . (int)$id);

  $db->update("product_supplier", [
    "product_supplier_price_te" => $data["wholesale_price"],
    "id_supplier" => Configuration::get("SUPPLIES24_SUPPLIER_ID")
  ], "product_supplier_reference='" . pSQL($data["internal_code"]) . "'");


  return [
    "status" => "success",
    "message" => "Aggiornamento completato",
    "fields" => [
      "internal_code" => $data["internal_code"],
      "product_price" => $original_price,
      "new_price" => $data["price"],
      "original_stock" => $original_stock,
      "new_stock" => $data["quantity"],
      "id" => $id,
      "reference" => $product_data["reference"],
      "ean13" => $product_data["ean13"]
    ]
  ];
}
