export function SmartGPTLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <div className="flex flex-col">
        <span className="text-4xl sm:text-5xl md:text-6xl font-bold text-[#153e69] leading-tight tracking-tight">
          Limitless<span className="text-[#a62733]">AI</span>
        </span>
        <span className="text-sm sm:text-base text-gray-700 font-medium tracking-wider">
          JetSMART
        </span>
      </div>
    </div>
  );
}
