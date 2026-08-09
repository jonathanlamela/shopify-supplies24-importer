<?php


function setOutStock($id_product)
{
    $db = Db::getInstance();
    $product = new Product($id_product);

    $product->quantity = 0;

    StockAvailable::setQuantity(
        $product->id,
        null,
        0,
        null
    );
    $product->save();

    return [
        "status" => "success",
        "message" => "Prodotto $id_product impostato 0"
    ];
}
