import type { Engine, Fill, Meeting } from './tradingRoom';
import type { Venue } from './treasure';

export const leagueHours=[1,6,24] as const;
export const groupCapital:Record<Venue,number>={bithumb:200000,bingx:200};
export const groupLabel=(group:number)=>(group*2-1)+'·'+group*2+'층';
export interface LeagueRule {version:number; stakePct:number; minRR:number; minTakePct:number}
export const initialRule:LeagueRule={version:1,stakePct:10,minRR:1,minTakePct:0};
export interface LeagueSeat {
  group:number;team:number;rule:LeagueRule;state:'waiting'|'debating'|'hold'|'open'|'closed'|'error';
  meetingId?:string;venue?:Venue;symbol?:string;note:string;fill?:Fill;lastQuoteAt?:number;
  review?:{finding:string;decision:string;lesson:string;next:LeagueRule};score?:number;rank?:number;
}
export interface LeagueRound {
  id:string;number:number;start:number;end:number;finishedAt?:number;phase:'debating'|'observing'|'reviewing'|'finished'|'void';
  note:string;seats:LeagueSeat[];
}
export interface LeagueSettings {enabled:boolean;hours:number;engine:Engine;nextAt:number|null}
export interface LeagueView {settings:LeagueSettings;round:LeagueRound|null;history:{id:string;number:number;start:number;phase:LeagueRound['phase']}[]}
export type LeagueTag={roundId:string;group:number;rule:LeagueRule};
export type LeagueMeeting=Meeting & {league:LeagueTag};
