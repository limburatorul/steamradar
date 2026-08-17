import { useEffect, useState } from 'react'
import type { AppConfig } from '@shared/types'

/** Tarile pentru care Steam da preturi in euro; codul decide moneda, nu limba. */
const COUNTRIES: Array<[string, string]> = [
  ['RO', 'România (EUR)'],
  ['DE', 'Germania (EUR)'],
  ['FR', 'Franța (EUR)'],
  ['PL', 'Polonia (PLN)'],
  ['UK', 'Marea Britanie (GBP)'],
  ['US', 'Statele Unite (USD)']
]

interface Props {
  config: AppConfig
  onChange: (patch: Partial<AppConfig>) => void
}

export default function SettingsView({ config, onChange }: Props): React.JSX.Element {
  const [folder, setFolder] = useState('')
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.config.dataFolder().then(setFolder)
    void window.api.version().then(setVersion)
  }, [])

  return (
    <>
      <div className="toolbar">
        <h1>Setări</h1>
        <span className="sub">SteamRadar {version}</span>
      </div>

      <div className="content">
        <div className="settings">
          <div className="card">
            <h2>Praguri</h2>
            <p className="hint">
              Sub cât să considere aplicația că un joc merită o alertă. Gratis e mereu primul prag
              și nu se poate opri din praguri, doar din notificări.
            </p>
            <div className="row">
              <label className="k">Pragul de jos</label>
              <input
                type="number"
                min={1}
                max={100}
                value={config.thresholdLow}
                onChange={(e) => onChange({ thresholdLow: Number(e.target.value) })}
              />
              <span className="note">implicit 5</span>
            </div>
            <div className="row">
              <label className="k">Pragul de sus</label>
              <input
                type="number"
                min={1}
                max={200}
                value={config.thresholdHigh}
                onChange={(e) => onChange({ thresholdHigh: Number(e.target.value) })}
              />
              <span className="note">implicit 10</span>
            </div>
            <div className="row">
              <label className="k">Reducere minimă</label>
              <input
                type="number"
                min={0}
                max={99}
                value={config.minDiscountPct}
                onChange={(e) => onChange({ minDiscountPct: Number(e.target.value) })}
              />
              <span className="note">% — ignoră ofertele mai slabe de atât</span>
            </div>
            <div className="row">
              <label className="k">Include și DLC-uri</label>
              <input
                type="checkbox"
                checked={config.includeDlc}
                onChange={(e) => onChange({ includeDlc: e.target.checked })}
              />
              <span className="note">
                DLC-urile la reducere sunt de două ori mai multe decât jocurile
              </span>
            </div>
          </div>

          <div className="card">
            <h2>Notificări</h2>
            <p className="hint">
              Windows nu afișează o coadă nesfârșită de notificări — când vin multe deodată le
              aruncă pe cele din spate. De aceea modul grupat trimite una singură pe prag, cu
              numărul și primele nume. Jocurile devenite gratis primesc oricum notificare proprie.
            </p>
            <div className="row">
              <label className="k">Anunță-mă la</label>
              <div className="pill-row">
                <button
                  className={`pill${config.notify.free ? ' on' : ''}`}
                  onClick={() => onChange({ notify: { ...config.notify, free: !config.notify.free } })}
                >
                  Gratis
                </button>
                <button
                  className={`pill${config.notify.under5 ? ' on' : ''}`}
                  onClick={() =>
                    onChange({ notify: { ...config.notify, under5: !config.notify.under5 } })
                  }
                >
                  Sub {config.thresholdLow}
                </button>
                <button
                  className={`pill${config.notify.under10 ? ' on' : ''}`}
                  onClick={() =>
                    onChange({ notify: { ...config.notify, under10: !config.notify.under10 } })
                  }
                >
                  Sub {config.thresholdHigh}
                </button>
              </div>
            </div>
            <div className="row">
              <label className="k">Mod</label>
              <select
                value={config.notifyMode}
                onChange={(e) =>
                  onChange({ notifyMode: e.target.value as AppConfig['notifyMode'] })
                }
              >
                <option value="grouped">Grupat — una pe prag</option>
                <option value="individual">Individual — una pe joc</option>
              </select>
            </div>
            <div className="row">
              <label className="k">Sunet</label>
              <input
                type="checkbox"
                checked={config.notifySound}
                onChange={(e) => onChange({ notifySound: e.target.checked })}
              />
            </div>
          </div>

          <div className="card">
            <h2>Scanare</h2>
            <p className="hint">
              Scanarea completă parcurge toate jocurile la reducere, câte 500 la fiecare cerere —
              în jur de 13 cereri și 30 de secunde. Verificarea jocurilor devenite gratis costă o
              singură cerere, deci poate rula mult mai des. Steam răspunde 429 peste vreo 20 de
              cereri într-o rafală, dar aplicația așteaptă și reia singură.
            </p>
            <div className="row">
              <label className="k">Verific jocurile gratis la</label>
              <input
                type="number"
                min={2}
                max={240}
                value={config.freeIntervalMin}
                onChange={(e) => onChange({ freeIntervalMin: Number(e.target.value) })}
              />
              <span className="note">minute</span>
            </div>
            <div className="row">
              <label className="k">Scanare completă la</label>
              <input
                type="number"
                min={15}
                max={1440}
                value={config.fullIntervalMin}
                onChange={(e) => onChange({ fullIntervalMin: Number(e.target.value) })}
              />
              <span className="note">minute</span>
            </div>
            <div className="row">
              <label className="k">Pauză între cereri</label>
              <input
                type="number"
                min={300}
                max={5000}
                step={100}
                value={config.requestDelayMs}
                onChange={(e) => onChange({ requestDelayMs: Number(e.target.value) })}
              />
              <span className="note">ms — sub 800 crește șansa de 429</span>
            </div>
            <div className="row">
              <label className="k">Maxim pagini</label>
              <input
                type="number"
                min={5}
                max={100}
                value={config.maxPages}
                onChange={(e) => onChange({ maxPages: Number(e.target.value) })}
              />
              <span className="note">a câte 500 de jocuri; 40 e de trei ori mai mult decât trebuie</span>
            </div>
            <div className="row">
              <label className="k">Țara pentru prețuri</label>
              <select
                value={config.countryCode}
                onChange={(e) => onChange({ countryCode: e.target.value })}
              >
                {COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <h2>Pornire</h2>
            <div className="row">
              <label className="k">Pornește cu Windows</label>
              <input
                type="checkbox"
                checked={config.autoStart}
                onChange={(e) => onChange({ autoStart: e.target.checked })}
              />
            </div>
            <div className="row">
              <label className="k">Pornește minimizat în tray</label>
              <input
                type="checkbox"
                checked={config.startMinimized}
                onChange={(e) => onChange({ startMinimized: e.target.checked })}
              />
            </div>
            <div className="row">
              <label className="k">Închiderea ferestrei o ascunde</label>
              <input
                type="checkbox"
                checked={config.closeToTray}
                onChange={(e) => onChange({ closeToTray: e.target.checked })}
              />
              <span className="note">
                debifat, închiderea ferestrei oprește și supravegherea
              </span>
            </div>
          </div>

          <div className="card">
            <h2>Date</h2>
            <p className="hint">
              Catalogul, istoricul și lista de urmărire stau în <code>{folder}</code>.
            </p>
            <button onClick={() => void window.api.config.openDataFolder()}>
              Deschide folderul
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
