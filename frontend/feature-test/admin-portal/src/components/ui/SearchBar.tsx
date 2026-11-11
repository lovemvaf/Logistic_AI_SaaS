'use client';

export interface SearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
}

export function SearchBar({ placeholder = "Search...", onSearch }: SearchBarProps) {
  return (
    <div className="relative flex-1 max-w-md group">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <svg className="w-5 h-5 text-inkSoft group-focus-within:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        type="text"
        className="w-full bg-surface/30  border border-border/50 rounded-xl py-2.5 pl-11 pr-4 text-sm text-ink placeholder-inkSoft focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-300 shadow-sm"
        placeholder={placeholder}
        onChange={(e) => onSearch?.(e.target.value)}
      />
      <div className="absolute inset-y-0 right-2 flex items-center">
        <div className="hidden md:flex items-center gap-1 text-[10px] text-inkSoft font-medium px-2 py-1 rounded bg-surfaceMuted border border-border/50">
          <kbd className="font-sans">Ctrl</kbd>
          <span>K</span>
        </div>
      </div>
    </div>
  );
}
