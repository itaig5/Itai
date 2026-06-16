# -*- coding: utf-8 -*-
"""Generate a fully-static, mobile-friendly RTL dashboard (index.html).
All content is materialized as static HTML; JS only enhances (tabs/sort/checklist)."""
from urllib.parse import quote_plus, quote

CI = {"rome":"2026-09-17","romeco":"2026-09-19","term":"2026-09-26","termco":"2026-09-27",
      "garda":"2026-09-19","gardaco":"2026-09-22","ort":"2026-09-22","ortco":"2026-09-26"}

def bk(name, ci, co):
    return (f"https://www.booking.com/searchresults.html?ss={quote_plus(name)}"
            f"&checkin={ci}&checkout={co}&group_adults=2&group_children=3&age=13&age=9&age=3")
def gh(name): return f"https://www.google.com/travel/search?q={quote_plus(name)}"
def gmap(name): return f"https://www.google.com/maps/search/?api=1&query={quote_plus(name)}"
def gmapll(la,ln): return f"https://www.google.com/maps/search/?api=1&query={la},{ln}"
def abnb(city,ci,co): return f"https://www.airbnb.com/s/{quote(city)}/homes?checkin={ci}&checkout={co}&adults=2&children=3"

SITE_URL = "https://friendly-blancmange-f8b49f.netlify.app/"

def night_str(lo,hi):
    if lo and hi: return f"€{lo}–{hi}"
    if lo: return f"€{lo}+"
    return "לבדיקה בקישור"
def total_str(lo,hi,n):
    if lo and hi: return f"€{lo*n:,}–{hi*n:,}"
    if lo: return f"≥€{lo*n:,}"
    return "לבדיקה בקישור"

# ---------------- DAYS ----------------
days = [
 (1,"יום ה׳ · 17/9","נחיתה ברומא","מלון במרכז ההיסטורי (פנתאון/נבונה) — לילה 1/2",
  ["נחיתה ב-FCO ב-21:00.","הסעה מוזמנת מראש (ואן/מונית 5–6 מקומות) למרכז ההיסטורי.","צ׳ק-אין ולישון — יום קצר אחרי טיסה."],
  "להזמין הסעה מראש כדי לא להתעכב בערב עם ילדים עייפים."),
 (2,"יום ו׳ · 18/9","רומא — יום מלא","מלון במרכז ההיסטורי — לילה 2/2",
  ["בוקר: קולוסיאום + פורום רומאנו + פלטינו (כרטיס בשעה מוזמן מראש).","צהריים: ארוחה + מנוחה (חשוב לבן 3.5).","אחה״צ: פנתאון (חינם), מזרקת טרווי, גלידה, פיאצה נבונה.","ערב: ארוחה בטרסטוורה."],
  "חלופה רכה לאחה״צ — גני וילה בורגזה: מגרש משחקים, סירות, אופניים."),
 (3,"יום ש׳ · 19/9","רומא ← ורונה ← אגם גארדה","בסיס באגם גארדה — לילה 1/3",
  ["בוקר רגוע; רכבת Frecciarossa מרומא טרמיני לוורונה Porta Nuova (~3 ש׳).","איסוף רכב שכור בוורונה.","אופציונלי: 1–2 שעות בוורונה (ארנה, מרפסת יוליה, גלידה) — או לשמור לחזרה.","נסיעה 30–40 דק׳ לבסיס בגארדה. ערב ראשון על האגם + ארוחה."],
  "מתחילת היום מתחיל הרכב השכור — לוודא כיסא בטיחות לקטן בהזמנה."),
 (4,"יום א׳ · 20/9","יום אגם — סירמיונה","בסיס באגם גארדה — לילה 2/3",
  ["סירמיונה: טירת סקליגרו, חורבות Grotte di Catullo, שייט קצר, שחייה, גלידה.","אחה״צ רגוע על האגם או בבריכת המלון."],
  "סירמיונה מתמלאת בצהריים — להגיע מוקדם או לקראת אחה״צ."),
 (5,"יום ב׳ · 21/9","גרדהלנד","בסיס באגם גארדה — לילה 3/3",
  ["יום שלם בפארק (יום אמצע שבוע = פחות קהל).","שאטל חינם מתחנת פסקיירה או נהיגה (חניה חינם)."],
  "חלופה רגועה יותר: Parco Natura Viva (ספארי/גן חיות) + עיירת אגם."),
 (6,"יום ג׳ · 22/9","גארדה ← ואל גרדנה (אורטיזאי)","אורטיזאי / ואל גרדנה — לילה 1/4",
  ["צ׳ק-אאוט ונסיעה נופית ~2.5 ש׳ צפונה.","עצירה אופציונלית בבולצאנו (מוזיאון 'אצי', מומיית הקרח).","הגעה לאורטיזאי אחה״צ, צ׳ק-אין, טיול קצר להתאקלמות."],
  "מוזיאון אצי קטן ומרתק — מתאים לעצירה של שעה בדרך."),
 (7,"יום ד׳ · 23/9","רכבל סצ׳דה","אורטיזאי / ואל גרדנה — לילה 2/4",
  ["רכבל מאורטיזאי לפסגת סצ׳דה (2,500 מ׳); דקות הליכה לרכס המפורסם.","הליכות קלות למעלה, שוקו חם ברפוג׳ו."],
  "סוף ספטמבר קר ורוחי בגובה — שכבות חמות, וביקור קצר למעלה."),
 (8,"יום ה׳ · 24/9","פארק חבלים Colfosco + אלטה באדיה","אורטיזאי / ואל גרדנה — לילה 3/4",
  ["נסיעה נופית מעל מעבר Passo Gardena (~45 דק׳) לקולפוסקו.","פארק חבלים: מסלול צהוב (3–4, לבן 3.5), כחול (מגיל 7, לבן 9), אדום (מגיל 11, לבן 13).","לקטן: טרמפולינות וגן חיות.","שילוב עם עצירה קלה באלטה באדיה (אגם הביוטופ בקורבארה / שביל קנייפ)."],
  "לאמת תאריך סגירה מדויק של הפארק ל-2026 (קצה העונה!) מול אתר אלטה באדיה."),
 (9,"יום ו׳ · 25/9","יום בחירה (קל, מעט נהיגה)","אורטיזאי / ואל גרדנה — לילה 4/4",
  ["אגם קרצה (הקפה ~20 דק׳).","ואל די פונס–סנטה מדלנה.","עמק וואלונגה בסלבה (שטוח, מתאים לעגלה).","אגם בראייס (~1.5 ש׳ נסיעה, סירות חתירה)."],
  "בוחרים אופציה אחת לפי מזג האוויר והמצב רוח — לא לעמיס."),
 (10,"יום ש׳ · 26/9","דולומיטים ← רומא (יום מעבר)","מלון ליד טרמיני, רומא — לילה אחרון",
  ["בוקר צ׳ק-אאוט, נסיעה נופית אורטיזאי→ורונה (~2.5–3 ש׳), החזרת רכב.","אופציונלי 1–2 ש׳ בוורונה / צהריים.","אחה״צ Frecciarossa ורונה→רומא (~3 ש׳).","הגעה בערב, צ׳ק-אין ליד טרמיני, ארוחה רגועה."],
  "לתזמן החזרת רכב מול הרכבת — להשאיר מרווח של שעה לפחות."),
 (11,"יום א׳ · 27/9","המראה","—",
  ["ארוחת בוקר, גלידה אחרונה.","יציאה ~09:00 ל-FCO (Leonardo Express 32 דק׳ מטרמיני, או מונית).","טיסה 13:00."],
  "Leonardo Express יוצא בתדירות גבוהה מטרמיני — נוח עם מזוודות."),
]

