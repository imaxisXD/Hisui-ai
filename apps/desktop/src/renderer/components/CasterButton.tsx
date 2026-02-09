import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "ghost" | "browse";
type ButtonSize = "sm" | "md" | "lg";

interface CasterButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
  className?: string;
}

export function CasterButton({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  icon,
  children,
  disabled,
  className,
  ...rest
}: CasterButtonProps) {
  const classes = [
    "caster-btn",
    `caster-btn--${variant}`,
    `caster-btn--${size}`,
    loading && "caster-btn--loading",
    className
  ].filter(Boolean).join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      <span className="caster-btn__edge" aria-hidden="true" />
      <span className="caster-btn__surface">
        {loading ? (
          <span className="caster-btn__loader">
            <span className="caster-btn__spinner" aria-hidden="true" />
            <span>{loadingText ?? children}</span>
          </span>
        ) : (
          <>
            {icon ? <span className="caster-btn__icon" aria-hidden="true">{icon}</span> : null}
            <span className="caster-btn__label">{children}</span>
          </>
        )}
      </span>
      <span className="caster-btn__glow" aria-hidden="true" />
    </button>
  );
}
