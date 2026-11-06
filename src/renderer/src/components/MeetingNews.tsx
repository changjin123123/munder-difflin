import { castNames, roleFor, type Meeting, type NewsItem } from '../../../shared/tradingRoom';

function published(item:NewsItem) {
  return new Date(item.publishedAt*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' KST';
}
export function NewsRefs({items,refs}:{items?:NewsItem[];refs?:string[]}) {
  const cited=items?.filter(item=>refs?.includes(item.id));
  if (!cited?.length) return null;
  return <span className="rm-citations">{cited.map(item=><a key={item.id} href={item.url} target="_blank"
    rel="noreferrer" title={item.title} aria-label={item.source+' 기사 '+item.id+' '+item.title}>{item.source} {item.id}</a>)}</span>;
}
export function MeetingNews({meeting:m}:{meeting:Meeting}) {
  const items=m.evidence?.news;
  if (!items) return null;
  const events=m.answers.news?.newsEvents??[];
  return <section className="rm-news" aria-label="뉴스 브리핑과 토론">
    <div className="rm-news-head"><h3>뉴스 브리핑과 토론</h3><small>최근 24시간 · 관련 기사 {items.length}건</small></div>
    {!items.length?<p>종목·시장 관련 기사를 확보하지 못해 이번 회의의 신규 모의 진입을 보류합니다.</p>:
      !events.length?<p>{!m.answers.news && m.state==='active'?'켈리가 기사들을 사건별로 정리하고 있습니다.':'원문 근거가 확인된 뉴스 종합이 없습니다.'}</p>:
      <ul>{events.map(e=><li key={e.newsRefs[0]}>{e.summary} <NewsRefs items={items} refs={e.newsRefs}/></li>)}</ul>}
    {(['bull','bear','reply','manager'] as const).map(step=>{
      const answer=m.answers[step];
      return answer && <div className="rm-news-turn" key={step}><b>{castNames[roleFor(step)]} · {{bull:'강세',bear:'약세',reply:'재반론',manager:'최종 판단'}[step]}</b>
        <span>{answer.line||answer.note} <NewsRefs items={items} refs={answer.newsRefs}/></span></div>;
    })}
    {!!items.length && <details><summary>수집한 기사 원문과 발행 시각</summary>{items.map(item=><article key={item.id}>
      <small>{item.id} · {item.source} · {published(item)} · {item.scope==='asset'?'종목 관련':'시장 전체'} · {item.summary?'RSS 요약':'제목만 제공'}</small>
      <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>{item.summary && <p>{item.summary}</p>}
    </article>)}</details>}
  </section>;
}
