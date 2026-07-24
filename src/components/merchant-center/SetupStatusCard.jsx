// src/components/merchant-center/SetupStatusCard.jsx
export default function SetupStatusCard({ title, value, caption, icon = null }) {
  return (
    <div className="bg-cb-surface rounded-cb border border-cb-border p-4 flex items-start justify-between gap-3 min-h-[5.5rem]">
      <div className="min-w-0">
        <p className="text-cb-caption uppercase text-gray-500 mb-1">{title}</p>
        <p className="font-display text-cb-title text-white truncate">{value}</p>
        {caption && (
          <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1 truncate">
            {caption}
          </p>
        )}
      </div>
      {icon && (
        <div className="flex-shrink-0 w-9 h-9 rounded-cb bg-cb-accent-muted flex items-center justify-center text-cb-accent">
          {icon}
        </div>
      )}
    </div>
  );
}
