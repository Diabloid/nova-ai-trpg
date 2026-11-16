export type DynamicSectionMode = 'read' | 'edit';
export type DynamicSectionVariant = 'column' | 'compact';

export interface DynamicSectionProps<TValue = any> {
  title: string;
  icon?: string;
  color?: string;
  value: TValue;
  mode: DynamicSectionMode;
  variant?: DynamicSectionVariant;
  emptyText?: string;
  onChange?: (nextValue: TValue) => void;
}
