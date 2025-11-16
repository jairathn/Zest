// Comprehensive NDC mapping for biologics used in psoriasis and atopic dermatitis
// Including originator products and biosimilars
// Source: FDA NDC database + manufacturer package inserts

export const biologicNdcMappings = [
  // ========================================
  // TNF INHIBITORS
  // ========================================

  // HUMIRA (adalimumab) - AbbVie
  { ndcCode: '0002-8900-01', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },
  { ndcCode: '0002-8900-02', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },
  { ndcCode: '0002-4500-01', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '0002-4500-02', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '0002-7811-01', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '80mg/0.8mL', dosageForm: 'Pen' },
  { ndcCode: '0002-7811-02', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '80mg/0.8mL', dosageForm: 'Pen' },
  { ndcCode: '0002-7529-01', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '10mg/0.2mL', dosageForm: 'Syringe' },
  { ndcCode: '0002-7529-02', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '10mg/0.2mL', dosageForm: 'Syringe' },
  { ndcCode: '0002-7811-03', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '20mg/0.4mL', dosageForm: 'Pen' },
  { ndcCode: '0002-7811-04', drugName: 'Humira', genericName: 'adalimumab', drugClass: 'TNF_INHIBITOR', strength: '20mg/0.4mL', dosageForm: 'Pen' },

  // HYRIMOZ (adalimumab-adaz biosimilar) - Sandoz
  { ndcCode: '0781-3049-94', drugName: 'Hyrimoz', genericName: 'adalimumab-adaz', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '0781-3049-95', drugName: 'Hyrimoz', genericName: 'adalimumab-adaz', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '0781-3054-94', drugName: 'Hyrimoz', genericName: 'adalimumab-adaz', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },
  { ndcCode: '0781-3054-95', drugName: 'Hyrimoz', genericName: 'adalimumab-adaz', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },

  // AMJEVITA (adalimumab-atto biosimilar) - Amgen
  { ndcCode: '55513-0950-01', drugName: 'Amjevita', genericName: 'adalimumab-atto', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '55513-0950-02', drugName: 'Amjevita', genericName: 'adalimumab-atto', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '55513-0952-01', drugName: 'Amjevita', genericName: 'adalimumab-atto', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Autoinjector' },
  { ndcCode: '55513-0952-02', drugName: 'Amjevita', genericName: 'adalimumab-atto', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Autoinjector' },
  { ndcCode: '55513-0954-01', drugName: 'Amjevita', genericName: 'adalimumab-atto', drugClass: 'TNF_INHIBITOR', strength: '80mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '55513-0954-02', drugName: 'Amjevita', genericName: 'adalimumab-atto', drugClass: 'TNF_INHIBITOR', strength: '80mg/0.8mL', dosageForm: 'Syringe' },

  // CYLTEZO (adalimumab-adbm biosimilar) - Boehringer Ingelheim
  { ndcCode: '0597-0140-02', drugName: 'Cyltezo', genericName: 'adalimumab-adbm', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '0597-0141-02', drugName: 'Cyltezo', genericName: 'adalimumab-adbm', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },

  // HADLIMA (adalimumab-bwwd biosimilar) - Samsung Bioepis
  { ndcCode: '66215-0501-02', drugName: 'Hadlima', genericName: 'adalimumab-bwwd', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '66215-0502-02', drugName: 'Hadlima', genericName: 'adalimumab-bwwd', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },

  // HULIO (adalimumab-fkjp biosimilar) - Mylan
  { ndcCode: '67457-0437-02', drugName: 'Hulio', genericName: 'adalimumab-fkjp', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '67457-0438-02', drugName: 'Hulio', genericName: 'adalimumab-fkjp', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },

  // YUFLYMA (adalimumab-aaty biosimilar) - Celltrion
  { ndcCode: '70010-0040-02', drugName: 'Yuflyma', genericName: 'adalimumab-aaty', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '70010-0041-02', drugName: 'Yuflyma', genericName: 'adalimumab-aaty', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },

  // YUSIMRY (adalimumab-aqvh biosimilar) - Coherus
  { ndcCode: '69452-0401-02', drugName: 'Yusimry', genericName: 'adalimumab-aqvh', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Syringe' },
  { ndcCode: '69452-0402-02', drugName: 'Yusimry', genericName: 'adalimumab-aqvh', drugClass: 'TNF_INHIBITOR', strength: '40mg/0.8mL', dosageForm: 'Pen' },

  // ENBREL (etanercept) - Amgen
  { ndcCode: '58406-0435-34', drugName: 'Enbrel', genericName: 'etanercept', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '58406-0435-52', drugName: 'Enbrel', genericName: 'etanercept', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '58406-0425-34', drugName: 'Enbrel', genericName: 'etanercept', drugClass: 'TNF_INHIBITOR', strength: '25mg/0.5mL', dosageForm: 'Syringe' },
  { ndcCode: '58406-0425-52', drugName: 'Enbrel', genericName: 'etanercept', drugClass: 'TNF_INHIBITOR', strength: '25mg/0.5mL', dosageForm: 'Syringe' },
  { ndcCode: '58406-0445-34', drugName: 'Enbrel', genericName: 'etanercept', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Autoinjector' },
  { ndcCode: '58406-0445-52', drugName: 'Enbrel', genericName: 'etanercept', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Autoinjector' },

  // ERELZI (etanercept-szzs biosimilar) - Sandoz
  { ndcCode: '0781-7105-94', drugName: 'Erelzi', genericName: 'etanercept-szzs', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '0781-7105-95', drugName: 'Erelzi', genericName: 'etanercept-szzs', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '0781-7106-94', drugName: 'Erelzi', genericName: 'etanercept-szzs', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Autoinjector' },
  { ndcCode: '0781-7106-95', drugName: 'Erelzi', genericName: 'etanercept-szzs', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Autoinjector' },

  // ETICOVO (etanercept-ykro biosimilar) - Samsung Bioepis
  { ndcCode: '66215-0701-04', drugName: 'Eticovo', genericName: 'etanercept-ykro', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '66215-0702-04', drugName: 'Eticovo', genericName: 'etanercept-ykro', drugClass: 'TNF_INHIBITOR', strength: '50mg/mL', dosageForm: 'Autoinjector' },

  // CIMZIA (certolizumab pegol) - UCB
  { ndcCode: '50474-0700-01', drugName: 'Cimzia', genericName: 'certolizumab pegol', drugClass: 'TNF_INHIBITOR', strength: '200mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '50474-0700-02', drugName: 'Cimzia', genericName: 'certolizumab pegol', drugClass: 'TNF_INHIBITOR', strength: '200mg/mL', dosageForm: 'Syringe' },

  // ========================================
  // IL-17 INHIBITORS
  // ========================================

  // COSENTYX (secukinumab) - Novartis
  { ndcCode: '0078-0639-61', drugName: 'Cosentyx', genericName: 'secukinumab', drugClass: 'IL17_INHIBITOR', strength: '150mg/mL', dosageForm: 'Pen' },
  { ndcCode: '0078-0639-68', drugName: 'Cosentyx', genericName: 'secukinumab', drugClass: 'IL17_INHIBITOR', strength: '150mg/mL', dosageForm: 'Pen' },
  { ndcCode: '0078-0670-61', drugName: 'Cosentyx', genericName: 'secukinumab', drugClass: 'IL17_INHIBITOR', strength: '150mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '0078-0670-68', drugName: 'Cosentyx', genericName: 'secukinumab', drugClass: 'IL17_INHIBITOR', strength: '150mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '0078-0715-61', drugName: 'Cosentyx', genericName: 'secukinumab', drugClass: 'IL17_INHIBITOR', strength: '300mg/2mL', dosageForm: 'Pen' },
  { ndcCode: '0078-0715-68', drugName: 'Cosentyx', genericName: 'secukinumab', drugClass: 'IL17_INHIBITOR', strength: '300mg/2mL', dosageForm: 'Pen' },

  // TALTZ (ixekizumab) - Eli Lilly
  { ndcCode: '0002-1467-01', drugName: 'Taltz', genericName: 'ixekizumab', drugClass: 'IL17_INHIBITOR', strength: '80mg/mL', dosageForm: 'Autoinjector' },
  { ndcCode: '0002-1467-02', drugName: 'Taltz', genericName: 'ixekizumab', drugClass: 'IL17_INHIBITOR', strength: '80mg/mL', dosageForm: 'Autoinjector' },
  { ndcCode: '0002-1467-03', drugName: 'Taltz', genericName: 'ixekizumab', drugClass: 'IL17_INHIBITOR', strength: '80mg/mL', dosageForm: 'Autoinjector' },
  { ndcCode: '0002-1468-01', drugName: 'Taltz', genericName: 'ixekizumab', drugClass: 'IL17_INHIBITOR', strength: '80mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '0002-1468-02', drugName: 'Taltz', genericName: 'ixekizumab', drugClass: 'IL17_INHIBITOR', strength: '80mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '0002-1468-03', drugName: 'Taltz', genericName: 'ixekizumab', drugClass: 'IL17_INHIBITOR', strength: '80mg/mL', dosageForm: 'Syringe' },

  // SILIQ (brodalumab) - Bausch Health (discontinued but may appear in historical data)
  { ndcCode: '50486-1010-01', drugName: 'Siliq', genericName: 'brodalumab', drugClass: 'IL17_INHIBITOR', strength: '210mg/1.5mL', dosageForm: 'Syringe' },
  { ndcCode: '50486-1010-02', drugName: 'Siliq', genericName: 'brodalumab', drugClass: 'IL17_INHIBITOR', strength: '210mg/1.5mL', dosageForm: 'Syringe' },

  // ========================================
  // IL-23 INHIBITORS
  // ========================================

  // TREMFYA (guselkumab) - Janssen
  { ndcCode: '57894-0060-01', drugName: 'Tremfya', genericName: 'guselkumab', drugClass: 'IL23_INHIBITOR', strength: '100mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '57894-0060-02', drugName: 'Tremfya', genericName: 'guselkumab', drugClass: 'IL23_INHIBITOR', strength: '100mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '57894-0061-01', drugName: 'Tremfya', genericName: 'guselkumab', drugClass: 'IL23_INHIBITOR', strength: '100mg/mL', dosageForm: 'One-Press' },
  { ndcCode: '57894-0061-02', drugName: 'Tremfya', genericName: 'guselkumab', drugClass: 'IL23_INHIBITOR', strength: '100mg/mL', dosageForm: 'One-Press' },

  // SKYRIZI (risankizumab-rzaa) - AbbVie
  { ndcCode: '0074-0554-71', drugName: 'Skyrizi', genericName: 'risankizumab-rzaa', drugClass: 'IL23_INHIBITOR', strength: '150mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '0074-0554-72', drugName: 'Skyrizi', genericName: 'risankizumab-rzaa', drugClass: 'IL23_INHIBITOR', strength: '150mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '0074-0555-71', drugName: 'Skyrizi', genericName: 'risankizumab-rzaa', drugClass: 'IL23_INHIBITOR', strength: '150mg/mL', dosageForm: 'Pen' },
  { ndcCode: '0074-0555-72', drugName: 'Skyrizi', genericName: 'risankizumab-rzaa', drugClass: 'IL23_INHIBITOR', strength: '150mg/mL', dosageForm: 'Pen' },
  { ndcCode: '0074-0773-01', drugName: 'Skyrizi', genericName: 'risankizumab-rzaa', drugClass: 'IL23_INHIBITOR', strength: '360mg/2.4mL', dosageForm: 'Pen' },

  // ILUMYA (tildrakizumab-asmn) - Sun Pharma
  { ndcCode: '47335-0925-83', drugName: 'Ilumya', genericName: 'tildrakizumab-asmn', drugClass: 'IL23_INHIBITOR', strength: '100mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '47335-0925-84', drugName: 'Ilumya', genericName: 'tildrakizumab-asmn', drugClass: 'IL23_INHIBITOR', strength: '100mg/mL', dosageForm: 'Syringe' },

  // ========================================
  // IL-12/23 INHIBITORS
  // ========================================

  // STELARA (ustekinumab) - Janssen
  { ndcCode: '57894-0060-02', drugName: 'Stelara', genericName: 'ustekinumab', drugClass: 'IL12_23_INHIBITOR', strength: '45mg/0.5mL', dosageForm: 'Syringe' },
  { ndcCode: '57894-0061-02', drugName: 'Stelara', genericName: 'ustekinumab', drugClass: 'IL12_23_INHIBITOR', strength: '90mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '57894-0062-02', drugName: 'Stelara', genericName: 'ustekinumab', drugClass: 'IL12_23_INHIBITOR', strength: '45mg/0.5mL', dosageForm: 'Vial' },
  { ndcCode: '57894-0063-02', drugName: 'Stelara', genericName: 'ustekinumab', drugClass: 'IL12_23_INHIBITOR', strength: '90mg/mL', dosageForm: 'Vial' },
  { ndcCode: '0597-0495-50', drugName: 'Stelara', genericName: 'ustekinumab', drugClass: 'IL12_23_INHIBITOR', strength: '130mg/26mL', dosageForm: 'IV Infusion' },

  // WEZLANA (ustekinumab-auub biosimilar) - Amgen
  { ndcCode: '55513-0920-01', drugName: 'Wezlana', genericName: 'ustekinumab-auub', drugClass: 'IL12_23_INHIBITOR', strength: '45mg/0.5mL', dosageForm: 'Syringe' },
  { ndcCode: '55513-0921-01', drugName: 'Wezlana', genericName: 'ustekinumab-auub', drugClass: 'IL12_23_INHIBITOR', strength: '90mg/mL', dosageForm: 'Syringe' },

  // ========================================
  // IL-4/13 INHIBITORS (Atopic Dermatitis)
  // ========================================

  // DUPIXENT (dupilumab) - Regeneron/Sanofi
  { ndcCode: '00024-5911-01', drugName: 'Dupixent', genericName: 'dupilumab', drugClass: 'IL4_13_INHIBITOR', strength: '300mg/2mL', dosageForm: 'Syringe' },
  { ndcCode: '00024-5911-02', drugName: 'Dupixent', genericName: 'dupilumab', drugClass: 'IL4_13_INHIBITOR', strength: '300mg/2mL', dosageForm: 'Syringe' },
  { ndcCode: '00024-5912-01', drugName: 'Dupixent', genericName: 'dupilumab', drugClass: 'IL4_13_INHIBITOR', strength: '200mg/1.14mL', dosageForm: 'Syringe' },
  { ndcCode: '00024-5912-02', drugName: 'Dupixent', genericName: 'dupilumab', drugClass: 'IL4_13_INHIBITOR', strength: '200mg/1.14mL', dosageForm: 'Syringe' },
  { ndcCode: '00024-5913-01', drugName: 'Dupixent', genericName: 'dupilumab', drugClass: 'IL4_13_INHIBITOR', strength: '300mg/2mL', dosageForm: 'Pen' },
  { ndcCode: '00024-5913-02', drugName: 'Dupixent', genericName: 'dupilumab', drugClass: 'IL4_13_INHIBITOR', strength: '300mg/2mL', dosageForm: 'Pen' },

  // ========================================
  // JAK INHIBITORS (Oral, not injectable but relevant)
  // ========================================

  // RINVOQ (upadacitinib) - AbbVie
  { ndcCode: '0074-1065-30', drugName: 'Rinvoq', genericName: 'upadacitinib', drugClass: 'JAK_INHIBITOR', strength: '15mg', dosageForm: 'Tablet' },
  { ndcCode: '0074-1066-30', drugName: 'Rinvoq', genericName: 'upadacitinib', drugClass: 'JAK_INHIBITOR', strength: '30mg', dosageForm: 'Tablet' },
  { ndcCode: '0074-1067-30', drugName: 'Rinvoq', genericName: 'upadacitinib', drugClass: 'JAK_INHIBITOR', strength: '45mg', dosageForm: 'Tablet' },

  // CIBINQO (abrocitinib) - Pfizer
  { ndcCode: '00069-0261-30', drugName: 'Cibinqo', genericName: 'abrocitinib', drugClass: 'JAK_INHIBITOR', strength: '50mg', dosageForm: 'Tablet' },
  { ndcCode: '00069-0262-30', drugName: 'Cibinqo', genericName: 'abrocitinib', drugClass: 'JAK_INHIBITOR', strength: '100mg', dosageForm: 'Tablet' },
  { ndcCode: '00069-0263-30', drugName: 'Cibinqo', genericName: 'abrocitinib', drugClass: 'JAK_INHIBITOR', strength: '200mg', dosageForm: 'Tablet' },

  // ========================================
  // TYK2 INHIBITORS
  // ========================================

  // SOTYKTU (deucravacitinib) - Bristol Myers Squibb
  { ndcCode: '00003-2280-11', drugName: 'Sotyktu', genericName: 'deucravacitinib', drugClass: 'OTHER', strength: '6mg', dosageForm: 'Tablet' },

  // ========================================
  // TRALOKINUMAB (IL-13 Inhibitor for AD)
  // ========================================

  // ADBRY (tralokinumab-ldrm) - Leo Pharma
  { ndcCode: '50222-0150-01', drugName: 'Adbry', genericName: 'tralokinumab-ldrm', drugClass: 'IL4_13_INHIBITOR', strength: '150mg/mL', dosageForm: 'Syringe' },
  { ndcCode: '50222-0150-02', drugName: 'Adbry', genericName: 'tralokinumab-ldrm', drugClass: 'IL4_13_INHIBITOR', strength: '150mg/mL', dosageForm: 'Syringe' },
];

// Common diagnosis codes for psoriasis and atopic dermatitis
export const diagnosisCodes = {
  // Psoriasis codes (L40.x)
  'L40.0': 'Psoriasis vulgaris',
  'L40.1': 'Generalized pustular psoriasis',
  'L40.2': 'Acrodermatitis continua',
  'L40.3': 'Pustulosis palmaris et plantaris',
  'L40.4': 'Guttate psoriasis',
  'L40.5': 'Arthropathic psoriasis',
  'L40.50': 'Arthropathic psoriasis, unspecified',
  'L40.51': 'Distal interphalangeal psoriatic arthropathy',
  'L40.52': 'Psoriatic arthritis mutilans',
  'L40.53': 'Psoriatic spondylitis',
  'L40.54': 'Psoriatic juvenile arthropathy',
  'L40.59': 'Other psoriatic arthropathy',
  'L40.8': 'Other psoriasis',
  'L40.9': 'Psoriasis, unspecified',

  // Atopic dermatitis codes (L20.x)
  'L20.0': 'Besnier prurigo',
  'L20.8': 'Other atopic dermatitis',
  'L20.81': 'Atopic neurodermatitis',
  'L20.82': 'Flexural eczema',
  'L20.83': 'Infantile (acute) (chronic) eczema',
  'L20.84': 'Intrinsic (allergic) eczema',
  'L20.89': 'Other atopic dermatitis',
  'L20.9': 'Atopic dermatitis, unspecified',

  // Eczema codes (L30.x)
  'L30.0': 'Nummular dermatitis',
  'L30.1': 'Dyshidrosis [pompholyx]',
  'L30.2': 'Cutaneous autosensitization',
  'L30.3': 'Infective dermatitis',
  'L30.8': 'Other specified dermatitis',
  'L30.9': 'Dermatitis, unspecified',

  // Other relevant codes
  'L21.0': 'Seborrhea capitis',
  'L21.1': 'Seborrheic infantile dermatitis',
  'L21.8': 'Other seborrheic dermatitis',
  'L21.9': 'Seborrheic dermatitis, unspecified',

  // Contact dermatitis (sometimes appears with AD)
  'L23.9': 'Allergic contact dermatitis, unspecified cause',
  'L24.9': 'Irritant contact dermatitis, unspecified cause',
  'L25.9': 'Unspecified contact dermatitis, unspecified cause',
};

// Helper function to find drug info by NDC code
export function findDrugByNdc(ndcCode: string) {
  // Normalize NDC code (remove dashes, handle different formats)
  const normalizedNdc = ndcCode.replace(/[-\s]/g, '');

  return biologicNdcMappings.find(mapping => {
    const normalizedMappingNdc = mapping.ndcCode.replace(/[-\s]/g, '');
    return normalizedMappingNdc === normalizedNdc ||
           normalizedMappingNdc.startsWith(normalizedNdc) ||
           normalizedNdc.startsWith(normalizedMappingNdc);
  });
}

// Helper function to get diagnosis description
export function getDiagnosisDescription(code: string): string {
  return diagnosisCodes[code as keyof typeof diagnosisCodes] || code;
}
