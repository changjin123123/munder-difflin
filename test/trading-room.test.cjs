const assert = require('node:assert/strict');
const test = require('node:test');
const {setTimeout:delay} = require('node:timers/promises');
const load = require('./load-ts.cjs');
const {TradingRoom} = load('src/main/tradingRoom.ts');
const {rounds,seats} = load('src/shared/tradingRoom.ts');
const Database = require('better-sqlite3');
let nativeAvailable = true;
try { new Database(':memory:').close(); } catch { nativeAvailable = false; }
const roomTest = (name, fn) => test(name,{skip:nativeAvailable?false:'Use the bundled Electron SQLite ABI'},fn);

function fixture(options={}) {
  let market=100;
  const steps=[];
  const objectives={};
  const quote=()=>({bid:market,ask:market+.02,at:Date.now()/1000,until:Date.now()/1000+8});
  const source=async(path,params)=>{
    const {venue,symbol}=params;
    if(path==='markets') return options.catalog(params);
    if (path==='room/evidence') {
      if(options.beforeEvidence) await options.beforeEvidence();
      if(options.badEvidence===symbol) throw new Error('호가 없음');
      const news=options.noNews?[]:['N1','N2'].map((id,i)=>({id,source:'CoinDesk',title:'합성 테스트 '+id,
        url:options.badUrl?'https://coindesk.com.example.org/a':'https://www.coindesk.com/test/'+i,
        summary:'공개 요약 테스트',scope:'asset',publishedAt:Date.now()/1000-(options.staleNews?86401:60)}));
      return {venue,symbol,captured:Date.now()/1000,quote:quote(),sources:{technical:{}},missing:[],news};
    }
    if (path==='room/entry' && options.expired) return {...quote(),until:0};
    return quote();
  };
  const workers={engines:()=>['codex'],ready:()=>true,cancel:()=>{},ask:async(id,step,engine,objective)=>{
    steps.push(step);
    objectives[step]=objective;
    if (step===options.malformed) return '{}';
    const review=['growth','defense','neutral','audit'].includes(step);
    return JSON.stringify({note:'독립된 합성 검증 자료',verdict:review?(step===options.veto?'VETO':'PASS'):(options.side||'LONG'),stopPct:1,takePct:2,confidencePct:options.confidence,
      newsRefs:step===options.badCitation?['N99']:['N1'],newsEvents:options.emptyBrief?[]:[{summary:'동일 사건의 두 보도',newsRefs:['N1','N2']},
        {summary:'중복 후속보도',newsRefs:['N1']}]});
  }};
  const room=new TradingRoom(options.path||':memory:',source,workers);
  async function run(venue='bingx'){
    room.start(venue,venue==='bingx'?'BTC-USDT':'KRW-BTC','codex');
    for(let i=0;i<40 && room.view().current.state==='active';i++) await delay(2);
    return room.view();
  }
  return {room,run,steps,objectives,setPrice:v=>{market=v}};
}
roomTest('13 seats, a real rebuttal stage, isolated paper balances and exactly-once closing',async t=>{
  const f=fixture();t.after(()=>f.room.stop());
  const v=await f.run();
  assert.equal(seats.length,13);assert.deepEqual(f.steps,rounds.flat());
  assert.equal(v.current.state,'approved');assert.equal(v.trades.length,1);
  assert.equal(v.trades[0].entry,100.02*1.0003);
  assert.equal(v.totals.find(t=>t.venue==='bithumb').cash,1_000_000);
  assert.equal((await f.run()).current.state,'hold');
  assert.equal(f.room.view().trades.length,1);
  f.setPrice(102);
  await Promise.all([f.room.closeTrade(v.trades[0].id),f.room.closeTrade(v.trades[0].id)]);
  const closed=f.room.view().trades[0];
  const expected=closed.qty*(closed.exit-closed.entry-.0005*(closed.entry+closed.exit));
  assert.equal(closed.pnl,expected);
  assert.equal(f.room.view().totals.find(t=>t.venue==='bingx').cash,1000+expected);
});

