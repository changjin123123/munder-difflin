import { useEffect, useState } from 'react';
import { castNames, seats, repeatLimits, repeatMinutes, type Engine, type RoomView, type Step } from '../../../shared/tradingRoom';
import type { Venue } from '../../../shared/treasure';
import { TradingOffice } from './TradingOffice';
import { MeetingNews } from './MeetingNews';
import { MeetingMarket } from './MeetingMarket';
import './tradingRoom.css';
import './tradingTerminal.css';

const labels:Record<string,string>={active:'회의 중',approved:'모의 체결',hold:'관망',error:'중단',cancelled:'취소',LONG:'매수',SHORT:'매도·숏',HOLD:'관망',PASS:'통과',VETO:'기각'};
const cash=(v:number|null,ccy:string)=>v==null?'—':v.toLocaleString('ko-KR',{maximumFractionDigits:ccy==='KRW'?1:4})+' '+ccy;
const clock=(v:number)=>new Date(v).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const venueName=(v:Venue)=>v==='bithumb'?'빗썸':'빙엑스';
const currency=(v:Venue)=>v==='bithumb'?'KRW':'USDT';

export function TradingRoomPanel({initialVenue,initialSymbol}:{initialVenue:Venue;initialSymbol:string}) {
  const [view,setView]=useState<RoomView>();
  const [venue,setVenue]=useState<Venue>(initialVenue);
  const [symbol,setSymbol]=useState(initialSymbol || (initialVenue==='bithumb'?'KRW-BTC':'BTC-USDT'));
  const [scope,setScope]=useState<'market'|'single'>(initialSymbol?'single':'market');
  const [marketLimit,setMarketLimit]=useState(3), [marketWait,setMarketWait]=useState(0);
  const [engine,setEngine]=useState<Engine>();
  const [history,setHistory]=useState('');
  const [busy,setBusy]=useState(false);
  const [minutes,setMinutes]=useState(5), [limit,setLimit]=useState(2);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true; let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try {const v=await window.cth.tradingMeeting('view',history?{id:history}:{}); if(active){setView(v);setEngine(e=>e??v.engines[0]);}}
      catch(e){if(active)setError(String(e));}
      if(active)timer=setTimeout(poll,1800);
    }
    void poll();return ()=>{active=false;clearTimeout(timer);};
  },[history]);
  async function act(action:'marketStart'|'start'|'cancel'|'close'|'autoStart'|'autoStop',args:Record<string,string>={}){
    setBusy(true);setError('');
    try { const next=await window.cth.tradingMeeting(action,args);setHistory('');setView(next); }
    catch(e){setError(String(e).replace(/^.*?Error: /,''));} finally{setBusy(false);}
  }
  const openMeeting=view?.history.some(h=>h.state==='active');
  const session=view?.session;
  const repeating=session?.state==='running' || session?.state==='waiting';
  const isMarket=scope==='market';
  const marketSession=session?.scope==='market'?session:undefined;
  const m=!history && marketSession && marketSession.created>(view?.current?.created??0) ? undefined : view?.current;
  const scan=m?.scan ?? (!history && !m ? marketSession?.scan : undefined);
  const canStart=!!view?.officeReady && !!engine && !openMeeting && !repeating && !busy && (isMarket || !!symbol);
  return <section className="rm-wrap">
    <header><div><h2>트레이딩 사무실</h2></div>
      <select aria-label="회의 기록" value={history} onChange={e=>setHistory(e.target.value)}><option value="">현재 회의</option>{view?.history.map(r=><option key={r.id} value={r.id}>{clock(r.created)} · {r.symbol} · {labels[r.state]}</option>)}</select></header>
    <div className="rm-controls">
      <label>회의 범위<select value={scope} disabled={repeating || openMeeting} onChange={e=>setScope(e.target.value as typeof scope)}>
        <option value="market">양 거래소 전 종목</option><option value="single">종목 직접 지정</option></select></label>
      {isMarket ? <>
        <label>토론할 최대 종목 수<select value={marketLimit} disabled={repeating} onChange={e=>setMarketLimit(Number(e.target.value))}>{[1,...repeatLimits].map(n=><option key={n} value={n}>{n}종목</option>)}</select></label>
        <label>다음 종목 회의<select value={marketWait} disabled={repeating} onChange={e=>setMarketWait(Number(e.target.value))}><option value={0}>종료 직후</option>{repeatMinutes.map(n=><option key={n} value={n}>{n}분 뒤</option>)}</select></label>
      </> : <>
        <label>거래소<select value={venue} onChange={e=>{const v=e.target.value as Venue;setVenue(v);setSymbol(v==='bithumb'?'KRW-BTC':'BTC-USDT');}}><option value="bithumb">빗썸 현물</option><option value="bingx">빙엑스 선물</option></select></label>
        <label>종목<input aria-label="회의 종목" maxLength={40} value={symbol} onChange={e=>setSymbol(e.target.value.trim().toUpperCase())}/></label>
      </>}
      <label>사무실 엔진<select aria-label="회의 엔진" value={engine??''} onChange={e=>setEngine(e.target.value as Engine)}>{!view?.engines.length && <option value="">사용 가능 엔진 없음</option>}{view?.engines.map(p=><option key={p}>{p}</option>)}</select></label>
      {isMarket ? <button className="rm-start" disabled={!canStart} onClick={()=>void act('marketStart',{engine:engine!,limit:String(marketLimit),minutes:String(marketWait)})}>전 종목 회의 시작</button> :
        <button className="rm-start" disabled={!canStart} onClick={()=>void act('start',{venue,symbol,engine:engine!})}>13인 회의 시작</button>}
      {repeating && marketSession && <button disabled={busy} onClick={()=>void act('autoStop')}>전 종목 회의 중지</button>}
      {openMeeting && !repeating && <button disabled={busy} onClick={()=>void act('cancel')}>진행 중인 회의 중지</button>}
    </div>
    <p className="rm-help">{view && !view.officeReady?'회의 작업 폴더를 준비할 수 없습니다. 앱 데이터 폴더의 쓰기 권한을 확인하고 다시 여세요. ':''}{view && !view.engines.length?'로그인한 Claude Code 또는 Codex CLI가 필요합니다. ':''}{isMarket?
      '매 회차 빗썸 현물과 빙엑스 선물의 전체 시세를 다시 비교합니다. 서로 다른 코인을 하나씩 토론하고 승인된 종목만 모의 체결합니다. 최대 '+(marketLimit*14)+'개 엔진 작업.':
      '종목당 13명이 참여하며 재반론을 포함해 엔진 작업 14개를 사용합니다.'}</p>
    {error && <p role="alert" className="rm-alert">{error}</p>}
    {marketSession && (!history || m?.sessionId===marketSession.id) && <section className="rm-market-run" aria-label="전 종목 회의 진행">
      <div role="status"><strong>{marketSession.reason}</strong> · {marketSession.meetings.length}/{marketSession.limit}종목 · 모의 체결 {marketSession.approved} · 관망 {marketSession.held}
        {marketSession.nextAt ? ' · 다음 회의 '+clock(marketSession.nextAt) : ''}</div>
      {marketSession.meetings.map((id,i)=><button key={id} onClick={()=>setHistory(id)}>{i+1}. {view?.history.find(h=>h.id===id)?.symbol??'회의록'}</button>)}
    </section>}
    {scan && <section className="rm-agenda" aria-label="전 종목 비교">
      <h3>전 종목 비교</h3>
      <p>{clock(scan.at)} · {scan.venues.map(v=>venueName(v.venue)+' '+(v.issue?'조회 실패':v.listed+'개 조회 · 유효 '+v.eligible+'개')).join(' / ')}</p>
      <p>거래소별 거래대금 순위 60%와 등락폭 순위 40%를 반영합니다. 두 거래소를 번갈아 살피고, 최근 회의에서 다루지 않은 코인을 우선합니다.</p>
      <ol>{scan.candidates.map((c,i)=><li key={c.symbol}><strong>{i===0?'이번 안건':'비교 후보'} · {venueName(c.venue)} {c.symbol}</strong> <span>등락 {c.change.toLocaleString('ko-KR',{maximumFractionDigits:2})}% · 거래대금 {c.turnoverRank}위 · 등락폭 {c.moveRank}위</span></li>)}</ol>
      <small>등락 기준은 빗썸 전일 종가 대비, 빙엑스 24시간 대비입니다.</small>
    </section>}
    {m && <MeetingMarket meeting={m}/>}
    <TradingOffice key={m?.id??'empty'} meeting={m} fill={view?.currentFill??view?.trades.find(t=>t.id===m?.id)}/>
    {m && <MeetingNews meeting={m}/>}
    {m?.method==='tradingagents-office-v1' && m.proposal && <section className="rm-review" aria-label="거래 계획과 심사">
      <h3>필리스의 거래 계획과 3인 심사</h3>
      <p>{m.proposal.side==='HOLD'?'필리스가 신규 진입을 보류했습니다.':
        labels[m.proposal.side]+' · 제안 시점 예상 진입 '+cash(m.proposal.entry,currency(m.venue))+' · 손절 '+cash(m.proposal.stop,currency(m.venue))+' · 익절 '+cash(m.proposal.take,currency(m.venue))}</p>
      {(['growth','defense','neutral','audit','manager'] as const).map(step=>{
        const a=m.answers[step];
        return a && <p key={step}><b>{castNames[step]} · {seats.find(s=>s[0]===step)![1]} · {labels[a.verdict]}</b> {a.line||a.note}</p>;
      })}
    </section>}
    {(!isMarket || (repeating && !marketSession)) && <section className="rm-auto" aria-label="자동 모의 테스트">
      <h3>자동 모의 테스트</h3>
      <div className="rm-controls">
        <label>회의 종료 후 대기<select value={minutes} disabled={repeating} onChange={e=>setMinutes(Number(e.target.value))}>{repeatMinutes.map(n=><option value={n} key={n}>{n}분</option>)}</select></label>
        <label>총 회의 횟수<select value={limit} disabled={repeating} onChange={e=>setLimit(Number(e.target.value))}>{repeatLimits.map(n=><option value={n} key={n}>{n}회</option>)}</select></label>
        {repeating?<button disabled={busy} onClick={()=>void act('autoStop')}>자동 반복 중지</button>:
          <button className="rm-start" disabled={!canStart} onClick={()=>void act('autoStart',{venue,symbol,engine:engine!,minutes:String(minutes),limit:String(limit)})}>자동 모의 시작</button>}
      </div>
      <p className="rm-help">{repeating?session.symbol+' · '+session.engine+' · '+session.minutes+'분 간격':
        '첫 회의는 바로 시작하고, 이후에는 새 시세로 회의를 엽니다. 최대 '+(limit*14)+'개 엔진 작업을 사용합니다.'} 앱을 닫으면 반복이 중지됩니다.</p>
      {session?.venue && <div className="rm-auto-result" role="status"><b>{session.state==='done'?'자동 테스트 완료':session.reason}</b>
        <span>{venueName(session.venue)} {session.symbol} · 회의 {session.meetings.length}/{session.limit}회 · 관망 {session.held} · 모의 체결 {session.approved}</span>
        {session.nextAt && <span>다음 회의 {new Date(session.nextAt).toLocaleTimeString('ko-KR')}</span>}
        <div>{session.meetings.map((id,i)=><button key={id} onClick={()=>setHistory(id)}>{i+1}회차 회의록</button>)}</div>
      </div>}
    </section>}
    {m?.evidence && <details><summary>회의에서 사용한 시세와 자료</summary>
      <p>{clock(m.evidence.captured*1000)} · {venueName(m.venue)} 매수 1호가 {cash(m.evidence.quote.bid,currency(m.venue))} · 매도 1호가 {cash(m.evidence.quote.ask,currency(m.venue))}</p>
      <p>출처는 거래소 15분 확정봉, CoinGecko 프로젝트 지표, Alternative.me 비트코인 심리지수, 블록미디어와 CoinDesk입니다. 누락된 자료 {m.evidence.missing.join(', ') || '없음'}</p>
      {['블록미디어','CoinDesk'].map(source=><div key={source}>{((m.evidence!.sources[source]??[]) as [number,string,string][]).map(([stamp,title,url])=>
        <p key={url}><small>{source} · {clock(stamp*1000)}</small> <a href={url} target="_blank" rel="noreferrer">{title}</a></p>)}</div>)}
    </details>}
    {m && <details><summary>전체 분석 보고서 · 응답 {Object.keys(m.answers).length}/14</summary>
      {(Object.keys(m.answers) as Step[]).map(s=><p key={s}><b>{s==='reply'?'강세 재반론':seats.find(r=>r[0]===s)?.[1]}</b> · {labels[m.answers[s]!.verdict]} · {m.answers[s]!.note}
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
