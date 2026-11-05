import React from "react";
import { cn } from "@/lib/cn";

export type AppleButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "glass";

export type AppleButtonSize = "sm" | "md" | "lg" | "icon";

interface AppleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppleButtonVariant;
  size?: AppleButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS: Record<AppleButtonVariant, string> = {
  primary:
    "bg-jade text-jade-texto hover:bg-jade-forte active:opacity-90 font-medium",
  secondary:
    "bg-sup text-texto border border-fio hover:bg-sup2 hover:border-fio-forte active:opacity-90",
  ghost:
    "bg-transparent text-texto2 hover:text-texto hover:bg-sup2 active:opacity-90",
  destructive:
    "bg-erro-fundo text-erro border border-erro/30 hover:bg-erro hover:text-white active:opacity-90",
  glass:
    "bg-sup text-texto border border-fio hover:border-fio-forte active:opacity-90",
};

const SIZES: Record<AppleButtonSize, string> = {
  sm: "h-8 px-2.5 text-[12px] rounded-[6px] gap-1.5",
  md: "h-9 px-3 text-[13px] rounded-[6px] gap-2",
  lg: "h-10 px-4 text-[14px] rounded-[6px] gap-2.5",
  icon: "h-8 w-8 p-0 rounded-[6px] justify-center items-center",
};

export function AppleButton({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  isLoading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: AppleButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center font-sans tracking-tight transition-colors duration-100",
        "disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {isLoading ? (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin mr-1.5" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