function board(rows,venue,offset) {
  const listed=rows.map(([coin,volume,change,eligible=true,age=0])=>({
    venue,symbol:venue==='bithumb'?'KRW-'+coin:coin+'-USDT',price:100,turnover_24h:volume,
    change_pct:change,paper_eligible:eligible,quoted_at:new Date(Date.now()-age).toISOString()
  }));
  return {total:listed.length,offset:Number(offset),sources:{[venue]:'snapshot'},items:listed.slice(Number(offset),Number(offset)+100)};
}
roomTest('market sessions re-scan each round, balance venues, debate peers and book separate assets',async t=>{
  const pages=[];
  const catalog=({venue,offset})=>{
    pages.push([venue,offset]);
    const rows=[['BTC',200,0.01],['ETH',300,4],['SOL',250,3],['DROP',900,9,false],['STALE',900,9,true,600000]];
    for(let i=0;i<100;i++) rows.push(['X'+i,1,0]);
    rows.push(['DEEP',400,5]);
    return board(rows,venue,offset);
  };
  const f=fixture({catalog});t.after(()=>f.room.stop());
  assert.throws(()=>f.room.startMarket('codex',0,500));
  f.room.startMarket('codex',0,3);
  assert.throws(()=>f.room.start('bingx','BTC-USDT','codex'));
  for(let i=0;i<100 && f.room.view().session.state!=='done';i++) await delay(3);
  const v=f.room.view();
  assert.equal(v.session.state,'done');assert.equal(v.trades.length,3);
  const all=v.session.meetings.map(id=>f.room.view(id).current);
  const coin=m=>m.symbol.split('-')[m.venue==='bithumb'?1:0];
  assert.deepEqual(all.map(coin),['DEEP','ETH','SOL']);assert.notEqual(all[0].venue,all[1].venue);
  assert.equal(all.length,3);assert.equal(f.steps.length,42);
  assert.deepEqual(all[0].scan.venues.map(x=>[x.listed,x.eligible]),[[106,104],[106,104]]);
  assert.equal(pages.filter(([,offset])=>offset==='100').length,6);
  assert.ok(f.objectives.bull.includes('전 종목 회의의 비교 자료'));
  assert.ok(f.objectives.bear.includes(all[2].scan.candidates[1].symbol));
  assert.ok(all.every(m=>m.scan.candidates[0].symbol===m.symbol));
  f.room.startMarket('codex',0,1);
  for(let i=0;i<50 && f.room.view().session.state!=='done';i++) await delay(2);
  assert.ok(!all.map(coin).includes(coin(f.room.view().current)));
});
roomTest('a missing venue and an unavailable instrument leave no fill and advance to the next eligible coin',async t=>{
  const catalog=({venue,offset})=>{
    if(venue==='bingx') throw Error('offline');
    return board([['ADA',90,4],['ETH',50,3]],venue,offset);
  };
  const f=fixture({catalog,badEvidence:'KRW-ADA'});t.after(()=>f.room.stop());
  f.room.startMarket('codex',0,3);
  for(let i=0;i<50 && f.room.view().session.state!=='done';i++) await delay(3);
  const v=f.room.view();assert.equal(v.session.state,'done');assert.equal(v.session.held,1);
  assert.equal(v.session.meetings.length,2);assert.equal(v.trades.length,1);assert.equal(v.trades[0].symbol,'KRW-ETH');
  assert.equal(v.current.scan.venues.find(x=>x.venue==='bingx').issue,'offline');assert.equal(f.steps.length,14);
});
roomTest('stopping a market scan discards late pages and never calls an engine',async t=>{
  const resolvers=[];
  const f=fixture({catalog:p=>new Promise(resolve=>resolvers.push(()=>resolve(board([['ETH',10,1]],p.venue,p.offset))))});
  t.after(()=>f.room.stop());f.room.startMarket('codex',0,2);f.room.stopAuto();resolvers.forEach(fn=>fn());
  await new Promise(r=>setImmediate(r));const v=f.room.view();
  assert.equal(v.session.state,'stopped');assert.equal(v.current,null);assert.equal(f.steps.length,0);
});

