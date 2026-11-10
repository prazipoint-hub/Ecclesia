import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

interface SearchInputProps {
  onSearch: (value: string) => void;
  placeholder?: string;
  delayMs?: number;
  className?: string;
}

export const SearchInput = ({ onSearch, placeholder = 'Search...', delayMs = 300, className }: SearchInputProps) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => onSearch(value.trim()), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, onSearch]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="block h-9 w-full rounded-md border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
      />
    </div>
  );
};
