<?php

class FixNameDescriptionIcecat
{

    public function __construct($id_product)
    {
        $prodotto = new Product($id_product);

        $langs = Language::getLanguages(false);


        $query_params = [
            "UserName" => "puntoclassic",
            "lang" => "it",
            "GTIN" => $prodotto->ean13
        ];

        $url_scheda = "https://live.icecat.biz/api/?" . http_build_query($query_params);

        $scheda = json_decode(file_get_contents($url_scheda));

        if ($scheda) {

            $nomeIcecat =
                $scheda->data->GeneralInfo->Title;
            if ($nomeIcecat) {
                foreach ($langs as $lang) {
                    $prodotto->name[$lang["id_lang"]] = sanitizeName(
                        checkField($nomeIcecat, 128)
                    );
                    $prodotto->link_rewrite[$lang["id_lang"]] = Tools::link_rewrite(
                        checkField(sanitizeName($nomeIcecat), 128)
                    );
                    $prodotto->meta_title[$lang["id_lang"]] = sanitizeName(
                        checkField($nomeIcecat, 70)
                    );
                }
            }

            $descrizioneIcecat =
                $scheda->data->GeneralInfo->SummaryDescription->ShortSummaryDescription;
            if ($descrizioneIcecat) {
                foreach ($langs as $lang) {

                    $descrizioneIcecat = str_replace("/", " ", $descrizioneIcecat);

                    $prodotto->description_short[$lang["id_lang"]] = sanitizeGenericName(checkField($descrizioneIcecat, 160));
                }
            }

            $descrizioneLungaIcecat =
                $scheda->data->GeneralInfo->SummaryDescription->LongSummaryDescription;
            if ($descrizioneLungaIcecat) {
                foreach ($langs as $lang) {
                    $prodotto->description[$lang["id_lang"]] = sanitizeGenericName($descrizioneLungaIcecat);
                    $prodotto->meta_description[$lang["id_lang"]] = sanitizeGenericName(checkField($descrizioneLungaIcecat, 160));
                }
            }
        }


        $prodotto->save();


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
}
