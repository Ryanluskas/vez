"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function AppleSearchInput({
  value,
  onChange,
  placeholder = "Buscar...",
  className,
  onClear,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
}) {
  return (
    <div className={cn("relative flex items-center w-full", className)}>
      <Search
        className="absolute left-3.5 h-4 w-4 text-texto3 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(
          "w-full h-10 pl-10 pr-9 rounded-2xl bg-sup2 border border-fio text-[13px] text-texto",
          "placeholder:text-texto3 transition-all duration-200",
          "focus:outline-none focus:border-jade focus:bg-sup focus:ring-2 focus:ring-jade/20"
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            if (onClear) onClear();
          }}
          className="absolute right-3 p-1 rounded-full text-texto3 hover:text-texto hover:bg-sup3 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
