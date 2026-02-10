import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

type ButtonVariant = "primary" | "ghost" | "browse";
type ButtonSize = "sm" | "md" | "lg";

interface HisuiButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
  className?: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-[0.55rem] py-[0.25rem] text-[0.75rem]",
  md: "px-4 py-[0.45rem] text-[0.82rem]",
  lg: "px-6 py-[0.6rem] text-[0.88rem]"
};

const surfaceVariantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-ui-accent text-white font-semibold",
    "shadow-ui-button-primary",
    "group-hover:bg-ui-accent-hover",
    "group-active:shadow-ui-button-primary-active"
  ].join(" "),
  ghost: [
    "border border-ui-border-strong bg-transparent text-ui-text-primary font-medium",
    "transition-[border-color,background-color,box-shadow] duration-200",
    "group-hover:border-ui-accent-ghost-border group-hover:bg-ui-bg-hover",
    "group-hover:shadow-ui-ghost-inset",
    "group-active:bg-ui-bg-surface"
  ].join(" "),
  browse: [
    "border border-ui-browse-border bg-ui-browse-soft text-ui-browse font-semibold",
    "transition-[background-color,border-color,color,box-shadow] duration-200",
    "group-hover:border-ui-browse group-hover:bg-ui-browse-soft-hover",
    "group-hover:text-ui-browse-hover group-hover:shadow-ui-browse-inset",
    "group-active:bg-ui-browse-soft-active"
  ].join(" ")
};

const edgeVariantClasses: Record<ButtonVariant, string> = {
  primary: [
    "absolute inset-0 z-0 rounded-[inherit] pointer-events-none",
    "bg-ui-button-sheen",
    "shadow-ui-accent-edge",
    "group-active:shadow-none"
  ].join(" "),
  ghost: "hidden",
  browse: "hidden"
};

const glowVariantClasses: Record<ButtonVariant, string> = {
  primary: [
    "absolute inset-[-4px] -z-[1] rounded-[10px] pointer-events-none",
    "bg-ui-accent-glow",
    "opacity-0 transition-opacity duration-250 group-hover:opacity-100"
  ].join(" "),
  ghost: "hidden",
  browse: [
    "absolute inset-[-4px] -z-[1] rounded-[10px] pointer-events-none",
    "bg-ui-browse-glow",
    "opacity-0 transition-opacity duration-250 group-hover:opacity-100"
  ].join(" ")
};

export function HisuiButton({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  icon,
  children,
  disabled,
  className,
  ...rest
}: HisuiButtonProps) {
  return (
    <button
      className={cn(
        "group relative isolate inline-flex items-center justify-center rounded-md border-0 bg-transparent p-0 font-geist-sans",
        "transition-[transform,opacity] duration-150 [transform:translateY(0)]",
        "enabled:active:[transform:translateY(1px)] disabled:cursor-not-allowed disabled:opacity-[0.35]",
        loading && "pointer-events-none",
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      <span className={edgeVariantClasses[variant]} aria-hidden="true" />
      <span
        className={cn(
          "relative z-[1] inline-flex w-full items-center justify-center gap-[0.45rem] whitespace-nowrap rounded-[inherit]",
          sizeClasses[size],
          surfaceVariantClasses[variant]
        )}
      >
        {loading ? (
          <span className="inline-flex items-center gap-[0.45rem]">
            <span
              className="inline-block h-[14px] w-[14px] animate-[spin_600ms_linear_infinite] rounded-full border-2 border-ui-frost-border-soft border-t-[currentColor]"
              aria-hidden="true"
            />
            <span>{loadingText ?? children}</span>
          </span>
        ) : (
          <>
            {icon ? <span className="inline-flex shrink-0 items-center justify-center" aria-hidden="true">{icon}</span> : null}
            <span className="inline-flex items-center">{children}</span>
          </>
        )}
      </span>
      <span className={glowVariantClasses[variant]} aria-hidden="true" />
    </button>
  );
}
