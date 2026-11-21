import React, { type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type ButtonVariant = 'primary' | 'danger' | 'emerald' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const RUBY_BUTTON_SURFACE_CLASS =
  'bg-gradient-to-b from-ruby-grad-from to-ruby-grad-to enabled:hover:from-ruby-grad-hover-from enabled:hover:to-ruby-grad-hover-to border border-accent-ruby enabled:hover:border-accent-ruby-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_10px_rgba(126,0,24,0.22)]';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'secondary',
  size = 'md',
  disabled,
  isLoading,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default select-none enabled:active:scale-[0.98]';

  const variantStyles: Record<ButtonVariant, string> = {
    primary: RUBY_BUTTON_SURFACE_CLASS,
    danger: 'bg-danger enabled:hover:bg-danger-hover text-white border border-transparent shadow-sm',
    emerald: 'bg-success enabled:hover:bg-success-hover text-white border border-success-light/30 shadow-sm',
    secondary:
      'bg-bg-surface enabled:hover:bg-bg-hover-strong text-text-primary border border-border-strong',
    ghost:
      'bg-transparent enabled:hover:bg-white/10 text-text-muted enabled:hover:text-text-primary border border-transparent',
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3.5 py-1.5 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, variantStyles[variant], sizeStyles[size], className))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
};
