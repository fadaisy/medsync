# The food list: which published row each food takes its numbers from.
# Numbers are never typed here; gen.py reads them from the parsed tables.
# comp: "KE:<code>" Kenya FCT 2018, "WA:<code>" West Africa FCT 2019, "US:<fdc_id>" USDA SR Legacy.
# gi: key into GI below, or None (no published GI reached -> unknown).
# portions: (label, grams) is a MedSync household estimate; (label, grams, "US:<portion id>") is a USDA measure.

def L(*pairs):
    return [{"name": n, "language": lang} for n, lang in pairs]

LG, SW, EN = "Luganda", "Swahili", "Ugandan English"

# GI values. kind T1 = Atkinson 2008 Table 1 (average of studies, glucose = 100);
# A1 = Atkinson 2008 online appendix Table A1 item (normal glucose tolerance, glucose scale);
# KE = Ebere et al. 2021 review of Kenyan GI studies, Table 1 (healthy subjects, glucose = 100).
GI = {
    "t1-white-bread": ("T1", 75, "White wheat bread, 75 ± 2"),
    "t1-wholemeal-bread": ("T1", 74, "Whole wheat/whole meal bread, 74 ± 2"),
    "t1-chapatti": ("T1", 52, "Chapatti, 52 ± 4"),
    "t1-sweet-corn": ("T1", 52, "Sweet corn, 52 ± 5"),
    "t1-spaghetti": ("T1", 49, "Spaghetti, white, 49 ± 2"),
    "t1-oats": ("T1", 55, "Porridge, rolled oats, 55 ± 2"),
    "t1-millet-porridge": ("T1", 67, "Millet porridge, 67 ± 5"),
    "t1-rice-porridge": ("T1", 78, "Rice porridge/congee, 78 ± 9"),
    "t1-apple": ("T1", 36, "Apple, raw, 36 ± 2"),
    "t1-orange": ("T1", 43, "Orange, raw, 43 ± 3"),
    "t1-banana": ("T1", 51, "Banana, raw, 51 ± 3"),
    "t1-pineapple": ("T1", 59, "Pineapple, raw, 59 ± 8"),
    "t1-mango": ("T1", 51, "Mango, raw, 51 ± 5"),
    "t1-watermelon": ("T1", 76, "Watermelon, raw, 76 ± 4"),
    "t1-orange-juice": ("T1", 50, "Orange juice, 50 ± 2"),
    "t1-potato-boiled": ("T1", 78, "Potato, boiled, 78 ± 4"),
    "t1-fries": ("T1", 63, "Potato, french fries, 63 ± 5"),
    "t1-carrots": ("T1", 39, "Carrots, boiled, 39 ± 4"),
    "t1-sweet-potato": ("T1", 63, "Sweet potato, boiled, 63 ± 6"),
    "t1-pumpkin": ("T1", 64, "Pumpkin, boiled, 64 ± 7"),
    "t1-plantain": ("T1", 55, "Plantain/green banana, 55 ± 6"),
    "t1-taro": ("T1", 53, "Taro, boiled, 53 ± 2"),
    "t1-milk-full": ("T1", 39, "Milk, full fat, 39 ± 3"),
    "t1-milk-skim": ("T1", 37, "Milk, skim, 37 ± 4"),
    "t1-kidney-beans": ("T1", 24, "Kidney beans, 24 ± 4"),
    "t1-lentils": ("T1", 32, "Lentils, 32 ± 5"),
    "t1-soya": ("T1", 16, "Soya beans, 16 ± 1"),
    "t1-popcorn": ("T1", 65, "Popcorn, 65 ± 5"),
    "t1-crisps": ("T1", 56, "Potato crisps, 56 ± 3"),
    "t1-soda": ("T1", 59, "Soft drink/soda, 59 ± 3"),
    "t1-sucrose": ("T1", 65, "Sucrose, 65 ± 4"),
    "t1-honey": ("T1", 61, "Honey, 61 ± 3"),
    "a1-1721": ("A1", 74, "1721"),
    "a1-1700": ("A1", 74, "1700"),
    "a1-1087": ("A1", 52, "1087"),
    "a1-1611": ("A1", 51, "1611"),
    "a1-1121": ("A1", 22, "1121"),
    "a1-1117": ("A1", 31, "1117"),
    "a1-1324": ("A1", 7, "1324"),
    "a1-1164": ("A1", 23, "1164"),
    "a1-999": ("A1", 56, "999"),
    "a1-48": ("A1", 68, "48"),
    "ke-ugali-whole": ("KE", 62, "Whole maize ugali; plain, 62 ± 8.90 (Ebere et al. 2017, FSQM 63:55–63)"),
    "ke-rice": ("KE", 77, "Boiled white rice (mwea pishori), 77 ± 5.69 (Ebere et al. 2017, FSQM 63:64–73)"),
    "ke-rice-beans": ("KE", 62, "Rice; beans, 62 ± 5.16 (Ebere et al. 2017, FSQM 63:64–73)"),
    "ke-bean-stew": ("KE", 44, "Bean stew, 44 ± 10.00 (Ebere et al. 2017, FSQM 63:64–73)"),
    "ke-sweet-potato": ("KE", 64.54, "Sweet potato, 64.54 ± 7.11 (Ebere et al. 2017, FSQM 63:7–12)"),
    "ke-cassava": ("KE", 74.1, "Boiled cassava, 74.10 ± 6.31 (Ebere et al. 2017, FSQM 63:7–12)"),
}

