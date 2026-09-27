# SteamRadar

**Download and details:** [protagonistlabs.app/steamradar](https://protagonistlabs.app/steamradar/)

An Electron app that watches the discounts on **Steam** and **GOG** and the free
games on **Epic**, and tells you when a game drops into a price tier.
The tier that matters most is **free**: games put at -100%, the ones you keep in
your library for good if you catch the promotion. The next tiers are **under 5**
and **under 10** (euros by default).

The interface has three sections, switched from the sidebar. Steam and GOG run on
the same mechanism (catalogue, tiers, price history, watchlist) because both give
prices. Epic has no prices to read (see below), so its section shows only the
games given away: the ones you can claim now and the ones announced for the
coming weeks, with picture, name and exact dates.

It runs in the tray, checks on its own in the background, and uses native Windows
notifications. The interface is in English; the comments in the code are in Romanian.

## How it gets the data: Steam

Steam has no official discounts API. The app uses two sources, each for what it
does well, both without a key and without anti-bot measures:

1. **`IStoreQueryService/Query`**: the query the new store uses. It answers
   anonymously, gives **500 items per request** and brings the price in cents, the
   percentage, the review score, the release date and the date the discount ends.
   Every game on sale (~5,900 without DLC) fits in **12 requests, ~30 seconds**.
2. **`search/results` with `maxprice=free&specials=1`**: a single request that
   returns exactly the games put at -100%. It runs far more often than the full
   sweep, because that is where finding out late costs the most.

Four things measured live, not assumed:

- **Without an explicit `sort`, the new query is not repeatable.** Two identical
  requests have no element in common, and paging lost **1,112 games out of 5,858**.
  `sort: 1` (alphabetical) brings exactly as many as `total_matching_records` declares.
- **The old endpoint limits you to ~20 requests**, refilling at ~0.4/s (token
  bucket), then answers 429 and recovers in 15–30 seconds. Measured: at 350 ms it
  fails after 30 requests, at 1000 ms after 52. Both sources go through the same
  retry mechanism.
- **`sort_by=Discount_DESC` is accepted, but ignored**: the store no longer sorts
  by discount, and returns -70%, -85%, -25% mixed together. The top discounts are
  computed locally.
- **`min_discount_percent: 100` does not filter the free games**; it returns the
  whole store (240,000 results). That is why the "free" tier stayed on the old
  search, which does it exactly.

The query always runs with `l=english`, so the review pattern is the same whatever
the country; the price still comes in the local currency, because the currency
follows `cc`, not the language.

## How it gets the data: GOG

A single source: `catalog.gog.com/v1/catalog`, the catalogue their own store
uses. It answers anonymously, in JSON, with the price already formatted and the
percentage. The offers go into the **same catalogue** as the Steam ones and pass
through the same tiers, the same price history and the same watchlist; they
differ by the `store` field and by the key prefix (`Gog_`).

Four things measured live:

- **GOG ignores `countryCode` when it picks the currency.** Without an explicit
  `currencyCode`, RO gets prices in **USD**, although Steam gives EUR for the same
  country. Since both stores end up in the same catalogue, two mixed currencies
  would break both the tiers and the alerts. So the currency is derived from the
  country, with a short table in `src/main/gog.ts`, and `npm run probe` checks
  explicitly that Steam and GOG answer in the same currency.
- **The maximum is 100 items per request**: at 200 it answers 400. Everything on
  sale (~3,700 with bundles) fits in **38 requests**.
- **Paging is repeatable with `order=desc:title`**: the same page requested twice
  returned the same 100 games (unlike Steam without a sort).
- **The default cover is a 1.4 MB PNG.** With the formatter
  `_product_tile_extended_432x243.webp` it drops to **30 KB**, at the same width as
  the row in the list.

The GOG giveaway (`giveaway/api/getGiveawayDetails`) is checked at every quick
scan, but answers 404 almost all the time: GOG gives a game away a few times a
year, not weekly. 404 means "none right now", not an error.

## How it gets the data: Epic

**Epic's discounts cannot be read.** The store's GraphQL
(`store.epicgames.com/graphql`) answers **403 with a Cloudflare challenge** on both
POST and GET, with normal browser headers. There is no way around it that is not
bot-detection evasion, and a source kept alive with tricks would break at their
first change. That is why the Epic section has free games only.

Their source, `store-site-backend-static.ak.epicgames.com/freeGamesPromotions`, is
on the static Akamai host, outside Cloudflare: a single anonymous request, ~1
second, and it returns at once both what is free now and what Epic has announced
for the coming weeks, with the exact start and end dates.

Two things measured:

- **The list also contains promotions that are not free.** The same request
  brought offers announced at -20%, -25%, -40% and -50%. The only sign that a game
  really is free is `discountPercentage === 0`: how much is left to pay of the list
  price, not the discount. Without that filter, the section would announce as
  "free" games that cost money.
- **The list price comes in Epic's currency for the country** (RON for RO), not in
  that of the Steam/GOG catalogue. It is not mixed in anywhere, because Epic has no
  price tier: it is only the "normally RON 116.99" text on the card.

## Alerts

On the first start the app only builds its reference: it has nothing to compare
with, so it notifies nothing. From the second scan on, a game raises an alert only
when it **drops** into a better tier than the one it was in, not for as long as it
stays there.

Windows does not show an endless queue of notifications: when many arrive at once,
it drops the ones at the back. One scan brings dozens of games under 5, and during
the big sales a few hundred. So the default mode is **grouped** (one notification
per tier, with the count and the first names) and there is **individual** in the
settings. Games that became free get their own notification in both modes.

The watchlist is the only place that also alerts on drops that reach no tier: you
star a game at 40 and find out when it gets to 24. Optionally with a target price.

GOG discounts pass through the same tiers as the Steam ones; in Settings you can
switch off only their notification, not the tracking. Epic has three separate
announcements, each switched on or off in Settings: **a game became claimable**,
**Epic announced what is next** and **one day left before it expires**.
Each goes out once per game, and on the first check the app only builds its
reference; otherwise, on the first start you would get at once the games announced
for a month from now as well. The expiry reminder goes out whether or not you have
already claimed the game: that can be seen only in your Epic account, which the
app neither asks for nor touches.

## Price history

Every game that reaches a tier, or that you watch, gets a chart of its price over
time, in the window that opens when you click its name. The chart is **stepped**,
because that is how a price really moves: it stays, then it jumps. A slanted line
between two points would draw prices that never existed.

What is not kept: the history of all ~5,900 offers. That would mean hundreds of
thousands of points a day for games nobody looks at. A game that came in once
stays tracked, so the whole cycle can be seen (discount, return to list price,
better discount), and it gets a point only when the price really changes.

## The theme

Ported from Game Browser, with the same recipe: the palette, the three glass
styles and the grain. The blur is a **scale**, not a replacement, and what really
separates acrylic from a thicker blur is the jump in saturation plus the grain;
without noise it just looks like a bigger blur. Verified through the control, not
by setting the attribute by hand: glass `blur(16px) saturate(1.2)` without grain,
acrylic `blur(33.6px) saturate(2) brightness(1.05)` with it, frosted
`blur(48px) saturate(1.1) brightness(1.16)` with it.

The rotating background is built from the capsules of the best-rated offers. It is
not decoration: without it the glass has nothing to blur and all three styles look
the same.

## The name in notifications

Windows does not take the name from the window title, nor from `productName`. The
toast shows the name of the Start Menu shortcut whose AppUserModelID matches the
one the process declares; without it, it says "electron.app.Electron" or does not
appear at all. So the app writes itself a Start Menu shortcut on first start
(`src/main/shortcut.ts`), targeting the real portable `.exe`, not the copy in
`%TEMP%`. In development there is nothing to target, so there the name stays
Electron's; Settings says so explicitly.

## Auto-update

On the portable build only, following the pattern proven in Game Browser: it
checks `https://api.github.com/repos/limburatorul/steamradar/releases/latest` 8
seconds after start (silently if there is nothing new), downloads the `.exe` into
`PORTABLE_EXECUTABLE_DIR`, checks the size against the one GitHub announces,
starts the new process detached and closes the current one. Deleting the old
versions is done by the next start, with retries at 5 and 20 seconds, because the
replaced process may still hold a lock on its file.

Two traps already paid for in Game Browser, not to be rediscovered:
`process.execPath` points to the temporary copy in `%TEMP%`, not to the real exe;
and the sweep deletes **any** exe with a lower version in the same folder,
including test builds kept there on purpose.

The source of the versions is https://github.com/limburatorul/steamradar: every
release carries `SteamRadar-<version>-portabil.exe`. Besides the check at start,
it checks again every 45 minutes (configurable), because the app sits in the tray
for days.

## Running it

```bash
npm install
npm run dev
```

Other commands:

- `npm run typecheck`: checks the types in both projects (main and interface)
- `npm run probe`: hits all three stores live and shows whether the endpoints and
  the parsers still work, including whether Steam and GOG answer in the same
  currency. Run it first when the app stops finding anything: the source breaks
  more often than the code.
- `npm run dist`: builds `release/SteamRadar-<ver>-portabil.exe`
- `node scripts/make-icons.mjs`: regenerates the icons (drawn from code)

## Where the data lives

In the portable build, in `SteamRadar-Date/` next to the executable, so the app
can be moved to a USB stick together with its history. Otherwise in
`%APPDATA%/steamradar`.

- `config.json`: tiers, intervals, notifications, appearance
- `history.json`: the price over time for the games that reached the tiers
- `catalog.json`: the offers right now, Steam and GOG together; it is also the
  snapshot everything is compared against
- `epic.json`: the free games on Epic and which announcements have already gone out
- `events.json`: the history of entries into the tiers (the last 3,000)
- `watchlist.json`: the games you watch
