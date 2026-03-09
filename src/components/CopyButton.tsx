import { useState } from 'react';

interface CopyButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}

export function CopyButton({ children, onClick, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onClick();
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }}
    >
      {copied ? 'Copied' : children}
    </button>
  );
}
