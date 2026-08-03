/**
 * MapRingLegend - explains the marker ring colors on the live map.
 * Green = most recently active users, gold = active within 21 days, grey = older.
 */
export function MapRingLegend({ className = "" }: { className?: string }) {
  const items: { color: string; label: string }[] = [
    { color: "#22C55E", label: "Recently active" },
    { color: "#FACC15", label: "Active this month" },
    { color: "#6B7280", label: "Inactive" },
  ];

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-xs text-muted-foreground ${className}`}
    >
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