# ---------------- STAY GROUPS ----------------
# row: name,bkName,type,area,rating,rsort,lo,hi,bf(txt,cls),park(txt,cls),official,airbnb(city|None),note,rec
stay_groups = [
 dict(title="רומא — מרכז היסטורי (פנתאון/נבונה)", dates="צ׳ק-אין 17/9 · צ׳ק-אאוט 19/9 · 2 לילות",
      ci=CI["rome"], co=CI["romeco"], nights=2,
      pick="<b>Internazionale Domus</b> (9.3) — דירת 2 חדרי שינה + מטבחון, הנוח ביותר ל-5 במרכז. ייתכן בלי מיטות נוספות → אולי 2 יחידות.",
      rows=[
       ("Hotel Martis Palace","Hotel Martis Palace Rome","מלון 4★","פנתאון/נבונה","~9.0",9.0,185,530,("זמינה/בתעריף","t-neutral"),("לא רלוונטי","t-neutral"),"https://www.hotelmartis.com",None,"Family Suite (2 חדרים מחוברים ~40מ״ר) ל-5 ✓ · מקור: momondo/Hotels.com",False),
       ("Hotel Lunetta","Hotel Lunetta Rome","מלון+ספא","קמפו דה פיורי","לבדיקה",0,140,390,("כלולה (בופה)","t-good"),("לא רלוונטי","t-neutral"),"https://www.hotellunetta.com",None,"ל-5 צריך Luxury Family Suite (עד 5) — בקצה הגבוה · מקור: HotelsCombined",False),
       ("Internazionale Domus","Internazionale Domus Rome","דירות","כיכר ספרד","9.3",9.3,180,405,("לבדיקה","t-neutral"),("לא רלוונטי","t-neutral"),"https://www.internazionaledomus.com","Rome--Italy","דירות 2 חדרי שינה+מטבחון · ללא מיטות נוספות → ייתכן 2 יחידות · מקור: momondo",True),
       ("Arch Rome Suites","Arch Rome Suites","בית הארחה 4★","לארגו ארג׳נטינה","9.1",9.1,100,230,("כלולה","t-good"),("לא רלוונטי","t-neutral"),"https://www.archromesuites.it",None,"חדר עד 4 (ל-5 שני חדרים) · ילדים 4–17: €20/לילה · מקור: planetofhotels",False),
      ]),
 dict(title="רומא — ליד טרמיני", dates="צ׳ק-אין 26/9 · צ׳ק-אאוט 27/9 · 1 לילה",
      ci=CI["term"], co=CI["termco"], nights=1,
      pick="<b>The Rossi</b> (~8.5) — חדרים משפחתיים וחלקם עם מטבחון, ומחיר נמוך. עדיף בבירור על Hotel Max (דירוג 6.2).",
      rows=[
       ("Hotel Max","Hotel Max Rome","מלון","ליד טרמיני","6.2",6.2,102,180,("זמינה (בופה)","t-neutral"),("לא רלוונטי","t-neutral"),"https://www.google.com/search?q=Hotel+Max+Roma+Via+Gioberti",None,"דירוג נמוך · חדר ל-5 לאמת · מקור: bedandbreakfast-rome/trip.com",False),
       ("The Rossi","The Rossi Rome","מלון-דירות","ליד טרמיני","~8.5",8.5,52,100,("זמינה","t-neutral"),("לא רלוונטי","t-neutral"),"https://www.hotelrossiroma.com",None,"חדרים משפחתיים, חלקם מטבחון · חדר ל-5 לאמת · מקור: romeitaly-hotels",True),
      ]),
 dict(title="אגם גארדה — חובה חניה", dates="צ׳ק-אין 19/9 · צ׳ק-אאוט 22/9 · 3 לילות",
      ci=CI["garda"], co=CI["gardaco"], nights=3,
      pick="<b>Sisan Family Resort</b> (ברדולינו) — דירת 2 חדרים ~50מ״ר ל-5 ✓, חניה חינם, מחיר טוב. שימו לב ל-Quellenhof (5★) אך ייתכן מינ׳ גיל 4.",
      rows=[
       ("Hotel Caesius Thermae & Spa","Hotel Caesius Thermae Spa Bardolino","מלון תרמי 4★","ברדולינו","לבדיקה (~9)",9.0,170,200,("כלולה","t-good"),("חינם בשטח","t-good"),"https://www.hotelcaesiusterme.com",None,"ספא ובריכות תרמיות · חדר ל-5 לאמת · מקור: momondo",False),
       ("Sisan Family Resort","Sisan Family Resort Bardolino","ריזורט 4★","ברדולינו (צ׳יזאנו)","לבדיקה",0,131,179,("בופה זמין","t-good"),("חינם בשטח","t-good"),"https://www.sisanfamilyresort.com","Bardolino--Italy","דירת 2 חדרים ~50מ״ר ל-5 ✓ · מקור: Hotels.com/FamilyResort.net",True),
       ("Quellenhof Luxury Resort","Quellenhof Luxury Resort Lazise","ריזורט 5★","לאזיסה","~9.6",9.6,255,None,("כלולה (חצי פנסיון)","t-good"),("חינם בשטח","t-good"),"https://www.quellenhof-lazise.it","Lazise--Italy","⚠️ ייתכן מינ׳ גיל 4 — קריטי לאמת לבן 3.5! €255+ עם חצי פנסיון · מקור: garda-see.com",False),
       ("Hotel Bell'Arrivo","Hotel Bell'Arrivo Peschiera del Garda","מלון 3★","פסקיירה דל גארדה","לבדיקה",0,98,210,("זמינה (לאמת)","t-neutral"),("ציבורית בתשלום","t-warn"),"https://www.hotelbellarrivo.it",None,"חניה לא חינם · חדר ל-5 לאמת (מחוברים) · מקור: momondo",False),
      ]),
 dict(title="אורטיזאי / ואל גרדנה — חובה חניה", dates="צ׳ק-אין 22/9 · צ׳ק-אאוט 26/9 · 4 לילות",
      ci=CI["ort"], co=CI["ortco"], nights=4,
      pick="<b>Cavallino Bianco Family Resort</b> — מלון למשפחות עם Family Queen Suite *5 ל-5, All-In וחניון. תמחור פנסיון מלא לאדם — לבדוק ישירות. חלופת ערך: <b>Elvis Apartments</b> (8.4, דירה ל-5, חניה חינם).",
      rows=[
       ("Cavallino Bianco Family Resort & Spa","Cavallino Bianco Family Resort Ortisei","מלון פמילי 4★S","אורטיזאי","לבדיקה",0,None,None,("כלולה (All-In)","t-good"),("חניון בשטח","t-good"),"https://www.cavallino-bianco.com",None,"Family Queen Suite *5 ל-5 ✓ · פנסיון מלא לאדם/לילה — מחיר ישירות באתר",True),
       ("Hotel Garni Gardena","Hotel Garni Gardena Val Gardena","גארני/דירות","ואל גרדנה","לבדיקה",0,184,None,("כלולה","t-good"),("לבדיקה","t-neutral"),"https://www.hotelgardena.com",None,"⚠️ לאמת זהות — ייתכן בסנטה כריסטינה · €184+ · מקור: hotels-in-it.com",False),
       ("Classic Hotel am Stetteneck","Classic Hotel am Stetteneck Ortisei","מלון 4★","אורטיזאי (מרכז)","8.9",8.9,130,460,("כלולה","t-good"),("בשטח בתשלום","t-warn"),"https://www.stetteneck.com",None,"חדרים מחוברים / ג׳וניור סוויט ל-5 · מקור: Tripadvisor",False),
       ("Elvis Apartments","Elvis Apartments Ortisei","אפרטהוטל/דירות","אורטיזאי (רונקדיצה)","8.4",8.4,208,461,("אופציונלי €25","t-neutral"),("חינם פרטית","t-good"),"https://www.hotel-elvis.com","Ortisei--Italy","דירת 2 חדרים ל-4–6 ✓ · מס €3/אדם 14+ · מקור: HotelsCombined",False),
      ]),
]

# ---------------- BUDGET ----------------
budget_rows = [
 ("לינה · רומא מרכז","Internazionale Domus (דירה)","2 לילות",180*2,405*2),
 ("לינה · אגם גארדה","Sisan Family Resort (דירה)","3 לילות",131*3,179*3),
 ("לינה · אורטיזאי","Elvis Apartments (דירה)*","4 לילות",208*4,461*4),
 ("לינה · רומא טרמיני","The Rossi","1 לילה",52,100),
 ("רכב שכור","7-מושבים אוטומט, ורונה","7 ימים",550,900),
 ("רכבות Frecciarossa","רומא⇄ורונה, 5 נפשות, 2 קטעים","מנחה",300,600),
 ("Leonardo Express","טרמיני↔FCO, €14×5","כיוון אחד",70,70),
 ("הסעה משדה (נחיתה)","ואן 5–6 מקומות","מנחה",60,80),
]
sum_lo = sum(r[3] for r in budget_rows); sum_hi = sum(r[4] for r in budget_rows)

# ---------------- CAR ----------------
car_rows = [
 ("Sixt — שדה VRN","VW Sharan / Ford Galaxy או דומה","אוטומט (לסנן)","7","CDW/TP בסיסי + Full Protection","לבדיקה בקישור","https://www.sixt.com/minivan-rental/italy/verona/"),
 ("Europcar — שדה VRN","Ford Galaxy / Peugeot 5008 או דומה","אוטומט (לסנן)","7","CDW + Theft; אופציית Premium","לבדיקה בקישור","https://www.europcar.com/en-us/places/car-rental-italy/sommacampagna/verona-airport"),
 ("Rentalcars — השוואה (VRN)","כל הספקים · People carrier 7+","לסנן אוטומט","7+","Full Protection משלים","~€550–900 (מנחה)","https://www.rentalcars.com/en/airport/it/vrn/"),
 ("DiscoverCars — השוואה","מיניוואן 7 מושבים (כולל מקומיים)","לסנן אוטומט","7+","Full Coverage משלים","~€550–900 (מנחה)","https://www.discovercars.com/italy-mainland/verona/vrn"),
]

