import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sprite, Texture } from 'pixi.js';
import { TiledMapRenderer, type Point } from '@/scene/office/TiledMapRenderer';
import { OFFICE_THEME } from '@/scene/office/themeRegistry';
import { resolveThemeMap, themeTilesetUrls } from '@/scene/office/themeLoader';
import { findPath } from '@/scene/office/pathfinding';
import { sceneFrameBufs, SCENE_H, SCENE_W } from '@/scene/office/portraitArt';
import { seats, castNames, roleFor, type Role, type Step } from '../../../shared/tradingRoom';

const desk: Record<Role,string> = {
  manager:'desk-ceo', technical:'pc-1', fundamental:'pc-2', news:'pc-3', sentiment:'pc-4',
  bull:'pc-5', bear:'pc-6', chair:'desk-agent-organizer', growth:'desk-team-lead',
  defense:'desk-backend-engineer', neutral:'desk-product-manager', trader:'desk-data-engineer',audit:'desk-project-manager'
};

type Floor = {map:TiledMapRenderer; image:HTMLCanvasElement};
let floorPromise: Promise<Floor> | undefined;

// Render the same Tiled layers as the main office once. The static canvas also
// works on PCs where Electron cannot allocate a second WebGL surface.
function loadFloor() {
  if (floorPromise) return floorPromise;
  floorPromise=Promise.all(themeTilesetUrls(OFFICE_THEME).map(async url=>{
    const image=new Image();
    image.src=url;
    await image.decode();
    return Texture.from(image);
  })).then(textures=>{
    const map=new TiledMapRenderer(resolveThemeMap(OFFICE_THEME),textures);
    const image=document.createElement('canvas');
    image.width=map.width*map.tileSize; image.height=map.height*map.tileSize;
    const ctx=image.getContext('2d')!;
    ctx.imageSmoothingEnabled=false;
    for (const layer of map.getContainer().children) {
      for (const tile of layer.children) {
        if (!(tile instanceof Sprite)) continue;
        const frame=tile.texture.frame;
        ctx.save();
        ctx.translate(tile.x,tile.y); ctx.rotate(tile.rotation); ctx.scale(tile.scale.x,tile.scale.y);
        ctx.drawImage(tile.texture.source.resource as HTMLImageElement,frame.x,frame.y,frame.width,frame.height,
          -tile.anchor.x*frame.width,-tile.anchor.y*frame.height,frame.width,frame.height);
        ctx.restore();
      }
    }
    return {map,image};
  }).catch(err=>{floorPromise=undefined;throw err;});
  return floorPromise;
}

const tableSpots: Partial<Record<Role,Point>> = {bull:{x:9,y:5},bear:{x:17,y:5},chair:{x:14,y:7},manager:{x:13,y:7}};
type Seat = typeof seats[number];
type ActorProps = {
  seat:Seat; floor:Floor; meetingTable:boolean; working:boolean; listening:boolean;
  line?:string; onSelect:()=>void
};

