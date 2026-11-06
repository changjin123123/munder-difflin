import type { Venue } from './treasure';
export const seats = [
  ['technical','기술 분석','jim','EMA·RSI·MACD·볼린저 밴드와 확정봉을 해석한다.'],
  ['fundamental','펀더멘털','oscar','프로젝트 식별자, 시가총액과 공급량의 한계까지 분석한다.'],
  ['news','뉴스 분석','kelly','기사 발행 시각과 출처를 확인하고 같은 사건의 후속·중복 보도를 묶는다. 종목 직접 보도와 거시 배경을 구분한다.'],
  ['sentiment','시장 심리','pam','시장 전체 심리와 해당 코인의 움직임을 구분한다.'],
  ['bull','강세 연구원','andy','상승 가설과 그 가설이 깨지는 조건을 제시한다. 반론 단계에서는 약세 측 논거를 직접 반박한다.'],
  ['bear','약세 연구원','dwight','강세 측 근거를 인용해 반박하고 하락 가설이 틀릴 조건을 제시한다.'],
  ['chair','토론 의장','stanley','양측의 가장 강한 근거를 비교하고 LONG, SHORT 또는 HOLD 방향을 정한다.'],
  ['growth','공격적 심사','ryan','기회 대비 변동성·비용을 심사하고 PASS 또는 VETO를 낸다.'],
  ['defense','보수적 심사','angela','하방 위험, 손실 한도, 자료 누락·노후를 심사해 PASS 또는 VETO를 낸다.'],
  ['neutral','중립 심사','toby','양방향 위험, 유동성, 1배 모의 증거금과 청산 가정을 검토해 PASS 또는 VETO를 낸다.'],
  ['trader','트레이더','phyllis','방향을 선택하고 진입 예상가, 손절률·익절률을 제안한다. 보류 가능.'],
  ['audit','근거 검증','kevin','시각·자료 출처·반론·심사·주문 계획을 대조해 PASS 또는 VETO를 낸다.'],
  ['manager','최종 매니저','michael','모든 기록을 검토하고 최종 LONG, SHORT, HOLD 중 하나로 결론짓는다.']
] as const;
export type Role = typeof seats[number][0];
export type Engine = 'claude' | 'codex';
export type Step = Role | 'reply';
export const rounds: Step[][] = [
  ['technical','fundamental','news','sentiment'],['bull'],['bear'],['reply'],['chair'],
  ['growth','defense','neutral'],['trader'],['audit'],['manager']
];
export const roleFor = (step: Step): Role => step==='reply' ? 'bull' : step;
export const castNames: Record<Role,string> = {
  technical:'짐', fundamental:'오스카', news:'켈리', sentiment:'팸', bull:'앤디', bear:'드와이트',
  chair:'스탠리', growth:'라이언', defense:'앤절라', neutral:'토비', trader:'필리스', audit:'케빈', manager:'마이클'
};
export interface NewsItem { id:string; source:string; publishedAt:number; title:string; url:string; summary:string; scope:'asset'|'market' }
export interface NewsEvent { summary:string; newsRefs:string[] }
export const newsDebaters = ['bull','bear','reply','chair','audit','manager'] as const;
export function citesNews(step:Step) { return newsDebaters.some(s=>s===step); }
export interface Answer { verdict: string; note: string; line?: string; replyTo?: Step; stopPct?: number; takePct?: number; newsEvents?:NewsEvent[]; newsRefs?:string[] }
export interface Quote { bid: number; ask: number; at: number; until: number }
export interface Evidence { venue: Venue; symbol: string; captured: number; quote: Quote;
  sources: Record<string,unknown>; missing: string[]; news?:NewsItem[] }
export interface Meeting {
  id: string; venue: Venue; symbol: string; engine: Engine; created: number;
  state: 'active'|'approved'|'hold'|'error'|'cancelled'; reason: string;
  evidence?: Evidence; speaking: Step[]; answers: Partial<Record<Step,Answer>>;
  sessionId?:string; finishedAt?:number;
}
export const repeatMinutes = [5,15,30,60] as const;
export const repeatLimits = [2,3,4,6] as const;
export interface PaperSession {
  id:string; venue:Venue; symbol:string; engine:Engine; minutes:number; limit:number;
  created:number; state:'running'|'waiting'|'done'|'stopped'|'error'; nextAt:number|null;
  reason:string; meetings:string[]; approved:number; held:number;
}
export interface Fill { id: string; venue: Venue; symbol: string; side: 'LONG'|'SHORT';
  entry: number; qty: number; stop: number; take: number; opened: number; exit: number|null;
  pnl: number|null; closed: number|null; reason: string|null }
export interface RoomView {
  current: Meeting|null; history: {id:string;symbol:string;state:string;created:number}[];
  trades: Fill[]; totals: {venue:Venue; cash:number; pnl:number; open:number}[];
  engines: Engine[]; officeReady: boolean; priceNotice: string; session:PaperSession|null;
}
