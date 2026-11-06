export interface FloorRule {floor:number;team:number;closed:number;lastClose:number;minRR:number;maxStop:number;idea:string}
export interface TrainingTag {trial?:string;arm:'trial'|'control'|'adopted';rule?:FloorRule}
export interface Trial {id:string;rule:FloorRule;created:number}
export interface FloorLearningView {
  floors:{floor:number;closed:number;result:number}[];
  trial?:Trial;adopted?:FloorRule;
  last?:{rule:FloorRule;at:number;adopted:boolean;trained:number;control:number;trainedTrades:number;controlTrades:number};
}
