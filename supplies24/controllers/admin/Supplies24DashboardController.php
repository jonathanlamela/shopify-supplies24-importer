<?php


class Supplies24DashboardController extends ModuleAdminController
{

    public function __construct()
    {

        $this->bootstrap = true;
        $this->lang = false;


        parent::__construct();
    }

    public function initContent()
    {

        $this->context->smarty->assign([
            'apiUrl' =>  Tools::getHttpHost(true)
                . __PS_BASE_URI__
                . "module/supplies24/job",
            'apiKey' => Configuration::get("SUPPLIES24_API_KEY"),
        ]);

        $this->content = $this->context->smarty->fetch('module:supplies24/views/templates/admin/catalogo.tpl');

        parent::initContent();
    }



    public function init()
    {
        parent::init();
    }
}