F = []
def food(id, name, group, comp, gi, portions, local=(), note=None):
    F.append(dict(id=id, name=name, group=group, comp=comp, gi=gi, portions=portions, local=list(local), note=note))

S = "staples"
food("matooke-mashed", "Matooke, steamed and mashed", S, "KE:15104", "t1-plantain",
     [("1 ladle", 100), ("1 plate portion", 300)], L(("matooke", LG)),
     "Composition: Kenya 'Mashed Bananas'. GI: international average for green banana/plantain; no matooke-specific GI found.")
food("matooke-stewed", "Matooke stew (green bananas, plain)", S, "KE:15097", None,
     [("1 ladle", 100), ("1 plate portion", 300)], L(("matooke", LG)))
food("matooke-meat", "Matooke with meat", S, "KE:15056", None,
     [("1 ladle", 120), ("1 plate portion", 350)], L(("matooke n'ennyama", LG)))
food("green-banana-raw", "Green cooking banana, peeled, raw weight", S, "KE:02004", "t1-plantain",
     [("1 finger", 100), ("3 fingers", 300)], L(("matooke", LG)),
     "For weighing matooke before cooking. GI: international average for green banana/plantain.")
food("posho", "Posho (refined maize flour)", S, "KE:15009", "a1-1721",
     [("1 fist-sized lump", 150), ("1 plate portion", 300)], L(("posho", EN), ("kawunga", LG), ("ugali", SW)),
     "GI: refined maize meal porridge, 1:3 meal to water (South Africa).")
food("posho-whole", "Posho, whole maize flour", S, "KE:15005", "ke-ugali-whole",
     [("1 fist-sized lump", 150), ("1 plate portion", 300)], L(("posho", EN), ("ugali", SW)))
food("posho-maize-millet", "Posho, maize and millet flour", S, "KE:15006", None,
     [("1 fist-sized lump", 150), ("1 plate portion", 300)], L(("ugali", SW)))
food("kalo", "Millet bread (finger millet)", S, "KE:15100", None,
     [("1 fist-sized lump", 150), ("1 plate portion", 300)], L(("kalo", LG), ("ugali wa wimbi", SW)))
food("sorghum-posho", "Sorghum, maize and millet bread", S, "KE:15010", None,
     [("1 fist-sized lump", 150), ("1 plate portion", 300)], L(("ugali", SW)))
food("cassava-posho", "Cassava flour bread", S, "KE:15011", None,
     [("1 fist-sized lump", 150), ("1 plate portion", 300)], L(("kawunga ka muwogo", LG), ("ugali wa muhogo", SW)))
food("cassava-boiled", "Cassava, boiled", S, "KE:02024", "ke-cassava",
     [("1 piece (palm-sized)", 100), ("1 plate portion", 250)], L(("muwogo", LG), ("muhogo", SW)))
food("cassava-raw", "Cassava, fresh, peeled", S, "KE:02007", None,
     [("1 piece (palm-sized)", 100)], L(("muwogo", LG), ("muhogo", SW)))
food("sweet-potato-boiled", "Sweet potato, boiled", S, "KE:02027", "ke-sweet-potato",
     [("1 medium", 151, "US:83173"), ("1 cup, mashed", 328, "US:83172")], L(("lumonde", LG), ("viazi vitamu", SW)))
food("sweet-potato-orange", "Orange-fleshed sweet potato, boiled", S, "KE:02028", "t1-sweet-potato",
     [("1 medium", 151, "US:83173"), ("1 cup, mashed", 328, "US:83172")], L(("lumonde", LG)),
     "GI: international average for boiled sweet potato; the orange variety has not been tested in East Africa.")
food("sweet-potato-fried", "Sweet potato, pan-fried", S, "KE:15109", None,
     [("1 medium", 150), ("1 plate portion", 250)], L(("lumonde", LG)))
food("irish-potato-boiled", "Irish potato, boiled", S, "KE:02025", "t1-potato-boiled",
     [("1 small", 125, "US:86654"), ("1 medium", 167, "US:86653"), ("1 large", 300, "US:86652")], L(("Irish", EN)))
food("irish-potato-mashed", "Irish potato, mashed", S, "KE:15103", None,
     [("1 ladle", 100), ("1 cup", 210)], L(("Irish", EN)))
food("irish-potato-stew", "Potato curry (stewed Irish potatoes)", S, "KE:15127", None,
     [("1 ladle", 120), ("1 plate portion", 300)], L(("Irish", EN)))
food("rice-boiled", "Rice, white, boiled", S, "KE:01059", "ke-rice",
     [("1 cup", 158, "US:83928"), ("1 plate portion", 300)], L(("omuceere", LG), ("wali", SW)))
food("pilau", "Pilau (spiced rice)", S, "KE:15036", None,
     [("1 cup", 158), ("1 plate portion", 300)], L(("pilawo", LG), ("pilau", SW)))
food("rice-beans", "Rice with beans", S, "KE:15038", "ke-rice-beans",
     [("1 cup", 170), ("1 plate portion", 350)], L(("omuceere n'ebijanjaalo", LG), ("mseto wa maharagwe", SW)))
food("rice-green-grams", "Rice with green grams", S, "KE:15037", None,
     [("1 cup", 170), ("1 plate portion", 350)], L(("mseto wa ndengu", SW)))
