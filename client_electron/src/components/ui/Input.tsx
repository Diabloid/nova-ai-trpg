import React, {
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type FieldVariant = 'standard' | 'compact';

export const STANDARD_FIELD_CLASS =
  'bg-bg-panel text-text-primary rounded-lg border border-border-input hover:border-border-focus placeholder-text-placeholder focus:outline-none focus:border-accent-ruby focus:hover:border-accent-ruby focus:ring-1 focus:ring-accent-ruby transition-colors disabled:opacity-55 disabled:cursor-not-allowed';

export const COMPACT_FIELD_CLASS =
  'bg-bg-app text-text-primary rounded-md border border-border-compact hover:border-border-compact-hover placeholder-text-placeholder focus:outline-none focus:border-accent-ruby focus:hover:border-accent-ruby transition-colors disabled:opacity-55 disabled:cursor-not-allowed';

const ERROR_FIELD_CLASS =
  'border-danger hover:border-danger focus:border-danger focus:hover:border-danger focus:ring-danger';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: FieldVariant;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = 'standard', error, icon, disabled, ...props }, ref) => {
    const isCompact = variant === 'compact';
    const fieldElement = (
      <input
        ref={ref}
        disabled={disabled}
        className={twMerge(
          clsx(
            'w-full',
            isCompact
              ? `text-xs px-2 py-1 ${COMPACT_FIELD_CLASS}`
              : `text-sm px-3.5 py-2 ${STANDARD_FIELD_CLASS}`,
            icon && (isCompact ? 'pl-8' : 'pl-9'),
            error && ERROR_FIELD_CLASS,
            className
          )
        )}
        {...props}
      />
    );

    if (!icon && !error) {
      return fieldElement;
    }

    return (
      <div className="w-full flex flex-col gap-1">
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-text-muted">
              {icon}
            </div>
          )}
          {fieldElement}
        </div>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: FieldVariant;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = 'standard', error, disabled, ...props }, ref) => {
    const isCompact = variant === 'compact';
    const fieldElement = (
      <textarea
        ref={ref}
        disabled={disabled}
        className={twMerge(
          clsx(
            'w-full text-xs leading-relaxed',
            isCompact
              ? `p-2.5 ${COMPACT_FIELD_CLASS}`
              : `px-3 py-2.5 ${STANDARD_FIELD_CLASS}`,
            error && ERROR_FIELD_CLASS,
            className
          )
        )}
        {...props}
      />
    );

    if (!error) {
      return fieldElement;
    }

    return (
      <div className="w-full flex flex-col gap-1">
        {fieldElement}
        <span className="text-xs text-danger">{error}</span>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
