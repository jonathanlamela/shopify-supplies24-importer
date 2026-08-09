<?php

class Supplies24CategoryItem extends ObjectModel
{
    public $id = null;
    public $category_text = "";
    public $id_category = null;

    public static $definition = array(
        'table' => 'supplies24_category',
        'primary' => 'id',
        'fields' => array(
            'category_text' => array('type' => self::TYPE_STRING, 'copy_post' => true),
            'id_category' => array('type' => self::TYPE_INT, 'copy_post' => true),
        ),
    );
}
