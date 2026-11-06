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
  const source=async(path,{venue,symbol})=>{
    if (path==='room/evidence') {
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
    return JSON.stringify({note:'독립된 합성 검증 자료',verdict:review?(step===options.veto?'VETO':'PASS'):(options.side||'LONG'),stopPct:1,takePct:2,
      newsRefs:step===options.badCitation?['N99']:['N1'],newsEvents:options.emptyBrief?[]:[{summary:'동일 사건의 두 보도',newsRefs:['N1','N2']},
        {summary:'중복 후속보도',newsRefs:['N1']}]});
  }};
  const room=new TradingRoom(':memory:',source,workers);
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
roomTest('risk veto, invalid output, stale quotes, and spot shorts cannot create paper entries',async t=>{
  for (const [opts,venue,state] of [[{veto:'defense'},'bingx','hold'],[{malformed:'technical'},'bingx','error'],
    [{expired:true},'bingx','hold'],[{side:'SHORT'},'bithumb','hold']]) {
    const f=fixture(opts);t.after(()=>f.room.stop());
    const v=await f.run(venue);
    assert.equal(v.current.state,state);assert.equal(v.trades.length,0);
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
