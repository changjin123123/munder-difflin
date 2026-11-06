import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { teamCount,teamTarget, type BuildingRun, type BuildingTeam, type Engine, type Instrument, type Meeting } from '../shared/tradingRoom';
import { buildingAgenda, type MarketSource } from './marketAgenda';

export class TradingBuilding {
  current:BuildingRun|null=null;
  private active=new Map<number,Meeting>();
  constructor(private db:Database.Database, private source:MarketSource,
    private conduct:(meeting:Meeting)=>Promise<void>, private cancel:(meeting:Meeting)=>void) {
    db.exec('CREATE TABLE IF NOT EXISTS building_runs(id TEXT PRIMARY KEY,created INTEGER NOT NULL,body TEXT NOT NULL)');
    const row=db.prepare('SELECT body FROM building_runs ORDER BY created DESC,rowid DESC LIMIT 1').get() as {body:string}|undefined;
    if(!row) return;
    const run:BuildingRun=JSON.parse(row.body);
    this.current=run;
    // Meetings are authoritative if the process stopped before its next building checkpoint.
    for(const team of run.teams) team.reports=[];
    const reports=db.prepare(`SELECT id,json_extract(body,'$.team') team,json_extract(body,'$.symbol') symbol,
      json_extract(body,'$.venue') venue,json_extract(body,'$.state') state FROM meetings
      WHERE json_extract(body,'$.buildingId')=? ORDER BY rowid`).all(run.id) as (BuildingTeam['reports'][number]&{team:number})[];
    for(const r of reports) run.teams[r.team-1]?.reports.push(r);
    if(this.busy) {run.state='stopped';run.reason='앱 종료로 건물 회의를 중지했습니다.';this.save(run);}
  }
  get busy() {return this.current?.state==='running' || this.current?.state==='scanning';}
  private save(run:BuildingRun) {
    this.db.prepare('INSERT INTO building_runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .run(run.id,run.at,JSON.stringify(run));
  }
  prepare() {
    if(this.busy) throw new Error('진행 중인 건물 작업을 먼저 중지하세요.');
    const run:BuildingRun={id:randomUUID(),at:Date.now(),state:'scanning',reason:'양 거래소 종목 배정 중',
      teams:[],venues:[],perTeam:1,parallel:teamCount};
    this.current=run;this.save(run);
    void this.assign(run);
  }
  private async assign(run:BuildingRun) {
    const active=()=>this.current===run && run.state==='scanning';
    try {
      const open=this.db.prepare('SELECT venue,symbol FROM trades WHERE closed IS NULL').all() as Instrument[];
      const recent=this.db.prepare(`SELECT json_extract(body,'$.venue') venue,json_extract(body,'$.symbol') symbol
        FROM meetings WHERE json_extract(body,'$.team') IS NOT NULL ORDER BY rowid DESC LIMIT 200`).all() as Instrument[];
      const agenda=await buildingAgenda(this.source,active,open,recent);
      if(!active()) return;
      Object.assign(run,agenda);
      if(agenda.venues.every(v=>v.issue)) throw new Error('양 거래소 시세를 확인하지 못했습니다.');
      run.state='ready';run.reason='종목 배정 완료';this.save(run);
    } catch(e) {
      if(active()) {run.state='error';run.reason=e instanceof Error?e.message:'종목 배정 실패';this.save(run);}
    }
  }
  start(engine:Engine,parallel:number,perTeam:number,beforeStart:()=>void) {
    const run=this.current;
    if(!run || run.state!=='ready') throw new Error('먼저 건물에 전 종목을 배정하세요.');
    if(parallel!==teamCount || ![0,1,3].includes(perTeam)) throw new Error('건물 회의는 40팀 단위입니다. 팀 실행 범위를 확인하세요.');
    if(Date.now()-run.at>10*60000) throw new Error('배정 시세가 10분 이상 지났습니다. 종목을 다시 배정하세요.');
    beforeStart();
    run.parallel=parallel;run.perTeam=perTeam;run.engine=engine;run.state='running';run.reason='팀별 회의 진행 중';
    this.save(run);this.pump(run);
  }
  private pump(run:BuildingRun) {
    if(this.current!==run || run.state!=='running') return;
    while(this.active.size<run.parallel) {
      // Each team gets a turn before any team starts its next instrument.
      const team=run.teams.filter(t=>!this.active.has(t.id) && t.reports.at(-1)?.state!=='error' && t.reports.length<teamTarget(t,run.perTeam))
        .sort((a,b)=>a.reports.length-b.reports.length || a.id-b.id)[0];
      if(!team) break;
      const i=team.reports.length, pick=team.candidates[i];
      const m:Meeting={id:randomUUID(),buildingId:run.id,team:team.id,engine:run.engine!,venue:pick.venue,symbol:pick.symbol,
        method:'tradingagents-office-v1',state:'active',reason:'공개 자료 수집 중',created:Date.now(),speaking:[],answers:{},
        scan:{at:run.at,venues:run.venues,candidates:[pick,...team.candidates.filter(c=>c!==pick).slice(0,4)]}};
      const report:BuildingTeam['reports'][number]={id:m.id,venue:m.venue,symbol:m.symbol,state:m.state};
      team.reports.push(report);this.active.set(team.id,m);
      void this.conduct(m).then(()=>{
        report.state=m.state;
        if(this.current!==run || this.active.get(team.id)!==m) return;
        this.active.delete(team.id);
        if(m.state==='error' && /사용 한도|로그인|시간 초과|Codex 서버/.test(m.reason)) {this.stop('엔진 오류로 건물 회의를 중지했습니다. '+m.reason,'error');return;}
        this.pump(run);
      }).catch(e=>{
        if(this.current===run && run.state==='running') this.stop(String(e),'error');
      });
    }
    if(!this.active.size) {
      const errors=run.teams.filter(t=>t.reports.at(-1)?.state==='error').length;
      run.state='done';run.reason=errors?'건물 회의 종료 · 응답 오류 '+errors+'팀':'배정한 회의를 모두 마쳤습니다.';this.save(run);
    }
  }
  stop(reason='사용자가 건물 회의를 중지했습니다.',state:'stopped'|'error'='stopped') {
    const run=this.current;
    if(!run || !this.busy) return;
    run.state=state;run.reason=reason;
    for(const [id,m] of this.active) {
      if(m.state==='active') this.cancel(m);
      run.teams[id-1].reports.at(-1)!.state=m.state;
    }
    this.active.clear();this.save(run);
  }
}
