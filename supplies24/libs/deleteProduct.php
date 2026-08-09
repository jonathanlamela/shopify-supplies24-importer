<?php


class DeleteProduct
{

    public function __construct($id_product)
    {
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
}
