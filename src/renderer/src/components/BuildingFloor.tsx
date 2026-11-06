import { useState } from 'react';
import { floorCount, teamsPerFloor, teamCount, teamLabel, teamTarget, type RoomView, type Engine } from '../../../shared/tradingRoom';
import './buildingFloor.css';

type Command='buildingPrepare'|'buildingStart'|'buildingStop';
const venueNames={bithumb:'빗썸',bingx:'빙엑스'};
const states={active:'회의 중',approved:'모의 체결',hold:'관망',cancelled:'중지',error:'오류'};
export function BuildingFloor({view,team,select,report,engine,busy,blocked,act}:{
  view?:RoomView;team:number;select:(n:number)=>void;report:(id:string)=>void;engine?:Engine;
  busy:boolean;blocked:boolean;act:(action:Command,args?:Record<string,string>)=>void;
}) {
  const [parallel,setParallel]=useState(2),[limit,setLimit]=useState(1);
  const run=view?.building, teams=run?.teams??[];
  const working=run?.state==='running' || run?.state==='scanning';
  const floor=Math.ceil(team/teamsPerFloor), desk=teams[team-1];
  const perTeam=working?run.perTeam:limit;
  const max=teams.reduce((n,t)=>n+teamTarget(t,perTeam),0);
  const finished=teams.reduce((n,t)=>n+t.reports.filter(r=>r.state!=='active').length,0);
  return <section className="bd-floor" aria-label="트레이딩 건물">
    <header><div><h3>트레이딩 건물</h3><span>10층 · 40개 팀 · 공동 모의 장부</span></div>
      <strong role="status">{run?.reason??'종목 배정 대기'}</strong></header>
    <div className="rm-controls">
      <button disabled={!view || busy || blocked || working} onClick={()=>act('buildingPrepare')}>{teams.length?'전 종목 다시 배정':'전 종목 배정'}</button>
      <label>팀당 회의 수<select disabled={working} value={perTeam} onChange={e=>setLimit(Number(e.target.value))}>
        <option value={1}>1종목</option><option value={3}>최대 3종목</option><option value={0}>적격 종목 전부</option></select></label>
      <label>동시 회의 팀<select disabled={working} value={working?run.parallel:parallel} onChange={e=>setParallel(Number(e.target.value))}>{[1,2,4].map(n=><option key={n} value={n}>{n}팀</option>)}</select></label>
      {working?<button onClick={()=>act('buildingStop')} disabled={busy}>건물 회의 중지</button>:
        <button className="rm-start" disabled={busy || blocked || !view?.officeReady || !engine || run?.state!=='ready' || !max}
          onClick={()=>act('buildingStart',{engine:engine!,parallel:String(parallel),perTeam:String(limit)})}>건물 회의 시작</button>}
    </div>
    {!!teams.length && <p>{run!.venues.map(v=>venueNames[v.venue]+' '+(v.issue?'조회 실패':v.listed+'종목')).join(' · ')}
      {run?.state==='ready'?' / 예정 '+max+'건 · 엔진 작업 최대 '+(max*14)+'개':' / 마친 회의 '+finished+'건'}</p>}
    <div className="bd-plan">
      <nav aria-label="건물 층 선택">{Array.from({length:floorCount},(_,i)=>floorCount-i).map(n=>{
        const live=teams.slice((n-1)*teamsPerFloor,n*teamsPerFloor).some(t=>t.reports.at(-1)?.state==='active');
        return <button key={n} aria-label={n+'층'} aria-pressed={floor===n} onClick={()=>select((n-1)*teamsPerFloor+1)}>{n}F{live?' ●':''}</button>;
      })}</nav>
      <div><h4>{floor}층 트레이딩 팀</h4>
        <div className="bd-desks">{Array.from({length:teamsPerFloor},(_,i)=>(floor-1)*teamsPerFloor+i+1).map(id=>{
          const t=teams[id-1], last=t?.reports.at(-1);
          return <button key={id} aria-label={teamLabel(id)} aria-pressed={team===id} onClick={()=>select(id)}>
            <b>{teamLabel(id)}</b><span>{last?states[last.state]+' · '+last.symbol:'회의 대기'}</span>
            <small>담당 {t?.assigned.length??0} · 후보 {t?.candidates.length??0} · 회의 {t?.reports.length??0}</small></button>;
        })}</div>
        <h4>{teamLabel(team)} 사무실</h4>
        <p>팀별 시작 예산은 거래소별 모의 원금의 1/{teamCount}입니다. 한 건에 팀 시작 예산의 1/4을 수수료 포함 배정합니다.</p>
        {view?.teamFunds?.map(x=><small className="bd-balance" key={x.venue}>{venueNames[x.venue]} 가용 {x.cash.toLocaleString('ko-KR',{maximumFractionDigits:2})} {x.venue==='bithumb'?'KRW':'USDT'} · 보유 {x.open}건</small>)}
      </div>
    </div>
    {desk && <details><summary>담당 종목 {desk.assigned.length}개 · 회의 후보 {desk.candidates.length}개</summary>
      <p>{desk.assigned.map(x=>x.symbol).join(' · ')||'배정된 종목 없음'}</p></details>}
    {!!desk?.reports.length && <div className="bd-reports" aria-label="팀 회의록">{desk.reports.map(r=>
      <button key={r.id} onClick={()=>report(r.id)}>{r.symbol} · {states[r.state]}</button>)}</div>}
  </section>;
}
