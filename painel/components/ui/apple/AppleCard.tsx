import React from "react";
import { cn } from "@/lib/cn";

interface AppleCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glass?: boolean;
  interactive?: boolean;
  className?: string;
}

export function AppleCard({
  children,
  interactive = false,
  className,
  ...props
}: AppleCardProps) {
  return (
    <div
      className={cn(
        "rounded-[6px] border border-fio bg-sup p-4 transition-colors duration-100",
        interactive && "hover:border-fio-forte cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AppleCardHeader({
  title,
  subtitle,
  badge,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-3", className)}>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold tracking-tight text-texto">
            {title}
          </h2>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-texto2 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function AppleCardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}
