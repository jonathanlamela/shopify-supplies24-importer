<?php
if (!defined('_PS_VERSION_'))
    exit;

class Supplies24 extends Module
{

    public function __construct()
    {
        $this->name = 'supplies24';
        $this->tab = 'front_office_features';
        $this->version = '4.0.0';
        $this->author = 'Jonathan La Mela';
        $this->need_instance = 0;
        $this->ps_versions_compliancy = array('min' => '1.6', 'max' => _PS_VERSION_);
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l('Supplies24.it');
        $this->description = $this->l('Import offers from Supplies24.it and manage stock automatically.');

        $this->confirmUninstall = $this->l('Are you sure you want to uninstall?');

        if (!Configuration::get('MYMODULE_NAME'))
            $this->warning = $this->l('No name provided');
    }

    public function getContent()
    {
        $output = null;


        if (Tools::isSubmit('submit' . $this->name)) {



            if (Tools::getValue("SUPPLIES24_URL") != null) {
                Configuration::updateValue(
                    "SUPPLIES24_URL",
                    Tools::getValue("SUPPLIES24_URL")
                );
            }


            if (Tools::getValue("SUPPLIES24_API_KEY") != null) {
                Configuration::updateValue(
                    "SUPPLIES24_API_KEY",
                    Tools::getValue("SUPPLIES24_API_KEY")
                );
            }

            if (Tools::getValue("SUPPLIES24_SUPPLIER_ID") != null) {
                Configuration::updateValue(
                    "SUPPLIES24_SUPPLIER_ID",
                    Tools::getValue("SUPPLIES24_SUPPLIER_ID")
                );
            }


            $output .= $this->displayConfirmation($this->l('Settings updated'));
        }

        return $output . $this->displayForm();
    }

    public function displayForm()
    {
        $default_lang = (int) Configuration::get('PS_LANG_DEFAULT');


        $db = Db::getInstance();

        $fields_form = array();

        $suppliers = $db->executeS("SELECT id_supplier, name FROM " . _DB_PREFIX_ . "supplier");

        $crono_url = $this->context->link->getModuleLink($this->name, 'crono', array(), true);
        $crono_update_url = $this->context->link->getModuleLink($this->name, 'cronoUpdate', array(), true);

        $fields_form[0]['form'] = array(
            'legend' => array(
                'title' => $this->l('Credenziali'),
            ),
            'input' => array(
                array(
                    'type' => 'text',
                    'label' => $this->l('URL Download - Supplies24  :'),
                    'name' => 'SUPPLIES24_URL'
                ),
                array(
                    'type' => 'text',
                    'label' => $this->l('Chiave:'),
                    'name' => 'SUPPLIES24_API_KEY'
                ),
                array(
                    'type' => 'select',
                    'label' => $this->l('Fornitore negozio'),
                    'name' => 'SUPPLIES24_SUPPLIER_ID',
                    'options' => [
                        "query" => $suppliers,
                        "id" => "id_supplier",
                        "name" => "name"
                    ]
                ),
                array(
                    'type' => 'html',
                    'name' => 'crono_links',
                    'label' => $this->l('Crono (procedura completa)'),
                    'html_content' => '<a href="' . $crono_url . '" target="_blank">' . $crono_url . '</a>'
                ),
                array(
                    'type' => 'html',
                    'name' => 'crono_update_links',
                    'label' => $this->l('Crono (solo aggiornamento)'),
                    'html_content' => '<a href="' . $crono_update_url . '" target="_blank">' . $crono_update_url . '</a>'
                ),
            ),
            'submit' => array(
                'title' => $this->l('Save'),
            )
        );


        $helper = new HelperForm();

        // Module, token and currentIndex
        $helper->module = $this;
        $helper->name_controller = $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');
        $helper->currentIndex = AdminController::$currentIndex . '&configure=' . $this->name;

        // Language
        $helper->default_form_language = $default_lang;
        $helper->allow_employee_form_lang = $default_lang;

        // Title and toolbar
        $helper->title = $this->displayName;
        $helper->show_toolbar = true;        // false -> remove toolbar
        $helper->toolbar_scroll = true;      // yes - > Toolbar is always visible on the top of the screen.
        $helper->submit_action = 'submit' . $this->name;
        $helper->toolbar_btn = array(
            'save' =>
            array(
                'desc' => $this->l('Save'),
                'href' => AdminController::$currentIndex . '&configure=' . $this->name . '&save' . $this->name .
                    '&token=' . Tools::getAdminTokenLite('AdminModules'),
            ),
            'back' => array(
                'href' => AdminController::$currentIndex . '&token=' . Tools::getAdminTokenLite('AdminModules'),
                'desc' => $this->l('Back to list')
            )
        );

        // Load current value
        $helper->fields_value['SUPPLIES24_URL'] = Configuration::get('SUPPLIES24_URL');
        $helper->fields_value['SUPPLIES24_API_KEY'] = Configuration::get('SUPPLIES24_API_KEY');
        $helper->fields_value['SUPPLIES24_SUPPLIER_ID'] = Configuration::get('SUPPLIES24_SUPPLIER_ID');


        return $helper->generateForm($fields_form);
    }

