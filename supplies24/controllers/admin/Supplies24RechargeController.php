<?php

require_once _PS_MODULE_DIR_ . "supplies24/classes/Supplies24RechargeItem.php";

class Supplies24RechargeController extends ModuleAdminController
{

    public function __construct()
    {

        $this->bootstrap = true;
        $this->table = 'supplies24_recharge';
        $this->className = 'Supplies24RechargeItem';
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
            'min' => array(
                'title' => 'Min',
                'align' => 'center',
                'orderby' => false
            ),
            'max' => array(
                'title' => 'Max',
                'align' => 'center',
                'orderby' => false
            ),
            'profit' => array(
                'title' => 'Percentuale',
                'align' => 'center',
                'orderby' => false
            ),
        );

        $this->bulk_actions = array(
            'delete' => array(
                'text' => 'Delete selected',
                'icon' => 'icon-trash',
                'confirm' => 'Delete selected items?'
            )
        );
        $this->specificConfirmDelete = false;

        parent::__construct();
    }

    public function initContent()
    {
        if ($this->action == 'select_delete') {
            $this->context->smarty->assign(array(
                'delete_form' => true,
                'url_delete' => htmlentities($_SERVER['REQUEST_URI']),
                'boxes' => $this->boxes,
            ));
        }
        parent::initContent();
    }

    public function init()
    {
        parent::init();
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
                    'label' => 'Min:',
                    'name' => 'min',
                    'id' => 'title',
                    'required' => "true",
                    'size' => 50
                ),
                array(
                    'type' => 'text',
                    'label' => 'Max:',
                    'name' => 'max',
                    'id' => 'title',
                    'required' => "true",
                    'size' => 50
                ),
                array(
                    'type' => 'text',
                    'label' => 'Percentuale:',
                    'name' => 'profit',
                    'id' => 'title',
                    'required' => "true",
                    'size' => 50
                ),
            ),
            'submit' => array('title' => 'Salva')
        );


        $this->fields_value = array(
            'min' => $obj->min ? $obj->min : 0.00,
            'max' => $obj->max ? $obj->max : 0.00,
            'profit' => $obj->profit ? $obj->profit : 0.00,
        );


        return parent::renderForm();
    }
}
