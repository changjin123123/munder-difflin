import {useState} from 'react';
import {castNames, roleFor, type Fill, type Meeting, type Step} from '../../../shared/tradingRoom';
import {NewsRefs} from './MeetingNews';
import {saveVerdictPng} from './saveVerdictPng';
import './verdictCard.css';

const metrics:Record<string,string>={ema20:'EMA 20',rsi14_simple:'RSI 14',macd:'MACD',macd_signal:'MACD 시그널',bb_low:'볼린저 하단',bb_high:'볼린저 상단'};
const debate=['bull','bear','reply','chair'] as const;
const stages:{label:string;steps:Step[]}[]=[
  {label:'분석',steps:['technical','fundamental','news','sentiment']},
  {label:'토론',steps:['bull','bear','reply','chair']},
  {label:'리스크 심사',steps:['trader','growth','defense','neutral','audit']},
  {label:'최종 판정',steps:['manager']}
];
const fmt=(n:number)=>n.toLocaleString('ko-KR',{maximumSignificantDigits:9});
type SourceLink={title:string;url:string;source:string};
function articles(m:Meeting):SourceLink[] {
  if (m.evidence?.news) return m.evidence.news;
  const result:SourceLink[]=[];
  for(const [source,host] of [['블록미디어','blockmedia.co.kr'],['CoinDesk','coindesk.com']]) {
    const rows=m.evidence?.sources[source];
    if (!Array.isArray(rows)) continue;
    for(const row of rows){
      if (!Array.isArray(row) || typeof row[1]!=='string' || typeof row[2]!=='string') continue;
      try {
        const url=new URL(row[2]);
        if(url.protocol==='https:' && url.hostname.replace(/^www\./,'')===host && !url.username && !url.password) result.push({source,title:row[1],url:url.href});
      } catch { /* Older records can lack a usable publisher link. */ }
    }
  }
  return result;
}

export function VerdictCard({meeting:m,fill}:{meeting:Meeting;fill?:Fill}) {
  const [open,setOpen]=useState<'기술'|'뉴스'|'토론'|'가격'|null>(null);
  const [saving,setSaving]=useState(false), [error,setError]=useState('');
  const final=m.state==='hold'||m.state==='approved';
  const manager=m.answers.manager;
  const trade=m.state==='approved' && fill?.id===m.id?fill:undefined;
  const direction=m.state==='hold'?'HOLD':trade?.side??manager?.verdict??'승인';
  const status=m.state==='approved'?'승인 · 모의 체결':m.state==='hold'?'관망 · 신규 체결 0건':
    m.state==='active'?'판정 대기':m.state==='cancelled'?'회의 취소':'회의 중단';
  const tech=m.evidence?.sources.technical as Record<string,unknown>|undefined;
  const indicators=Object.keys(metrics).filter(k=>typeof tech?.[k]==='number' && Number.isFinite(tech[k]));
  const news=articles(m), speakers=debate.filter(s=>m.answers[s]);
  const confidence=manager?.confidencePct;
  const confidenceLabel=manager?'마이클의 '+manager.verdict+' 확신도 · 자기평가':'매니저 확신도';
  const confidenceText=confidence===undefined?'미기록':confidence+'%';
  const currency=m.venue==='bingx'?'USDT':'KRW';
  const prices=trade?[['모의 진입가',trade.entry],['익절가',trade.take],['손절가',trade.stop]].map(([label,n])=>[String(label),fmt(Number(n))+' '+currency]):[];
  const venueSymbol=(m.venue==='bingx'?'빙엑스':'빗썸')+' · '+m.symbol;
  const statement=manager?.line||manager?.note;
  const time=new Date(m.finishedAt??m.created).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST';
  async function save(){
    setSaving(true);setError('');
    try {await saveVerdictPng({symbol:m.symbol,id:m.id,venueSymbol,time,direction,status,confidence,
      confidenceLabel,reason:m.reason,statement,prices,counts:'기술 지표 '+indicators.length+'개  ·  수집 기사 '+news.length+'건  ·  토론 발언 '+speakers.length+'개'});}
    catch {setError('카드 이미지를 만들지 못했습니다. 다시 시도하세요.');}
    finally {setSaving(false);}
  }
  return <section className="vc-card" aria-label="최종 판정" data-side={final?direction:'pending'}>
    <div className="vc-head"><h3>최종 판정</h3>{final && <button type="button" onClick={()=>void save()} disabled={saving}>{saving?'저장 준비 중':'카드 저장'}</button>}</div>
    {final?<><small>{venueSymbol} · 모의</small>
      <div className="vc-direction"><strong>{direction}</strong><span>{status}</span></div>
      <div className="vc-score"><span>{confidenceLabel}</span><b>{confidenceText}</b></div>
      {confidence!==undefined && <meter aria-label={confidenceLabel} min={0} max={100} value={confidence}>{confidenceText}</meter>}
      <p className="vc-reason">{m.reason}</p>
      {statement && <p className="vc-statement">마이클 · {statement}</p>}
      <NewsRefs items={m.evidence?.news} refs={manager?.newsRefs}/>
      <div className="vc-facts">{(['기술','뉴스','토론'] as const).map((key,i)=>
        <button key={key} type="button" aria-expanded={open===key} onClick={()=>setOpen(open===key?null:key)}>
          {['기술 지표','수집 기사','토론 발언'][i]} <b>{[indicators.length,news.length,speakers.length][i]}</b></button>)}</div>
      {open==='기술' && <div className="vc-detail">{m.answers.technical && <p>{m.answers.technical.note}</p>}
        <dl>{indicators.map(k=><div key={k}><dt>{metrics[k]}</dt><dd>{fmt(tech![k] as number)}</dd></div>)}</dl>
        {!indicators.length && <p>저장된 지표 수치가 없습니다.</p>}</div>}
      {open==='뉴스' && <div className="vc-detail">{m.answers.news && <p>{m.answers.news.note}</p>}
        {news.map(n=><p key={n.url}><a href={n.url} target="_blank" rel="noreferrer">{n.source} · {n.title}</a></p>)}
        {!news.length && <p>수집된 기사가 없습니다.</p>}</div>}
      {open==='토론' && <div className="vc-detail">{speakers.map(s=><p key={s}><b>{castNames[roleFor(s)]}{s==='reply'?' · 재반론':''}</b> {m.answers[s]!.note}</p>)}
        {!speakers.length && <p>저장된 발언이 없습니다.</p>}</div>}
      {trade && <button type="button" className="vc-prices" aria-expanded={open==='가격'} onClick={()=>setOpen(open==='가격'?null:'가격')}>{open==='가격'?'체결 가격 접기':'모의 진입가·익절가·손절가 보기'}</button>}
      {open==='가격' && trade && <dl className="vc-detail">{prices.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      {error && <p role="alert">{error}</p>}
    </>:<><b className="vc-pending">{status}</b><div className="vc-stages">{stages.map(s=><span key={s.label}
      data-state={s.steps.some(k=>m.speaking.includes(k))?'current':s.steps.every(k=>m.answers[k])?'done':'waiting'}>{s.label}</span>)}</div>
      <p className="vc-reason">{m.reason}</p></>}
  </section>;
}
