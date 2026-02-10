import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot as SlotPrimitive } from 'radix-ui';

const badgeVariants = cva(
  'inline-flex items-center whitespace-nowrap justify-center border border-transparent font-medium focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:-ms-px [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        success:
          'bg-sem-success-accent text-sem-success-foreground',
        warning:
          'bg-sem-warning-accent text-sem-warning-foreground',
        info: 'bg-sem-info-accent text-sem-info-foreground',
        outline: 'bg-transparent border border-border text-secondary-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
      },
      appearance: {
        default: '',
        light: '',
        outline: '',
        ghost: 'border-transparent bg-transparent',
      },
      disabled: {
        true: 'opacity-50 pointer-events-none',
      },
      size: {
        lg: 'rounded-md px-[0.5rem] h-7 min-w-7 gap-1.5 text-xs [&_svg]:size-3.5',
        md: 'rounded-md px-[0.45rem] h-6 min-w-6 gap-1.5 text-xs [&_svg]:size-3.5 ',
        sm: 'rounded-sm px-[0.325rem] h-5 min-w-5 gap-1 text-[0.6875rem] leading-[0.75rem] [&_svg]:size-3',
        xs: 'rounded-sm px-[0.25rem] h-4 min-w-4 gap-1 text-[0.625rem] leading-[0.5rem] [&_svg]:size-3',
      },
      shape: {
        default: '',
        circle: 'rounded-full',
      },
    },
    compoundVariants: [
      {
        variant: 'primary',
        appearance: 'light',
        className:
          'text-sem-primary-accent bg-sem-primary-soft-50 dark:bg-sem-primary-soft-950 dark:text-sem-primary-soft-600',
      },
      {
        variant: 'secondary',
        appearance: 'light',
        className: 'bg-secondary dark:bg-secondary/50 text-secondary-foreground',
      },
      {
        variant: 'success',
        appearance: 'light',
        className:
          'text-sem-success-soft-800 bg-sem-success-soft-100 dark:bg-sem-success-soft-950 dark:text-sem-success-soft-600',
      },
      {
        variant: 'warning',
        appearance: 'light',
        className:
          'text-sem-warning-soft-700 bg-sem-warning-soft-100 dark:bg-sem-warning-soft-950 dark:text-sem-warning-soft-600',
      },
      {
        variant: 'info',
        appearance: 'light',
        className:
          'text-sem-info-soft-700 bg-sem-info-soft-100 dark:bg-sem-info-soft-950 dark:text-sem-info-soft-400',
      },
      {
        variant: 'destructive',
        appearance: 'light',
        className:
          'text-sem-destructive-accent bg-sem-destructive-soft-50 dark:bg-sem-destructive-soft-950 dark:text-sem-destructive-soft-600',
      },
      {
        variant: 'primary',
        appearance: 'outline',
        className:
          'text-sem-primary-accent border-sem-primary-soft-100 bg-sem-primary-soft-50 dark:bg-sem-primary-soft-950 dark:border-sem-primary-soft-900 dark:text-sem-primary-soft-600',
      },
      {
        variant: 'success',
        appearance: 'outline',
        className:
          'text-sem-success-soft-700 border-sem-success-soft-200 bg-sem-success-soft-50 dark:bg-sem-success-soft-950 dark:border-sem-success-soft-900 dark:text-sem-success-soft-600',
      },
      {
        variant: 'warning',
        appearance: 'outline',
        className:
          'text-sem-warning-soft-700 border-sem-warning-soft-200 bg-sem-warning-soft-50 dark:bg-sem-warning-soft-950 dark:border-sem-warning-soft-900 dark:text-sem-warning-soft-600',
      },
      {
        variant: 'info',
        appearance: 'outline',
        className:
          'text-sem-info-soft-700 border-sem-info-soft-100 bg-sem-info-soft-50 dark:bg-sem-info-soft-950 dark:border-sem-info-soft-900 dark:text-sem-info-soft-400',
      },
      {
        variant: 'destructive',
        appearance: 'outline',
        className:
          'text-sem-destructive-accent border-sem-destructive-soft-100 bg-sem-destructive-soft-50 dark:bg-sem-destructive-soft-950 dark:border-sem-destructive-soft-900 dark:text-sem-destructive-soft-600',
      },
      {
        variant: 'primary',
        appearance: 'ghost',
        className: 'text-primary',
      },
      {
        variant: 'secondary',
        appearance: 'ghost',
        className: 'text-secondary-foreground',
      },
      {
        variant: 'success',
        appearance: 'ghost',
        className: 'text-sem-success-accent',
      },
      {
        variant: 'warning',
        appearance: 'ghost',
        className: 'text-sem-warning-accent',
      },
      {
        variant: 'info',
        appearance: 'ghost',
        className: 'text-sem-info-accent',
      },
      {
        variant: 'destructive',
        appearance: 'ghost',
        className: 'text-destructive',
      },
      { size: 'lg', appearance: 'ghost', className: 'px-0' },
      { size: 'md', appearance: 'ghost', className: 'px-0' },
      { size: 'sm', appearance: 'ghost', className: 'px-0' },
      { size: 'xs', appearance: 'ghost', className: 'px-0' },
    ],
    defaultVariants: {
      variant: 'primary',
      appearance: 'default',
      size: 'md',
    },
  },
);

const badgeButtonVariants = cva(
  'cursor-pointer transition-all inline-flex items-center justify-center leading-none size-3.5 [&>svg]:opacity-100! [&>svg]:size-3.5! p-0 rounded-md -me-0.5 opacity-60 hover:opacity-100',
  {
    variants: {
      variant: {
        default: '',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant,
  size,
  appearance,
  shape,
  asChild = false,
  disabled,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? SlotPrimitive.Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, appearance, shape, disabled }), className)}
      {...props}
    />
  );
}

function BadgeButton({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof badgeButtonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? SlotPrimitive.Slot : 'span';
  return (
    <Comp
      data-slot="badge-button"
      className={cn(badgeButtonVariants({ variant, className }))}
      role="button"
      {...props}
    />
  );
}

function BadgeDot({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge-dot"
      className={cn('size-1.5 rounded-full bg-[currentColor] opacity-75', className)}
      {...props}
    />
  );
}

export { Badge, BadgeButton, BadgeDot, badgeVariants };
