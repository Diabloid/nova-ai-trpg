import React, { type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type ButtonVariant = 'primary' | 'danger' | 'emerald' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

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
    primary:
      'bg-[#7E0018] enabled:hover:bg-[#9E0020] text-white border border-[#9E0020]/40 shadow-sm',
    danger: 'bg-[#EF4444] enabled:hover:bg-[#DC2626] text-white shadow-sm',
    emerald: 'bg-[#10B981] enabled:hover:bg-[#059669] text-white shadow-sm',
    secondary:
      'bg-[#1C1C1C] enabled:hover:bg-[#282828] text-[#E5E7EB] border border-[#2A2A2A]',
    ghost:
      'bg-transparent enabled:hover:bg-white/10 text-[#9CA3AF] enabled:hover:text-[#E5E7EB]',
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
