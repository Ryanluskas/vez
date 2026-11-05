"use client";

import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  badge?: number | string;
  icon?: React.ReactNode;
}

export function AppleSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex p-1 rounded-2xl bg-sup2 border border-fio items-center gap-1 select-none",
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[13px] font-medium transition-all duration-200 cursor-pointer",
              selected
                ? "bg-sup text-texto shadow-sm border border-fio/60"
                : "text-texto2 hover:text-texto hover:bg-sup/40"
            )}
          >
            {option.icon}
            <span>{option.label}</span>
            {option.badge !== undefined && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[11px] font-mono",
                  selected
                    ? "bg-sup2 text-texto"
                    : "bg-sup3 text-texto3"
                )}
              >
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
