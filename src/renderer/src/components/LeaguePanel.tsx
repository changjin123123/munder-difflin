import {useState} from 'react';
import {groupLabel,leagueHours,type LeagueRule,type LeagueView} from '../../../shared/paperLeague';
import {teamLabel,type Engine} from '../../../shared/tradingRoom';

const clock=(v:number)=>new Date(v).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const title={waiting:'후보 선정',debating:'대표팀 회의',hold:'관망',open:'모의 보유',closed:'청산',error:'오류'};
const ruleText=(r:LeagueRule)=>'v'+r.version+' · 진입 '+r.stakePct+'% · 최소 손익비 '+r.minRR+' · 최소 익절 '+r.minTakePct.toFixed(2)+'%';
export function LeaguePanel({data,engine,busy,selected,select,act,report}:{
  data?:LeagueView;engine?:Engine;busy:boolean;selected:string;select:(id:string)=>void;
  act:(start:boolean,hours:number)=>void;report:(team:number,id:string)=>void;
}){
  const [hours,setHours]=useState(6);
  const on=!!data?.settings.enabled,r=data?.round;
  return <section className="bd-floor" aria-label="5개 조 정기 대회">
    <header><div><h3>5개 조 정기 대회</h3><span>두 층씩 한 조 · 조별 독립 모의 장부</span></div>
      <strong>{r?r.number+'회 · '+r.note:'첫 대회 대기'}</strong></header>
    <div className="rm-controls"><label>대회 주기<select value={on?data!.settings.hours:hours} disabled={on} onChange={e=>setHours(Number(e.target.value))}>
      {leagueHours.map(h=><option key={h} value={h}>{h}시간마다</option>)}</select></label>
      <button className="rm-start" disabled={busy||!data||(!on&&!engine)} onClick={()=>act(!on,hours)}>{on?'정기 대회 중지':'정기 대회 시작'}</button>
      <label>대회 기록<select value={selected} onChange={e=>select(e.target.value)}><option value="">현재 회차</option>{data?.history.map(h=><option key={h.id} value={h.id}>{h.number}회 · {clock(h.start)}</option>)}</select></label></div>
    <p>시작하면 첫 대회를 열고 앱 실행 중 지정 주기로 반복합니다. 5개 대표팀의 새 회의에 최대 70개, 손실 복기에 최대 5개 엔진 작업을 씁니다. {on && data!.settings.nextAt && '다음 대회 '+clock(data!.settings.nextAt)}</p>
    <p>각 조는 회차마다 20만 원과 200 USDT로 시작합니다. 두 거래소의 비용 차감 수익률을 절반씩 반영하며, 종료 시 남은 포지션은 새 호가로 정산합니다.</p>
    {r && <small>{clock(r.start)} ~ {clock(r.end)}{r.phase==='void'?' · 무효 회차 · 순위 제외':''}</small>}
    <div className="lg-grid">{Array.from({length:5},(_,i)=>i+1).map(g=>{
      const s=r?.seats[g-1];
      return <article key={g}><h4>{g}조 · {groupLabel(g)}</h4>
        {s?<><b>{s.rank?s.rank+'위 · '+s.score!.toFixed(3)+'%':r?.phase==='void'?'무효':title[s.state]}</b>
          <p>{teamLabel(s.team)} · {s.symbol??'후보 선정'}<br/>{s.note}</p>
          <small>{ruleText(s.rule)}</small>
          {s.fill && <p>진입 {s.fill.entry.toLocaleString('ko-KR',{maximumSignificantDigits:8})} · {s.fill.pnl===null?'미정산':'순손익 '+s.fill.pnl.toLocaleString('ko-KR',{maximumSignificantDigits:5})+(s.venue==='bingx'?' USDT':'원')}</p>}
          {s.meetingId && <button onClick={()=>report(s.team,s.meetingId!)}>대표팀 회의록</button>}
          {s.review && <details><summary>손실 복기 · 다음 규칙</summary><p>{s.review.finding}</p><p>당시 결론 · {s.review.decision}</p><p>{s.review.lesson}</p><small>{ruleText(s.review.next)}</small></details>}
        </>:<small>대표팀 순번 대기</small>}</article>;
    })}</div>
  </section>;
}
