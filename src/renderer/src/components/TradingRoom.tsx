import { useEffect, useState } from 'react';
import { seats, rounds, type Engine, type RoomView, type Step } from '../../../shared/tradingRoom';
import type { Venue } from '../../../shared/treasure';
import { SpritePortrait } from './SpritePortrait';
import './tradingRoom.css';

const labels:Record<string,string>={active:'회의 중',approved:'모의 체결',hold:'관망',error:'중단',cancelled:'취소',LONG:'매수',SHORT:'매도·숏',HOLD:'관망',PASS:'통과',VETO:'기각'};
const cash=(v:number|null,ccy:string)=>v==null?'—':v.toLocaleString('ko-KR',{maximumFractionDigits:ccy==='KRW'?1:4})+' '+ccy;
const clock=(v:number)=>new Date(v).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const venueName=(v:Venue)=>v==='bithumb'?'빗썸':'빙엑스';
const currency=(v:Venue)=>v==='bithumb'?'KRW':'USDT';

export function TradingRoomPanel({initialVenue,initialSymbol}:{initialVenue:Venue;initialSymbol:string}) {
  const [view,setView]=useState<RoomView>();
  const [venue,setVenue]=useState<Venue>(initialVenue);
  const [symbol,setSymbol]=useState(initialSymbol);
  const [engine,setEngine]=useState<Engine>();
  const [history,setHistory]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<Step>('technical');
  useEffect(()=>{
    let active=true; let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try {const v=await window.cth.tradingMeeting('view',history?{id:history}:{}); if(active){setView(v);setEngine(e=>e??v.engines[0]);}}
      catch(e){if(active)setError(String(e));}
      if(active)timer=setTimeout(poll,1800);
    }
    void poll();return ()=>{active=false;clearTimeout(timer);};
  },[history]);
  async function act(action:'start'|'cancel'|'close',args:Record<string,string>={}){
    setBusy(true);setError('');
    try { const next=await window.cth.tradingMeeting(action,args);setHistory('');setView(next); }
    catch(e){setError(String(e).replace(/^.*?Error: /,''));} finally{setBusy(false);}
  }
  const m=view?.current;
  const report=m?.answers[selected];
  const tech=m?.evidence?.sources.technical as {closes?: number[]}|null;
  const closes=tech?.closes??[], low=Math.min(...closes), high=Math.max(...closes);
  const groups=[seats.slice(0,4),seats.slice(4,7),seats.slice(7,10),seats.slice(10)];
  const openMeeting=view?.history.some(h=>h.state==='active');
  const activeSeat=seats.find(s=>s[0]===(selected==='reply'?'bull':selected));
  return <section className="rm-wrap">
    <header><div><h2>트레이딩 회의실</h2><p>공개 자료 분석부터 최종 모의 체결까지</p></div>
      <select aria-label="회의 기록" value={history} onChange={e=>setHistory(e.target.value)}><option value="">현재 회의</option>{view?.history.map(r=><option key={r.id} value={r.id}>{clock(r.created)} · {r.symbol} · {labels[r.state]}</option>)}</select></header>
    <div className="rm-controls">
      <label>거래소<select value={venue} onChange={e=>{const v=e.target.value as Venue;setVenue(v);setSymbol(v==='bithumb'?'KRW-BTC':'BTC-USDT');}}><option value="bithumb">빗썸 현물</option><option value="bingx">빙엑스 선물</option></select></label>
      <label>종목<input aria-label="회의 종목" maxLength={40} value={symbol} onChange={e=>setSymbol(e.target.value.trim().toUpperCase())}/></label>
      <label>사무실 엔진<select aria-label="회의 엔진" value={engine??''} onChange={e=>setEngine(e.target.value as Engine)}>{!view?.engines.length && <option value="">사용 가능 엔진 없음</option>}{view?.engines.map(p=><option key={p}>{p}</option>)}</select></label>
      <button className="rm-start" disabled={!view?.officeReady || !engine || !!openMeeting || busy || !symbol} onClick={()=>void act('start',{venue,symbol,engine:engine!})}>13인 회의 시작</button>
      {openMeeting && <button disabled={busy} onClick={()=>void act('cancel')}>진행 중인 회의 중지</button>}
    </div>
    <p className="rm-help">{view && !view.officeReady?'사무실 탭에서 작업공간 설정을 마치세요. ':''}{view && !view.engines.length?'로그인한 Claude Code 또는 Codex CLI가 필요합니다. ':''}회의 1회에 13개 역할이 엔진을 사용합니다. 강세 측 재반론을 포함해 총 14개 작업입니다.</p>
    {error && <p role="alert" className="rm-alert">{error}</p>}
    <div className="rm-paper"><strong>{m ? venueName(m.venue)+' · '+m.symbol : '회의 대기'}</strong><span>{m ? labels[m.state]+' · '+m.reason : '거래소와 종목을 선택해 회의를 시작하세요.'}</span></div>
    {closes.length>1 && <div className="rm-chart"><div>15분 확정봉 · 종가 <small>{clock(m!.evidence!.captured*1000)} 수집</small></div>
      <svg viewBox="0 0 300 45" role="img" aria-label="최근 32개 확정봉 종가 추이"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={closes.map((p,i)=>i*300/(closes.length-1)+','+(42-39*(p-low)/(high-low||1))).join(' ')}/></svg></div>}
    <div className="rm-floor">{groups.map((g,i)=><section key={i}><h3>{['분석팀','강세·약세 토론','리스크 위원회','계획·검증·승인'][i]}</h3>
      {g.map(([key,name,character])=>{
        const speaking=m?.speaking.includes(key) || (key==='bull' && m?.speaking.includes('reply'));
        const ans=key==='bull'?(m?.answers.reply??m?.answers.bull):m?.answers[key];
        return <button key={key} className={'rm-seat '+(speaking?'rm-active':'')} aria-pressed={activeSeat?.[0]===key} onClick={()=>setSelected(key==='bull'&&m?.answers.reply?'reply':key)}>
          <SpritePortrait character={character} scale={1.3}/><span><b>{name}</b><small>{speaking?'요청·응답 대기':ans?labels[ans.verdict]:'대기'}</small></span></button>;
      })}</section>)}</div>
    <div className="rm-note"><h3>{activeSeat?.[1]}{selected==='reply'?' · 재반론':''}</h3><p>{report ? (labels[report.verdict]+' · '+report.note) : '이 역할의 회의 기록이 아직 없습니다.'}</p></div>
    {m?.evidence && <details><summary>회의에서 사용한 시세와 자료</summary>
      <p>{clock(m.evidence.captured*1000)} · {venueName(m.venue)} 매수 1호가 {cash(m.evidence.quote.bid,currency(m.venue))} · 매도 1호가 {cash(m.evidence.quote.ask,currency(m.venue))}</p>
      <p>출처는 거래소 15분 확정봉, CoinGecko 프로젝트 지표, Alternative.me 비트코인 심리지수와 아래 뉴스입니다. 누락된 자료 {m.evidence.missing.join(', ') || '없음'}</p>
      {['블록미디어','CoinDesk'].map(source=><div key={source}>{((m.evidence!.sources[source]??[]) as [number,string,string][]).map(([stamp,title,url])=>
        <p key={url}><small>{source} · {clock(stamp*1000)}</small> <a href={url} target="_blank" rel="noreferrer">{title}</a></p>)}</div>)}
    </details>}
    {m && <details><summary>전체 분석 보고서 · 응답 {Object.keys(m.answers).length}/14</summary>
      {rounds.flat().filter(s=>m.answers[s]).map(s=><p key={s}><b>{s==='reply'?'강세 재반론':seats.find(r=>r[0]===s)?.[1]}</b> · {labels[m.answers[s]!.verdict]} · {m.answers[s]!.note}
        {s==='trader' && m.answers[s]?.stopPct!=null && <small> · 손절 {m.answers[s]!.stopPct}% / 익절 {m.answers[s]!.takePct}%</small>}</p>)}
    </details>}
    <section className="rm-ledger"><h3>회의 전용 모의 장부</h3><p>1배 단일 진입 · 편도 수수료 빗썸 0.25%, 빙엑스 0.05% · 슬리피지 0.03%. 펀딩비 미반영. 앱 실행 중 관측한 호가로 익절·손절합니다.</p>
      <div className="rm-bal">{view?.totals.map(v=><article key={v.venue}><b>{venueName(v.venue)}</b> 가용 {cash(v.cash,currency(v.venue))} · 실현손익 {cash(v.pnl,currency(v.venue))} · 보유 {v.open}건</article>)}</div>
      {view?.priceNotice && <p>{view.priceNotice}</p>}
      {!view?.trades.length && <p>최종 승인된 모의 체결이 아직 없습니다.</p>}
      {view?.trades.map(t=><article className="rm-trade" key={t.id}><b>{t.symbol} · {labels[t.side]}</b> <span>진입 {cash(t.entry,currency(t.venue))} · 손절 {cash(t.stop,currency(t.venue))} · 익절 {cash(t.take,currency(t.venue))}</span>
        {t.closed ? <span>{t.reason} · {cash(t.pnl,currency(t.venue))}</span> : <button disabled={busy} onClick={()=>void act('close',{id:t.id})}>모의 포지션 종료</button>}</article>)}
    </section>
  </section>;
}