food("yam-boiled", "Yam, boiled", S, "KE:02030", "a1-1700",
     [("1 piece (palm-sized)", 100), ("1 plate portion", 250)], L(("balugu", LG)), "GI: yam (Dioscorea), boiled (Nigeria).")
food("cocoyam-boiled", "Cocoyam (taro), boiled", S, "US:168486", "t1-taro",
     [("1 cup, sliced", 132, "US:83176"), ("1 piece (palm-sized)", 100)], L(("jjuuni", LG), ("magimbi", SW)))
food("chapati", "Chapati", S, "KE:15019", "t1-chapatti",
     [("1 chapati", 70), ("half a chapati", 35)], L(("chapati", EN)))
food("chapati-brown", "Chapati, brown (wholemeal)", S, "KE:15020", "t1-chapatti",
     [("1 chapati", 70), ("half a chapati", 35)], L(("chapati", EN)),
     "GI: international average for chapatti; wholemeal not tested separately.")
food("bread-white", "Bread, white", S, "KE:01007", "t1-white-bread",
     [("1 slice", 29, "US:95169"), ("2 slices", 58)], L(("omugaati", LG), ("mkate", SW)))
food("bread-brown", "Bread, brown", S, "KE:01005", "t1-wholemeal-bread",
     [("1 slice", 29, "US:95169"), ("2 slices", 58)], L(("omugaati", LG), ("mkate", SW)))
food("bread-sweet", "Sweet bread / bun", S, "KE:01006", None,
     [("1 slice", 30), ("1 bun", 60)], L(("omugaati", LG)))
food("maize-fresh-boiled", "Fresh maize (corn on the cob), boiled", S, "KE:01051", "t1-sweet-corn",
     [("1 cob (grain only)", 150), ("half a cob", 75)], L(("kasooli", LG), ("mahindi", SW)),
     "GI: international average for sweet corn; East African field maize not tested.")
food("githeri", "Maize and beans, stewed", S, "KE:15053", None,
     [("1 ladle", 120), ("1 plate portion", 300)], L(("empeke", LG), ("githeri", SW)))
food("spaghetti", "Spaghetti / macaroni, boiled", S, "KE:01063", "t1-spaghetti",
     [("1 cup", 140), ("1 plate portion", 250)], L(("spaghetti", EN)))
food("plantain-ripe-roasted", "Gonja (ripe plantain), roasted", S, "US:169131", None,
     [("1 gonja", 150), ("1 cup", 139, "US:84304")], L(("gonja", LG)),
     "Composition: USDA 'Plantains, yellow, baked', the nearest published match for roasted ripe plantain.")

LEG = "legumes"
food("beans-stew", "Beans, stewed (sauce)", LEG, "KE:15045", "ke-bean-stew",
     [("1 ladle", 100), ("1 bowl", 250)], L(("ebijanjaalo", LG), ("maharagwe", SW)))
food("beans-boiled", "Beans (kidney), boiled", LEG, "KE:03029", "t1-kidney-beans",
     [("1 cup", 177, "US:95822"), ("1 tablespoon", 11, "US:95823")], L(("ebijanjaalo", LG), ("maharagwe", SW)))
food("beans-milk-cream", "Beans stewed with milk and cream", LEG, "KE:15115", None,
     [("1 ladle", 100), ("1 bowl", 250)], L(("ebijanjaalo", LG)))
food("beans-skinned-stew", "Skinned bean stew", LEG, "KE:15142", None,
     [("1 ladle", 100), ("1 bowl", 250)], L(("ebijanjaalo", LG)))
food("cowpeas-boiled", "Cowpeas, boiled", LEG, "KE:03045", "a1-1087",
     [("1 cup", 170), ("1 ladle", 100)], L(("empindi", LG), ("kunde", SW)), "GI: black-eyed peas (Vigna unguiculata), boiled (Nigeria).")
food("peas-boiled", "Green peas, boiled", LEG, "KE:03050", "a1-1611",
     [("1 cup", 160), ("1 ladle", 100)], L(("kaawo", LG), ("njegere", SW)), "GI: peas, frozen, boiled (Canada).")
food("peas-dry-boiled", "Dry peas, boiled", LEG, "KE:03051", None,
     [("1 cup", 170), ("1 ladle", 100)], L(("kaawo", LG)))
food("pigeon-peas-boiled", "Pigeon peas, boiled", LEG, "KE:03067", "a1-1121",
     [("1 cup", 170), ("1 ladle", 100)], L(("mbaazi", SW)), "GI: pigeon pea, soaked, boiled 45 min (Philippines).")
food("pigeon-peas-stew", "Pigeon pea stew", LEG, "KE:15092", None,
     [("1 ladle", 100), ("1 bowl", 250)], L(("mchuzi wa mbaazi", SW)))
food("green-grams-boiled", "Green grams (mung beans), boiled", LEG, "KE:03059", "a1-1117",
     [("1 cup", 170), ("1 ladle", 100)], L(("choroko", LG), ("ndengu", SW)), "GI: mung bean, soaked, boiled 20 min (Philippines).")
food("green-grams-stew", "Green gram stew", LEG, "KE:15044", None,
     [("1 ladle", 100), ("1 bowl", 250)], L(("choroko", LG), ("mchuzi wa ndengu", SW)))
food("lentils-boiled", "Lentils, boiled", LEG, "KE:03063", "t1-lentils",
     [("1 cup", 170), ("1 ladle", 100)], L(("dengu", SW)))
