export type AdjustmentCategory = 'plansAndEngineering' | 'layout' | 'permit' | 'excavation' | 'plumbing' | 'gas' | 'steel' | 'electrical' | 'shotcrete' | 'tile' | 'copingDecking' | 'stoneRockwork' | 'drainage' | 'equipmentOrdered' | 'equipmentSet' | 'waterFeatures' | 'cleanup' | 'interiorFinish' | 'waterTruck' | 'fiberglassShell' | 'fiberglassInstall' | 'startupOrientation' | 'customFeatures';
export type ConditionOperator = 'active' | 'equals' | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
export interface AdjustmentCondition {
  targetId: string;
  operator: ConditionOperator;
  value?: string | number;
}
export interface CategoryAdjustment {
  id: string;
  title: string;
  amount: number;
  category: AdjustmentCategory | '';
  basis: 'cogs' | 'retail';
  mode: 'static' | 'conditional';
  condition?: AdjustmentCondition;
}
