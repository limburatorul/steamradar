export interface ChangelogEntry {
  version: string
  /** ISO `YYYY-MM-DD`, the day it was released. */
  date: string
  /** Banner headline of the whole x.y release; set on its x.y.0 entry. */
  title?: string
  changes: string[]
}

// Newest first, built into the app so What's new works offline. Add an entry, with its date, with
// every version bump; a new x.y.0 also gets a title for its banner. test/changelog.test.ts checks it.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.9.1',
    date: '2026-10-25',
    changes: [
      'A new icon, brighter and easier to spot in the taskbar, in the tray and at the top of the window.',
      'What’s new now shows a picture for each release, at the top of its notes.'
    ]
  },
  {
    version: '0.9.0',
    date: '2026-10-23',
    title: 'One home, beside our other apps',
    changes: [
      'SteamRadar now installs for everyone on this PC, in Program Files\\ProtagonistLabs\\SteamRadar, next to our other apps. Windows asks for permission when you install and when you update.',
      'Your watch list, price history and settings move by themselves to %APPDATA%\\ProtagonistLabs\\SteamRadar, in one go. Nothing is copied twice and nothing is lost.',
      'The old copy in your user folder goes away with its shortcuts; the new ones are in the Start menu for everyone.',
      'Say no to Windows during an update and SteamRadar keeps watching, and tells you the update was not installed.',
      'New: this window. Every release, month by month, built into the app. It opens once after an update, and any time from the tray menu or Settings.'
    ]
  },
  {
    version: '0.8.0',
    date: '2026-10-20',
    title: 'Knows which games you already own',
    changes: [
      'The deal lists quietly mark the Steam games you already have in Shelf with “In your Shelf”.',
      'Games from Shelf only count while Shelf is installed: a leftover list from an uninstalled Shelf no longer silences alerts.'
    ]
  },
  {
    version: '0.7.3',
    date: '2026-10-18',
    changes: ['The program files now say they come from Protagonist Labs, which keeps a couple of over-eager antivirus checks calm. SteamRadar itself works exactly as before.']
  },
  {
    version: '0.7.2',
    date: '2026-10-17',
    changes: ['The tray menu follows the order all our apps share: actions first, then the counts, then Quit. It follows your Windows light or dark theme.']
  },
  {
    version: '0.7.1',
    date: '2026-10-16',
    changes: [
      'Updates are checked every hour, plus once a few seconds after start.',
      'When a manual check can’t reach GitHub, it says so in one plain sentence instead of an error code.',
      'An update is only installed when it matches the checksum GitHub published for it.'
    ]
  },
  {
    version: '0.7.0',
    date: '2026-10-15',
    title: 'Works with Shelf',
    changes: [
      'Have Shelf? Games already in your library stop sending deal alerts, and your watch list marks them “In your Shelf”.',
      'Shelf can show the games you watch that are on sale right now.',
      'Settings → Works with lists what our other apps add to SteamRadar.'
    ]
  },
  {
    version: '0.6.0',
    date: '2026-10-04',
    title: 'An installer that keeps itself up to date',
    changes: [
      'SteamRadar comes with an installer, with Start menu and desktop shortcuts.',
      'Updates download, check themselves and install in about ten seconds, then SteamRadar starts again.',
      'The portable copy is offered the installer once and brings its history and settings along.'
    ]
  },
  {
    version: '0.5.0',
    date: '2026-10-04',
    title: 'Sharper filters',
    changes: [
      'Filter the deal lists by review score, number of reviews, maximum price and platform, or show games only, without DLC and bundles.',
      'Filters combine, and reset when you switch sections.'
    ]
  },
  {
    version: '0.4.3',
    date: '2026-09-27',
    changes: ['Website links from Settings tell the site they came from SteamRadar.']
  },
  {
    version: '0.4.2',
    date: '2026-09-26',
    changes: ['Send feedback, Website and More apps buttons in Settings → Updates.']
  },
  {
    version: '0.4.1',
    date: '2026-09-14',
    changes: [
      'Adult-only games are hidden by default, using the marker Steam puts on them. Settings → Thresholds → “Show adult games” brings them back.',
      'Epic cards follow the clock: an offer that has ended disappears, and an announced one turns free right on time.'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-08-23',
    title: 'Steam, Epic and GOG',
    changes: [
      'Three sections instead of one: Steam, Epic and GOG, switched from the sidebar. Radar shows all three at once.',
      'Epic’s free games with picture, name and the exact window to claim them, including the ones announced for the coming weeks.',
      'GOG deals sit beside Steam’s, with the same thresholds, price history and watch list.',
      'Alerts say which store a game is from.'
    ]
  },
  {
    version: '0.3.0',
    date: '2026-08-17',
    title: 'Price history',
    changes: [
      'Every game you care about keeps its price history, drawn as steps in the game’s window, with the lowest price ever seen.',
      'A new look, with glass, acrylic and frosted styles over a backdrop made from the best deals.',
      'The Steam button opens the game in the Steam app.'
    ]
  },
  {
    version: '0.2.0',
    date: '2026-08-17',
    changes: [
      'SteamRadar updates itself.',
      'Notifications show SteamRadar’s name.',
      'Everything is in English.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-08-17',
    title: 'The first SteamRadar',
    changes: [
      'Watches every Steam sale and tells you when a game turns free, drops under 5 or under 10.',
      'A watch list that alerts on any price drop, with an optional target price.',
      'Runs quietly in the tray and can start with Windows.'
    ]
  }
]