food("soybeans-boiled", "Soybeans, boiled", LEG, "KE:03071", "t1-soya",
     [("1 cup", 170), ("1 ladle", 100)], L(("soya", EN)))
food("groundnut-sauce", "Groundnut sauce", LEG, "KE:15063", None,
     [("1 ladle", 100), ("1 bowl", 250)], L(("binyeebwa", LG), ("mchuzi wa karanga", SW)))
food("groundnuts", "Groundnuts, raw, with skin", LEG, "KE:10009", "a1-1324",
     [("1 handful", 30), ("1 cup", 146)], L(("ebinyeebwa", LG), ("karanga", SW)), "GI: peanuts, crushed (South Africa).")
food("groundnuts-roasted", "Groundnuts, dry-roasted", LEG, "US:173806", "a1-1324",
     [("1 handful", 28.35, "US:93281"), ("1 cup", 146, "US:93280")], L(("ebinyeebwa ebyokye", LG), ("karanga", SW)),
     "GI: peanuts, crushed (South Africa).")
food("gnut-paste", "Groundnut paste (peanut butter)", LEG, "KE:10012", "a1-1164",
     [("1 tablespoon", 16), ("2 tablespoons", 32, "US:90673")], L(("binyeebwa", LG), ("siagi ya karanga", SW)),
     "Kenya's table gives peanut butter the same values as raw groundnuts.")
food("simsim", "Simsim (sesame) seeds / paste", LEG, "KE:10014", None,
     [("1 tablespoon", 10), ("2 tablespoons", 20)], L(("entungo", LG), ("ufuta", SW)))
food("lentil-stew", "Lentil stew", LEG, "KE:15046", None,
     [("1 ladle", 100), ("1 bowl", 250)], L(("mchuzi wa dengu", SW)))
food("bambara-nuts", "Bambara groundnuts, dried", LEG, "KE:10001", None,
     [("1 handful", 30)], L(("njugu mawe", SW)))

M = "meat-fish-eggs"
food("beef-stew", "Beef stew", M, "KE:15087", None,
     [("1 ladle", 120), ("1 bowl", 250)], L(("ennyama y'ente", LG), ("nyama ya ng'ombe", SW)))
food("beef-boiled", "Beef, lean, boiled", M, "KE:07034", None,
     [("1 piece (matchbox-sized)", 30), ("1 portion (palm-sized)", 90)], L(("ennyama y'ente", LG)))
food("beef-grilled", "Beef, lean, grilled (muchomo)", M, "KE:07035", None,
     [("1 skewer", 60), ("1 portion (palm-sized)", 90)], L(("muchomo", EN), ("nyama choma", SW)))
food("beef-fry", "Beef, stir-fried", M, "KE:15098", None,
     [("1 ladle", 100), ("1 portion (palm-sized)", 90)], L(("ennyama y'ente", LG)))
food("beef-fatty-boiled", "Beef, high fat, boiled", M, "KE:07031", None,
     [("1 piece (matchbox-sized)", 30), ("1 portion (palm-sized)", 90)], L(("ennyama y'ente", LG)))
food("liver-boiled", "Liver (beef), boiled", M, "KE:07037", None,
     [("1 portion (palm-sized)", 90)], L(("ekibumba", LG), ("maini", SW)))
food("goat-stew", "Goat stew", M, "KE:15108", None,
     [("1 ladle", 120), ("1 bowl", 250)], L(("ennyama y'embuzi", LG), ("nyama ya mbuzi", SW)))
food("goat-grilled", "Goat, lean, grilled", M, "KE:07044", None,
     [("1 skewer", 60), ("1 portion (palm-sized)", 90)], L(("ennyama y'embuzi", LG)))
food("goat-fry", "Goat, stir-fried", M, "KE:15099", None,
     [("1 ladle", 100), ("1 portion (palm-sized)", 90)], L(("ennyama y'embuzi", LG)))
food("chicken-stew", "Chicken stew", M, "KE:15070", None,
     [("1 piece", 100), ("1 ladle", 120)], L(("enkoko", LG), ("kuku", SW)))
food("chicken-fried", "Chicken, fried", M, "KE:15073", None,
     [("1 piece", 100), ("1 quarter chicken", 200)], L(("enkoko", LG), ("kuku", SW)))
food("chicken-boiled", "Chicken, boiled (meat and skin)", M, "KE:07041", None,
     [("1 piece", 100), ("1 portion (palm-sized)", 90)], L(("enkoko", LG), ("kuku", SW)))
food("pork-grilled", "Pork, grilled", M, "KE:07052", None,
     [("1 portion (palm-sized)", 90), ("1 plate portion", 200)], L(("ennyama y'embizzi", LG), ("pork", EN)))
food("sausage", "Sausage, beef, grilled", M, "KE:07055", None,
     [("1 sausage", 50), ("2 sausages", 100)], L(("sausage", EN)))
food("tilapia-fried", "Tilapia, fried", M, "KE:15096", None,
     [("1 small fish", 150), ("1 medium fish", 250)], L(("ngege", LG), ("sato", SW)))
food("nile-perch-stew", "Nile perch, stewed", M, "KE:15107", None,
     [("1 piece", 100), ("1 ladle", 120)], L(("mputa", LG), ("sangara", SW)))
food("fish-dried-stew", "Dried fish, stewed", M, "KE:15082", None,
     [("1 ladle", 100)], L(("ekyennyanja ekikalu", LG)))
