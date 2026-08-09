<?php

class Supplies24GuadagniController extends ModuleAdminController
{

    public function __construct()
    {

        $this->bootstrap = true;
        $this->table = "guadagni";
        $this->lang = false;
        $this->deleted = false;
        $this->explicitSelect = true;
        $this->_defaultOrderBy = 'id';
        $this->allow_export = true;

        $this->context = Context::getContext();


        $this->fields_list = array(
            'id' => array(
                'title' => 'ID Ordine',
                'align' => 'center',
                'class' => 'fixed-width-xs'
            ),
            'customer_paid' => array(
                'title' => 'Importo pagato dal cliente',
                'align' => 'center',
                'orderby' => true,
            ),
            'supplier_paid' => array(
                'title' => 'Costo prodotti',
                'align' => 'center',
                'orderby' => true,
            ),
            'payment_tax' => array(
                'title' => 'Tassa di pagamento',
                'align' => 'center',
                'orderby' => true,
            ),
            'payment_method' => array(
                'title' => 'Metodo di pagamento',
                'align' => 'center',
                'orderby' => true,
            ),
            'guadagno' => array(
                'title' => 'Guadagno',
                'align' => 'center',
                'orderby' => true,
            ),

        );


        parent::__construct();
    }
}
