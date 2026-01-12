export interface TowerCardData {
  type: 'harvest' | 'growing' | 'attention' | 'empty' | 'spray' | 'inventory' | 'batch' | 'sowing' | 'tasks' | 'customers' | 'orders' | 'recipes';
  title: string;
  count: number;
  emoji?: string;
  description?: string;
  items: Array<{
    name: string;
    ports?: number;
    details?: string;
  }>;
}

export interface ChatServiceResponse {
  message: string;
  reportHtml?: string;
  cards?: TowerCardData[];
}