food("mukene-dried", "Mukene (silverfish), dried", M, "KE:08002", None,
     [("1 handful", 20), ("1 cup", 60)], L(("mukene", LG), ("dagaa / omena", SW)))
food("mukene-stewed", "Mukene (silverfish) stew", M, "KE:15017", None,
     [("1 ladle", 100), ("1 bowl", 250)], L(("mukene", LG), ("omena", SW)))
food("mukene-fried", "Mukene (silverfish), fried", M, "KE:15101", None,
     [("1 handful", 30), ("1 ladle", 60)], L(("mukene", LG), ("omena", SW)))
food("egg-boiled", "Egg, boiled", M, "KE:07027", None,
     [("1 egg", 50, "US:92500"), ("2 eggs", 100)], L(("eggi", LG), ("yai", SW)))
food("egg-fried", "Egg, fried", M, "KE:15022", None,
     [("1 egg", 50), ("2 eggs", 100)], L(("eggi", LG), ("yai", SW)))
food("omelette", "Omelette", M, "KE:15023", None,
     [("1-egg omelette", 70), ("2-egg omelette", 140)], L(("omeleti", LG)))
food("omelette-spanish", "Spanish omelette (with vegetables)", M, "KE:15024", None,
     [("1-egg omelette", 80), ("2-egg omelette", 160)], L(("omeleti", LG)))
food("nsenene", "Grasshoppers, fresh", M, "KE:14002", None,
     [("1 handful", 30), ("1 cup", 80)], L(("nsenene", LG), ("senene", SW)))
food("white-ants", "White ants (termites), fresh", M, "KE:14004", None,
     [("1 handful", 30)], L(("enswa", LG), ("kumbi kumbi", SW)))
food("guinea-fowl-stew", "Guinea fowl, stewed", M, "KE:15095", None,
     [("1 piece", 100)], L(("enkofu", LG)))
food("rabbit-stewed", "Rabbit, stewed", M, "KE:07053", None,
     [("1 portion (palm-sized)", 90)], L(("akamyu", LG)))

G = "greens-vegetables"
food("dodo-boiled", "Dodo (amaranth leaves), boiled", G, "KE:04039", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("doodo", LG), ("mchicha / terere", SW)))
food("dodo-fried", "Dodo (amaranth leaves), stir-fried", G, "KE:15030", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("doodo", LG), ("terere", SW)))
food("nsugga-boiled", "African nightshade leaves, boiled", G, "KE:04042", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("nsugga", LG), ("managu", SW)))
food("mixed-greens", "Spider plant, amaranth and nightshade leaves, cooked", G, "KE:15035", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("eyobyo, doodo ne nsugga", LG)))
food("sukuma-boiled", "Sukuma wiki (kale), boiled", G, "KE:04074", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("sukuma wiki", SW)))
food("sukuma-fried", "Sukuma wiki (kale), stir-fried", G, "KE:15031", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("sukuma wiki", SW)))
food("cabbage-boiled", "Cabbage, boiled", G, "KE:04050", None,
     [("half a cup", 75, "US:85799"), ("1 bowl", 200)], L(("kabeeji", LG), ("kabichi", SW)))
food("cabbage-fried", "Cabbage, stir-fried", G, "KE:15032", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("kabeeji", LG), ("kabichi", SW)))
food("tomato", "Tomato, raw", G, "KE:04036", None,
     [("1 medium", 123, "US:86686"), ("1 slice", 20, "US:86687")], L(("nnyaanya", LG), ("nyanya", SW)))
food("tomato-cooked", "Tomato, boiled", G, "KE:04098", None,
     [("1 ladle", 80)], L(("nnyaanya", LG), ("nyanya", SW)))
food("onion", "Onion, raw", G, "KE:13023", None,
     [("1 medium", 110, "US:85860"), ("1 tablespoon, chopped", 10, "US:85857")], L(("katungulu", LG), ("kitunguu", SW)))
food("eggplant-boiled", "Eggplant, boiled", G, "KE:04068", None,
     [("1 ladle", 80), ("1 medium", 200)], L(("biringanya", LG), ("biringanya", SW)))
food("eggplant-stewed", "Eggplant, stewed", G, "KE:04069", None,
     [("1 ladle", 80)], L(("biringanya", LG)))
food("pumpkin-boiled", "Pumpkin, boiled", G, "KE:04082", "t1-pumpkin",
     [("1 piece (palm-sized)", 100), ("1 cup", 245)], L(("ensujju", LG), ("malenge", SW)))
food("butternut-boiled", "Butternut squash, boiled", G, "KE:04092", None,
     [("1 piece (palm-sized)", 100), ("1 cup", 205)], L(("ensujju", LG)))
food("pumpkin-leaves-boiled", "Pumpkin leaves, boiled", G, "KE:04084", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("ebikoola by'ensujju", LG), ("seveve", SW)))
food("cowpea-leaves-boiled", "Cowpea leaves, boiled", G, "KE:04066", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("eggobe", LG), ("kunde", SW)))
food("cowpea-leaves-stewed", "Cowpea leaves, stewed", G, "KE:15078", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("eggobe", LG)))
food("spider-plant-boiled", "Spider plant leaves, boiled", G, "KE:04086", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("ejjobyo", LG), ("saget / mwangani", SW)))
food("jute-mallow-boiled", "Jute mallow leaves, boiled", G, "KE:04070", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("otigo", "Acholi"), ("mrenda", SW)))
food("sweet-potato-leaves", "Sweet potato leaves, raw", G, "KE:04034", None,
     [("1 handful", 30), ("1 bowl", 100)], L(("ebikoola bya lumonde", LG)))