const waitFor=async fn=>{
  for(let i=0;i<160 && !fn();i++) await delay(5);
  assert.ok(fn(),'expected state before timeout');
};
roomTest('40 teams partition every listing, share a coin owner across venues and run bounded concurrent meetings',async t=>{
  const rows=Array.from({length:120},(_,i)=>['X'+i,1000-i,20-i/10]);
  rows.push(['HALTED',999,5,false]);
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const f=fixture({catalog:({venue,offset})=>board(rows,venue,offset),beforeEvidence:()=>gate});
  t.after(()=>{release();f.room.stop();});
  f.room.prepareBuilding();await waitFor(()=>f.room.view().building.state==='ready');
  const run=f.room.view().building, owner=new Map();
  assert.equal(run.teams.length,40);
  assert.equal(run.teams.flatMap(x=>x.assigned).length,242);
  assert.equal(run.teams.flatMap(x=>x.candidates).length,240);
  for(const team of run.teams) for(const pair of team.assigned){
    const coin=pair.symbol.replace(/^KRW-|-USDT$/g,'');if(owner.has(coin)) assert.equal(owner.get(coin),team.id);
    owner.set(coin,team.id);
  }
  const count=run.teams.filter(x=>x.candidates.length).length;
  assert.equal(f.steps.length,0);
  assert.throws(()=>f.room.startBuilding('codex',40,1));
  f.room.startBuilding('codex',2,1);
  assert.equal(run.teams.flatMap(t=>t.reports).length,2);
  assert.throws(()=>f.room.startMarket('codex',0,1));assert.throws(()=>f.room.prepareBuilding());
  release();
  await waitFor(()=>run.state==='done');
  assert.equal(f.steps.length,count*14);
  const view=f.room.view();assert.equal(view.trades.length,count);
  for(const team of run.teams.filter(x=>x.reports.length)){
    const v=f.room.view(undefined,team.id);
    assert.equal(v.current.team,team.id);assert.equal(v.current.buildingId,run.id);
    assert.equal(v.history.length,1);assert.equal(v.trades.length,1);
    const budget=v.teamFunds.find(x=>x.venue===v.current.venue);
    assert.ok(Math.abs(budget.cash-budget.budget*.75)<1e-7);
    assert.equal(v.trades[0].id,team.reports[0].id);
  }
});
roomTest('full allocation visits every candidate, blocks duplicate exposure, and enforces the same team cap across runs',async t=>{
  const {buildingAgenda}=load('src/main/marketAgenda.ts');
  const universe=Array.from({length:500},(_,i)=>['Z'+i,900-i,7]);
  const raw=await buildingAgenda(async(_,p)=>board(universe,p.venue,p.offset),()=>true,[],[]);
  const symbols=raw.teams.find(x=>x.assigned.length>=14).assigned.filter(x=>x.venue==='bingx').slice(0,7).map(x=>x.symbol.replace('-USDT',''));
  const rows=symbols.map((x,i)=>[x,80-i,5]);
  const f=fixture({catalog:({venue,offset})=>board(rows,venue,offset)});t.after(()=>f.room.stop());
  for(let cycle=0;cycle<2;cycle++){
    f.room.prepareBuilding();await waitFor(()=>f.room.view().building.state==='ready');
    f.room.startBuilding('codex',4,0);await waitFor(()=>f.room.view().building.state==='done');
    const run=f.room.view().building;
    if(cycle===0) assert.equal(run.teams.flatMap(x=>x.reports).length,14);
    const trades=f.room.view().trades;
    assert.equal(new Set(trades.map(t=>t.symbol.replace(/^KRW-|-USDT$/g,''))).size,trades.length);
    for(const venue of ['bithumb','bingx']) assert.ok(trades.filter(t=>t.venue===venue).length<=4);
    for(const sum of f.room.view().totals) assert.ok(sum.cash>=0);
  }
});
roomTest('stop cancels every active team and reopening an interrupted building never launches a worker',async t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'paper-building-')),file=path.join(tmp,'room.db');
  const rows=Array.from({length:60},(_,i)=>['T'+i,70-i,2]);
  let resume;
  const gate=new Promise(r=>{resume=r;});
  const options={path:file,catalog:({venue,offset})=>board(rows,venue,offset),beforeEvidence:()=>gate};
  const f=fixture(options);t.after(()=>{resume();f.room.stop();});
  f.room.prepareBuilding();await waitFor(()=>f.room.view().building.state==='ready');
  f.room.startBuilding('codex',4,3);
  const afterCrash=fixture(options);t.after(()=>afterCrash.room.stop());
  const recovered=afterCrash.room.view().building;assert.equal(recovered.state,'stopped');
  assert.equal(recovered.teams.flatMap(t=>t.reports).filter(r=>r.state==='error').length,4);
  assert.equal(afterCrash.steps.length,0);
  f.room.stopBuilding();resume();await delay(15);
  assert.equal(f.room.view().building.teams.flatMap(t=>t.reports).filter(r=>r.state==='cancelled').length,4);
  assert.equal(f.steps.length,0);assert.equal(f.room.view().trades.length,0);
});
roomTest('risk veto, invalid output, stale quotes, and spot shorts cannot create paper entries',async t=>{
  for (const [opts,venue,state] of [[{veto:'defense'},'bingx','hold'],[{malformed:'technical'},'bingx','error'],
    [{expired:true},'bingx','hold'],[{side:'SHORT'},'bithumb','hold']]) {
    const f=fixture(opts);t.after(()=>f.room.stop());
    const v=await f.run(venue);
    assert.equal(v.current.state,state);assert.equal(v.trades.length,0);
  }
});
roomTest('the final card keeps manager self-assessment separate from execution and loads the matching historical fill',async t=>{
  for (const value of [0,100,71,undefined,null,101,-1,70.4,'90']) {
    const f=fixture({confidence:value});t.after(()=>f.room.stop());
    const view=await f.run(), id=view.current.id;
    assert.equal(view.current.state,'approved');
    const expected=Number.isInteger(value) && value>=0 && value<=100?value:undefined;
    assert.equal(view.current.answers.manager.confidencePct,expected);
    assert.equal(view.current.answers.bull.confidencePct,undefined);
    assert.deepEqual(view.currentFill,view.trades[0]);
    const noFill=await f.run();
    assert.equal(noFill.current.state,'hold');assert.equal(noFill.currentFill,undefined);
    assert.equal(noFill.current.answers.manager.verdict,'LONG');
    assert.equal(f.room.view(id).currentFill.id,id);
  }
});
roomTest('each risk reviewer sees the trader proposal and earlier reviews before the manager decides',async t=>{
  const f=fixture();t.after(()=>f.room.stop());
  const view=await f.run();
  const i=f.steps.indexOf('trader');
  assert.deepEqual(f.steps.slice(i),['trader','growth','defense','neutral','audit','manager']);
  const plan=view.current.proposal;
  assert.equal(plan.side,'LONG');
  for(const field of ['entry','stop','take']) assert.equal(plan[field],view.trades[0][field]);
  for(const [idx,role] of f.steps.slice(i+1).entries()) {
    const prompt=f.objectives[role];
    assert.ok(prompt.includes(JSON.stringify(plan)));
    const previous=JSON.parse(prompt.split('\n').find(line=>line.startsWith('이전 역할 의견 ')).slice('이전 역할 의견 '.length));
    assert.ok(previous.trader);
    assert.ok(f.steps.slice(i,i+idx+1).every(step=>previous[step]));
    assert.equal(previous[role],undefined);
  }
  const hold=fixture({side:'HOLD'});t.after(()=>hold.room.stop());
  const held=await hold.run();
  assert.deepEqual(held.current.proposal,{side:'HOLD'});
  assert.equal(held.trades.length,0);
});
roomTest('a paper entry needs fresh source-linked events and a cited debate through manager approval',async t=>{
  for (const options of [{},{noNews:true},{badUrl:true},{staleNews:true},{emptyBrief:true},
    {badCitation:'bull'},{badCitation:'bear'},{badCitation:'reply'},{badCitation:'audit'},{badCitation:'manager'}]) {
    const f=fixture(options);t.after(()=>f.room.stop());
    const view=await f.run();
    assert.equal(Object.keys(view.current.answers).length,14);
    const valid=!Object.keys(options).length;
    assert.equal(view.current.state,valid?'approved':'hold');
    assert.equal(view.trades.length,valid?1:0);
    if (valid) assert.deepEqual(view.current.answers.news.newsEvents,[{summary:'동일 사건의 두 보도',newsRefs:['N1','N2']}]);
  }
});
roomTest('BingX paper short closes on the ask with spread, fees and slippage',async t=>{
  const f=fixture({side:'SHORT'});t.after(()=>f.room.stop());
  const v=await f.run();const trade=v.trades[0];
  assert.equal(trade.side,'SHORT');assert.ok(trade.stop>trade.entry && trade.take<trade.entry);
  f.setPrice(98);await f.room.closeTrade(trade.id);
  const closed=f.room.view().trades[0];assert.equal(closed.exit,98.02*1.0003);assert.ok(closed.pnl>0);
});

