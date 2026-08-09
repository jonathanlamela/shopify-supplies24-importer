<?php

class Supplies24OfferItem extends ObjectModel
{

    public $id = null;
    public $internal_code = "";
    public $reference = "";
    public $ean13 = "";
    public $manufacturer = "";
    public $name = "";
    public $quantity = 0;
    public $price = 0.0;
    public $wholesale_price = 0.0;
    public $description_short = "";
    public $category = "";
    public $executed = true;
    public $date_add = null;

    public static $definition = array(
        'table' => 'supplies24_offer',
        'primary' => 'id',
        'fields' => array(
            'internal_code' => array('type' => self::TYPE_STRING),
            'reference' => array('type' => self::TYPE_STRING),
            'ean13' => array('type' => self::TYPE_STRING),
            'manufacturer' => array('type' => self::TYPE_STRING),
            'name' => array('type' => self::TYPE_STRING),
            'quantity' => array('type' => self::TYPE_INT),
            'price' => array('type' => self::TYPE_FLOAT),
            'wholesale_price' => array('type' => self::TYPE_FLOAT),
            'description_short' => array('type' => self::TYPE_STRING),
            'category' => array('type' => self::TYPE_STRING),
            'executed' => array('type' => self::TYPE_BOOL),
            'date_add' => array('type' => self::TYPE_DATE),
        ),
    );
}
