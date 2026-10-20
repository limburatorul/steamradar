# SteamRadar 0.8.0 — 20.10.2026

Planul de integrări din 20.10, punctul 6 (SteamRadar ↔ Shelf), partea SteamRadar.
În paralel, Shelf 3.65 ascunde din lista lui de reduceri jocurile deținute,
potrivește doar pe `appid` întreg și ignoră un `steamradar.watch.json` mai vechi
de 48 h — de aici punctul 5.

## Ce

1. **Shelf contează doar când e instalat.** `readShelf(root)` (în `src/main/diff.ts`)
   citește întâi `apps\shelf.json`: trebuie `schema: 1`, `id: "shelf"` și un `exe`
   local care există. Abia apoi citește `data\shelf.games.json`.
2. **Cititor bănuitor.** `readShared(file)` înlocuiește `readCommon` și servește atât
   cardurile („Works with”), cât și jocurile din Shelf: fișier peste 16 MB = absent
   (verificat cu `stat`, înainte de citire), BOM eliminat, JSON invalid sau
   `schema` ≠ 1 = absent. `shelfIndex(json, now)` mai cere `updated` ISO cu vârsta
   validă (vezi mai jos), sare peste jocurile fără nume text, cu nume de peste 500 de
   caractere, iar `steamAppId` contează doar ca întreg pozitiv.
   `updated` trebuie să fie o dată validă, cel mult o zi în viitor; vechimea nu
   contează (o primă variantă cu limită de 7 zile a fost scoasă: Shelf scrie
   fișierul doar la pornire și la salvarea bibliotecii, deci cine nu deschide
   Shelf o săptămână ar fi primit brusc alerte pentru jocuri deținute).
3. **Căi ostile.** `localExe(p)` acceptă doar `X:\…\*.exe` (sau `X:/…`). O cale UNC,
   `\\?\`, `\\.\` sau relativă e refuzată înainte de `existsSync`: altfel un card
   scris de oricine ar face Windows să contacteze un server SMB doar ca să răspundă
   dacă fișierul există. Aceeași verificare se aplică acum și în „Works with”
   (`readSisters`), care avea același `existsSync` pe orice cale.
4. **„In your Shelf” în listele de oferte.** `DealRow` primește `inShelf`; Radar,
   pragurile Steam și GOG, Top discounts și Alert history îl calculează din
   appid-urile Steam ale Shelf (IPC nou `ecosystem:shelf-appids`, recitit la fiecare
   schimbare de ecran și după fiecare scanare). Jocurile rămân în listă; eticheta e
   aceeași `event-time` discretă din lista de urmărire, care trece și ea prin prop.
   În liste potrivesc doar pe appid (nu pe nume), ca „Doom” 2016 să nu marcheze „DOOM” 1993.
5. **`steamradar.watch.json` pentru Shelf 3.65.** `appid` trece prin `shareAppid`:
   doar întreg pozitiv, altfel câmpul lipsește (nu mai poate ajunge text sau 0 dintr-un
   `watchlist.json` editat). Fișierul se rescrie, cu `updated` proaspăt, la pornire,
   după fiecare scanare completă, la fiecare schimbare a listei și acum și la fiecare
   12 h (`WATCH_SHARE_EVERY_MS`), fără rețea — deci și când scanările eșuează offline.

## De ce

- Un `shelf.games.json` rămas după dezinstalarea Shelf oprea alerte pentru totdeauna.
- Shelf 3.65 ascunde ofertele după 48 h fără rescriere; înainte, fișierul se
  rescria doar după scanări complete reușite (offline = niciuna).
- Fișierele din `%APPDATA%\ProtagonistLabs` pot fi scrise de orice proces al
  utilizatorului; o cale UNC în `exe` era un mod de a provoca trafic de rețea.

## Cum am testat

Doar teste unitare (`npm test`, `node --test`): SteamRadar pornește scanări de
magazin la start, deci o rulare izolată ar fi ieșit pe rețea, iar redirecționarea
`APPDATA` nu mută `appData` la Electron pe Windows. N-am pornit aplicația deloc;
copia utilizatorului n-a fost atinsă.

Teste noi în `test/logic.test.ts`:
- `shelfIndex`: 1 h, 60 de zile vechime și +23 h în viitor acceptate; +4,5 zile
  în viitor, `updated` text invalid, număr, lipsă, `schema: 2` → nimic deținut;
  appid text / fracționar / negativ, nume număr, nume de 501 caractere, intrare
  string → sărite fără excepții.
- `localExe`: 2 căi locale acceptate; UNC, `//server`, `\\?\`, `\\.\pipe`,
  `\\?\UNC\…`, relativ, `C:Shelf.exe`, `.txt`, număr, null → refuzate.
- `readShelf` pe fișiere sintetice într-un folder temporar: fără card → nimic;
  card valid → appid găsit; fișier cu BOM → citit; exe lipsă, exe UNC
  (`\\127.0.0.1\c$\…`), `id` greșit, `schema: 2`, card JSON stricat → nimic;
  fișier de jocuri gol, `null`, `[]`, `games: "x"`, trunchiat, peste 16 MB → nimic.
- `shareAppid`: 1145360 rămâne număr după `JSON.stringify`; `'1145360'`, null,
  undefined, 0, −5, 1,5, NaN, `{}` → câmp absent; 3 × intervalul de rescriere < 48 h.

## Rezultate

- `npm test`: 11/11 trec (7 vechi, 4 noi), ~220 ms în total; testul pe disc ~43 ms,
  inclusiv fișierul de 16 MB refuzat la `stat`.
- `npm run typecheck`: curat. `npm run build`: curat (renderer 301 kB).

## Netestat

- Temporizatorul de 12 h din `index.ts` n-a rulat (aplicația n-a fost pornită);
  testat doar intervalul și funcția pe care o apelează (aceeași ca la pornire).
- UI-ul n-a fost pornit: eticheta din listele de oferte e verificată doar prin
  typecheck și build, fără captură de ecran.
- Cu un Shelf real instalat (card + `shelf.games.json` scrise de Shelf 3.65).
- Notificările suprimă și după nume (joc Shelf fără appid), dar eticheta din liste
  doar după appid; un astfel de joc nu sună, dar nici nu e marcat în liste. Ales așa
  ca să nu apară etichete false.
