# Istoric versiuni

Formatul urmează [Keep a Changelog](https://keepachangelog.com/ro/1.1.0/),
versionarea e [SemVer](https://semver.org/lang/ro/).

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