# ---------------- CHECKLIST ----------------
check_items = [
 ("col","כרטיסי קולוסיאום (הזמנה מיידית עם הפתיחה)","דחוף","t-bad"),
 ("train1","רכבת Frecciarossa רומא→ורונה (יום 3)","~4ח׳ מראש","t-warn"),
 ("train2","רכבת Frecciarossa ורונה→רומא (יום 10)","~4ח׳ מראש","t-warn"),
 ("car","רכב שכור בוורונה — לוודא אוטומט!","מוקדם","t-warn"),
 ("h1","מלון רומא מרכז — 2 לילות (17–19/9)","לינה","t-neutral"),
 ("h2","מלון אגם גארדה — 3 לילות (19–22/9)","לינה","t-neutral"),
 ("h3","מלון אורטיזאי — 4 לילות (22–26/9)","לינה","t-neutral"),
 ("h4","מלון רומא טרמיני — 1 לילה (26–27/9)","לינה","t-neutral"),
 ("transfer","הסעה משדה FCO בנחיתה (ואן 5–6)","יום 1","t-neutral"),
 ("seceda","כרטיסי רכבל סצ׳דה (יום 7)","אטרקציה","t-neutral"),
 ("colfosco","אימות פתיחת פארק Colfosco ל-2026 (יום 8)","לאמת","t-warn"),
 ("gardaland","כרטיסי גרדהלנד (יום 5)","אטרקציה","t-neutral"),
 ("quellenhof","אם בוחרים Quellenhof — לאמת מינ׳ גיל 4 לבן 3.5","קריטי","t-bad"),
 ("insurance","ביטוח נסיעות למשפחה","חובה","t-warn"),
]

# ---------------- PLACES (quick links) ----------------
places = {
 "רומא":[("קולוסיאום",41.8902,12.4922),("פנתאון",41.8986,12.4769),("מזרקת טרווי",41.9009,12.4833),("פיאצה נבונה",41.8992,12.4731),("וילה בורגזה",41.9145,12.4920),("טרסטוורה",41.8896,12.4694)],
 "ורונה":[("ארנה די ורונה",45.4390,10.9947),("ורונה Porta Nuova",45.4290,10.9817)],
 "אגם גארדה":[("סירמיונה",45.4956,10.6064),("גרדהלנד",45.4604,10.7174),("Parco Natura Viva",45.4717,10.7553)],
 "הדולומיטים":[("מוזיאון אצי (בולצאנו)",46.4983,11.3548),("רכבל סצ׳דה",46.5790,11.6680),("פסגת סצ׳דה",46.6075,11.6480),("אלפה די סיוזי",46.5408,11.6175),("פארק חבלים Colfosco",46.5577,11.8800),("אגם קרצה",46.4093,11.5765),("סנטה מדלנה/פונס",46.6417,11.7050),("וואלונגה (סלבה)",46.5547,11.7600),("אגם בראייס",46.6947,12.0855),("Passo Gardena",46.5469,11.8163)],
 "תחבורה":[("שדה תעופה FCO",41.8003,12.2389),("תחנת רומא טרמיני",41.9009,12.5018)],
}

# ---------------- WEATHER (typical September norms — verify live forecast) ----------------
# name, climate, day_high, night_low, extra, clothing
weather = [
 ("🏛️ רומא","ים-תיכוני, נעים","~26–28°C","~15–17°C","בעיקר שמשי; ייתכן ממטר קצר. בסוף החודש מעט מתקרר (~24°C ביום).",
  "בגדי קיץ, שכבה דקה לערב, נעלי הליכה נוחות, כובע ובקבוק מים ליום בעיר."),
 ("🏖️ אגם גארדה","מתון, שמשי","~24–26°C","~13–15°C","מי האגם ~22–23°C — עדיין נעים לשחייה.",
  "בגדי קיץ + בגד ים, כפכפים, שכבה לערב על שפת המים."),
 ("🏔️ דולומיטים / אורטיזאי","אלפיני, משתנה מהר","~15–20°C בעמק","~3–7°C (ייתכן קרוב ל-0)","בפסגות (סצ׳דה 2,500מ׳) ~0–8°C עם רוח, וייתכן שלג. הפרשים גדולים בין עמק לפסגה.",
  "שכבות! מעיל חם/רוח, כובע וכפפות לגובה, נעלי הליכה, שכבה תרמית לקטן."),
]
weather_cards = []
for name,climate,day,night,extra,cloth in weather:
    weather_cards.append(f'''<div class="wcard">
  <div class="wtop"><span class="wname">{name}</span><span class="wclimate">{climate}</span></div>
  <div class="wtemps"><div class="wt"><span>☀️ יום</span><b>{day}</b></div><div class="wt"><span>🌙 לילה</span><b>{night}</b></div></div>
  <div class="wextra">{extra}</div>
  <div class="wcloth">🧳 <b>לבוש:</b> {cloth}</div>
</div>''')
weather_html = "\n".join(weather_cards)

# ---------------- RESTAURANTS (family-friendly; verified real places) ----------------
# group title, list of (name, area, cuisine, why, price)
resto_groups = [
 ("🏛️ רומא — מרכז היסטורי", [
   ("Armando al Pantheon","ליד הפנתאון","טרטוריה רומאית קלאסית","מוסד משפחתי ותיק, מנות מסורתיות (קרבונרה, קצ׳ו אה פפה). קטן — להזמין מראש","€€€"),
   ("Tonnarello","טרסטוורה","פסטה/טרטוריה","תוסס, מנות גדולות (~€12.5), פופולרי למשפחות, התור זז מהר","€€"),
   ("Da Enzo al 29","טרסטוורה","טרטוריה רומאית קטנה","אותנטי וזול, פסטה שילדים אוהבים. קטן — להגיע מוקדם","€€"),
   ("Dar Poeta","טרסטוורה","פיצרייה","רגוע וידידותי לילדים, פיצה פשוטה לכולם","€€"),
   ("Da Tonino","ליד פיאצה נבונה","טרטוריה פשוטה","זול, מהיר וקליל (קציצות מפורסמות)","€"),
   ("La Renella","טרסטוורה","מאפייה / פיצה בחיתוך","פרוסות פריכות, מהיר וזול — מצוין לבן 3.5","€"),
 ]),
 ("🍦 רומא — גלידה", [
   ("Giolitti","ליד הפנתאון","גלידרייה היסטורית","מ~1900, מוסד רומאי, מבחר טעמים ענק","€"),
   ("Gelateria del Teatro","ליד פיאצה נבונה","גלידה אומנותית","טעמים מיוחדים (תאנה-שקד-ריקוטה), איכות מנה קטנה","€"),
   ("Frigidarium","ליד פיאצה נבונה","גלידרייה פופולרית","גלידה בטבילת שוקולד — אהובה על ילדים","€"),
 ]),
 ("🏛️ רומא — ליד טרמיני", [
   ("Mercato Centrale Roma","בתוך תחנת טרמיני","אולם אוכל (food hall)","~500 מקומות, 18 דוכנים (פיצת Bonci, Trapizzino, פסטה) — כל אחד בוחר. פתוח עד מאוחר","€/€€"),
   ("Trattoria Monti","אסקווילינו (ליד טרמיני)","טרטוריה משפחתית, מטבח לה-מארקה","ביתי ורב-דורי, עדיף לגדולים — להזמין מראש","€€"),
   ("Trattoria da Danilo","דרומית לטרמיני","קוצ׳ינה רומאנה","כפרי וידידותי, קלאסיקות רומיות (קרבונרה, גריצ׳ה)","€€"),
 ]),
 ("🏖️ אגם גארדה", [
   ("Trattoria al Porticciolo","ברדולינו","איטלקי / פיצה / דגי אגם","על שפת האגם, פיצה ופסטה שילדים אוהבים","€€"),
   ("Ristorante Alla Fassa","לאזיסה","איטלקי / דגי אגם","טרסה גדולה על המים — קליל וקרוב למים לילדים","€€"),
   ("Pizzeria La Roccia","סירמיונה","פיצה נפוליטנית","פיצה מהירה בטאבון, ישיבה פנים + חוץ מקורה","€€"),
   ("Ristorante Risorgimento","סירמיונה","איטלקי מסורתי","ותיק (100+ שנים), תפריט רחב לשולחן רב-גילאי","€€€"),
   ("Trattoria Bella Italia","פסקיירה דל גארדה","פסטה/בשר ורונזי","כפרי עם טרסה, בישול מקומי טרי","€€"),
 ]),
 ("🏔️ אורטיזאי / ואל גרדנה", [
   ("Mauriz Keller","אורטיזאי (מרכז)","דרום-טירולי + פיצה בטאבון","מרכזי, מנות גדולות, פיצה/פסטה + מקומי. דירוג גבוה בטריפאדוויזר","€€"),
   ("Restaurant Four","אורטיזאי (מרכז)","טירולי / ים-תיכוני / פיצה","קליל ומרכזי, פיצות אותנטיות + טייקאווי","€€"),
   ("Gostner Schwaige","אלפה די סיוזי","בקתת הרים דרום-טירולית","רכבל + ~30 דק׳ הליכה קלה (הכי קלה לקטן!). מרק פרחי-חציר בקערת לחם","€€"),
   ("Rifugio Firenze (Regensburgerhütte)","מרחבי סצ׳דה","טירולי / לדיני","בקתה משפחתית פופולרית, נוף Odle, אופציות צמחוני/טבעוני/ללא גלוטן","€€"),
   ("Rifugio Sasso Piatto","אזור סאסולונגו","בקתה דרום-טירולית","Schlutzkrapfen ביתי, חיות קטנות. הליכה ארוכה יותר — לשקול עם הקטן","€€"),
 ]),
]
resto_html = []
for gtitle, items in resto_groups:
    rows = []
    for name, area, cuisine, why, price in items:
        rows.append(f'''<div class="ritem">
   <div class="rh"><a class="rname" target="_blank" rel="noopener" href="{gmap(name+' '+area)}">📍 {name}</a><span class="tag t-neutral">{price}</span></div>
   <div class="rmeta">{area} · {cuisine}</div>
   <div class="rwhy">{why}</div>
 </div>''')
    resto_html.append(f'<div class="tablecard"><div class="th"><h3>{gtitle}</h3></div>{"".join(rows)}</div>')
