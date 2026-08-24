import type { ScriptDocument } from "../../domain/contracts/script";

export function ScriptView({ script }: { script?: ScriptDocument }) {
  if (!script) return <><div className="section-kicker">04 / SCRIPT</div><h2 className="page-title">劇本會在<br/><em>內容管線之後出現。</em></h2><p className="muted">尚未產生結構化劇本。</p></>;
  const seconds = script.episodes.reduce((total, episode) => total + episode.scenes.reduce((sceneTotal, scene) => sceneTotal + scene.flow.reduce((flowTotal, beat) => flowTotal + beat.durationSec, 0), 0), 0);
  return <><div className="section-kicker">04 / SCRIPT</div><h2 className="page-title">動作與台詞，<br/><em>各自落在節拍上。</em></h2><div className="score"><strong>{Math.round(seconds)}s</strong><span>ESTIMATED<br/><b>EPISODE FLOW</b></span></div>{script.episodes.map((episode) => <section className="output-card" key={episode.id}><h3>{episode.title} <small>{episode.id}</small></h3>{episode.scenes.map((scene) => <div key={scene.id}><p><b>{scene.id}</b></p>{scene.flow.map((beat, index) => <p key={`${scene.id}-${index}`}>{"action" in beat ? `動作：${beat.action}` : `台詞：${beat.speaker}｜${beat.line}｜${beat.delivery}`} <small>{beat.durationSec}s</small></p>)}</div>)}</section>)}</>;
}
