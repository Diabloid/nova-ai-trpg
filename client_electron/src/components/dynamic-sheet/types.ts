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
  fieldLabels?: Record<string, string>;
  onChange?: (nextValue: TValue) => void;
  onFieldLabelChange?: (rawKey: string, nextLabel: string) => void;
  onTranslateKeys?: (keys: string[]) => void;
}
