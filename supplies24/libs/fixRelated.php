<?php


class FixSchedeTecnicheIcecat
{

    public function __construct($id_product)
    {
        $prodotto = new Product($id_product);

        $query_params = [
            "UserName" => "puntoclassic",
            "lang" => "it",
            "GTIN" => $prodotto->ean13
        ];

        $url_scheda = "https://live.icecat.biz/api/?" . http_build_query($query_params);


        $scheda = json_decode(file_get_contents($url_scheda));

        if ($scheda && $prodotto->reference) {

            $db = Db::getInstance();

            $related = $scheda->data->ProductRelated;
            foreach ($related as $prodotto_related) {

                $codice = $prodotto_related->ProductCode;

                $search = $db->executeS('SELECT id_product from ' . _DB_PREFIX_ . 'product where reference="' . $codice . '" or reference like "%' . $codice . '%"');

                if (count($search) > 0) {

                    $id_related = $search[0]["id_product"];

                    $db->execute("DELETE FROM " . _DB_PREFIX_ . "accessory where id_product_1=$prodotto->id and id_product_2=$id_related");

                    $db->execute("DELETE FROM " . _DB_PREFIX_ . "accessory where id_product_2=$prodotto->id and id_product_1=$id_related");

                    $db->insert("accessory", [
                        "id_product_1" => $prodotto->id,
                        "id_product_2" => $id_related
                    ]);

                    $db->insert("accessory", [
                        "id_product_2" => $prodotto->id,
                        "id_product_1" => $id_related
                    ]);
                }
            }
        }

        Search::indexation(false, $prodotto->id);

        if ($scheda) {
            return [
                "status" => "success",
                "message" => "Scheda trovata",
                "product_id" => $prodotto->id,
                "url_scheda" => $url_scheda,
            ];
        } else {
            return [
                "status" => "fail",
                "message" => "Scheda non trovata",
                "product_id" => $prodotto->id,
                "url_scheda" => $url_scheda,

            ];
        }
    }

    function createFeatureValue($feature, $value)
    {
        $langs = Language::getLanguages(false);

        $featureValue = new FeatureValue();
        $featureValue->id_feature = $feature;
        $featureValue->custom = true;

        foreach ($langs as $lang) {
            $featureValue->value[$lang["id_lang"]] = $value;
        }

        $featureValue->add();

        return $featureValue->id;
    }


    function getOrCreateFeature($feature_name)
    {
        $db = Db::getInstance();
        $searchFeature = $db->executeS('select id_feature from ' . _DB_PREFIX_ . 'feature_lang where name="' . $feature_name . '"');

        if (count($searchFeature) == 0) {
            $langs = Language::getLanguages(false);

            $feature = new Feature();
            foreach ($langs as $lang) {
                $feature->name[$lang["id_lang"]] = $feature_name;
            }

            $feature->add();

            return $feature->id;
        } else {
            return $searchFeature[0]["id_feature"];
        }
    }
}
