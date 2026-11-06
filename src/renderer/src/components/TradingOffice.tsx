import { useEffect, useRef, useState } from 'react';
import { seats, roleFor, castNames, type Meeting, type Step, type Fill, type Role } from '../../../shared/tradingRoom';
import { TradingOfficeMap } from './TradingOfficeMap';
import { NewsRefs } from './MeetingNews';
import { VerdictCard } from './VerdictCard';
import { SpritePortrait } from './SpritePortrait';
import './tradingOffice.css';

const vote:Record<string,string>={LONG:'매수',SHORT:'숏',HOLD:'관망',VETO:'기각',PASS:'통과'};
const phase=(s:Step)=>['technical','news','sentiment','fundamental'].includes(s)?'시장 분석':
  ['bull','bear','reply','chair'].includes(s)?'강세·약세 토론':s==='trader'?'거래 계획':['growth','neutral','defense'].includes(s)?'리스크 심사':'최종 결정';
const chairFor=(s:Step)=>seats.find(r=>r[0]===roleFor(s))!;

// Earlier meetings contain the original note but no short spoken version.
function excerpt(text:string,limit:number) {
  if (text.length<=limit) return text;
  const prefix=text.slice(0,limit);
  const sentence=prefix.match(/^.*[.!?](?=\s)/u);
  if (sentence) return sentence[0];
  return prefix.slice(0,prefix.lastIndexOf(' ')>limit*.6?prefix.lastIndexOf(' '):limit).trimEnd()+'…';
}

export function TradingOffice({meeting:m,fill}:{meeting?:Meeting|null;fill?:Fill}) {
  // JSON object order is the order in which the office saved each reply.
  const steps=Object.keys(m?.answers??{}) as Step[];
  const live=m?.state==='active';
  const beganLive=useRef(live);
  const [index,setIndex]=useState(live?Math.max(0,steps.length-1):0);
  const [playing,setPlaying]=useState(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [inspected,setInspected]=useState<Role>();
  const step=steps[index];
  const answer=step?m?.answers[step]:undefined;
  const complete=!!m && !live && index>=steps.length;
  const next=index+1<steps.length || (!!step && !live);
  useEffect(()=>{
    if (!playing || !next || !step) return;
    const timer=setTimeout(()=>setIndex(i=>i+1),5300);
    return ()=>clearTimeout(timer);
  },[index,playing,next,step]);
  function seek(i:number) {setInspected(undefined);setPlaying(false);setIndex(i);}
  function replay() {setInspected(undefined);setIndex(0);setPlaying(true);}
  function inspect(role:Role) {
    const last=steps.map(roleFor).lastIndexOf(role);
    if (last>=0) seek(last);else {setInspected(role);setPlaying(false);}
  }
  const selected=inspected??(step?roleFor(step):undefined);
  const speaker=selected?seats.find(s=>s[0]===selected):undefined;
  const visibleAnswer=inspected?undefined:answer;
  const statement=visibleAnswer?.line || (visibleAnswer?excerpt(visibleAnswer.note,122):undefined);
  const activeWorkers=live ? m.speaking : [];
  const status=live?'실시간 회의':complete?'회의 종료':m?(beganLive.current?'회의 발언':'지난 회의 재생'):'회의 대기';
  const context=inspected?'발언 대기':complete?'최종 결정':step?phase(step):'시장 분석';
  return <section className="tf-stage" aria-label="트레이딩 사무실">
    <div className="tf-stage-head"><span className={'tf-status'+(live?' is-live':'')}>{status}</span>
      <strong>{m?((m.venue==='bingx'?'빙엑스':'빗썸')+' · '+m.symbol):'트레이딩 사무실'}</strong>
      <span className="tf-count">{m?Object.keys(m.answers).length+' / 14 발언':'13명 착석'}</span></div>
    <div className="tf-columns">
      <TradingOfficeMap step={inspected?undefined:step} recipient={visibleAnswer?.replyTo}
        line={statement?excerpt(statement,64):undefined} working={activeWorkers} onSelect={inspect}/>
      <aside className="tf-dialogue" aria-label="사무실 대화">
        <div className="tf-context"><span>{context}</span><span>{step && !inspected?String(index+1).padStart(2,'0')+' / '+String(steps.length).padStart(2,'0'):''}</span></div>
        {speaker && !complete && <div className="tf-by"><SpritePortrait character={speaker[2]} scale={1.5}/>
          <div><strong>{castNames[speaker[0]]}</strong><small>{step==='reply' && !inspected?'강세 측 재반론':speaker[1]}</small></div>
          {visibleAnswer && <span className="tf-vote">{vote[visibleAnswer.verdict]}</span>}</div>}
        {visibleAnswer && step && !complete ? <>
          {visibleAnswer.replyTo && <small className="tf-to">{castNames[roleFor(visibleAnswer.replyTo)]}에게 답변</small>}
          <p className="tf-quote" aria-live="polite">{statement}</p>
          <NewsRefs items={m?.evidence?.news} refs={step==='news'?visibleAnswer.newsEvents?.flatMap(e=>e.newsRefs):visibleAnswer.newsRefs}/>
          <details className="tf-full" key={step}><summary>발언 전문</summary><p>{visibleAnswer.note}</p></details>
        </> : complete && !inspected ? null : <p className="tf-wait">{inspected?castNames[inspected]+'의 발언이 아직 없습니다.':
            live?(activeWorkers.length?activeWorkers.map(s=>castNames[roleFor(s)]).join(' · ')+' 의견 작성 중':'공개 시세와 뉴스를 모으고 있습니다.'):'거래소와 종목을 선택해 회의를 시작하세요.'}</p>}
        {m && <VerdictCard meeting={m} fill={fill}/>}
        {live && steps.length>0 && <div className="tf-recent"><h4>앞선 대화</h4>
          {steps.slice(Math.max(0,index-3),index).map(s=>{
            const a=m!.answers[s]!;
            return <button type="button" key={s} onClick={()=>seek(steps.indexOf(s))}><b>{castNames[roleFor(s)]}</b><span>{excerpt(a.line||a.note,47)}</span></button>;
          })}
          {index===0 && <small>첫 번째 발언입니다.</small>}
        </div>}
      </aside>
    </div>
    {steps.length>0 && <div className="tf-transport">
      <div><button type="button" onClick={()=>seek(Math.max(0,index-1))} disabled={index===0}>이전 발언</button>
        <button type="button" className="tf-play" onClick={()=>{
          if(complete){replay();return;}setInspected(undefined);setPlaying(!playing);
        }}>{complete?'처음부터 다시 보기':playing?'일시정지':'이어 보기'}</button>
        <button type="button" onClick={()=>seek(Math.min(index+1,live?steps.length-1:steps.length))} disabled={!next}>다음 발언</button></div>
      <button type="button" onClick={()=>{if(live){seek(steps.length-1);setPlaying(true);}else seek(steps.length);}} disabled={complete && !inspected}>{live?'최신 발언':'최종 결정 보기'}</button>
    </div>}
    {!!steps.length && <div className="tf-sequence" aria-label="발언 순서">{steps.map((s,i)=>
      <button type="button" key={s} aria-pressed={step===s} title={castNames[roleFor(s)]+' · '+chairFor(s)[1]}
        aria-label={(i+1)+'번째 발언 '+castNames[roleFor(s)]} onClick={()=>seek(i)}>
        <span className={i<=index?'is-read':''}/></button>)}</div>}
  </section>;
}
