# Istoric versiuni

Formatul urmează [Keep a Changelog](https://keepachangelog.com/ro/1.1.0/),
versionarea e [SemVer](https://semver.org/lang/ro/).

## [0.4.0] — 2026-08-23

### Adăugat

- **Trei secțiuni în loc de una: Steam, Epic și GOG**, comutate din bara
  laterală. Radar-ul le arată pe toate trei deodată; paginile de praguri sunt
  ale magazinului ales.
- **Jocurile gratuite de pe Epic**, cu poză, nume și fereastra exactă în care pot
  fi luate — și cele revendicabile acum, și cele anunțate pentru săptămânile
  următoare. Trei anunțuri separate, fiecare pornit sau oprit din Settings: a
  devenit revendicabil, s-a anunțat ce urmează, mai e o zi până expiră.
- **Reducerile de pe GOG**, în același catalog cu cele de pe Steam: aceleași
  praguri, același istoric de preț, aceeași listă de urmărire. Plus verificarea
  giveaway-ului lor la fiecare scanare rapidă.

### Schimbat

- Notificările de prag spun acum din ce magazin vine jocul.
- Butonul din dreapta rândului deschide clientul Steam doar pentru jocurile de pe
  Steam; pentru GOG și Epic deschide pagina din magazin.
- Bara de progres numără cererile din toată scanarea, nu doar pe cele de la
  Steam. O măturare completă înseamnă acum ~53 de cereri, în jur de un minut.

### Note despre surse

- **Reducerile Epic nu se pot citi.** GraphQL-ul magazinului răspunde 403 cu
  provocare Cloudflare și pe POST, și pe GET. Doar hostul static cu jocurile
  gratuite e liber, iar ocolirea provocării ar fi evitare de detecție de boți.
- **GOG ignoră `countryCode` când alege moneda** — fără `currencyCode` explicit,
  RO primește prețuri în USD, iar amestecate cu cele în EUR de la Steam ar strica
  pragurile. Moneda se deduce din țară, iar `npm run probe` verifică potrivirea.
- O măturare GOG întreruptă la mijloc nu se salvează parțial: se păstrează
  fotografia precedentă. Un catalog GOG incomplet ar face scanarea următoare să
  creadă că tot ce lipsește tocmai a intrat la reducere.

## [0.3.0] — 2026-08-17

### Adăugat

- **Istoric de preț per joc, salvat local**, cu grafic în fereastra jocului
  (clic pe nume, pe capsulă sau pe butonul ▤). Graficul e desenat în **trepte**,
  nu cu linii oblice: un preț nu urcă lin de la 20 la 40 într-o săptămână, stă la
  20 până în clipa în care sare. Arată prețul de listă cu linie întreruptă,
  minimul văzut vreodată și fiecare schimbare.
  - Se ține doar pentru jocurile care au ajuns măcar o dată într-un prag sau
    sunt urmărite. Pentru toate cele ~5900 de oferte ar însemna sute de mii de
    puncte pe zi la jocuri la care nu se uită nimeni.
  - Punctele se scriu doar când prețul chiar se schimbă. Un joc care iese din
    reducere primește un punct la prețul de listă, altfel graficul ar arăta
    reducerea ca și cum ar ține la nesfârșit.
- **Tema vizuală din Game Browser**, portată întreagă: paleta, cele trei stiluri
  de sticlă (glass / acrylic / frosted) cu aceeași rețetă de patru variabile,
  granulația fină pe suprafețele mari, barele de derulare și fundalul rotativ —
  construit aici din capsulele celor mai bine cotate oferte, ca sticla să aibă ce
  estompa.
- **Verificare periodică de versiune**, la 45 de minute implicit, configurabilă.
  Aplicația stă zile în tray, deci o verificare doar la pornire ar însemna să
  afli de o versiune nouă abia la următoarea repornire a calculatorului.

### Schimbat

- Butonul **Steam** din listă deschide jocul în **clientul Steam**
  (`steam://store/<appid>`), nu pagina din browser. Pentru pachete și bundle-uri,
  care n-au appid, cade pe pagina web. Comportamentul se poate inversa din
  Settings, iar fereastra jocului are oricum ambele butoane.

## [0.2.0] — 2026-08-17

### Adăugat

- **Auto-actualizare** pentru varianta portabilă, după tiparul din Game Browser:
  verificare la pornire (tăcută dacă nu e nimic nou) și buton în Settings,
  descărcarea `.exe`-ului nou în `PORTABLE_EXECUTABLE_DIR`, verificarea mărimii
  față de ce anunță GitHub, pornire detașată și ștergerea versiunilor vechi la
  următoarea pornire, cu reîncercări la 5 și 20 de secunde.
- **Notificările apar sub numele aplicației**, nu „electron.app.Electron".
  Windows ia numele din scurtătura de Start Menu a cărei AppUserModelID se
  potrivește cu cea declarată de proces, deci aplicația își scrie singură
  scurtătura la prima pornire. Settings arată dacă a reușit.

### Schimbat

- Interfața, notificările și meniul din tray sunt în engleză.

## [0.1.0] — 2026-08-17

Prima versiune.

### Adăugat

- Scanarea tuturor jocurilor la reducere de pe Steam prin
  `IStoreQueryService/Query`, câte 500 pe cerere: ~5900 de jocuri în 12 cereri și
  30 de secunde.
- Verificare separată a jocurilor devenite gratis, printr-o singură cerere la
  căutarea veche (`maxprice=free&specials=1`), rulată mult mai des.
- Trei praguri de alertă — gratis, sub 5 și sub 10 — cu praguri configurabile.
  Alerta se dă doar când un joc coboară într-un prag mai bun decât cel în care
  era, deci nu se repetă cât timp stă la reducere.
- Notificări Windows, grupate implicit (o notificare pe prag) sau individuale.
  Jocurile devenite gratis primesc notificare proprie în ambele moduri.
- Listă de urmărire care alertează la orice scădere de preț, nu doar la trecerea
  unui prag, cu preț țintă opțional per joc.
- Interfață cu radar, listele celor trei praguri, top reduceri, istoric de alerte
  și setări; filtre după reducere, scor recenzii și nume.
- Rulare în tray, cu pornire la boot și pornire minimizată, opționale.
- `npm run probe` pentru verificarea surselor pe viu și `scripts/scan-once.mjs`
  pentru o scanare fără interfață.

### Măsurat, nu presupus

- Endpointul vechi de căutare limitează la ~20 de cereri, cu completare de
  ~0,4/s; peste asta răspunde 429 și își revine în 15–30 de secunde. Ambele surse
  trec prin același mecanism de reîncercare.
- Fără `sort` explicit, interogarea nouă nu e repetabilă: două cereri identice
  n-au niciun element comun, iar paginarea pierdea 1112 jocuri din 5858.
  `sort: 1` (alfabetic) aduce exact câte declară `total_matching_records`.
- `sort_by=Discount_DESC` la căutarea veche e acceptat, dar ignorat — magazinul
  nu mai are sortare după reducere. Topul reducerilor se calculează local.
- `min_discount_percent: 100` nu filtrează jocurile gratis, ci întoarce tot
  magazinul (240.000 de rezultate); de aceea pragul „gratis" rămâne pe căutarea
  veche.
