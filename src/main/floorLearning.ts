import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import type {FloorRule,FloorLearningView,TrainingTag} from '../shared/floorLearning';
import type {Venue} from '../shared/treasure';

type Closed={team:number;venue:Venue;pnl:number;closed:number;stopPct:number;takePct:number;idea:string};
type Policy=Omit<FloorLearningView,'floors'>;
const floorOf=(team:number)=>Math.ceil(team/4);
const contribution=(r:Pick<Closed,'venue'|'pnl'>)=>50*r.pnl/(r.venue==='bithumb'?100000:100);
function median(values:number[]) {
  const s=[...values].sort((a,b)=>a-b),i=Math.floor(s.length/2);
  return (s[i]+s[Math.floor((s.length-1)/2)])/2;
}
export class FloorLearning {
  private policy:Policy={};
  private cached?:{at:number;rows:Closed[];floors:FloorLearningView['floors']};
  constructor(private db:Database.Database) {
    db.exec('CREATE TABLE IF NOT EXISTS floor_learning(id INTEGER PRIMARY KEY,body TEXT NOT NULL)');
    const row=db.prepare('SELECT body FROM floor_learning WHERE id=1').get() as {body:string}|undefined;
    if(row)this.policy=JSON.parse(row.body);
  }
  private records(refresh=false) {
    const at=Date.now();
    if(!refresh && this.cached && at-this.cached.at<15000)return this.cached;
    const rows=this.db.prepare(`SELECT json_extract(m.body,'$.team') team,t.venue,t.pnl,t.closed,
      json_extract(m.body,'$.answers.trader.stopPct') stopPct,json_extract(m.body,'$.answers.trader.takePct') takePct,
      json_extract(m.body,'$.answers.trader.note') idea FROM trades t JOIN meetings m ON m.id=t.id
      WHERE t.closed>=? AND json_extract(m.body,'$.buildingId') IS NOT NULL ORDER BY t.closed DESC`).all(at-30*86400000) as Closed[];
    const floors=Array.from({length:10},(_,i)=>({floor:i+1,closed:0,result:0}));
    for(const row of rows){const floor=floors[floorOf(row.team)-1];if(floor){floor.closed++;floor.result+=contribution(row);}}
    floors.sort((a,b)=>b.result-a.result || a.floor-b.floor);
    return this.cached={at,rows,floors};
  }
  view():FloorLearningView{return {...this.policy,floors:this.records().floors};}
  private assess() {
    const trial=this.policy.trial;if(!trial)return;
    const rows=this.db.prepare(`SELECT json_extract(m.body,'$.training.arm') arm,t.closed,t.venue,t.pnl
      FROM meetings m LEFT JOIN trades t ON m.id=t.id WHERE json_extract(m.body,'$.training.trial')=?
      AND json_extract(m.body,'$.state') IN ('hold','approved')`).all(trial.id) as {arm:string;closed:number|null;venue:Venue|null;pnl:number|null}[];
    if(rows.some(r=>r.venue && r.closed===null))return;
    const stats=(arm:string)=>{
      const sample=rows.filter(r=>r.arm===arm),fills=sample.filter(r=>r.venue!==null);
      // Each arm owns two teams per recipient floor (18 teams total).
      return {decisions:sample.length,trades:fills.length,score:fills.reduce((n,r)=>n+contribution({venue:r.venue!,pnl:r.pnl!}),0)/4.5};
    };
    const a=stats('trial'),b=stats('control');
    if(Math.min(a.decisions,b.decisions)<3 || a.trades+b.trades<4)return;
    const adopt=a.score>0 && a.score>b.score;
    if(adopt)this.policy.adopted=trial.rule;
    this.policy.last={rule:trial.rule,at:Date.now(),adopted:adopt,trained:a.score,control:b.score,trainedTrades:a.trades,controlTrades:b.trades};
    delete this.policy.trial;
  }
  startCycle() {
    this.assess();
    if(!this.policy.trial){
      const {rows,floors}=this.records(true);
      for(const floor of floors.filter(f=>f.closed>=3 && f.result>0)){
        const byTeam=new Map<number,Closed[]>();
        for(const r of rows.filter(r=>floorOf(r.team)===floor.floor)){
          const group=byTeam.get(r.team)??[];group.push(r);byTeam.set(r.team,group);
        }
        const teams=[...byTeam.values()].filter(t=>t.length>=3 && t[0].closed>(this.policy.last?.at??0))
          .map(t=>({t,net:t.reduce((n,r)=>n+contribution(r),0)})).filter(x=>x.net>0).sort((a,b)=>b.net-a.net);
        const sample=teams[0]?.t;
        if(!sample)continue;
        const valid=sample.filter(r=>r.stopPct>=.3&&r.stopPct<=5&&r.takePct>=r.stopPct&&r.takePct<=15);
        if(valid.length<3)continue;
        const rule:FloorRule={team:sample[0].team,floor:floor.floor,closed:valid.length,lastClose:sample[0].closed,
          minRR:Math.min(3,Math.max(1,median(valid.map(r=>r.takePct/r.stopPct)))),
          maxStop:median(valid.map(r=>r.stopPct)),idea:(valid.find(r=>r.pnl>0)?.idea??'거래 계획의 손절폭과 손익비를 비교한다.').slice(0,500)};
        this.policy.trial={id:randomUUID(),created:Date.now(),rule};break;
      }
    }
    this.db.prepare('INSERT OR REPLACE INTO floor_learning VALUES(1,?)').run(JSON.stringify(this.policy));
  }
  tag(team:number):TrainingTag|undefined {
    const {trial,adopted}=this.policy;
    if(trial && floorOf(team)!==trial.rule.floor){
      const learner=(team%2)===(parseInt(trial.id[0],16)%2);
      return {trial:trial.id,arm:learner?'trial':'control',rule:learner?trial.rule:adopted};
    }
    return adopted?{arm:'adopted',rule:adopted}:undefined;
  }
}
