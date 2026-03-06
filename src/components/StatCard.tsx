import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  helperText?: string;
  tone?: "teal" | "blue" | "amber" | "slate";
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  teal: "bg-teal-100 text-teal-700",
  blue: "bg-sky-100 text-sky-700",
  amber: "bg-amber-100 text-amber-700",
  slate: "bg-slate-100 text-slate-700",
};

const StatCard = ({
  label,
  value,
  icon: Icon,
  helperText,
  tone = "slate",
}: StatCardProps) => {
  return (
    <article
      className="card-surface group p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-sky-400"
      role="region"
      aria-label={`${label}: ${value}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-500" id={`stat-label-${label}`}>
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          {helperText ? (
            <p className="mt-2 text-xs font-medium text-slate-500" role="note">
              {helperText}
            </p>
          ) : null}
        </div>
        <span
          className={`rounded-xl p-2.5 ${toneClasses[tone]} flex-shrink-0`}
          role="img"
          aria-label={label}
        >
          <Icon size={20} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
};

export default StatCard;
