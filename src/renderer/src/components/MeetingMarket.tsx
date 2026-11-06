import type { Meeting } from '../../../shared/tradingRoom';

type Candle = [number,number,number,number,number];
type Technical = {chart_bars?:Candle[]; closes?:number[]; asof?:number};
const price=(n:number)=>n.toLocaleString('ko-KR',{maximumSignificantDigits:8});
const stamp=(at:number)=>new Date(at*1000).toLocaleString('ko-KR',{
  timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});

export function MeetingMarket({meeting:m}:{meeting:Meeting}) {
  const tech=m.evidence?.sources.technical as Technical|null;
  if (!m.evidence || !tech) return null;
  const bars=tech.chart_bars??[], closes=bars.length?bars.map(b=>b[4]):tech.closes??[];
  if (closes.length<2) return null;
  const lo=Math.min(...(bars.length?bars.map(b=>b[3]):closes));
  const hi=Math.max(...(bars.length?bars.map(b=>b[2]):closes));
  const y=(p:number)=>hi===lo?48:89-(p-lo)/(hi-lo)*80;
  const x=(i:number)=>9+i*710/(closes.length-1);
  const last=closes[closes.length-1], change=(last/closes[0]-1)*100;
  const ccy=m.venue==='bingx'?'USDT':'KRW';
  const settled=m.state!=='active';
  const outcome={active:'심사 중',approved:'모의 체결',hold:'관망',error:'중단',cancelled:'취소'}[m.state];
  return <section className="mk-board" aria-label="회의 시세와 최종 판단">
    <div className="mk-price"><small>{m.venue==='bingx'?'빙엑스 선물':'빗썸 현물'} · {m.symbol}</small>
      <strong>{price(last)} <em>{ccy}</em></strong>
      <span className={change>=0?'mk-up':'mk-down'}>{change>=0?'+':''}{change.toFixed(2)}% <small>표시 구간</small></span>
      <small>15분 확정봉 · {stamp(tech.asof??m.evidence.captured)} KST</small>
    </div>
    <div className="mk-plot"><svg viewBox="0 0 804 100" preserveAspectRatio="none" role="img" aria-label={bars.length?'15분 확정 캔들 차트':'15분 확정 종가 차트'}>
      {[hi,(hi+lo)/2,lo].map((p,i)=><g key={i}><line x1="0" x2="730" y1={y(p)} y2={y(p)} className="mk-grid"/><text x="740" y={y(p)+3}>{price(p)}</text></g>)}
      {bars.length?bars.map(([at,o,h,l,c],i)=><g key={at} className={c>=o?'mk-rise':'mk-fall'}><title>{stamp(at)} KST · 시가 {price(o)} / 고가 {price(h)} / 저가 {price(l)} / 종가 {price(c)}</title>
        <line x1={x(i)} x2={x(i)} y1={y(h)} y2={y(l)}/><rect x={x(i)-4.5} y={Math.min(y(o),y(c))} width="9" height={Math.max(1,Math.abs(y(o)-y(c)))}/></g>):
        <polyline fill="none" stroke="#e3b765" strokeWidth="1.8" points={closes.map((p,i)=>x(i)+','+y(p)).join(' ')}/>}
    </svg></div>
    <div className="mk-result"><small>마이클 · 회의 결과</small><b>{outcome}</b>
      <span>{settled?m.reason:'참석자 의견을 수집하고 있습니다.'}</span></div>
  </section>;
}
