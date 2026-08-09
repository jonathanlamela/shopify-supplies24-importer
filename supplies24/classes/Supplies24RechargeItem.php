<?php

class Supplies24RechargeItem extends ObjectModel
{
    public $id = null;
    public $min = 0.00;
    public $max = 0.00;
    public $profit = 0.00;

    public static $definition = array(
        'table' => 'supplies24_recharge',
        'primary' => 'id',
        'fields' => array(
            'min' => array('type' => self::TYPE_FLOAT, 'copy_post' => true),
            'max' => array('type' => self::TYPE_FLOAT, 'copy_post' => true),
            'profit' => array('type' => self::TYPE_FLOAT, 'copy_post' => true),
        ),
    );
}
