# SteamRadar

Aplicație Electron care urmărește reducerile de pe Steam și te anunță când un joc
intră într-un prag de preț. Pragul care contează cel mai mult e **gratis** — jocurile
puse la -100%, adică cele pe care le adaugi definitiv în bibliotecă dacă prinzi
promoția. Următoarele praguri sunt **sub 5** și **sub 10** (implicit euro).

Rulează în tray, verifică singură în fundal, notificări Windows native.
Interfața e în engleză; comentariile din cod și notele astea rămân în română.

## Cum ia datele

Steam nu are un API oficial de reduceri. Aplicația folosește două surse, fiecare
pentru ce știe să facă, ambele fără cheie și fără anti-bot:

1. **`IStoreQueryService/Query`** — interogarea pe care o folosește magazinul nou.
   Răspunde anonim, dă **500 de itemi pe cerere** și aduce direct preț în cenți,
   procent, scor recenzii, dată de lansare și data la care expiră reducerea. Toate
   jocurile la reducere (~5900 fără DLC) încap în **12 cereri, ~30 de secunde**.
2. **`search/results` cu `maxprice=free&specials=1`** — o singură cerere care
   întoarce exact jocurile puse la -100%. Rulează mult mai des decât măturarea
   completă, fiindcă acolo se pierde cel mai mult dacă afli târziu.

Patru lucruri măsurate pe viu, nu presupuse:

- **Fără `sort` explicit, interogarea nouă nu e repetabilă.** Două cereri identice
  n-au niciun element comun, iar paginarea pierdea **1112 jocuri din 5858**.
  `sort: 1` (alfabetic) aduce exact câte declară `total_matching_records`.
- **Endpointul vechi limitează la ~20 de cereri**, cu completare de ~0,4/s (token
  bucket), apoi răspunde 429 și își revine în 15–30 de secunde. Măsurat: la 350 ms
  cade după 30 de cereri, la 1000 ms după 52. Ambele surse trec prin același
  mecanism de reîncercare.
- **`sort_by=Discount_DESC` e acceptat, dar ignorat** — magazinul nu mai are
  sortare după reducere; întoarce -70%, -85%, -25% amestecat. Topul reducerilor se
  calculează local.
- **`min_discount_percent: 100` nu filtrează jocurile gratis**, ci întoarce tot
  magazinul (240.000 de rezultate). De aceea pragul „gratis" a rămas pe căutarea
  veche, care îl face exact.

Interogarea se face mereu cu `l=english`, ca tiparul recenziilor să fie același
indiferent de țară; prețul vine tot în moneda locală, fiindcă de monedă răspunde
`cc`, nu limba.

## Alertele

La prima pornire aplicația doar construiește referința — n-are cu ce compara, deci
nu notifică nimic. De la a doua scanare încolo, un joc generează alertă doar când
**coboară** într-un prag mai bun decât cel în care era, nu cât timp stă acolo.

Windows nu afișează o coadă nesfârșită de notificări: când vin multe deodată, le
aruncă pe cele din spate. Într-o scanare intră zeci de jocuri sub 5, iar în timpul
soldurilor mari câteva sute. De aceea modul implicit e **grupat** — o notificare pe
prag, cu numărul și primele nume — și există **individual** în setări. Jocurile
devenite gratis primesc notificare proprie în ambele moduri.

Lista de urmărire e singurul loc care alertează și la scăderi care nu ating niciun
prag: pui steaua pe un joc de 40 și afli când ajunge la 24. Opțional cu preț țintă.

## Istoricul de preț

Fiecare joc care ajunge într-un prag — sau pe care îl urmărești — capătă un
grafic al evoluției prețului, în fereastra care se deschide la clic pe nume.
Graficul e în **trepte**, fiindcă un preț chiar așa se mișcă: stă, apoi sare.
O linie oblică între două puncte ar desena prețuri care n-au existat.

