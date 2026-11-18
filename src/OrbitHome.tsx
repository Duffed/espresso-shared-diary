export function OrbitHome({ shots, beans, onBrew, onHistory, onBeans }: {
 shots: number; beans: number; onBrew: () => void; onHistory: () => void; onBeans: () => void
}) {
 return <section className="home-screen orbit-home retro-desktop">
  <header className="retro-window retro-welcome"><div className="retro-title"><span>▣ Espresso Diary — Willkommen</span><span aria-hidden="true">▰</span></div><div className="retro-window-body"><span className="eyebrow">PERSONAL BREWING SYSTEM / 98</span><h1>Guter Kaffee.<br/>Alte Schule.</h1><p>Dein Raum ist hochgefahren. Zeit für einen neuen Bezug.</p><button className="orbit-launch" aria-label="Neuer Bezug" onClick={onBrew}><span className="retro-cup" aria-hidden="true">☕</span><span><strong>Neuer Bezug</strong><small>Assistent starten →</small></span></button><div className="retro-tip">☞ Tipp des Tages: Erst mahlen. Dann die Welt retten.</div></div><div className="retro-status"><span>● System bereit</span><span>5 Schritte zum Espresso</span></div></header>
  <aside className="retro-window retro-explorer"><div className="retro-title"><span>▣ Arbeitsplatz</span></div><div className="retro-desktop-icons"><button onClick={onHistory}><span aria-hidden="true">▤</span><strong>Bezugsarchiv</strong><small>{shots.toLocaleString('de-DE')} Einträge</small></button><button onClick={onBeans}><span aria-hidden="true">▰</span><strong>Bohnenordner</strong><small>{beans} Sorten</small></button></div><div className="retro-memory"><span>SPEICHER: VOLLER GESCHMACK</span><div aria-hidden="true">▮▮▮▮▮▮▮▮▮▮▮▮▮▮</div><small>Keine Diskette erforderlich.</small></div></aside>
  <div className="section-heading"><h2>▤ Zuletzt geöffnet</h2>{shots > 0 && <button className="quiet" onClick={onHistory}>Alle ansehen →</button>}</div>
 </section>
}