function Actor({seat,floor,meetingTable,working,listening,line,onSelect}:ActorProps) {
  const [role,title,character]=seat;
  const el=useRef<HTMLButtonElement>(null), sprite=useRef<HTMLCanvasElement>(null);
  const home=floor.map.getSpawnPoint(desk[role])!;
  const goal=(meetingTable && tableSpots[role]) || home;
  const position=useRef<Point>({...home});
  const facing=useRef(false);
  facing.current=!!line || !!listening;
  const draw=useRef<(frame:number,back:boolean,seated:boolean)=>void>(()=>{});

  useLayoutEffect(()=>{
    const ctx=sprite.current?.getContext('2d');
    if (!ctx) return;
    const frames=sceneFrameBufs(character);
    const materialize=(buf:Uint8ClampedArray)=>{
      const data=ctx.createImageData(SCENE_W,SCENE_H);
      data.data.set(buf);return data;
    };
    const front=frames.front.map(materialize), back=frames.back.map(materialize);
    draw.current=(i,up,seated)=>{
      ctx.clearRect(0,0,SCENE_W,SCENE_H);
      ctx.putImageData((up?back:front)[i],0,0,0,0,SCENE_W,SCENE_H-(seated?6:0));
    };
  },[character]);

  useLayoutEffect(()=>{
    const button=el.current!;
    const {map}=floor;
    const standing=meetingTable && !!tableSpots[role];
    const place=(p:Point)=>{
      position.current=p;
      button.style.left=((p.x+.5)/map.width*100)+'%';
      button.style.top=((p.y+1.15)/map.height*100)+'%';
      button.dataset.edge=p.x<6?'left':p.x>map.width-7?'right':'middle';
    };
    const settle=()=>{
      place(goal); button.dataset.walk='false';
      draw.current(0,!facing.current && role!=='manager' && !standing,!standing);
    };
    const start=position.current;
    const path=findPath(map,{x:Math.round(start.x),y:Math.round(start.y)},goal);
    if (!path?.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {settle();return;}
    let handle=0;
    const points=[start,...path], begin=performance.now(), beat=155;
    button.dataset.walk='true';
    const tick=(now:number)=>{
      // A callback can receive this frame's timestamp from before the React layout effect.
      const t=Math.max(0,(now-begin)/beat), i=Math.min(Math.floor(t),points.length-2);
      if (t>=path.length) {settle();return;}
      const from=points[i],to=points[i+1],fraction=t-i;
      place({x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction});
      draw.current(1+Math.floor(t*1.5)%2,to.y<from.y,false);
      handle=requestAnimationFrame(tick);
    };
    handle=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(handle);
  },[floor,goal.x,goal.y,meetingTable,role]);
  useLayoutEffect(()=>{
    if (el.current?.dataset.walk==='true') return;
    const standing=meetingTable && !!tableSpots[role];
    draw.current(0,!line && !listening && role!=='manager' && !standing,!standing);
  },[line,listening,meetingTable,role]);

  return <button type="button" ref={el} className="tf-person" data-talking={!!line} data-working={working}
    data-listening={listening} onClick={onSelect} aria-label={castNames[role]+' · '+title}>
    <canvas ref={sprite} width={SCENE_W} height={SCENE_H} aria-hidden="true"/>
    <span className="tf-name">{character[0].toUpperCase()+character.slice(1)}</span>
    {line && <span className="tf-balloon" aria-hidden="true">{line}</span>}
    {working && !line && <span className="tf-thinking" aria-hidden="true">•••</span>}
  </button>;
}

export function TradingOfficeMap({step,recipient,line,working,onSelect}:{
  step?:Step;recipient?:Step;line?:string;working:Step[];onSelect:(r:Role)=>void
}) {
  const [floor,setFloor]=useState<Floor>(), [failed,setFailed]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    let alive=true;loadFloor().then(value=>{if(alive)setFloor(value);},()=>{if(alive)setFailed(true);});
    return ()=>{alive=false;};
  },[]);
  useLayoutEffect(()=>{if(floor)canvas.current?.getContext('2d')?.drawImage(floor.image,0,0);},[floor]);
  const debate=!!step && ['bull','bear','reply','chair'].includes(step);
  const final=!!step && ['trader','audit','manager'].includes(step);
  return <div className="tf-map" role="group" aria-label="먼더 디플린 픽셀 사무실">
    {floor ? <>
      <canvas className="tf-map-art" ref={canvas} width={floor.image.width} height={floor.image.height} aria-hidden="true"/>
      {seats.map(seat=><Actor key={seat[0]} seat={seat} floor={floor}
        meetingTable={debate?['bull','bear','chair'].includes(seat[0]):final && seat[0]==='manager'}
        working={working.some(s=>roleFor(s)===seat[0])} listening={!!recipient && roleFor(recipient)===seat[0]}
        line={step && roleFor(step)===seat[0]?line:undefined} onSelect={()=>onSelect(seat[0])}/>)}
    </> : <p>{failed?'사무실 지도를 열 수 없습니다. 발언은 옆의 대화에서 볼 수 있습니다.':'사무실을 여는 중…'}</p>}
  </div>;
}
