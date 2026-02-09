import type { ButtonHTMLAttributes, ReactNode } from "react";

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
  const classes = [
    "hisui-btn",
    `hisui-btn--${variant}`,
    `hisui-btn--${size}`,
    loading && "hisui-btn--loading",
    className
  ].filter(Boolean).join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      <span className="hisui-btn__edge" aria-hidden="true" />
      <span className="hisui-btn__surface">
        {loading ? (
          <span className="hisui-btn__loader">
            <span className="hisui-btn__spinner" aria-hidden="true" />
            <span>{loadingText ?? children}</span>
          </span>
        ) : (
          <>
            {icon ? <span className="hisui-btn__icon" aria-hidden="true">{icon}</span> : null}
            <span className="hisui-btn__label">{children}</span>
          </>
        )}
      </span>
      <span className="hisui-btn__glow" aria-hidden="true" />
    </button>
  );
}