food("spinach-boiled", "Spinach, boiled", G, "KE:04088", None,
     [("1 ladle", 80), ("1 bowl", 200)], L(("spinach", EN)))
food("carrot-boiled", "Carrot, boiled", G, "KE:04061", "t1-carrots",
     [("1 carrot", 46, "US:86566"), ("half a cup, sliced", 78, "US:86565")], L(("kaloti", LG), ("karoti", SW)))
food("carrot-raw", "Carrot, raw", G, "KE:04011", None,
     [("1 carrot", 60), ("half a cup, grated", 55)], L(("kaloti", LG)))
food("okra-boiled", "Okra, boiled", G, "KE:04080", None,
     [("1 ladle", 80), ("10 pods", 100)], L(("bamia", LG), ("bamia", SW)))
food("green-pepper", "Green pepper, raw", G, "KE:04008", None,
     [("1 medium", 120), ("1 tablespoon, chopped", 10)], L(("pilipili hoho", SW)))
food("mushroom-boiled", "Mushrooms, boiled", G, "KE:04077", None,
     [("1 ladle", 80), ("1 cup", 150)], L(("obutiko", LG), ("uyoga", SW)))
food("cucumber", "Cucumber, raw", G, "KE:04016", None,
     [("1 slice", 10), ("half a cucumber", 150)], L(("kukamba", SW)))
food("lettuce", "Lettuce, raw", G, "KE:04022", None,
     [("1 cup, shredded", 35)], L(("lettuce", EN)))

FR = "fruits"
food("banana-ripe", "Banana, ripe (sweet)", FR, "KE:05004", "t1-banana",
     [("1 small", 101, "US:93514"), ("1 medium", 118, "US:93515")], L(("menvu / ndiizi", LG), ("ndizi", SW)))
food("mango", "Mango, ripe", FR, "KE:05019", "t1-mango",
     [("1 cup, pieces", 165, "US:85651"), ("1 whole mango", 336, "US:85652")], L(("muyembe", LG), ("embe", SW)))
food("mango-unripe", "Mango, unripe", FR, "KE:05020", None,
     [("1 cup, pieces", 165)], L(("muyembe", LG)))
food("pineapple", "Pineapple", FR, "KE:05030", "t1-pineapple",
     [("1 slice", 84, "US:84290"), ("1 cup, chunks", 165, "US:84287")], L(("nnanaansi", LG), ("nanasi", SW)))
food("jackfruit", "Jackfruit", FR, "KE:05012", None,
     [("1 cup", 165, "US:94754"), ("5 pods", 100)], L(("ffene", LG), ("fenesi", SW)))
food("papaya", "Pawpaw (papaya)", FR, "KE:05024", "a1-999",
     [("1 cup, pieces", 145, "US:85692"), ("1 slice", 150)], L(("ppapaali", LG), ("papai", SW)), "GI: pawpaw (Australia).")
food("avocado", "Avocado", FR, "KE:05003", None,
     [("half an avocado", 100), ("1 avocado", 201, "US:89226")], L(("ovakedo", LG), ("parachichi", SW)))
food("orange", "Orange", FR, "KE:05023", "t1-orange",
     [("1 orange", 131, "US:84230"), ("1 cup, sections", 180, "US:84227")], L(("omucungwa", LG), ("chungwa", SW)))
food("tangerine", "Tangerine", FR, "KE:05036", None,
     [("1 tangerine", 90)], L(("mangada", LG)))
food("watermelon", "Watermelon", FR, "KE:05038", "t1-watermelon",
     [("1 wedge", 286, "US:81935"), ("1 cup, diced", 152, "US:81933")], L(("watermelon", EN), ("tikiti maji", SW)))
food("passion-fruit", "Passion fruit", FR, "KE:05025", None,
     [("1 fruit (pulp)", 18, "US:84256"), ("5 fruits (pulp)", 90)], L(("butunda", LG), ("passion", SW)))
food("guava", "Guava", FR, "KE:05011", None,
     [("1 guava", 55, "US:91859"), ("1 cup", 165, "US:91858")], L(("mapeera", LG), ("pera", SW)))
food("apple", "Apple", FR, "KE:05002", "t1-apple",
     [("1 medium", 180), ("1 small", 150)], L(("tufaa", SW)))
food("tree-tomato", "Tree tomato", FR, "KE:05037", None,
     [("1 fruit", 60)], L(("tamarillo", EN)))
food("lemon-juice", "Lemon juice", FR, "KE:05013", None,
     [("1 tablespoon", 15)], L(("ndimu", SW)))
food("pear", "Pear", FR, "KE:05028", None,
     [("1 medium", 180)], L(("pear", EN)))
food("grapes", "Grapes", FR, "KE:05010", None,
     [("1 cup", 150)], L(("zabibu", SW)))
food("strawberry", "Strawberries", FR, "KE:05034", None,
     [("1 cup", 150)], L(("strawberry", EN)))
food("coconut-flesh", "Coconut, fresh flesh", FR, "KE:10002", None,
     [("1 piece", 45), ("1 cup, grated", 80)], L(("nazi", SW)))
