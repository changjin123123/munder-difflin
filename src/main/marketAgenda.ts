import type { Markets, Venue } from '../shared/treasure';
import type { MarketCandidate, MarketScan } from '../shared/tradingRoom';

export type MarketSource = (path:string, params:Record<string,string>)=>Promise<unknown>;
type Row = Markets['items'][number];
type Instrument = Pick<Row,'venue'|'symbol'>;
const venues:Venue[] = ['bithumb','bingx'];
const pageSize = 100;
const wait = (ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const asset = (x:Instrument)=>x.symbol.split('-')[x.venue==='bithumb'?1:0];
function recentQuote(row:Row, now:number) {
  const age=now-Date.parse(row.quoted_at??'');
  return age>=-10000 && age<=120000;
}

async function catalog(venue:Venue, source:MarketSource, active:()=>boolean):Promise<Row[]> {
  // Every page must belong to the same board refresh, even if the sizes match.
  for (let attempt=0; attempt<16 && active(); attempt++) {
    const rows = new Map<string,Row>();
    let total=0, stamp='';
    do {
      if (!active()) throw new Error('조회 중지');
      const offset=rows.size;
      const page=await source('markets',{venue,offset:String(offset),limit:String(pageSize)}) as Markets;
      const status=page.sources[venue];
      if (offset===0) {total=page.total;stamp=status;}
      if (!total || total!==page.total || stamp!==status || page.offset!==offset ||
          page.items.length!==Math.min(pageSize,total-offset)) {
        if (!total && status?.includes('실패')) throw new Error(status);
        break;
      }
      for (const row of page.items) if (row.venue===venue) rows.set(row.symbol,row);
      if (rows.size!==offset+page.items.length) break;
      if (rows.size===total) {
        const snapshot=[...rows.values()];
        // Opening a board after a long meeting starts its refresh asynchronously.
        if (attempt===15 || snapshot.some(r=>recentQuote(r,Date.now()))) return snapshot;
        break;
      }
    } while (rows.size<total);
    if (attempt<15 && active()) await wait(750);
  }
  throw new Error('전체 시세 목록을 확인하지 못했습니다.');
}

function ranks(rows:Row[], value:(r:Row)=>number) {
  const result=new Map<string,number>();
  const sorted=[...rows].sort((a,b)=>value(b)-value(a));
  let rank=1;
  sorted.forEach((row,i)=>{
    if (i && value(row)!==value(sorted[i-1])) rank=i+1;
    result.set(row.symbol,rank);
  });
  return result;
}

export async function scanMarkets(source:MarketSource, active:()=>boolean, reviewed:Instrument[],
    open:Instrument[], recent:Instrument[]):Promise<MarketScan> {
  const data=await Promise.allSettled(venues.map(venue=>catalog(venue,source,active)));
  const now=Date.now();
  const scan:MarketScan={at:now,venues:[],candidates:[]};
  const excluded=new Set([...open,...reviewed].map(asset)), last=new Set(recent.map(asset));
  const pool:{candidate:MarketCandidate;score:number}[]=[];
  data.forEach((result,i)=>{
    const venue=venues[i];
    if (result.status==='rejected') {
      scan.venues.push({venue,listed:0,eligible:0,issue:String(result.reason?.message||'시세 조회 실패')});return;
    }
    const rows=result.value.filter(r=>r.paper_eligible && recentQuote(r,now) &&
      r.price!==null && Number.isFinite(r.price) && r.price>0 &&
      r.turnover_24h!==null && Number.isFinite(r.turnover_24h) && r.turnover_24h>0 && Number.isFinite(r.change_pct));
    scan.venues.push({venue,listed:result.value.length,eligible:rows.length});
    const volume=ranks(rows,r=>r.turnover_24h!), movement=ranks(rows,r=>Math.abs(r.change_pct!));
    for(const row of rows) {
      if(excluded.has(asset(row))) continue;
      const turnoverRank=volume.get(row.symbol)!, moveRank=movement.get(row.symbol)!;
      pool.push({candidate:{venue,symbol:row.symbol,change:row.change_pct!,turnover:row.turnover_24h!,turnoverRank,moveRank},
        score:(.6*(turnoverRank-1)+.4*(moveRank-1))/Math.max(rows.length-1,1)});
    }
  });
  const counts={bithumb:0,bingx:0};
  for(const x of reviewed) counts[x.venue]++;
  const used=new Set<string>();
  while(scan.candidates.length<5) {
    const remaining=pool.filter(x=>!used.has(asset(x.candidate)));
    if(!remaining.length) break;
    remaining.sort((a,b)=>counts[a.candidate.venue]-counts[b.candidate.venue] ||
      Number(last.has(asset(a.candidate)))-Number(last.has(asset(b.candidate))) || a.score-b.score ||
      a.candidate.symbol.localeCompare(b.candidate.symbol));
    const pick=remaining[0].candidate;
    scan.candidates.push(pick); used.add(asset(pick)); counts[pick.venue]++;
  }
  return scan;
}
