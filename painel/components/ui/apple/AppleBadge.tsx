import React from "react";
import { cn } from "@/lib/cn";

export type AppleBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "outline";

const VARIANTS: Record<AppleBadgeVariant, string> = {
  default: "text-texto2",
  success: "text-jade",
  warning: "text-atencao",
  destructive: "text-erro",
  info: "text-frio",
  outline: "text-texto2 border border-fio px-1.5 py-0.5 rounded-[4px]",
};

export function AppleBadge({
  children,
  variant = "default",
  dot = true,
  className,
}: {
  children: React.ReactNode;
  variant?: AppleBadgeVariant;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-medium tracking-tight select-none",
        VARIANTS[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            variant === "success" && "bg-jade",
            variant === "warning" && "bg-atencao",
            variant === "destructive" && "bg-erro",
            variant === "info" && "bg-frio",
            variant === "default" && "bg-texto3",
            variant === "outline" && "bg-texto3"
          )}
        />
      )}
      {children}
    </span>
  );
}
