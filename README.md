# SteamRadar

Aplicație Electron care urmărește reducerile de pe Steam și te anunță când un joc
intră într-un prag de preț. Pragul care contează cel mai mult e **gratis** — jocurile
puse la -100%, adică cele pe care le adaugi definitiv în bibliotecă dacă prinzi
promoția. Următoarele praguri sunt **sub 5** și **sub 10** (implicit euro).

Rulează în tray, verifică singură în fundal, notificări Windows native.
Interfața e în engleză; comentariile din cod și notele astea rămân în română.

## Cum ia datele

Steam nu are un API oficial de reduceri, dar căutarea din magazin răspunde în JSON
dacă i-o ceri: `store.steampowered.com/search/results/?json=1`. Fără cheie, fără
anti-bot. Un câmp `total_count` și un câmp `results_html` cu rândurile randate, din
care se citesc appid, preț final în cenți, procent de reducere, scor recenzii și
dată de lansare.

Trei lucruri verificate pe viu, nu presupuse:

- **`sort_by=Discount_DESC` e acceptat, dar ignorat.** Magazinul nu mai are sortare
  după reducere; cererea întoarce rezultate amestecate (-70%, -85%, -25%). De aceea
  topul reducerilor se calculează local, nu se cere de la Steam.
- **`sort_by=Price_ASC` e reală și stabilă peste pagini.** Tot ce e sub un prag e
  un prefix continuu al listei, deci pragurile ies dintr-o singură parcurgere.
- **`maxprice=free&specials=1` întoarce exact jocurile devenite gratis.** O singură
  cerere, deci alerta cea mai importantă poate rula la câteva minute, în timp ce
  scanarea completă (~105 cereri, câte 100 de oferte pe pagină) merge o dată pe oră.

Interogarea se face mereu cu `l=english`, ca tiparul recenziilor să fie același
indiferent de țară; prețul vine tot în moneda locală, fiindcă de monedă răspunde
`cc`, nu limba. Etichetele se traduc la afișare.

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

Ca să funcționeze, are nevoie de un repo GitHub `limburatorul/steamradar` cu un
release care poartă `SteamRadar-<versiune>-portabil.exe`.

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

- `config.json` — praguri, intervale, notificări
- `catalog.json` — ofertele de acum; e și fotografia față de care se compară
- `events.json` — istoricul intrărilor în praguri (ultimele 3000)
- `watchlist.json` — jocurile urmărite
