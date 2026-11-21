import React from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { getLucideIcon } from '../../utils/lucideIconMap';

interface DynamicLucideIconProps extends Omit<LucideProps, 'ref'> {
  icon?: string | null;
  fallback?: LucideIcon;
}

/**
 * Безпечний рендер Lucide-іконки за строковим ключем без динамічного створення JSX-типу в тілі рендеру.
 */
export const DynamicLucideIcon: React.FC<DynamicLucideIconProps> = ({
  icon,
  fallback,
  ...props
}) => {
  const IconComponent = getLucideIcon(icon, fallback);
  return React.createElement(IconComponent, props);
};
