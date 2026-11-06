import { citesNews, newsDebaters, type Answer, type Meeting, type NewsItem, type Step } from '../shared/tradingRoom';

const publishers:Record<string,string> = {'블록미디어':'blockmedia.co.kr', CoinDesk:'coindesk.com'};
function fresh(item:NewsItem, now:number) {
  return Number.isFinite(item.publishedAt) && item.publishedAt<=now && now-item.publishedAt<=86400;
}
export function collectNews(raw:NewsItem[]|undefined, now:number):NewsItem[] {
  const seenIds=new Set<string>(), seenUrls=new Set<string>();
  if (!Array.isArray(raw)) return [];
  return raw.filter(item=>{
    if (!item || !/^N[1-9]\d?$/.test(item.id) || !fresh(item,now) ||
        !Object.hasOwn(publishers,item.source) || typeof item.title!=='string' || !item.title.trim() ||
        typeof item.summary!=='string' || !['asset','market'].includes(item.scope)) return false;
    try {
      const u=new URL(item.url);
      if (u.protocol!=='https:' || u.username || u.password || u.port ||
          u.hostname.replace(/^www\./,'')!==publishers[item.source] || seenIds.has(item.id) || seenUrls.has(u.href)) return false;
      seenIds.add(item.id); seenUrls.add(u.href); return true;
    } catch {return false;}
  }).slice(0,12);
}

function references(raw:unknown, allowed:Set<string>):string[] {
  if (!Array.isArray(raw) || !raw.every(ref=>typeof ref==='string' && allowed.has(ref))) return [];
  return [...new Set(raw)] as string[];
}
export function recordNews(step:Step, raw:Record<string,unknown>, answer:Answer, items:NewsItem[]) {
  const allowed=new Set(items.map(item=>item.id));
  if (citesNews(step)) answer.newsRefs=references(raw.newsRefs,allowed);
  if (step!=='news') return;
  answer.newsEvents=[];
  const grouped=new Set<string>();
  for (const event of Array.isArray(raw.newsEvents)?raw.newsEvents:[]) {
    if (!event || typeof event.summary!=='string' || !event.summary.trim() || event.summary.length>400) continue;
    const refs=references(event.newsRefs,allowed).filter(ref=>!grouped.has(ref));
    if (!refs.length) continue;
    refs.forEach(ref=>grouped.add(ref));
    answer.newsEvents.push({summary:event.summary.trim(),newsRefs:refs});
    if (answer.newsEvents.length===5) break;
  }
}
export function newsHoldReason(m:Meeting):string|undefined {
  const valid=new Set((m.evidence?.news??[]).filter(item=>fresh(item,Date.now()/1000)).map(item=>item.id));
  if (!valid.size) return '최근 24시간 종목·시장 뉴스가 없어 모의 진입을 보류했습니다.';
  const events=(m.answers.news?.newsEvents??[]).filter(e=>e.newsRefs.every(id=>valid.has(id)));
  if (!events.length) return '기사 출처를 확인할 수 있는 뉴스 종합이 없어 관망합니다.';
  const discussed=new Set(events.flatMap(e=>e.newsRefs));
  for (const step of newsDebaters) {
    const refs=m.answers[step]?.newsRefs;
    if (!refs?.length || !refs.every(id=>discussed.has(id))) return '토론·최종 심사에서 인용한 뉴스 근거가 충분하지 않아 관망합니다.';
  }
}

export function newsInstruction(step:Step):string {
  if (step==='news') return 'news 배열만 사용해 핵심 사건 최대 5건을 newsEvents 배열로 작성한다. 각 원소는 {summary: 한국어 사건 요약, newsRefs: 해당 기사 ID 배열}. 같은 사건 보도는 묶고 독립 증거로 세지 않는다. 시간·직접 관련성·서로 다른 보도 내용을 구분한다. summary가 빈 기사는 제목까지만 해석한다. 관련 근거가 없으면 빈 배열.';
  if (!citesNews(step)) return '';
  const instruction=step==='bull'?'켈리의 사건에서 가장 강한 상승 근거와 그 해석이 틀릴 조건을 제시한다.':
    step==='bear'?'앤디가 채택한 사건의 해석을 직접 반박하고 하락 근거나 관망할 이유를 설명한다.':
    step==='reply'?'드와이트의 뉴스 해석에 동의하거나 재반박할 대목을 명시한다.':
    step==='audit'?'양측의 주장이 원보도 범위에 맞는지, 중복 보도를 과대평가했는지 점검한다.':
    '찬반이 갈린 사건을 비교해 어떤 근거를 채택하거나 배제했고 최종 방향에 어떻게 반영했는지 설명한다.';
  return instruction+' note와 line에는 구체적인 사건을 짚는다. 켈리가 newsEvents로 정리한 사건에서 이 발언에 실제로 사용한 기사 ID를 newsRefs 배열로 반환한다. 확정적 근거가 없어 관망하는 경우에도 검토한 기사는 표시한다. 자료가 없으면 빈 배열.';
}
