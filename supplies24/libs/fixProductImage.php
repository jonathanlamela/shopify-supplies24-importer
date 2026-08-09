<?php


class ProcessProductImage
{
  public function __construct($id_product)
  {

    $prodotto = new Product($id_product);
    $ean = $prodotto->ean13;
    $image_url = null;

    if ($prodotto) {
      $query_params = [
        "UserName" => "puntoclassic",
        "lang" => "it",
        "GTIN" => $ean
      ];

      $url_scheda = "https://live.icecat.biz/api/?" . http_build_query($query_params);
      $scheda = json_decode(file_get_contents($url_scheda));

      if ($scheda) {

        $image_url = $scheda->data->Image->Pic500x500;

        if (!$image_url) {
          $image_url = $scheda->data->Image->HighPic;
        }
      }

      if (!$scheda) {
        $urlSearch =
          "https://www.toner24.it/Handler/LiveSearch.ashx?queryString=" .
          $ean .
          "&action=&page=%2FCerca%2F";
        $searchSUPPLIES = json_decode(file_get_contents($urlSearch));
        if ($searchSUPPLIES && count($searchSUPPLIES->article) > 0) {
          $toner24Img = getToner24Img($prodotto->ean13);
          if ($toner24Img) {
            $image_url = $toner24Img;
          }
        }
      }

      $image_created = false;

      if ($image_url) {

        $shops = Shop::getShops(true, null, true);
        $image = new Image();
        $image->id_product = $prodotto->id;
        $image->position = Image::getHighestPosition($prodotto->id) + 1;
        $image->cover = true;
        $image->add();
        $image->associateTo($shops);

        if (
          !ImageManagerCore::copyImg($prodotto->id, $image->id, $image_url, "products", true)
        ) {
          $image->delete();
        } else {
          $image_created = true;
        }
      } else {
        $image_created = false;
      }

      return [
        "status" => "success",
        "message" => "Prodotto completato",
        "product" => $prodotto->id,
        "image_created" => $image_created
      ];
    } else {

      return [
        "status" => "fail",
        "message" => "Prodotto non trovato",
        "product" => $prodotto->id,
        "image_created" => false
      ];
    }
  }
}