Ce nu se ține: istoricul tuturor celor ~5900 de oferte. Ar însemna sute de mii
de puncte pe zi pentru jocuri la care nu se uită nimeni. Un joc intrat o dată
rămâne urmărit, ca să se vadă ciclul întreg — reducere, revenire la prețul de
listă, reducere mai bună — și primește un punct doar când prețul chiar se
schimbă.

## Tema

Portată din Game Browser, cu aceeași rețetă: paleta, cele trei stiluri de
sticlă și granulația. Blur-ul e o **scală**, nu o înlocuire, iar ce separă de
fapt acrylic-ul de un blur mai gros e saltul de saturație plus granulația — fără
zgomot arată doar ca un blur mai mare. Verificat prin control, nu setând
atributul de mână: glass `blur(16px) saturate(1.2)` fără granulație, acrylic
`blur(33.6px) saturate(2) brightness(1.05)` cu, frosted
`blur(48px) saturate(1.1) brightness(1.16)` cu.

Fundalul rotativ e construit din capsulele celor mai bine cotate oferte. Nu e
decorativ: fără el, sticla n-are ce estompa și toate trei stilurile arată la fel.

## Numele din notificări

Windows nu ia numele din titlul ferestrei și nici din `productName`. Toast-ul
afișează numele scurtăturii din Start Menu a cărei AppUserModelID se potrivește
cu cea declarată de proces — fără ea scrie „electron.app.Electron" sau nu apare
deloc. De aceea aplicația își scrie singură o scurtătură în Start Menu la prima
pornire (`src/main/shortcut.ts`), țintind `.exe`-ul portabil real, nu copia din
`%TEMP%`. În dezvoltare nu are ce ținti, deci acolo numele rămâne cel al
Electron-ului; Settings spune asta explicit.

## Auto-actualizare

Doar pe varianta portabilă, după tiparul rodat în Game Browser: verifică
`https://api.github.com/repos/limburatorul/steamradar/releases/latest` la 8
secunde după pornire (tăcut dacă nu e nimic nou), descarcă `.exe`-ul în
`PORTABLE_EXECUTABLE_DIR`, verifică mărimea față de cea anunțată de GitHub,
pornește noul proces detașat și închide procesul curent. Ștergerea versiunilor
vechi o face pornirea următoare, cu reîncercări la 5 și 20 de secunde, fiindcă
procesul înlocuit poate ține încă lock pe fișierul lui.

Două capcane deja plătite în Game Browser, nu le redescoperi:
`process.execPath` arată spre copia temporară din `%TEMP%`, nu spre exe-ul real;
și maturarea șterge **orice** exe cu versiune mai mică din același folder,
inclusiv build-uri de test ținute intenționat acolo.

Sursa versiunilor e https://github.com/limburatorul/steamradar — fiecare release
poartă `SteamRadar-<versiune>-portabil.exe`. Pe lângă verificarea de la pornire,
reverifică din 45 în 45 de minute (configurabil), fiindcă aplicația stă zile
întregi în tray.

## Rulare

```bash
npm install
npm run dev
```

Alte comenzi:

- `npm run typecheck` — verifică tipurile pe ambele proiecte (main și interfață)
- `npm run probe` — lovește Steam pe viu și arată dacă endpointul și parserul mai
  merg. De rulat primul când aplicația nu mai găsește nimic: sursa se strică mai
  des decât codul.
- `npm run dist` — construiește `release/SteamRadar-<ver>-portabil.exe`
- `node scripts/make-icons.mjs` — regenerează iconițele (desenate din cod)

## Unde stau datele

În varianta portabilă, în `SteamRadar-Date/` lângă executabil, ca aplicația să
poată fi mutată pe stick cu tot cu istoric. Altfel în `%APPDATA%/steamradar`.

- `config.json` — praguri, intervale, notificări, aspect
- `history.json` — evoluția prețului pentru jocurile ajunse în praguri
- `catalog.json` — ofertele de acum; e și fotografia față de care se compară
- `events.json` — istoricul intrărilor în praguri (ultimele 3000)
- `watchlist.json` — jocurile urmărite
