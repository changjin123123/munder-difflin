export type Venue = 'bithumb' | 'bingx';
export interface PaperStatus {
  venues: {venue: Venue; state: string; mode: string; all_markets: boolean; profile: string; error: string | null}[];
}
export interface Markets {
  total: number; offset: number; sources: Record<string,string>;
  items: {venue: Venue; symbol: string; name: string; price: number | null; currency: string;
    change_pct: number | null; turnover_24h: number | null; quoted_at: string | null; paper_eligible: boolean}[];
}
export interface Headlines {
  sources: Record<string,string>;
  items: {source: string; title: string; url: string; published_at: string}[];
}
export interface PaperResults {
  venues: {venue: Venue; currency: string; has_record: boolean; cash?: number; realized?: number;
    positions?: number; closed_trades?: number}[];
}
export interface TreasureData {
  status: PaperStatus; markets: Markets; news: Headlines; 'paper/results': PaperResults;
  'paper/start': PaperStatus; 'paper/stop': PaperStatus;
}
export type TreasurePath = keyof TreasureData;
export type MarketQuery = {venue?: string; q?: string; limit?: string; offset?: string};