resto_html = "\n".join(resto_html)

# ---------------- TICKETS (verified official ticketing URLs) ----------------
# group, list of dict(name, when, official, reseller, rlabel, note)
ticket_groups = [
 ("🏛️ רומא ותחבורה", [
   dict(name="קולוסיאום + פורום רומאנו + פלטינו", when="יום 2", official="https://ticketing.colosseo.it/en/", reseller="https://www.getyourguide.com/colosseum-l719/", rlabel="חלופה (GetYourGuide)", note="⚠️ הזמינו מיד עם פתיחת המכירה — נמכר מהר מאוד. כרטיס בשעה מוזמן מראש."),
   dict(name="רכבת Frecciarossa רומא⇄ורונה", when="ימים 3 ו-10", official="https://www.trenitalia.com/en.html", reseller="https://www.italotreno.com/en", rlabel="Italo (חלופה זהה)", note="⚠️ נפתח ~4 חודשים מראש — מוקדם = זול בהרבה."),
   dict(name="Leonardo Express (טרמיני↔FCO)", when="יום 11", official="https://www.trenitalia.com/en/services/leonardo-express.html", reseller=None, rlabel=None, note="€17.90, כל ~15 דק׳, ~32 דק׳. אפשר גם לקנות בתחנה."),
 ]),
 ("🏖️ אגם גארדה וורונה", [
   dict(name="גרדהלנד", when="יום 5", official="https://www.gardaland.it/en/tickets-season-passes/tickets/", reseller="https://www.tiqets.com/en/gardaland-amusement-park-tickets-l145735/", rlabel="חלופה (Tiqets)", note="כרטיס מקוון מראש זול יותר ומקצר תורים."),
   dict(name="Parco Natura Viva (חלופה ליום 5)", when="יום 5", official="https://shop.parconaturaviva.it", reseller="https://www.tiqets.com/en/bussolengo-attractions-c71971/", rlabel="חלופה (Tiqets)", note=None),
   dict(name="טירת סקליגרו + Grotte di Catullo (סירמיונה)", when="יום 4", official="https://www.museiitaliani.it", reseller="https://www.getyourguide.com/sirmione-l3990/", rlabel="חלופה (GetYourGuide)", note="מוזיאונים ממלכתיים — הכרטיס דרך הפלטפורמה הלאומית museiitaliani.it."),
   dict(name="ארנה די ורונה (אופציונלי)", when="ימים 3 / 10", official="https://www.arena.it/en/arena-verona-opera-festival/tickets/", reseller="https://www.getyourguide.com/verona-l1029/", rlabel="חלופה (GetYourGuide)", note="ℹ️ פסטיבל האופרה מסתיים ~12/9 — בתאריכים שלכם אין מופעים, אך אפשר לבקר במבנה עצמו."),
 ]),
 ("🏔️ הדולומיטים", [
   dict(name="רכבל סצ׳דה (Ortisei–Furnes–Seceda)", when="יום 7", official="https://www.seceda.it/en/tickets", reseller="https://www.getyourguide.com/-l103355/?q=seceda", rlabel="חלופה (GetYourGuide)", note="⚠️ מקיץ 2026 חובה הזמנת חלון-זמן (timed slot) מראש באתר הרשמי."),
   dict(name="מוזיאון אצי (מומיית הקרח), בולצאנו", when="יום 6", official="https://www.iceman.it/en", reseller="https://www.tiqets.com/en/bolzano-attractions-c66172/", rlabel="חלופה (Tiqets)", note=None),
   dict(name="פארק חבלים Colfosco (אלטה באדיה)", when="יום 8", official="https://www.alta-badia.org/en/leisure-activities/colfosco-adventure-park/", reseller=None, rlabel=None, note="⚠️ אין מכירה מקוונת נפרדת — מידע/קשר דרך לשכת התיירות. לאמת תאריך סגירה מדויק ל-2026 (קצה העונה)."),
   dict(name="אגם בראייס — הזמנת חניה", when="יום 9 (חלופה)", official="https://www.pragsparking.com/en", reseller=None, rlabel=None, note="ℹ️ הזמנת חניה נדרשת רק 1/7–15/9. סוף ספטמבר ככל הנראה פטור — לאמת באתר לקראת הנסיעה."),
 ]),
]
ticket_html = []
for gtitle, items in ticket_groups:
    rows = []
    for it in items:
        links = [f'<a class="btnlink bk" target="_blank" rel="noopener" href="{it["official"]}">🎟️ כרטיסים רשמיים</a>']
        if it["reseller"]:
            links.append(f'<a class="btnlink" target="_blank" rel="noopener" href="{it["reseller"]}">{it["rlabel"]}</a>')
        note = f'<div class="rwhy">{it["note"]}</div>' if it["note"] else ""
        rows.append(f'''<div class="ritem">
   <div class="rh"><span class="rname" style="color:var(--ink)">{it["name"]}</span><span class="tag t-neutral">{it["when"]}</span></div>
   {note}
   <div class="links" style="margin-top:6px">{"".join(links)}</div>
 </div>''')
    ticket_html.append(f'<div class="tablecard"><div class="th"><h3>{gtitle}</h3></div>{"".join(rows)}</div>')
ticket_html = "\n".join(ticket_html)

# ================= BUILD HTML =================
def esc(s): return s  # content is trusted/static

# route
route_html = []
route = [("🏛️","רומא","מרכז היסטורי",2),("🚄 רכבת ~3ש׳",),("🏖️","אגם גארדה","ברדולינו/לאזיסה",3),
         ("🚗 נסיעה ~2.5ש׳",),("🏔️","אורטיזאי","ואל גרדנה",4),("🚗+🚄 חזרה",),("🏛️","רומא","טרמיני",1)]
for r in route:
    if len(r)==1:
        route_html.append(f'<div class="arrowwrap"><span style="font-size:18px;color:#94a3b8">‹</span><span style="font-size:11px;color:#6b7280">{r[0]}</span></div>')
    else:
        ic,nm,ni,ni_n = r
        lbl = "לילה" if ni_n==1 else "לילות"
        route_html.append(f'<div class="leg"><div class="ic">{ic}</div><div class="nm">{nm}</div><div class="ni">{ni}</div><div class="badge">{ni_n} {lbl}</div></div>')
route_html = "\n".join(route_html)

# day tabs + panels
tabs_html = ['<button class="dtab" data-day="all">הכל</button>']
for n,date,title,stay,acts,tip in days:
    tabs_html.append(f'<button class="dtab" data-day="{n}"><span class="d">{date}</span>יום {n}</button>')
tabs_html = "\n".join(tabs_html)

panels_html = []
for n,date,title,stay,acts,tip in days:
    lis = "".join(f"<li>{a}</li>" for a in acts)
    panels_html.append(f'''<div class="daypanel" id="day{n}">
  <div class="daycard">
    <div class="top"><div class="date">{date}</div><h3>יום {n} · {title}</h3>
      <span class="stay">🛏️ לינה: {stay}</span></div>
    <div class="body">
      <div><h4>פעילויות</h4><ul>{lis}</ul></div>
      <div class="tipbox"><b>💡 טיפ:</b> {tip}</div>
    </div></div>
</div>''')
panels_html = "\n".join(panels_html)

