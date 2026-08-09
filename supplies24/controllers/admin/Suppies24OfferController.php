<?php

/**
 * 2014-2016 MyQuickList
 *
 * NOTICE OF LICENSE
 *
 * E' vietata la riproduzione parziale e non del modulo ,
 * la vendita e la distribuzione non autorizzata dalla MyQuickList.
 *
 *  @author    Jonathan La Mela <jonathan.la.mela@gmail.com>
 *  @copyright 2014-2016 MyQuickList
 *  @license   http://www.creativecommons.it/ Creative Commons
 */

require_once _PS_MODULE_DIR_ . "supplies24/classes/Supplies24OfferItem.php";


class Supplies24OfferController extends ModuleAdminController
{

    public function __construct()
    {

        $this->bootstrap = true;
        $this->table = 'supplies24_offer';
        $this->className = 'Supplies24OfferItem';
        $this->lang = false;
        $this->deleted = false;
        $this->explicitSelect = true;
        $this->_defaultOrderBy = 'id';
        $this->allow_export = true;
        $this->identifier = "id";


        $this->context = Context::getContext();

        $this->addRowAction('edit');
        $this->addRowAction('delete');


        $this->fields_list = array(
            'id' => array(
                'title' => 'ID',
                'align' => 'center',
                'class' => 'fixed-width-xs'
            ),

        );



        parent::__construct();
    }

    public function initContent()
    {
        parent::initContent();
    }

    public function init()
    {
        parent::init();
    }

    public function initToolbar()
    {
        parent::initToolbar();

        // Rimuove il pulsante "Add new"
        unset($this->toolbar_btn['new']);
    }

    public function renderForm()
    {
        $this->display = 'edit';
        $this->initToolbar();

        $obj = $this->loadObject(true);

        $db = Db::getInstance();



        $categories = $db->executeS("SELECT id_category,CONCAT('(',id_category,') ',name) as 'name' FROM " . _DB_PREFIX_ . "category_lang where id_category > 1 and id_lang=" . Configuration::get("PS_LANG_DEFAULT") . " order by " . _DB_PREFIX_ . "category_lang.id_category asc");

        $this->fields_form = array(
            'input' => array(
                array(
                    'type' => 'text',
                    'label' => 'Categoria sul listino',
                    'name' => 'category_text',
                    'readonly' => true,
                ),
                array(
                    'type' => 'select',
                    'label' => 'Id categoria prestashop',
                    'name' => 'id_category',
                    'required' => true,
                    'options' => array(
                        'query' => $categories,
                        'id' => 'id_category',
                        'name' => 'name'
                    )
                ),

            ),
            'submit' => array('title' => 'Salva')
        );

        $this->fields_value = array(
            'category_text' => $obj->category_text ? $obj->category_text : "",
            'id_category' => $obj->id_category ? $obj->id_category : null,
        );


        return parent::renderForm();
    }
}
