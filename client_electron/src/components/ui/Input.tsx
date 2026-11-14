import React, { type InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, icon, disabled, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1">
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-[#9CA3AF]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={twMerge(
              clsx(
                'w-full bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3.5 py-2 border transition-all duration-150',
                'border-[#333333] hover:border-[#444444] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:hover:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                icon && 'pl-9',
                error && 'border-[#EF4444] hover:border-[#EF4444] focus:border-[#EF4444] focus:hover:border-[#EF4444] focus:ring-[#EF4444]',
                className
              )
            )}
            {...props}
          />
        </div>
        {error && <span className="text-xs text-[#EF4444]">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
