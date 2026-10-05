from h import *
M=lambda a: dict(sex="male", age_years=a)
F=lambda a: dict(sex="female", age_years=a, pregnancy_possible=(16<=a<=50) or None)
T2M=dict(dm_status="known",dm_type_recorded="type_2",glucose_lowering_therapy=["metformin"])
P=[
("P01 well T2 routine", dict(**M(55),**T2M,hba1c=6.8,bp_systolic=124,bp_diastolic=76,egfr=85,months_since_eye_screen=6,months_since_kidney_screen=6,months_since_foot_risk_assessment=6,months_since_lipids=6,months_since_neuropathy_screen=6,months_since_hba1c=3,hypo_worst_12m="none"),"referral",True),
("P02 new 50 glucose16 thirst", dict(**M(50),polydipsia=True,capillary_glucose=16.0,capillary_glucose_context="random"),"district",False),
("P03 T2 gastroenteritis glucose 6", dict(**M(60),**T2M,vomiting=True,capillary_glucose=6.0),"district",True),
("P04 pregnant T1", dict(**F(28),pregnant=True,gestation_weeks=10,dm_status="known",dm_type_recorded="type_1",glucose_lowering_therapy=["insulin"],capillary_glucose=8.0),"referral",True),
("P05 17yo new glucose14 polyuria", dict(**M(17),polyuria=True,capillary_glucose=14.0),"district",False),
("P06 15yo new glucose14 polyuria", dict(**M(15),polyuria=True,capillary_glucose=14.0),"district",False),
("P07 eGFR35 glib+met", dict(**M(62),dm_status="known",dm_type_recorded="type_2",glucose_lowering_therapy=["metformin","glibenclamide"],egfr=35),"referral",True),
("P08 hypertensive emergency T2", dict(**M(58),**T2M,bp_systolic=210,bp_diastolic=125,hypertensive_organ_damage=True),"district",True),
("P09 HHS district no ketones", dict(**M(70),**T2M,glucose_meter_extreme="hi",mental_status="drowsy"),"district",True),
("P10 blank", dict(**M(40)),"district",False),
("P11 asymp random cap 12", dict(**M(45),capillary_glucose=12.0,capillary_glucose_context="random"),"district",False),
("P12 HIV ART HbA1c 6.6 asymp", dict(**M(45),hiv_on_art=True,art_regimen="tdf_3tc_dtg",hba1c=6.6),"referral",False),
("P13 HIV ART HbA1c 5.4", dict(**M(45),hiv_on_art=True,art_regimen="tdf_3tc_dtg",hba1c=5.4),"referral",False),
("P14 child 6 enuresis wtloss no glucose", dict(**M(6),secondary_enuresis=True,unexplained_weight_loss=True),"district",False),
("P15 child HI no symptoms", dict(**M(9),glucose_meter_extreme="hi"),"district",False),
("P16 new 25 BMI20 wtloss glu15", dict(**M(25),bmi=20,unexplained_weight_loss=True,capillary_glucose=15.0,polyuria=True),"district",False),
("P17 postpartum 12w prior GDM no test", dict(**F(30),pregnant=False,postpartum_weeks=12,prior_gdm=True),"referral",False),
("P18 severe foot infection", dict(**M(60),**T2M,active_foot_ulcer=True,foot_infection_grade="severe"),"district",True),
("P19 K 6.2 on ACEi", dict(**M(65),**T2M,ras_blocker="acei",potassium=6.2,egfr=40),"referral",True),
("P20 eGFR25 metformin", dict(**M(65),**T2M,egfr=25),"referral",True),
("P21 child 12 metformin eGFR25", dict(**M(12),**T2M,egfr=25),"referral",True),
("P22 adolescent 14 T2 HbA1c 9", dict(**M(14),**T2M,hba1c=9.0),"referral",True),
("P23 T1 no insulin listed", dict(**M(30),dm_status="known",dm_type_recorded="type_1"),"referral",True),
("P24 antipsychotic 14w no glucose", dict(**M(35),on_second_gen_antipsychotic=True,weeks_since_antipsychotic_start=14,glucose_test_since_antipsychotic_start=False),"referral",False),
("P25 iron def HbA1c 6.1", dict(**M(40),iron_deficiency=True,hba1c=6.1),"referral",False),
("P26 pregnant OGTT 2h 9.0 fasting 5.3", dict(**F(28),pregnant=True,gestation_weeks=26,fasting_pg=5.3,ogtt_2h_pg=9.0),"referral",False),
("P27 pregnant random cap 12 thirst", dict(**F(28),pregnant=True,gestation_weeks=26,capillary_glucose=12.0,polydipsia=True),"district",False),
("P28 70 glib eGFR 50 hypo", dict(**M(70),dm_status="known",dm_type_recorded="type_2",glucose_lowering_therapy=["glibenclamide"],egfr=50,hypo_worst_12m="needed_help"),"district",True),
("P29 T2 SGLT2 surgery planned", dict(**M(55),dm_status="known",dm_type_recorded="type_2",glucose_lowering_therapy=["metformin","sglt2_inhibitor"],surgery_or_fasting_planned=True),"referral",True),
("P30 sudden vision loss", dict(**M(55),**T2M,sudden_vision_loss=True),"district",True),
("P31 T1 adult ill no glucose", dict(**M(30),dm_status="known",dm_type_recorded="type_1",glucose_lowering_therapy=["insulin"],acute_illness_current=True),"referral",True),
("P32 T1 child ill no glucose", dict(**M(7),dm_status="known",dm_type_recorded="type_1",glucose_lowering_therapy=["insulin"],acute_illness_current=True),"district",True),
("P33 T1 child ill glu 13", dict(**M(7),dm_status="known",dm_type_recorded="type_1",glucose_lowering_therapy=["insulin"],acute_illness_current=True,capillary_glucose=13.0),"referral",True),
("P34 limb ischaemia", dict(**M(66),**T2M,limb_ischaemia_signs=True),"district",True),
("P35 steroid new patient", dict(**M(50),on_glucocorticoid=True),"referral",False),
("P36 woman 45 prior GDM, never tested", dict(**F(45),prior_gdm=True,never_glucose_tested=True,pregnant=False),"district",False),
("P37 pregnant 12w, no glucose ever, BMI 32", dict(**F(30),pregnant=True,gestation_weeks=12,bmi=32),"district",False),
("P38 insulin omitted T1", dict(**M(22),dm_status="known",dm_type_recorded="type_1",glucose_lowering_therapy=["insulin"],insulin_omitted=True),"district",True),
("P39 SCD HbA1c 6.6 polyuria", dict(**M(30),sickle_cell_disease=True,hba1c=6.6,polyuria=True),"referral",False),
("P40 GDM known postpartum 8w", dict(**F(30),pregnant=False,postpartum_weeks=8,dm_status="known",dm_type_recorded="gestational",glucose_lowering_therapy=["metformin"]),"referral",True),
]
for name, vals, site, est in P:
    vals={k:v for k,v in vals.items() if v is not None}
    run(vals, site=site, est=est, tag=name)
