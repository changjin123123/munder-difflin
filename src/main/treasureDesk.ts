import { app, ipcMain, type WebContents } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';
import { TradingRoom, type RoomWorkers } from './tradingRoom';
import type { Venue } from '../shared/treasure';
import type { Engine } from '../shared/tradingRoom';

const assets = join(process.resourcesPath, 'treasure');
const python = join(assets, 'python', 'python.exe');
const host = join(assets, 'bot', 'office_host.py');
export const treasureEdition = process.platform === 'win32' && existsSync(host) && existsSync(python);
const routes = new Set(['status','markets','news','paper/results','paper/start','paper/stop']);
type Waiter = { finish: (value: unknown) => void; fail: (error: Error) => void };

function dataHome(): string {
  const settings = join(app.getPath('userData'), 'treasure-location.json');
  if (existsSync(settings)) {
    const { directory } = JSON.parse(readFileSync(settings, 'utf8'));
    if (typeof directory !== 'string' || !isAbsolute(directory) || !existsSync(join(directory,'config.json'))) {
      throw new Error('설정한 보물공방 데이터 폴더를 확인하세요.');
    }
    return directory;
  }
  return join(app.getPath('userData'), 'treasure-engine');
}

export function registerTreasureDesk(allowed: () => WebContents | null, workers:RoomWorkers): void {
  let engine: ChildProcessWithoutNullStreams | undefined;
  let nextId = 0;
  const pending = new Map<number, Waiter>();
  function getEngine(): ChildProcessWithoutNullStreams {
    if (engine) return engine;
    const child = spawn(python, ['-E','-s','-B','-X','utf8', host, dataHome()], {
      shell: false, windowsHide: true, cwd: join(assets,'bot'), stdio: 'pipe'
    });
    engine = child;
    const failed = () => {
      if (engine !== child) return;
      engine = undefined;
      for (const waiter of pending.values()) waiter.fail(new Error('엔진 연결이 종료됐습니다. 다시 조회하세요.'));
      pending.clear();
    };
    child.once('error', failed);
    child.once('exit', failed);
    child.stdin.on('error', failed);
    child.stderr.resume();
    createInterface({ input: child.stdout }).on('line', line => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.status >= 200 && msg.status < 300) waiter.finish(msg.data);
      else waiter.fail(new Error(msg.data?.error || '엔진 요청에 실패했습니다.'));
    });
    return child;
  }
  ipcMain.handle('treasure:available', () => treasureEdition);
  ipcMain.handle('treasure:request', async (event, path: string, params = {}) => {
    if (!treasureEdition || event.sender !== allowed() || event.senderFrame !== event.sender.mainFrame ||
        !routes.has(path) || !params || typeof params !== 'object' || Array.isArray(params) ||
        !Object.entries(params).every(([k,v]) => path === 'markets' && ['venue','q','limit','offset'].includes(k)
          && typeof v === 'string' && v.length <= 128)) throw new Error('허용되지 않은 요청입니다.');
    return request(path,params);
  });
  let roomReads=0;
  const readQueue:(()=>void)[]=[];
  const quoteQueue:(()=>void)[]=[];
  function request(path:string,params:object,active?:()=>boolean):Promise<unknown> {
    if(!path.startsWith('room/'))return requestNow(path,params);
    return new Promise((resolve,reject)=>{
      const start=()=>{
        roomReads++;
        Promise.resolve().then(()=>{
          if(active && !active())throw new Error('회의가 중지됐습니다.');
          return requestNow(path,params);
        }).then(resolve,reject).finally(()=>{roomReads--;const next=quoteQueue.shift()??readQueue.shift();next?.();});
      };
      if(roomReads<3)start();else if(path==='room/evidence')readQueue.push(start);else quoteQueue.push(start);
    });
  }
  function requestNow(path:string,params:object):Promise<unknown> {
    if (pending.size >= 24) throw new Error('조회 대기 중입니다. 잠시 후 다시 시도하세요.');
    const child = getEngine();
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('응답 대기 시간이 지났습니다. 현재 상태를 다시 조회하세요.'));
      }, path.startsWith('room/')?55000:18000);
      pending.set(id, {
        finish: value => { clearTimeout(timer); resolve(value); },
        fail: error => { clearTimeout(timer); reject(error); }
      });
      child.stdin.write(JSON.stringify({id,path,params}) + '\n');
    });
  }
  const room=treasureEdition ? new TradingRoom(join(app.getPath('userData'),'trading-room.sqlite'),request,workers):null;
  ipcMain.handle('treasure:meeting',async(event,action:string,args:Record<string,string>={})=>{
    if (!room || event.sender!==allowed() || event.senderFrame!==event.sender.mainFrame ||
        !args || typeof args!=='object' || Object.values(args).some(v=>typeof v!=='string'||v.length>100)) throw new Error('허용되지 않은 회의 요청입니다.');
    if(action==='leagueStart')room.startLeague(Number(args.hours),args.engine as Engine);
    else if(action==='leagueStop')room.stopLeague();
    else if (action==='buildingPrepare') room.prepareBuilding();
    else if (action==='buildingStart') room.startBuilding(args.engine as Engine,Number(args.parallel),Number(args.perTeam));
    else if (action==='buildingStop') room.stopBuilding();
    else if (action==='marketStart') room.startMarket(args.engine as Engine,Number(args.minutes),Number(args.limit));
    else if (action==='start') room.start(args.venue as Venue,args.symbol,args.engine as Engine);
    else if (action==='autoStart') room.startAuto(args.venue as Venue,args.symbol,args.engine as Engine,Number(args.minutes),Number(args.limit));
    else if (action==='autoStop') room.stopAuto();
    else if (action==='cancel') room.cancel();
    else if (action==='close') await room.closeTrade(args.id);
    else if (action!=='view') throw new Error('지원하지 않는 회의 명령입니다.');
    return room.view(action==='view'?args.id:undefined,args.team===undefined?undefined:Number(args.team),args.leagueId);
  });
  app.on('will-quit', () => {room?.stop();engine?.stdin.end();});
}
