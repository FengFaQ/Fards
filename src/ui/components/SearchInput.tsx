import { IconSearch, IconX } from './icons';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/** 带图标与清除按钮的搜索框 */
export function SearchInput({
  value,
  onChange,
  placeholder = '搜索…',
  className = '',
  autoFocus = false,
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <IconSearch
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-field-500"
      />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="fards-input pr-9 pl-9"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="清除搜索"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-field-500 transition-colors hover:text-brass-300"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}

export default SearchInput;
