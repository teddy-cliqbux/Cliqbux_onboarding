export default function FormCard({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg px-8 py-7 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}