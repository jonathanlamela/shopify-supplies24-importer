<?php

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


        $this->fields_list = array(
            'id' => array(
                'title' => 'ID',
                'align' => 'center',
                'class' => 'fixed-width-xs'
            ),
            'internal_code' => array(
                'title' => 'Codice interno',
                'type' => 'text',
            ),
            'ean13' => array(
                'title' => 'EAN13',
                'type' => 'text',
            ),
            'reference' => array(
                'title' => 'Codice prodotto',
                'type' => 'text',
            ),
            'price' => array(
                'title' => 'Prezzo',
                'type' => 'text',
            ),
            'wholesale_price' => array(
                'title' => 'Prezzo Supplies24',
                'type' => 'text',
            ),
            'quantity' => array(
                'title' => 'Quantità',
                'type' => 'text',
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


        $this->fields_form = array(
            'input' => array(
                array(
                    'type' => 'text',
                    'label' => 'ID',
                    'name' => 'id',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Codice interno',
                    'name' => 'internal_code',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Codice prodotto',
                    'name' => 'reference',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'EAN13',
                    'name' => 'ean13',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Produttore',
                    'name' => 'manufacturer',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Nome',
                    'name' => 'name',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Quantità',
                    'name' => 'quantity',
                    'readonly' => true,
                ),

                array(
                    'type' => 'text',
                    'label' => 'Prezzo',
                    'name' => 'price',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Prezzo Supplies24',
                    'name' => 'wholesale_price',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Descrizione breve',
                    'name' => 'description_short',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Categoria',
                    'name' => 'category',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Eseguito',
                    'name' => 'executed',
                    'readonly' => true,
                ),
                array(
                    'type' => 'text',
                    'label' => 'Data di aggiunta',
                    'name' => 'date_add',
                    'readonly' => true,
                ),

            ),

        );

        $this->fields_value = array(
            'id' => $obj->id,
            'internal_code' => $obj->internal_code,
            'reference' => $obj->reference,
            'ean13' => $obj->ean13,
            'manufacturer' => $obj->manufacturer,
            'name' => $obj->name,
            'quantity' => $obj->quantity,
            'price' => $obj->price,
            'wholesale_price' => $obj->wholesale_price,
            'description_short' => $obj->description_short,
            'category' => $obj->category,
            'executed' => $obj->executed ? "Yes" : "No",
            'date_add' => $obj->date_add,
        );


        return parent::renderForm();
    }
}
