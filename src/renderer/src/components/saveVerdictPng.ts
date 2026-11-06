interface VerdictImage {
  symbol:string; id:string; venueSymbol:string; time:string; direction:string; status:string;
  confidence?:number; confidenceLabel:string; reason:string; statement?:string; prices:string[][]; counts:string;
}

export async function saveVerdictPng(card:VerdictImage) {
  const canvas=document.createElement('canvas');
  canvas.width=900;
  const ctx=canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const font='22px "Malgun Gothic", sans-serif';
  ctx.font=font;
  // Wrap Hangul and long unbroken symbols using the same font as the export.
  function wrap(value:string):string[] {
    const rows:string[]=[];
    let line='';
    for (const c of value) {
      if (c==='\n' || (line && ctx!.measureText(line+c).width>800)) {
        rows.push(line.trimEnd());line='';
      }
      if(c!=='\n') line+=c;
    }
    if(line) rows.push(line.trimEnd());
    return rows;
  }
  const comments=wrap(card.reason);
  if (card.statement) comments.push('',...wrap('마이클 · '+card.statement));
  const lines=[...comments,'',card.counts,...card.prices.map(([label,value])=>label+'   '+value)];
  canvas.height=302+lines.length*34;
  const accent=card.direction==='LONG'?'#70dda6':card.direction==='SHORT'?'#ffa09e':'#efc276';
  ctx.fillStyle='#181a22';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=accent;ctx.fillRect(0,0,900,6);
  ctx.font='bold 24px "Malgun Gothic", sans-serif';ctx.fillText('최종 판정   /   '+card.venueSymbol,40,54);
  ctx.fillStyle='#c5c3ca';ctx.font='18px "Malgun Gothic", sans-serif';ctx.fillText(card.time+'   ·   회의 전용 모의 장부',40,89);
  ctx.fillStyle=accent;ctx.font='bold 62px monospace';ctx.fillText(card.direction,40,159);
  ctx.font='bold 24px "Malgun Gothic", sans-serif';ctx.fillText(card.status,40,197);
  ctx.fillStyle='#d3d0c8';ctx.font=font;ctx.fillText(card.confidenceLabel+'   '+(card.confidence===undefined?'미기록':card.confidence+'%'),40,240);
  if(card.confidence!==undefined){
    ctx.fillStyle='#34353c';ctx.fillRect(40,252,810,7);
    ctx.fillStyle=accent;ctx.fillRect(40,252,810*card.confidence/100,7);
  }
  ctx.fillStyle='#e2dfd8';lines.forEach((line,i)=>ctx.fillText(line,40,289+i*34));
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG unavailable')),'image/png'));
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url;link.download='최종판정-'+card.symbol+'-'+card.id+'.png';
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