food("dates", "Dates, dried", FR, "KE:05007", None,
     [("3 dates", 24)], L(("tende", SW)))

SN = "snacks"
food("mandazi", "Mandazi", SN, "KE:15125", None,
     [("1 mandazi", 50), ("2 mandazi", 100)], L(("mandazi", LG), ("maandazi", SW)))
food("samosa-meat", "Samosa, meat", SN, "KE:15025", None,
     [("1 samosa", 60), ("2 samosas", 120)], L(("sambusa", LG), ("sambusa", SW)))
food("samosa-veg", "Samosa, vegetable", SN, "KE:15026", None,
     [("1 samosa", 60), ("2 samosas", 120)], L(("sambusa", LG), ("sambusa", SW)))
food("chips", "Chips (fried potatoes)", SN, "KE:15110", "t1-fries",
     [("1 small plate", 150), ("1 large plate", 250)], L(("chips", EN)))
food("crisps", "Potato crisps", SN, "US:169677", "t1-crisps",
     [("1 small packet", 28, "US:85331"), ("1 large bag", 227, "US:85334")], L(("crisps", EN)))
food("popcorn", "Popcorn, oil-popped", SN, "US:167549", "t1-popcorn",
     [("1 cup", 11, "US:81613"), ("1 small packet", 28.35, "US:81614")], L(("popcorn", EN)))
food("biscuits-sweet", "Biscuits, sweet", SN, "KE:01004", None,
     [("1 biscuit", 10), ("1 small packet", 50)], L(("biskuti", LG), ("biskuti", SW)))
food("biscuits-savoury", "Biscuits, savoury (crackers)", SN, "KE:01003", None,
     [("1 biscuit", 8), ("1 small packet", 50)], L(("biskuti", LG)))
food("cake", "Cake, plain", SN, "KE:01012", None,
     [("1 slice", 60), ("1 cupcake", 50)], L(("keeki", LG), ("keki", SW)))
food("kaimati", "Kaimati (fried dough balls)", SN, "KE:15003", None,
     [("5 balls", 50)], L(("kaimati", SW)))
food("bhajia", "Potato bhajia", SN, "KE:15131", None,
     [("1 piece", 30), ("5 pieces", 150)], L(("bhajia", SW)))
food("egg-toast", "Egg toast", SN, "KE:15028", None,
     [("1 slice", 60)], L(("tosti mayai", SW)))
food("scone", "Scone, plain", SN, "KE:01036", None,
     [("1 scone", 50)], L(("scone", EN)))

D = "drinks"
food("tea-milk", "Milk tea (chai ya maziwa)", D, "KE:15081", None,
     [("1 cup", 250), ("1 mug", 350)], L(("caayi", LG), ("chai ya maziwa", SW)),
     "Kenya's mixed-tea recipe; the table does not say how much sugar it holds.")
food("tea-black", "Tea, black, no sugar", D, "US:173227", None,
     [("1 cup", 237, "US:92147"), ("1 mug", 350)], L(("caayi", LG), ("chai", SW)))
food("coffee-black", "Coffee, black, no sugar", D, "US:171890", None,
     [("1 cup", 237, "US:89520"), ("1 mug", 350)], L(("kaawa", LG), ("kahawa", SW)))
food("soda-cola", "Soda, cola", D, "US:174852", "t1-soda",
     [("1 bottle (300 ml)", 310), ("1 can or bottle (12 fl oz)", 370, "US:95017")], L(("soda", EN)))
food("soda-orange", "Soda, orange", D, "US:174854", "a1-48",
     [("1 bottle (300 ml)", 310), ("1 can or bottle (12 fl oz)", 372, "US:95027")], L(("soda", EN)), "GI: Fanta, orange soft drink.")
food("orange-juice", "Orange juice, fresh", D, "US:169098", "t1-orange-juice",
     [("1 glass (250 ml)", 250), ("1 cup", 248)], L(("omubisi gw'emicungwa", LG), ("juisi ya machungwa", SW)))
food("passion-juice", "Passion fruit juice", D, "KE:05026", None,
     [("1 glass (250 ml)", 250)], L(("omubisi gwa butunda", LG), ("juisi ya pasheni", SW)))
food("pineapple-juice", "Pineapple juice, unsweetened", D, "US:168187", None,
     [("1 cup", 250, "US:82628")], L(("omubisi gwa nnanaansi", LG)))
food("sugarcane-juice", "Sugarcane juice", D, "KE:11002", None,
     [("1 glass (250 ml)", 250)], L(("ebikajjo", LG), ("miwa", SW)))
food("milk-whole", "Milk, whole, boiled", D, "KE:06029", "t1-milk-full",
     [("1 cup", 244, "US:88314"), ("half a cup", 122)], L(("amata", LG), ("maziwa", SW)))
food("milk-skim", "Milk, skimmed, boiled", D, "KE:06028", "t1-milk-skim",
     [("1 cup", 244, "US:88314"), ("half a cup", 122)], L(("amata", LG), ("maziwa", SW)))
food("milk-fermented", "Fermented milk", D, "KE:06020", None,
     [("1 cup", 245), ("half a cup", 122)], L(("bongo", EN), ("maziwa lala", SW)))
food("yoghurt", "Yoghurt, plain", D, "KE:06026", None,
     [("1 cup", 245), ("1 small tub", 150)], L(("yogati", LG)))
