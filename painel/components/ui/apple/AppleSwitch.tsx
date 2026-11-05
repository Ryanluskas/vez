"use client";

import { cn } from "@/lib/cn";

export function AppleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center justify-between gap-4 py-2 cursor-pointer select-none",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {(label || description) && (
        <div className="flex-1 pr-2">
          {label && (
            <p className="text-[14px] font-medium text-texto tracking-tight">{label}</p>
          )}
          {description && (
            <p className="text-[12px] text-texto2 leading-relaxed mt-0.5">{description}</p>
          )}
        </div>
      )}

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
          checked ? "bg-jade" : "bg-sup3 border-fio",
          disabled && "cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </label>
  );
}
