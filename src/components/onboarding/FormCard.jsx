export default function FormCard({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-cb-surface-raised rounded-cb border border-cb-border px-8 py-7 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
