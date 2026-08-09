<?php

class ProcessImage404
{
  function checkImageAndDelete($image_obj)
  {
    $imagePath = _PS_PROD_IMG_DIR_ . $image_obj->getImgPath() . '.jpg';
    // Verifica se l'immagine esiste
    if (!file_exists($imagePath)) {
      try {
        $image_obj->delete();
        return false;
      } catch (PrestaShopException $ex) {
      }
    } else {
      return true;
    }
  }

  public function __construct($id_image)
  {
    $image_obj = new Image($id_image);;

    return [
      "status" => "Check completato",
      "result" => $this->checkImageAndDelete($image_obj) ? "Immagine presente" : "Immagine 404"
    ];
  }
}