food("porridge-maize", "Maize porridge (uji)", D, "KE:15001", None,
     [("1 cup", 250), ("1 mug", 350)], L(("obuugi", LG), ("uji wa mahindi", SW)))
food("porridge-millet", "Millet porridge", D, "KE:15014", "t1-millet-porridge",
     [("1 cup", 250), ("1 mug", 350)], L(("obuugi bw'obulo", LG), ("uji wa wimbi", SW)))
food("porridge-sorghum-mix", "Sorghum, millet and maize porridge", D, "KE:15002", None,
     [("1 cup", 250), ("1 mug", 350)], L(("obuugi", LG)))
food("porridge-cassava", "Cassava porridge", D, "KE:15013", None,
     [("1 cup", 250), ("1 mug", 350)], L(("uji wa muhogo", SW)))
food("porridge-rice", "Rice porridge", D, "KE:15016", "t1-rice-porridge",
     [("1 cup", 250), ("1 mug", 350)], L(("uji wa mchele", SW)))
food("porridge-oats", "Oat porridge", D, "KE:15123", "t1-oats",
     [("1 cup", 250), ("1 bowl", 300)], L(("oats", EN)))
food("porridge-wheat", "Wheat flour porridge", D, "KE:15136", None,
     [("1 cup", 250), ("1 mug", 350)], L(("uji wa ngano", SW)))
food("beer-lager", "Beer, lager", D, "US:168746", None,
     [("1 bottle (500 ml)", 505), ("1 can", 356, "US:83687")], L(("bbiya", LG), ("bia", SW)))
food("beer-millet", "Millet beer (local brew)", D, "WA:12_003", None,
     [("1 cup", 250), ("1 calabash (1 litre)", 1000)], L(("malwa", EN), ("ajon", "Ateso")))
food("beer-maize", "Maize beer (local brew)", D, "WA:12_002", None,
     [("1 cup", 250), ("1 litre", 1000)], L(("busaa", SW)))
food("waragi", "Waragi (spirit, 40%)", D, "US:174815", None,
     [("1 tot (1.5 fl oz)", 42, "US:94946"), ("1 sachet (100 ml)", 93)], L(("waragi", LG), ("chang'aa", SW)))
food("wine-red", "Wine, red", D, "KE:12007", None,
     [("1 glass (150 ml)", 150)], L(("divai", SW)))
food("coconut-water", "Coconut water", D, "KE:12002", None,
     [("1 glass (250 ml)", 250)], L(("maji ya madafu", SW)))

B = "basics"
food("sugar", "Sugar", B, "KE:11003", "t1-sucrose",
     [("1 teaspoon", 4.2, "US:85287"), ("1 tablespoon", 12.6)], L(("sukaali", LG), ("sukari", SW)))
food("honey", "Honey", B, "KE:11001", "t1-honey",
     [("1 tablespoon", 21, "US:85265"), ("1 teaspoon", 7)], L(("omubisi gw'enjuki", LG), ("asali", SW)))
food("oil", "Cooking oil (sunflower)", B, "KE:09013", None,
     [("1 teaspoon", 4.5, "US:87799"), ("1 tablespoon", 13.6, "US:87797")], L(("butto", LG), ("mafuta", SW)))
food("fat-vegetable", "Vegetable cooking fat", B, "KE:09011", None,
     [("1 teaspoon", 4.3), ("1 tablespoon", 12.8)], L(("butto", LG), ("kimbo", EN)))
food("ghee", "Ghee", B, "KE:06008", None,
     [("1 teaspoon", 4.3), ("1 tablespoon", 12.8)], L(("muzigo", LG), ("samli", SW)))
food("margarine", "Margarine", B, "KE:09006", None,
     [("1 teaspoon (on bread)", 5), ("1 tablespoon", 14)], L(("bulubandi", LG), ("blue band", EN)))
food("salt", "Salt, iodised", B, "KE:13027", None,
     [("1 pinch", 0.4, "US:92597"), ("1 teaspoon", 6, "US:92594")], L(("omunnyo", LG), ("chumvi", SW)))
food("palm-oil", "Red palm oil", B, "KE:09010", None,
     [("1 tablespoon", 13.6)], L(("mafuta ya mawese", SW)))
food("coconut-milk", "Coconut milk", B, "KE:13010", None,
     [("1 tablespoon", 15), ("half a cup", 120)], L(("tui la nazi", SW)))
food("tomato-paste", "Tomato paste", B, "KE:13032", None,
     [("1 tablespoon", 16)], L(("nyaanya", LG)))
food("ketchup", "Tomato sauce (ketchup)", B, "KE:13031", None,
     [("1 tablespoon", 17)], L(("sauce", EN)))

# Dishes logged as their parts, so each number still comes from a row above.
COMBOS = [
    dict(id="rolex", name="Rolex (chapati rolled with omelette)", group=SN, local=L(("rolex", EN)),
         parts=[("chapati", 70), ("omelette", 140)], description="1 chapati + 2-egg omelette"),
    dict(id="kikomando", name="Kikomando (chapati with beans)", group=SN, local=L(("kikomando", LG)),
         parts=[("chapati", 70), ("beans-stew", 200)], description="1 chapati + 2 ladles of beans"),
    dict(id="chips-chicken", name="Chips and chicken", group=SN, local=L(("chips ne nkoko", LG)),
         parts=[("chips", 200), ("chicken-fried", 100)], description="1 plate of chips + 1 piece of fried chicken"),
]