    public function install()
    {
        if (Shop::isFeatureActive())
            Shop::setContext(Shop::CONTEXT_ALL);


        if (!parent::install() || !$this->InstallModule())
            return false;

        return true;
    }



    public function unistall()
    {

        parent::unistall();
        if (!parent::unistall())
            return false;

        return true;
    }


    public function DeleteTabs()
    {

        Db::getInstance()->execute("DELETE FROM " . _DB_PREFIX_ . "tab WHERE module ='" . $this->name . "' ");

        return true;
    }

    public function InstallModule()
    {


        Db::getInstance()->execute("DELETE FROM " . _DB_PREFIX_ . "tab WHERE module ='" . $this->name . "' ");

        $db = Db::getInstance();

        $db->execute("CREATE TABLE IF NOT EXISTS " . _DB_PREFIX_ . "supplies24_category(
            `id` int(11) primary key auto_increment,
            `category_text` text,
            `id_category` int
        )");

        $db->execute("CREATE TABLE IF NOT EXISTS " . _DB_PREFIX_ . "supplies24_recharge (
            id INTEGER
            PRIMARY KEY AUTO_INCREMENT,
            min DOUBLE,
            max DOUBLE,
            profit DOUBLE
            )");

        $db->execute("CREATE TABLE IF NOT EXISTS " . _DB_PREFIX_ . "supplies24_offer (
                `id` int NOT NULL,
                `internal_code` varchar(100),
                `reference` varchar(100) DEFAULT NULL,
                `ean13` text,
                `manufacturer` text,
                `name` text,
                `quantity` int DEFAULT '0',
                `price` decimal(20,6) DEFAULT '0.000000',
                `wholesale_price` decimal(20,6) DEFAULT '0.000000',
                `description_short` text ,
                `category` text,
                `executed` boolean default True,
                `date_add` datetime DEFAULT CURRENT_TIMESTAMP
        )");



        $db->execute("DROP VIEW IF EXISTS " . _DB_PREFIX_ . "guadagni");

        $db->execute("CREATE VIEW " . _DB_PREFIX_ . "guadagni AS
        SELECT
    od.id_order AS 'id',
    FORMAT(SUM(od.total_price_tax_incl), 2) AS 'customer_paid',
    FORMAT(SUM((od.purchase_supplier_price * 1.22) * od.product_quantity), 2) AS 'supplier_paid',
    FORMAT(
        SUM(od.total_price_tax_incl)
        - SUM((od.purchase_supplier_price * 1.22) * od.product_quantity),
        2
    ) AS 'guadagno',
    FORMAT(
        CASE
            WHEN o.payment like '%paypal%'
            THEN (SUM(od.total_price_tax_incl) * 0.034) + 0.35
            ELSE 0
        END,
        2
    ) AS 'payment_tax'
FROM " . _DB_PREFIX_ . "order_detail od
INNER JOIN " . _DB_PREFIX_ . "orders o ON o.id_order = od.id_order
GROUP BY od.id_order
ORDER BY od.id_order DESC;
        ");



        $tabMain = new TabCore();
        $tabMain->class_name = "Supplies24";
        $tabMain->id_parent = 2;
        $tabMain->module = $this->name;
        $tabMain->name[(int) (Configuration::get('PS_LANG_DEFAULT'))] = "Supplies24";
        $tabMain->save();



        $tabDashboard = new TabCore();
        $tabDashboard->class_name = "Supplies24Dashboard";
        $tabDashboard->id_parent = $tabMain->id;
        $tabDashboard->module = $this->name;
        $tabDashboard->name[(int) (Configuration::get('PS_LANG_DEFAULT'))] = $this->l('Dashboard');
        $tabDashboard->save();

        $tabOffer = new TabCore();
        $tabOffer->class_name = "Supplies24Offer";
        $tabOffer->id_parent = $tabMain->id;
        $tabOffer->module = $this->name;
        $tabOffer->name[(int) (Configuration::get('PS_LANG_DEFAULT'))] = $this->l('Offer');
        $tabOffer->save();

        //Main Tab
        $tabRecharge = new TabCore();
        $tabRecharge->class_name = "Supplies24Recharge";
        $tabRecharge->id_parent = $tabMain->id;
        $tabRecharge->module = $this->name;
        $tabRecharge->name[(int) (Configuration::get('PS_LANG_DEFAULT'))] = $this->l('Recharges');
        $tabRecharge->save();

        //Main Tab
        $tabCategory = new TabCore();
        $tabCategory->class_name = "Supplies24Category";
        $tabCategory->id_parent = $tabMain->id;
        $tabCategory->module = $this->name;
        $tabCategory->name[(int) (Configuration::get('PS_LANG_DEFAULT'))] = $this->l('Categories');
        $tabCategory->save();

        //Main Tab
        $tabGuadagni = new TabCore();
        $tabGuadagni->class_name = "Supplies24Guadagni";
        $tabGuadagni->id_parent = $tabMain->id;
        $tabGuadagni->module = $this->name;
        $tabGuadagni->name[(int) (Configuration::get('PS_LANG_DEFAULT'))] = $this->l('Guadagni');
        $tabGuadagni->save();



        return true;
    }
}
