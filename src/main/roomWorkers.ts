import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { basename, isAbsolute, join } from 'node:path';
import { citesNews, roleFor, seats, type Engine, type Step } from '../shared/tradingRoom';
import { choices, type RoomWorkers } from './tradingRoom';

interface Job {run:string; step:Step; engine:Engine; objective:string; queued:boolean; child?:ChildProcess;
  resolve:(s:string)=>void; reject:(e:Error)=>void; timer:ReturnType<typeof setTimeout>}

export class RoomWorkerPool implements RoomWorkers {
  private jobs=new Map<string,Job>();
  private detected:Engine[]=[];
  private checked=0;
  constructor(private root:()=>string|null, private locate:(s:string)=>string|null, private kill:(id:string)=>void) {}
  private codexPath(): string|null {
    const found=this.locate('codex');
    if (found && isAbsolute(found) && basename(found).toLowerCase()==='codex.exe') return found;
    const local=process.env.LOCALAPPDATA;
    if (!local) return null;
    const dir=join(local,'OpenAI','Codex','bin');
    try {
      return readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory() && /^[a-f0-9]+$/i.test(d.name))
        .map(d=>join(dir,d.name,'codex.exe')).filter(p=>existsSync(p))
        .sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs)[0]??null;
    } catch { return null; }
  }
  batchCount() { return [...this.jobs.values()].filter(j=>j.child).length; }
  ready() {return !!this.root();}
  engines() {
    if (Date.now()-this.checked>30000) {
      this.detected=(['claude','codex'] as Engine[]).filter(v=>v==='codex'?this.codexPath():this.locate(v));this.checked=Date.now();
    }
    return this.detected;
  }
  ask(run:string,step:Step,engine:Engine,objective:string) {
    const id='room-'+run+'-'+step;
    return new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.jobs.get(id)?.child?.kill();this.end(id,undefined,'응답 시간 초과 · 에이전트 로그인을 확인하세요.');this.kill('worker-'+id);},12*60000);
      this.jobs.set(id,{run,step,engine,objective,queued:true,resolve,reject,timer});
    });
  }
  end(id:string,body?:string,error='작업자가 결과를 보내기 전에 종료됐습니다.') {
    const job=this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);clearTimeout(job.timer);
    if (body) job.resolve(body); else job.reject(new Error(error));
  }
  cancel(run:string) {
    for (const [id,j] of this.jobs) if (j.run===run) {
      j.child?.kill();this.end(id,undefined,'회의가 중지됐습니다.');if(!j.queued && !j.child)this.kill('worker-'+id);
    }
  }
  private startCodex(cwd:string,id:string,job:Job) {
    const exe=this.codexPath();
    if (!exe) throw new Error('Codex 실행 파일이 없습니다.');
    const schema=join(cwd,'schema.json'), output=join(cwd,'answer.json');
    const properties:Record<string,object>={verdict:{type:'string',enum:choices(job.step)},note:{type:'string'},
      line:{type:'string'},replyTo:{type:['string','null']}};
    const newsRefs={type:'array',items:{type:'string'}};
    if (citesNews(job.step)) properties.newsRefs=newsRefs;
    if (job.step==='news') properties.newsEvents={type:'array',items:{type:'object',
      properties:{summary:{type:'string'},newsRefs},required:['summary','newsRefs'],additionalProperties:false}};
    if (job.step==='trader') {
      properties.stopPct={type:['number','null']};
      properties.takePct={type:['number','null']};
    }
    writeFileSync(schema,JSON.stringify({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),{flag:'wx'});
    const args=['exec','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--ignore-user-config',
      '--disable','shell_tool','--disable','multi_agent','--disable','apps','--disable','plugins','--disable','computer_use',
      '-c','web_search="disabled"','-c','model_reasoning_effort="low"','--output-schema',schema,'-o',output,'-'];
    const child=spawn(exe,args,{cwd,windowsHide:true,shell:false,stdio:'pipe'});
    job.child=child;
    child.stdout.resume();
    let failure='';
    child.stderr.on('data',chunk=>{
      const msg=chunk.toString();
      if (/usage limit|rate.limit|quota|429 too many/i.test(msg)) failure='Codex 사용 한도에 도달했습니다.';
      else if (/unauthorized|authentication required|not logged in|401 unauthorized/i.test(msg)) failure='Codex 로그인을 확인하세요.';
      else if (/failed to connect|network is unreachable|connection refused/i.test(msg)) failure='Codex 서버 연결을 확인하세요.';
    });
    child.stdin.on('error',()=>{ /* close reports failure */ });
    child.once('error',()=>this.end(id,undefined,'Codex 작업자를 시작할 수 없습니다.'));
    child.once('close',code=>{
      if (!this.jobs.has(id)) return;
      if (code===0 && existsSync(output) && statSync(output).size<=16000) {
        return this.end(id,readFileSync(output,'utf8'));
      }
      this.end(id,undefined,failure||'Codex가 응답을 완료하지 못했습니다 (종료 '+code+').');
    });
    child.stdin.end(job.objective);
  }
  async pump(hasSlot:()=>boolean,spawn:(file:string,id:string)=>Promise<void>) {
    const root=this.root();
    if (!root) return;
    for (const [id,job] of this.jobs) {
      if (!hasSlot()) break;
      if (!job.queued) continue;
      job.queued=false;
      try {
        const dir=join(root,'spawn-requests','.trading-room');
        const cwd=join(root,'trading-room','work',job.run,job.step);
        mkdirSync(cwd,{recursive:true});
        if (job.engine==='codex') {this.startCodex(cwd,id,job);continue;}
        mkdirSync(dir,{recursive:true});
        const seat=seats.find(s=>s[0]===roleFor(job.step))!;
        const file=join(dir,id+'.json');
        writeFileSync(file,JSON.stringify({id,objective:job.objective,cwd,name:seat[1],character:seat[2],
          provider:job.engine,isolate:false}),{flag:'wx'});
        await spawn(file,id);
        if (!this.jobs.has(id)) this.kill('worker-'+id);
      } catch {this.end(id,undefined,'회의 작업자를 시작할 수 없습니다.');}
    }
  }
}