roomTest('automatic meetings wait five minutes after completion, count holds and stop at the requested limit',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
  const f=fixture();t.after(()=>f.room.stop());
  const settle=()=>new Promise(r=>setImmediate(r));
  const id=f.room.startAuto('bingx','BTC-USDT','codex',5,2);
  assert.throws(()=>f.room.startAuto('bingx','BTC-USDT','codex',5,2));
  await settle();
  const first=f.room.view();
  assert.equal(first.session.id,id);
  assert.equal(first.session.state,'waiting');
  assert.equal(first.session.nextAt,first.current.finishedAt+300000);
  assert.throws(()=>f.room.start('bingx','BTC-USDT','codex'));
  t.mock.timers.tick(299999);await settle();
  assert.equal(f.steps.length,14);
  t.mock.timers.tick(1);await settle();
  let v=f.room.view();
  assert.equal(v.session.state,'done');assert.equal(v.session.meetings.length,2);
  assert.equal(v.session.approved,1);assert.equal(v.session.held,1);assert.equal(v.trades.length,1);
  assert.ok(v.session.meetings.every(mid=>f.room.view(mid).current.sessionId===id));
  t.mock.timers.tick(600000);await settle();assert.equal(f.steps.length,28);
});

roomTest('stopping a waiting batch and worker errors never start a later paid round',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
  const settle=()=>new Promise(r=>setImmediate(r));
  for(const invalid of [[0,2],[5,1],[5,200],[NaN,2]]) {
    const f=fixture();t.after(()=>f.room.stop());
    assert.throws(()=>f.room.startAuto('bingx','BTC-USDT','codex',...invalid));assert.equal(f.steps.length,0);
  }
  for(const options of [{},{malformed:'technical'}]){
    const f=fixture(options);t.after(()=>f.room.stop());
    f.room.startAuto('bingx','BTC-USDT','codex',5,2);
    await settle();
    if(!options.malformed) f.room.stopAuto();
    const before=f.steps.length;
    t.mock.timers.tick(600000);await settle();
    assert.equal(f.steps.length,before);
    assert.equal(f.room.view().session.state,options.malformed?'error':'stopped');
  }
});
