import { useEffect, useState } from 'react';
import type { Headlines, Markets, PaperResults, PaperStatus, Venue } from '../../../shared/treasure';
import { App } from '../App';
import './treasure.css';
import { TradingRoomPanel } from './TradingRoom';

const names = { bithumb: '빗썸', bingx: '빙엑스' };
const states: Record<string,string> = { stopped:'중지', running:'실행 중', starting:'시작 중', stopping:'중지 중', failed:'오류', unavailable:'모의 모드 확인 필요' };
const fmt = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('ko-KR', {maximumFractionDigits: 8});
const when = (s: string) => new Date(s).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
const message = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

type DeskPage = 'markets'|'news'|'results'|'room';
function Desk({page,setPage}:{page:DeskPage;setPage:(p:DeskPage)=>void}) {
  const [status,setStatus] = useState<PaperStatus>();
  const [markets,setMarkets] = useState<Markets>();
  const [news,setNews] = useState<Headlines>();
  const [results,setResults] = useState<PaperResults>();
  const [error,setError] = useState('');
  const [controlError,setControlError] = useState('');
  const [busy,setBusy] = useState(false);
  const [venue,setVenue] = useState<Venue>('bithumb');
  const [term,setTerm] = useState('');
  const [offset,setOffset] = useState(0);
  const [revision,refresh] = useState(0);
  const [meetingSymbol,setMeetingSymbol] = useState('');
  const limit = 20;

  useEffect(() => {
    if (page==='room') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setMarkets(undefined);
    async function poll() {
      let delay = 5000;
      try {
        const state = await window.cth.treasureRequest('status');
        if (!active) return;
        setStatus(state);
        if (page === 'markets') {
          const data = await window.cth.treasureRequest('markets',{venue, q:term.trim(), offset:String(offset), limit:String(limit)});
          if (active) setMarkets(data);
          if (!data.items.length && Object.values(data.sources).some(s=>s.includes('조회 중'))) delay=900;
        } else if (page === 'news') {
          const data = await window.cth.treasureRequest('news');
          if (active) setNews(data);
          if (!data.items.length) delay=1700;
        } else {
          const data = await window.cth.treasureRequest('paper/results');
          if (active) setResults(data);
        }
        if (active) setError('');
      } catch (e) {
        if (active) setError(message(e));
      } finally {
        if (active) timer=setTimeout(poll,delay);
      }
    }
    timer=setTimeout(poll,120);
    return () => { active=false; clearTimeout(timer); };
  },[page,venue,term,offset,revision]);

  async function control(start: boolean) {
    setBusy(true); setControlError('');
    try { setStatus(await window.cth.treasureRequest(start?'paper/start':'paper/stop')); }
    catch (e) { setControlError(message(e)); }
    finally { setBusy(false); refresh(n=>n+1); }
  }
  const canControl = !!status && status.venues.every(v=>v.mode==='paper');
  const running = status?.venues.some(v=>['running','starting','stopping'].includes(v.state));
  const bothRunning = status?.venues.every(v=>['running','starting'].includes(v.state));
  return <main className={'tb-desk'+(page==='room'?' tb-trading':'')}>
    {page!=='room' && <header className="tb-head"><div><h1>보물공방</h1><p>빗썸 원화 현물 · 빙엑스 USDT 무기한선물</p></div>
      <div className="tb-actions"><button disabled={!canControl || busy || bothRunning} onClick={()=>void control(true)}>전체 종목 모의 시작</button>
      <button disabled={!canControl || busy || !running} onClick={()=>void control(false)}>모의 중지</button></div>
    </header>}
    {page!=='room' && <section className="tb-status" aria-label="모의매매 상태">{(['bithumb','bingx'] as const).map(v=>{
      const s=status?.venues.find(row=>row.venue===v);
      return <div key={v}><strong>{names[v]}</strong><span className={s?.state==='running'?'tb-running':''}>{s ? states[s.state] ?? s.state : '연결 중'}</span>
        <small>{s?.error || s?.profile || ''}</small></div>;
    })}</section>}
    {page!=='room' && (error || controlError) && <div role="alert" className="tb-error">{controlError || error} <button onClick={()=>refresh(n=>n+1)}>다시 조회</button></div>}
    {page!=='room' && <nav className="tb-tabs" aria-label="보물공방 화면">{(['markets','news','results','room'] as const).map((key,i)=>
      <button key={key} aria-pressed={page===key} onClick={()=>setPage(key)}>{['전체 시세','최신 뉴스','모의 장부','트레이딩 회의실'][i]}</button>)}</nav>}
    {page==='room' && <TradingRoomPanel initialVenue={venue} initialSymbol={meetingSymbol || (venue==='bithumb'?'KRW-BTC':'BTC-USDT')}/>}
    {page==='markets' && <>
      <div className="tb-filters"><select aria-label="거래소" value={venue} onChange={e=>{setOffset(0);setMeetingSymbol('');setVenue(e.target.value as Venue);}}>
        <option value="bithumb">빗썸 · KRW</option><option value="bingx">빙엑스 · USDT</option></select>
        <input aria-label="코인 검색" placeholder="종목명 또는 심볼 검색" value={term} maxLength={100} onChange={e=>{setOffset(0);setTerm(e.target.value);}}/>
        <span>{markets ? markets.total.toLocaleString('ko-KR')+'종목' : '조회 중'}</span></div>
      <div className="tb-grid"><table><thead><tr><th>종목</th><th>현재가 ({venue==='bithumb'?'KRW':'USDT'})</th><th>등락률</th><th>24시간 거래대금</th><th>모의 후보</th></tr></thead>
        <tbody>{markets?.items.map(m=><tr key={m.symbol}><td><button title="이 종목의 회의실 열기" onClick={()=>{setMeetingSymbol(m.symbol);setPage('room');}}>{m.symbol}</button><small>{m.name!==m.symbol?m.name:''}</small></td><td title={m.quoted_at ? when(m.quoted_at):''}>{fmt(m.price)}</td>
          <td className={(m.change_pct??0)>0?'tb-up':(m.change_pct??0)<0?'tb-down':''}>{m.change_pct==null?'—':m.change_pct.toFixed(2)+'%'}</td>
          <td>{m.turnover_24h==null?'—':Math.round(m.turnover_24h).toLocaleString('ko-KR')}</td><td>{m.paper_eligible?'가능':'제외'}</td></tr>)}</tbody></table></div>
      {!markets?.items.length && <p>{markets?.sources[venue]?.includes('실패') ? markets.sources[venue] : markets && !Object.values(markets.sources).some(s=>s.includes('조회 중')) ? '조건에 맞는 종목이 없습니다.' : '거래소에서 시세를 불러오는 중입니다.'}</p>}
      <footer><span>{markets?.sources[venue]}</span><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-limit))}>이전</button>
        <span>{Math.floor(offset/limit)+1} / {Math.max(1,Math.ceil((markets?.total??0)/limit))}</span><button disabled={!markets || offset+limit>=markets.total} onClick={()=>setOffset(offset+limit)}>다음</button></footer>
    </>}
    {page==='news' && <section className="tb-news">
      {!news?.items.length && <p>{news ? Object.values(news.sources).join(' · ') : '뉴스를 불러오는 중입니다.'}</p>}
      {news?.items.map(n=><a key={n.url} href={n.url} target="_blank" rel="noreferrer"><small>{n.source} · {when(n.published_at)}</small><strong>{n.title}</strong></a>)}</section>}
    {page==='results' && <section className="tb-results">{!results && <p>모의 장부를 조회하는 중입니다.</p>}
      {results?.venues.map(v=><article key={v.venue}><h2>{names[v.venue]} <small>{v.currency}</small></h2>
        {v.has_record ? <dl>{[['모의 현금',fmt(v.cash)],['실현손익',fmt(v.realized)],['보유 종목',fmt(v.positions)],['종료 거래',fmt(v.closed_trades)]].map(([k,n])=><div key={k}><dt>{k}</dt><dd>{n}</dd></div>)}</dl> : <p>전체 종목 모의 기록이 아직 없습니다.</p>}</article>)}</section>}
  </main>;
}

export function TreasureOffice() {
  const [available,setAvailable] = useState<boolean>();
  const [desk,setDesk] = useState(true);
  const [page,setPage] = useState<DeskPage>('room');
  const [visited,setVisited] = useState(false);
  useEffect(()=>{ void window.cth.treasureAvailable().then(setAvailable,()=>setAvailable(false)); },[]);
  if (available===undefined) return null;
  if (!available) return <App/>;
  return <div className="tb-shell">
    <nav className="tb-switch" aria-label="작업 화면"><strong>Munder Difflin</strong>
      <button aria-pressed={desk && page==='room'} onClick={()=>{setDesk(true);setPage('room');}}>트레이딩 사무실</button>
      <button aria-pressed={desk && page!=='room'} onClick={()=>{setDesk(true);if(page==='room')setPage('markets');}}>보물공방</button>
      <button aria-pressed={!desk} onClick={()=>{setDesk(false);setVisited(true);}}>사무실 관리</button></nav>
    {desk && <Desk page={page} setPage={setPage}/>}
    {visited && <div className="tb-office" hidden={desk}><App/></div>}
  </div>;
}
