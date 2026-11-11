'use client';

import { useState, useRef, useEffect } from 'react';

export interface TenantActionMenuProps {
  tenantId: string;
  tenantName: string;
  status: string;
  onAction?: (action: string, tenantId: string) => void;
}

export function TenantActionMenu({ tenantId, tenantName, status, onAction }: TenantActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (action: string) => {
    setIsOpen(false);
    onAction?.(action, tenantId);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:text-ink hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 11.25v3.75a2.25 2.25 0 00.876 1.781L17 19.5M7.5 12.75h9m-9 3h9m-9 2.25h9" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => handleAction('suspend')}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            {status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
          </button>
          <button
            onClick={() => handleAction('edit')}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Edit Tenant
          </button>
          <button
            onClick={() => handleAction('delete')}
            className="block w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
          >
            Delete Tenant
          </button>
        </div>
      )}
    </div>
  );
}
