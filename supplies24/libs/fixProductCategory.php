<?php
class ProcessProductCategory
{
  public function __construct($id_product)
  {
    $db = Db::getInstance();

    $prodotto = new Product($id_product);

    if ($prodotto->id_category_default == 0) {
      $prodotto->id_category_default = 2;
    }

    $categoria = new Category($prodotto->id_category_default);

    $db->execute("DELETE FROM " . _DB_PREFIX_ . "category_product where id_product=" . $id_product);

    $parents = $categoria->getParentsCategories();

    foreach ($parents as $p) {
      if (
        $p["id_parent"] != Configuration::get("PS_ROOT_CATEGORY") &&
        $p["id_category"] != $prodotto->id_category_default
      ) {
        $prodotto->category[] = $p["id_category"];
      }
    }

    $prodotto->category[] = $prodotto->id_category_default;
    try {
      $prodotto->updateCategories(array_map("intval", $prodotto->category));
    } catch (Exception $e) {
    }

    $prodotto->save();

    return [
      "status" => "success",
      "product" => $prodotto->id
    ];
  }
}