# stay tables
stay_html = []
for gi,g in enumerate(stay_groups):
    rows_html = []
    for row in g["rows"]:
        (name,bkName,typ,area,rating,rsort,lo,hi,bf,park,official,airbnb,note,rec) = row
        links = [f'<a class="btnlink bk" target="_blank" rel="noopener" href="{bk(bkName,g["ci"],g["co"])}">Booking</a>',
                 f'<a class="btnlink" target="_blank" rel="noopener" href="{official}">רשמי</a>',
                 f'<a class="btnlink" target="_blank" rel="noopener" href="{gh(bkName)}">Google</a>',
                 f'<a class="btnlink" target="_blank" rel="noopener" href="{gmap(bkName)}">📍 מפה</a>']
        if airbnb:
            links.append(f'<a class="btnlink" target="_blank" rel="noopener" href="{abnb(airbnb,g["ci"],g["co"])}">Airbnb</a>')
        rec_cls = ' class="rec"' if rec else ''
        rsort_attr = rsort if rsort else 0
        lo_attr = lo if lo else 100000
        rows_html.append(f'''<tr{rec_cls}>
   <td data-label="שם" class="nm">{name}<div class="note-sm">{note}</div></td>
   <td data-label="סוג">{typ}</td>
   <td data-label="אזור">{area}</td>
   <td data-label="דירוג" data-sort="{rsort_attr}">{rating}</td>
   <td data-label="בוקר"><span class="tag {bf[1]}">{bf[0]}</span></td>
   <td data-label="חניה"><span class="tag {park[1]}">{park[0]}</span></td>
   <td data-label="מחיר/לילה" data-sort="{lo_attr}"><span class="price">{night_str(lo,hi)}</span> <span class="note-sm">מנחה</span></td>
   <td data-label="סה״כ ({g['nights']}ל׳)"><span class="price">{total_str(lo,hi,g["nights"])}</span></td>
   <td data-label="קישורים"><div class="links">{"".join(links)}</div></td>
 </tr>''')
    stay_html.append(f'''<div class="tablecard">
  <div class="th"><h3>{g["title"]}</h3><span class="dates">{g["dates"]}</span></div>
  <div class="pickbar">★ הבחירה שלי: {g["pick"]}</div>
  <div class="scroll"><table class="sortable">
   <thead><tr>
     <th data-k="t">שם <span class="ar">↕</span></th>
     <th data-k="t">סוג <span class="ar">↕</span></th>
     <th data-k="t">אזור <span class="ar">↕</span></th>
     <th data-k="n">דירוג <span class="ar">↕</span></th>
     <th data-k="t">בוקר <span class="ar">↕</span></th>
     <th data-k="t">חניה <span class="ar">↕</span></th>
     <th data-k="n">מחיר/לילה <span class="ar">↕</span></th>
     <th class="nosort">סה״כ ({g["nights"]}ל׳)</th>
     <th class="nosort">קישורים</th>
   </tr></thead>
   <tbody>
{"".join(rows_html)}
   </tbody>
  </table></div>
</div>''')
stay_html = "\n".join(stay_html)

# budget
brows = []
for comp,det,qty,lo,hi in budget_rows:
    brows.append(f'<tr><td data-label="רכיב" class="nm">{comp}</td><td data-label="פרטים">{det}</td><td data-label="כמות">{qty}</td><td data-label="אומדן" class="price">€{lo:,}–{hi:,}</td></tr>')
brows = "\n".join(brows)

# car
crows = []
for prov,model,trans,seats,ins,price,link in car_rows:
    crows.append(f'''<tr>
  <td data-label="ספק" class="nm">{prov}</td>
  <td data-label="דגם/קטגוריה">{model}</td>
  <td data-label="תיבה"><span class="tag t-good">{trans}</span></td>
  <td data-label="מושבים">{seats}</td>
  <td data-label="ביטוח">{ins}</td>
  <td data-label="מחיר (7 ימים)"><span class="tag t-neutral">{price}</span></td>
  <td data-label="הזמנה"><a class="btnlink bk" target="_blank" rel="noopener" href="{link}">להזמנה</a></td>
 </tr>''')
crows = "\n".join(crows)

# checklist
chk = []
for cid,txt,pri,pcls in check_items:
    chk.append(f'''<div class="chk" data-id="{cid}">
  <input type="checkbox" id="ck_{cid}">
  <label for="ck_{cid}">{txt}<span class="pri tag {pcls}">{pri}</span></label>
 </div>''')
chk = "\n".join(chk)

# quick links
ql = []
for grp,arr in places.items():
    btns = "".join(f'<a target="_blank" rel="noopener" href="{gmapll(la,ln)}">📍 {nm}</a>' for nm,la,ln in arr)
    ql.append(f'<div class="grp">{grp}</div><div class="qlgrid">{btns}</div>')
ql = "\n".join(ql)

HTML = f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>טיול משפחתי לאיטליה · 17–27 בספטמבר 2026</title>
<style>
  :root{{--bg:#f4f6fb;--card:#fff;--ink:#1f2937;--muted:#6b7280;--line:#e5e7eb;--accent:#0e7490;--accent2:#155e75;--warm:#b45309;--shadow:0 1px 3px rgba(0,0,0,.08),0 6px 18px rgba(0,0,0,.06)}}
  *{{box-sizing:border-box}}
  body{{margin:0;font-family:"Segoe UI",Arial,"Helvetica Neue",sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-text-size-adjust:100%}}
  a{{color:var(--accent2)}}
  header.hero{{background:linear-gradient(135deg,#0e7490,#155e75 60%,#134e4a);color:#fff;padding:26px 20px 24px;position:relative}}
  .wrap{{max-width:1120px;margin:0 auto;padding:0 16px}}
  header.hero h1{{margin:0 0 6px;font-size:27px}}
  header.hero .sub{{font-size:15.5px;opacity:.95}}
  header.hero .meta{{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px}}
  header.hero .pill{{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);padding:6px 11px;border-radius:999px;font-size:13px}}
  .printbtn{{margin-top:14px;background:#fff;color:#155e75;border:0;border-radius:10px;padding:9px 15px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:var(--shadow)}}
  .printbtn:hover{{background:#ecfeff}}
  nav.toc{{position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid var(--line);box-shadow:0 1px 4px rgba(0,0,0,.05);overflow-x:auto;-webkit-overflow-scrolling:touch}}
  nav.toc .row{{display:flex;gap:4px;padding:8px 12px;white-space:nowrap}}
  nav.toc a{{color:var(--ink);text-decoration:none;font-size:13.5px;padding:7px 11px;border-radius:8px;flex:0 0 auto}}
  nav.toc a:active,nav.toc a:hover{{background:#ecfeff;color:var(--accent2)}}
  section{{padding:28px 0 6px}}
  h2.sec{{font-size:22px;margin:0 0 4px;color:var(--accent2);display:flex;align-items:center;gap:9px}}
  h2.sec .ico{{font-size:23px}}
  .lead{{color:var(--muted);margin:2px 0 16px;font-size:14px}}
  .route{{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin-bottom:20px}}
  .leg{{flex:1 1 130px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:13px;text-align:center;min-width:120px}}
  .leg .ic{{font-size:23px}} .leg .nm{{font-weight:700;margin-top:4px}} .leg .ni{{font-size:12px;color:var(--muted)}}
  .leg .badge{{display:inline-block;margin-top:6px;background:#ecfeff;color:#155e75;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}}
  .arrowwrap{{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:60px}}
  .daytabs{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}}
  .daytabs button{{cursor:pointer;border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 12px;font-size:13.5px;color:var(--ink)}}
  .daytabs button .d{{display:block;font-size:11px;color:var(--muted)}}
  .daytabs button.active{{background:var(--accent);color:#fff;border-color:var(--accent)}}
  .daytabs button.active .d{{color:#d6f3fb}}
  .daypanel{{display:block;margin-bottom:14px}}
  .js-tabs .daypanel{{display:none}} .js-tabs .daypanel.show{{display:block}}
  .daycard{{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}}
  .daycard .top{{padding:15px 18px;border-bottom:1px solid var(--line);background:#f8fafc}}
  .daycard .top .date{{font-size:13px;color:var(--muted)}}
  .daycard .top h3{{margin:3px 0 0;font-size:19px}}
  .daycard .top .stay{{margin-top:7px;font-size:13px;color:var(--accent2);background:#ecfeff;display:inline-block;padding:4px 10px;border-radius:8px}}
  .daycard .body{{padding:15px 18px;display:grid;gap:13px}}
  .daycard h4{{margin:0 0 6px;font-size:14px;color:var(--accent2)}}
  .daycard ul{{margin:0;padding-inline-start:20px}} .daycard li{{margin:3px 0}}
  .tipbox{{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;font-size:13.5px}}
  .tipbox b{{color:var(--warm)}}
  .notes{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}}
  .note{{background:#fff;border:1px solid var(--line);border-inline-start:4px solid var(--accent);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}}
  .note h4{{margin:0 0 6px;font-size:15px}} .note p{{margin:0;font-size:13.5px;color:#374151}}
  .tablecard{{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;margin-bottom:24px}}
  .tablecard .th{{padding:13px 16px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between}}
  .tablecard .th h3{{margin:0;font-size:17px}} .tablecard .th .dates{{font-size:12.5px;color:var(--muted)}}
  .pickbar{{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:10px 16px;font-size:13.5px}}
  .pickbar b{{color:#047857}}
  .scroll{{overflow-x:auto;-webkit-overflow-scrolling:touch}}
  table{{width:100%;border-collapse:collapse;font-size:13.5px}}
  th,td{{padding:10px 12px;text-align:right;border-bottom:1px solid var(--line);vertical-align:top}}
  thead th{{background:#f8fafc;color:#374151;font-weight:600;cursor:pointer;white-space:nowrap;user-select:none}}
  thead th.nosort{{cursor:default}}
  thead th .ar{{opacity:.4;font-size:10px}}
  .nm{{font-weight:600}}
  .rec td{{background:#ecfdf5}}
  .rec .nm:after{{content:"★ הבחירה שלי";font-size:11px;color:#047857;margin-inline-start:8px;background:#d1fae5;padding:2px 7px;border-radius:6px;font-weight:600}}
  .tag{{display:inline-block;font-size:11.5px;padding:2px 8px;border-radius:6px;white-space:nowrap}}
  .t-good{{background:#dcfce7;color:#166534}} .t-warn{{background:#fef3c7;color:#92400e}}
  .t-bad{{background:#fee2e2;color:#991b1b}} .t-neutral{{background:#f1f5f9;color:#475569}}
  .price{{font-weight:700;color:#0f172a}}
  .links{{display:flex;flex-wrap:wrap;gap:5px}}
  .btnlink{{font-size:12px;text-decoration:none;padding:5px 10px;border-radius:7px;border:1px solid var(--line);color:#1f2937;background:#fff;white-space:nowrap}}
  .btnlink:active,.btnlink:hover{{background:#0e7490;color:#fff;border-color:#0e7490}}
  .btnlink.bk{{background:#003580;color:#fff;border-color:#003580}}
  .note-sm{{font-size:12px;color:var(--muted)}}
  .budget tfoot td{{font-weight:700;background:#f0fdfa;border-top:2px solid #99f6e4}}
  .grandtotal{{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px}}
  .gt{{flex:1 1 200px;background:linear-gradient(135deg,#0e7490,#155e75);color:#fff;border-radius:14px;padding:16px 20px;box-shadow:var(--shadow)}}
  .gt .lbl{{font-size:13px;opacity:.9}} .gt .val{{font-size:25px;font-weight:800;margin-top:2px}}
  .checklist{{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:6px 6px}}
  .chk{{display:flex;align-items:flex-start;gap:10px;padding:11px 14px;border-bottom:1px solid var(--line)}}
  .chk:last-child{{border-bottom:0}}
  .chk input{{width:21px;height:21px;margin-top:1px;cursor:pointer;accent-color:#0e7490;flex-shrink:0}}
  .chk label{{cursor:pointer;font-size:14px}}
  .chk .pri{{font-size:11px;margin-inline-start:6px}}
  .chk.done label{{text-decoration:line-through;color:var(--muted)}}
  .progress{{height:9px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:6px 14px 12px}}
  .progress>i{{display:block;height:100%;background:linear-gradient(90deg,#10b981,#0e7490);width:0;transition:width .25s}}
  .progtxt{{font-size:13px;color:var(--muted);padding:8px 14px 2px}}
  .mapbox{{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:18px 20px}}
  .mapbox ol{{margin:8px 0 0;padding-inline-start:22px}} .mapbox li{{margin:6px 0;font-size:14px}}
  .filechips{{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}}
  .filechips a{{font-size:13px;text-decoration:none;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;padding:8px 12px;border-radius:9px}}
  .sharedmap{{background:linear-gradient(135deg,#0e7490,#155e75);color:#fff;border-radius:12px;padding:14px 16px;margin-bottom:14px}}
  .sharedmap h4{{margin:0 0 8px;font-size:15px}}
  .sharedmap .row{{display:flex;flex-wrap:wrap;gap:8px;align-items:center}}
  .sharedmap input{{flex:1 1 240px;border:0;border-radius:8px;padding:10px 12px;font-size:14px;font-family:inherit}}
  .sharedmap button{{border:0;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;background:#fff;color:#155e75}}
  .sharedmap .open{{background:#10b981;color:#fff;text-decoration:none;display:none}}
  .sharedmap small{{opacity:.9;display:block;margin-top:8px;font-size:12px}}
  .qlinks .grp{{font-size:13px;color:var(--muted);margin:12px 0 6px;font-weight:600}}
  .qlgrid{{display:flex;flex-wrap:wrap;gap:6px}}
  .qlgrid a{{font-size:12.5px;text-decoration:none;background:#fff;border:1px solid var(--line);color:#1f2937;padding:7px 11px;border-radius:8px}}
  .qlgrid a:active,.qlgrid a:hover{{background:#0e7490;color:#fff;border-color:#0e7490}}
  footer{{padding:26px 0 50px;color:var(--muted);font-size:12.5px;text-align:center}}
  .disclaim{{background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px 16px;font-size:13px;color:#7c2d12;margin-top:10px;text-align:right}}
  .wgrid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}}
  .wcard{{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:15px 17px}}
  .wtop{{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}}
  .wname{{font-size:17px;font-weight:700}} .wclimate{{font-size:12.5px;color:var(--muted)}}
  .wtemps{{display:flex;gap:10px;margin:10px 0}}
  .wt{{flex:1;background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:8px 10px;text-align:center}}
  .wt span{{display:block;font-size:12px;color:var(--muted)}} .wt b{{font-size:16px}}
  .wextra{{font-size:13px;color:#374151}} .wcloth{{font-size:13px;margin-top:8px;background:#ecfeff;border-radius:8px;padding:8px 10px}}
  .ritem{{padding:12px 16px;border-bottom:1px solid var(--line)}} .ritem:last-child{{border-bottom:0}}
  .rh{{display:flex;justify-content:space-between;align-items:baseline;gap:10px}}
  .rname{{font-weight:700;text-decoration:none;color:var(--accent2)}} .rname:hover{{text-decoration:underline}}
  .rmeta{{font-size:12.5px;color:var(--muted);margin-top:2px}} .rwhy{{font-size:13.5px;margin-top:3px}}

  /* ---- MOBILE: stack tables into cards ---- */
  @media(max-width:760px){{
    header.hero h1{{font-size:23px}}
    table.sortable,.budget table,#cartable{{font-size:13.5px}}
    table.sortable thead,.budget thead,#cartable thead{{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}}
    table.sortable tr,.budget tbody tr,.budget tfoot tr,#cartable tr{{display:block;margin:0 12px 12px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}}
    table.sortable td,.budget td,#cartable td{{display:flex;justify-content:space-between;gap:12px;border:0;border-bottom:1px solid var(--line);padding:9px 13px}}
    table.sortable td:last-child,.budget td:last-child,#cartable td:last-child{{border-bottom:0}}
    table.sortable td:before,.budget td:before,#cartable td:before{{content:attr(data-label);font-weight:700;color:var(--muted);flex:0 0 38%;text-align:right}}
    table.sortable td .links,#cartable td .links{{justify-content:flex-end}}
    table.sortable td.nm,.budget td.nm,#cartable td.nm{{flex-direction:column;gap:4px}}
    table.sortable td.nm:before,.budget td.nm:before,#cartable td.nm:before{{flex-basis:auto}}
    .rec td{{background:#fff}} .rec tr{{}}
    .scroll{{overflow:visible}}
    .gt .val{{font-size:22px}}
  }}
  @media print{{
    nav.toc,.printbtn,.daytabs,.sharedmap{{display:none!important}}
    .js-tabs .daypanel{{display:block!important;page-break-inside:avoid}}
    body{{background:#fff}}
    .tablecard,.daycard,.note,.checklist,.mapbox{{box-shadow:none}}
  }}
</style>
</head>
<body>

<header class="hero"><div class="wrap">
  <h1>🇮🇹 טיול משפחתי לאיטליה</h1>
  <div class="sub">רומא · אגם גארדה · הדולומיטים — 17–27 בספטמבר 2026 · 10 לילות</div>
  <div class="meta">
    <span class="pill">👨‍👩‍👧‍👦 2 מבוגרים + 3 ילדים (13, 9, 3.5)</span>
    <span class="pill">✈️ נחיתה FCO 17/9 21:00</span>
    <span class="pill">✈️ המראה FCO 27/9 13:00</span>
    <span class="pill">🚄 רכבת רומא⇄ורונה</span>
    <span class="pill">🚗 רכב: גארדה+דולומיטים</span>
  </div>
  <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
    <button class="printbtn" onclick="window.print()">🖨️ הדפסה / PDF</button>
    <button class="printbtn" onclick="copyLink()">🔗 העתק קישור</button>
  </div>
  <div style="margin-top:8px;font-size:12.5px;opacity:.92">קישור לדף: <a href="{SITE_URL}" target="_blank" rel="noopener" style="color:#d6f3fb">{SITE_URL}</a></div>
</div></header>

<nav class="toc"><div class="row wrap">
  <a href="#itinerary">🗓️ מסלול יומי</a>
  <a href="#notes">📌 הערות</a>
  <a href="#tickets">🎟️ כרטיסים</a>
  <a href="#weather">🌤️ מזג אוויר</a>
  <a href="#stay">🏨 לינה</a>
  <a href="#food">🍝 מסעדות</a>
  <a href="#budget">💶 תקציב</a>
  <a href="#car">🚗 רכב</a>
  <a href="#checklist">✅ צ׳ק-ליסט</a>
  <a href="#map">🗺️ מפה</a>
</div></nav>

<div class="wrap">

<section id="itinerary">
  <h2 class="sec"><span class="ico">🗓️</span> מסלול יומי מפורט</h2>
  <p class="lead">סקירת מסלול, ולחיצה על יום מציגה אותו בלבד (כפתור "הכל" מציג את כולם). במובייל הכל גלוי בגלילה.</p>
  <div class="route">{route_html}</div>
  <div class="daytabs" id="daytabs">{tabs_html}</div>
  <div id="daypanels">
{panels_html}
  </div>
</section>

<section id="notes">
  <h2 class="sec"><span class="ico">📌</span> הערות והזמנות חשובות</h2>
  <p class="lead">דברים שכדאי להזמין/לאמת מוקדם — חלקם אוזלים או מתייקרים מהר.</p>
  <div class="notes">
    <div class="note"><h4>🚄 רכבת Frecciarossa</h4><p>הכרטיסים נפתחים ~4 חודשים מראש. הזמנה מוקדמת = זול משמעותית. שני קטעים: רומא→ורונה (יום 3) וורונה→רומא (יום 10), ~3 שעות כל אחד.</p></div>
    <div class="note"><h4>🏛️ קולוסיאום</h4><p>הזמנה מיידית עם פתיחת המכירה — נמכר מהר מאוד. כרטיס בשעה מוזמן מראש (כולל פורום + פלטינו).</p></div>
    <div class="note"><h4>🚗 רכב שכור</h4><p>להזמין מראש איסוף/החזרה בוורונה. לוודא תיבת הילוכים <b>אוטומט</b> — באירופה ידני הוא ברירת המחדל, אוטומט יקר ונגמר מהר.</p></div>
    <div class="note"><h4>🧗 פארק חבלים Colfosco</h4><p>פתוח בערך יוני–ספטמבר. סוף ספטמבר = קצה העונה — <b>לאמת תאריך סגירה מדויק ל-2026</b> מול אתר אלטה באדיה.</p></div>
    <div class="note"><h4>🧥 מזג אוויר בדולומיטים</h4><p>סוף ספטמבר: ימים 15–20°, לילות קרים, ייתכן שלג בגבהים. שכבות + מעיל חם, במיוחד לרכבל סצ׳דה (2,500 מ׳).</p></div>
    <div class="note"><h4>👶 התאמות לבן 3.5</h4><p>מנוחות צהריים, מגרשי משחק (וילה בורגזה), עגלה לשבילים שטוחים (וואלונגה). שימו לב: Quellenhof בלאזיסה — ייתכן מינימום גיל 4, לאמת!</p></div>
  </div>
</section>

<section id="tickets">
  <h2 class="sec"><span class="ico">🎟️</span> כרטיסים והזמנות</h2>
  <p class="lead">קישורים <b>רשמיים</b> לרכישה (ועוד חלופה מאומתת כמו GetYourGuide/Tiqets/Italo). תמיד עדיף האתר הרשמי. שימו לב לאזהרות — חלק נמכר מהר או דורש הזמנת חלון-זמן.</p>
{ticket_html}
  <div class="disclaim">🎟️ העדיפו את הקישור הרשמי. <b>קולוסיאום</b> ו-<b>רכבות</b> — להזמין מוקדם ככל האפשר. <b>רכבל סצ׳דה</b> — מ-2026 חובה הזמנת חלון-זמן מראש. <b>פארק Colfosco</b> — לאמת תאריך סגירה ל-2026. <b>בראייס</b> — חניה ללא הזמנה אחרי 15/9 (לאמת).</div>
</section>

<section id="weather">
  <h2 class="sec"><span class="ico">🌤️</span> מזג אוויר צפוי וטיפי לבוש</h2>
  <p class="lead">ממוצעים עונתיים טיפוסיים לספטמבר — לא תחזית. בדקו תחזית חיה כשבוע לפני הנסיעה.</p>
  <div class="wgrid">
{weather_html}
  </div>
  <div class="disclaim">🌡️ הערכים הם נורמות אקלים טיפוסיות לסוף ספטמבר, לא תחזית. בדולומיטים מזג האוויר משתנה מהר והגובה קובע — תמיד שכבה חמה בתיק.</div>
</section>

<section id="stay">
  <h2 class="sec"><span class="ico">🏨</span> השוואת לינה לפי יעד</h2>
  <p class="lead">קישורים ממולאים מראש לתאריכים ולתפוסה (2 מבוגרים + 3 ילדים: 13, 9, 3). <b>המחירים אינדיקטיביים</b> ("מ-" של אגרגטורים) — תמיד לאמת בקישור. במחשב אפשר ללחוץ על כותרת עמודה למיון.</p>
  {stay_html}
  <div class="disclaim">ℹ️ כל המחירים ב-<b>€</b> ואינדיקטיביים בלבד (מקור: תקצירי חיפוש, יוני 2026). חדר/דירה ל-5 נפשות עשוי להיות בקצה הגבוה. מס עירוני (~€3–7 לאדם/לילה) לרוב בנפרד.</div>
</section>

<section id="food">
  <h2 class="sec"><span class="ico">🍝</span> מסעדות מומלצות (ידידותיות למשפחות)</h2>
  <p class="lead">מקומות אמיתיים, ותיקים ומדורגים, מתאימים לילדים (פיצה/פסטה/גלידה/בקתות הרים). 📍 לחיצה פותחת ב-Google Maps. מחירים: € זול · €€ בינוני · €€€ יקר. כדאי לאמת כיסא תינוק ולהזמין מראש במקומות הקטנים/בקתות.</p>
{resto_html}
  <div class="disclaim">🍽️ המחירים הם רמות מנחות בלבד. בקתות ההרים (Gostner, Rifugio Firenze) — מומלץ להזמין מראש; Gostner Schwaige היא הקלה ביותר להגעה עם הקטן.</div>
</section>

<section id="budget">
  <h2 class="sec"><span class="ico">💶</span> אומדן תקציב (מנחה)</h2>
  <p class="lead">אומדן לפי "הבחירה שלי" בכל יעד (נכסים שמאשרים 5 נפשות). טווח רחב כי המחירים אינדיקטיביים.</p>
  <div class="tablecard budget">
    <div class="scroll"><table id="budgettable">
      <thead><tr><th class="nosort">רכיב</th><th class="nosort">פרטים</th><th class="nosort">כמות</th><th class="nosort">אומדן (€)</th></tr></thead>
      <tbody>
{brows}
      </tbody>
      <tfoot><tr><td data-label="סה״כ" class="nm">סה״כ אומדן</td><td data-label=""></td><td data-label="">לינה+תחבורה יבשתית</td><td data-label="טווח" class="price">€{sum_lo:,}–{sum_hi:,}</td></tr></tfoot>
    </table></div>
  </div>
  <div class="grandtotal">
    <div class="gt"><div class="lbl">אומדן כולל (מנחה)</div><div class="val">€{sum_lo:,}–{sum_hi:,}</div></div>
    <div class="gt" style="background:linear-gradient(135deg,#b45309,#92400e)"><div class="lbl">לא כלול</div><div class="val" style="font-size:15px;line-height:1.5">טיסות · ארוחות · כרטיסי אטרקציות · דלק · חניות · מס עירוני</div></div>
  </div>
  <div class="disclaim">⚠️ אומדן מנחה רחב בלבד. *באורטיזאי שולב Elvis (דירה במחיר ידוע); Cavallino Bianco מתומחר פנסיון-מלא לאדם — לבדיקה ישירה. הקצה הגבוה משקף תעריפי שיא; הזמנה מוקדמת מורידה משמעותית.</div>
</section>

<section id="car">
  <h2 class="sec"><span class="ico">🚗</span> השכרת רכב — גארדה + דולומיטים</h2>
  <p class="lead">איסוף: ורונה 19/9 · החזרה: ורונה 26/9 (7 ימים) · 5 נוסעים + מטען → SUV גדול / 7 מקומות / מיניוואן · <b>אוטומט מועדף</b>. אומדן: <b>~€550–900</b> לתקופה.</p>
  <div class="tablecard">
    <div class="th"><h3>אפשרויות להשוואה</h3><span class="dates">ורונה · 19–26.09.2026</span></div>
    <div class="scroll"><table id="cartable">
      <thead><tr><th class="nosort">ספק</th><th class="nosort">דגם/קטגוריה</th><th class="nosort">תיבה</th><th class="nosort">מושבים</th><th class="nosort">ביטוח</th><th class="nosort">מחיר (7 ימים)</th><th class="nosort">הזמנה</th></tr></thead>
      <tbody>
{crows}
      </tbody>
    </table></div>
  </div>
  <div class="notes">
    <div class="note"><h4>📍 שני מיקומי איסוף</h4><p><b>שדה התעופה VRN</b>: המבחר הגדול ביותר של 7-מושבים ואוטומט. <b>תחנת Porta Nuova</b>: נוח לרכבת אך מבחר מצומצם. כדאי לבדוק את שניהם.</p></div>
    <div class="note"><h4>⚙️ אוטומט</h4><p>חובה לסנן "Automatic" — ברירת המחדל באיטליה ידני. אוטומט 7-מושבים אוזל מהר לספטמבר — להזמין מוקדם.</p></div>
    <div class="note"><h4>🛡️ ביטוח</h4><p>הביטוח הכלול לרוב עם השתתפות עצמית גבוהה (פיקדון מוקפא). שקלו Full Protection / Full Coverage.</p></div>
    <div class="note"><h4>🚙 דגמי 7-מושבים</h4><p>Ford Galaxy · Peugeot 5008 · Citroën Grand C4 Picasso · VW Touran/Sharan · Opel Zafira. 8–9 מושבים: Citroën Jumper.</p></div>
  </div>
</section>

<section id="checklist">
  <h2 class="sec"><span class="ico">✅</span> צ׳ק-ליסט הזמנות</h2>
  <p class="lead">סימון נשמר אוטומטית בדפדפן שלך (במחשב/נייד שבו פתחת).</p>
  <div class="progtxt" id="progtxt">סמנו פריטים כדי לעקוב אחר ההתקדמות</div>
  <div class="progress"><i id="progbar"></i></div>
  <div class="checklist" id="checklist">
{chk}
  </div>
</section>

<section id="map">
  <h2 class="sec"><span class="ico">🗺️</span> מפה משותפת ל-Google My Maps</h2>
  <p class="lead">קובץ KML מוכן לייבוא + גיבוי CSV. 3 שכבות: לינה (כחול) · אטרקציות (אדום) · תחבורה (אפור).</p>
  <div class="mapbox">
    <div class="sharedmap">
      <h4>🔗 המפה המשותפת ב-Google My Maps</h4>
      <div class="row">
        <input id="mymapsInput" type="url" placeholder="הדביקו כאן את קישור השיתוף מ-My Maps...">
        <button onclick="saveMyMaps()">שמור</button>
        <a id="mymapsOpen" class="btnlink open" target="_blank" rel="noopener">🗺️ פתח את המפה</a>
      </div>
      <small>אחרי שמעלים את trip-map.kml ל-My Maps ולוחצים "שיתוף", מדביקים כאן את הקישור — הוא נשמר במכשיר. (רוצים שיהיה קבוע לכולם? תנו לי את הקישור ואטמיע אותו.)</small>
    </div>
    <div class="filechips">
      <a href="trip-map.kml" download>⬇️ trip-map.kml</a>
      <a href="lodging.csv" download>🔵 lodging.csv</a>
      <a href="attractions.csv" download>🔴 attractions.csv</a>
      <a href="transport.csv" download>⚪ transport.csv</a>
    </div>
    <h4 style="margin:14px 0 0;color:var(--accent2)">הוראות ייבוא ושיתוף</h4>
    <ol>
      <li>היכנסו ל-<a href="https://mymaps.google.com" target="_blank" rel="noopener">mymaps.google.com</a> ולחצו <b>"צור מפה חדשה"</b>.</li>
      <li>לחצו <b>"ייבוא"</b> והעלו את <b>trip-map.kml</b>. אם השכבות לא נשמרות — ייבאו כל CSV בנפרד.</li>
      <li>עצבו צבע פין לפי קטגוריה (כחול/אדום/אפור) ושנו שם שכבה.</li>
      <li>לחצו <b>"שיתוף"</b> → <b>"כל מי שיש לו הקישור — צפייה"</b> → העתיקו ושלחו למשפחה.</li>
    </ol>
    <div style="text-align:center;margin-top:16px">
      <h4 style="color:var(--accent2);margin:0 0 6px">📱 סרקו לפתיחה בנייד</h4>
      <img src="trip-qr.png" alt="QR לדשבורד" style="width:158px;height:158px;border:1px solid var(--line);border-radius:12px;padding:6px;background:#fff">
      <div class="note-sm">סריקה פותחת את הדף הזה בטלפון</div>
    </div>
    <h4 style="margin:16px 0 0;color:var(--accent2)">📍 ניווט מהיר ב-Google Maps (נוח במובייל)</h4>
    <p class="note-sm">לחיצה פותחת את המיקום ב-Google Maps לניווט.</p>
    <div class="qlinks">
{ql}
    </div>
  </div>
</section>

</div>

<footer><div class="wrap">
  תוכנן עבור משפחה בת 5 · 17–27.09.2026 · נתונים נאספו ביוני 2026 — אמתו מחירים וזמינות בקישורים החיים לפני הזמנה.
  <div class="disclaim">⚠️ אף מחיר לא הומצא. המחירים אינדיקטיביים ("מ-" של אגרגטורים); מה שלא נשלף — "לבדיקה בקישור".</div>
</div></footer>

<script>
/* progressive enhancement only — all content above is static and shows without JS */
(function(){{
  try{{
    // day tabs
    var cont=document.getElementById('daypanels');
    if(cont){{
      cont.classList.add('js-tabs');
      var tabs=document.querySelectorAll('#daytabs .dtab');
      function show(d){{
        var panels=document.querySelectorAll('.daypanel');
        for(var i=0;i<panels.length;i++) panels[i].classList.toggle('show', d==='all'||panels[i].id==='day'+d);
        for(var j=0;j<tabs.length;j++) tabs[j].classList.toggle('active', tabs[j].getAttribute('data-day')===String(d));
      }}
      for(var k=0;k<tabs.length;k++){{(function(t){{t.onclick=function(){{show(t.getAttribute('data-day'));}};}})(tabs[k]);}}
      show(1);
    }}
  }}catch(e){{}}

  try{{
    // sortable tables (reorder existing rows; preserves mobile data-labels)
    var tables=document.querySelectorAll('table.sortable');
    for(var t=0;t<tables.length;t++){{(function(tbl){{
      var ths=tbl.tHead.rows[0].cells, body=tbl.tBodies[0];
      for(var c=0;c<ths.length;c++){{(function(idx,th){{
        if(th.className==='nosort') return;
        var asc=true;
        th.onclick=function(){{
          asc=!asc;
          var numeric=th.getAttribute('data-k')==='n';
          var rows=[].slice.call(body.rows);
          rows.sort(function(a,b){{
            var ca=a.cells[idx], cb=b.cells[idx];
            if(numeric){{
              var x=parseFloat(ca.getAttribute('data-sort'))||0, y=parseFloat(cb.getAttribute('data-sort'))||0;
              return asc?x-y:y-x;
            }}
            var sx=(ca.textContent||'').trim(), sy=(cb.textContent||'').trim();
            return asc?sx.localeCompare(sy,'he'):sy.localeCompare(sx,'he');
          }});
          for(var r=0;r<rows.length;r++) body.appendChild(rows[r]);
        }};
      }})(c,ths[c]);}}
    }})(tables[t]);}}
  }}catch(e){{}}

  try{{
    // checklist persistence
    var KEY="trip2026_chk_";
    var items=document.querySelectorAll('#checklist .chk');
    var total=items.length;
    function updProg(){{
      var done=0;
      for(var i=0;i<items.length;i++) if(items[i].querySelector('input').checked) done++;
      var pct=total?Math.round(done/total*100):0;
      var bar=document.getElementById('progbar'); if(bar) bar.style.width=pct+'%';
      var txt=document.getElementById('progtxt'); if(txt) txt.textContent='הושלמו '+done+' מתוך '+total+' ('+pct+'%)';
    }}
    for(var i=0;i<items.length;i++){{(function(row){{
      var id=row.getAttribute('data-id'), cb=row.querySelector('input');
      try{{ if(localStorage.getItem(KEY+id)==='1'){{cb.checked=true;row.classList.add('done');}} }}catch(e){{}}
      cb.onchange=function(){{
        row.classList.toggle('done',cb.checked);
        try{{ localStorage.setItem(KEY+id,cb.checked?'1':'0'); }}catch(e){{}}
        updProg();
      }};
    }})(items[i]);}}
    updProg();
  }}catch(e){{}}

  // copy page link
  window.copyLink=function(){{
    var u='{SITE_URL}';
    if(navigator.clipboard&&navigator.clipboard.writeText){{
      navigator.clipboard.writeText(u).then(function(){{alert('הקישור הועתק! '+u);}},function(){{prompt('העתק את הקישור:',u);}});
    }}else{{prompt('העתק את הקישור:',u);}}
  }};

  // shared My Maps link
  window.saveMyMaps=function(){{
    var inp=document.getElementById('mymapsInput'), open=document.getElementById('mymapsOpen');
    var v=(inp.value||'').trim();
    if(v && !/^https?:\\/\\//i.test(v)){{ alert('הדביקו קישור מלא שמתחיל ב-https://'); return; }}
    try{{ if(v) localStorage.setItem('trip2026_mymaps',v); else localStorage.removeItem('trip2026_mymaps'); }}catch(e){{}}
    if(v){{ open.href=v; open.style.display='inline-block'; }} else {{ open.style.display='none'; }}
  }};
  try{{
    var saved=localStorage.getItem('trip2026_mymaps');
    if(saved){{ var o=document.getElementById('mymapsOpen'),i=document.getElementById('mymapsInput');
      o.href=saved;o.style.display='inline-block';i.value=saved; }}
  }}catch(e){{}}
}})();
</script>
</body>
</html>
'''

with open("index.html","w",encoding="utf-8") as f:
    f.write(HTML)
print("wrote index.html", len(HTML), "chars")
