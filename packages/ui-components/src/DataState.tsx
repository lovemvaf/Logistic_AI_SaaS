'use client';

import type { ReactNode } from 'react';

export interface DataStateProps {
  /** true khi đang tải dữ liệu */
  loading?: boolean;
  /** true khi đã tải xong nhưng không có dữ liệu */
  empty?: boolean;
  /** lỗi (nếu có) */
  error?: unknown;
  /** nội dung khi có dữ liệu */
  children: ReactNode;
  /** tiêu đề khi rỗng */
  emptyTitle?: string;
  /** mô tả khi rỗng */
  emptyDescription?: string;
  /** UI empty tuỳ chỉnh (giữ nguyên thiết kế của trang nếu đã có) */
  emptyContent?: ReactNode;
  /** nhãn nút thử lại khi lỗi */
  retryLabel?: string;
  /** hàm thử lại khi lỗi (có thể nhận tham số tuỳ trang) */
  onRetry?: (...args: any[]) => void;
  /** skeleton dùng khi loading (mặc định là 3 dòng) */
  loadingRows?: number;
}

/**
 * Chuẩn hoá 4 trạng thái của mọi bảng dữ liệu: loading / empty / error / data.
 *
 * Trước đây mỗi trang tự viết if (loading) ... if (!data.length) ... nên thiếu
 * trạng thái, hiển thị sai (bảng trống khi đang tải), hoặc nuốt lỗi. Component
 * này gom về một chỗ để áp dụng đồng nhất.
 */
export function DataState({
  loading,
  empty,
  error,
  children,
  emptyTitle = 'Chưa có dữ liệu',
  emptyDescription = 'Dữ liệu sẽ hiển thị ở đây khi có.',
  emptyContent,
  retryLabel = 'Thử lại',
  onRetry,
  loadingRows = 3,
}: DataStateProps) {
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        {Array.from({ length: loadingRows }).map((_, index) => (
          <div
            key={index}
            className="h-9 w-full animate-pulse rounded-lg"
            style={{ background: 'var(--surface-alt, #f1f1f1)' }}
          />
        ))}
        <span className="sr-only">Đang tải dữ liệu…</span>
      </div>
    );
  }

  if (error) {
    const message =
      (error as any)?.response?.data?.message ||
      (error as any)?.message ||
      'Không tải được dữ liệu.';
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 rounded-xl border px-4 py-4 text-sm"
        style={{
          background: 'var(--surface, #fff)',
          borderColor: 'var(--danger, #b3261e)',
          color: 'var(--ink, #1f2937)',
        }}
      >
        <strong style={{ color: 'var(--danger, #b3261e)' }}>Không tải được dữ liệu</strong>
        <span>{String(message)}</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: 'var(--border, #e2e2e2)' }}
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    );
  }

  if (empty) {
    if (emptyContent) {
      return <>{emptyContent}</>;
    }
    return (
      <div
        className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-10 text-center"
        style={{ borderColor: 'var(--border, #e2e2e2)' }}
      >
        <strong className="text-sm">{emptyTitle}</strong>
        <span className="text-xs opacity-70">{emptyDescription}</span>
      </div>
    );
  }

  return <>{children}</>;
}

export interface TableStateProps {
  loading?: boolean;
  empty?: boolean;
  error?: unknown;
  /** số cột của bảng (để span đúng cột) */
  colSpan: number;
  emptyTitle?: string;
  emptyDescription?: string;
  /** UI empty tuỳ chỉnh (giữ nguyên thiết kế của trang nếu đã có) */
  emptyContent?: ReactNode;
  onRetry?: (...args: any[]) => void;
  loadingRows?: number;
  /** các dòng dữ liệu (render khi không lỗi / không rỗng / không tải) */
  children?: ReactNode;
}

/**
 * Bản dành riêng cho bảng: các trạng thái được render thành `<tr>` nên vẫn
 * giữ nguyên cấu trúc bảng (không làm vỡ layout khi đang tải/lỗi).
 */
export function TableState({
  loading,
  empty,
  error,
  colSpan,
  emptyTitle = 'Chưa có dữ liệu',
  emptyDescription = 'Dữ liệu sẽ hiển thị ở đây khi có.',
  emptyContent,
  onRetry,
  loadingRows = 4,
  children,
}: TableStateProps) {
  if (loading) {
    return (
      <>
        {Array.from({ length: loadingRows }).map((_, index) => (
          <tr key={index}>
            <td colSpan={colSpan} className="px-6 py-3">
              <div
                className="h-7 w-full animate-pulse rounded-lg"
                style={{ background: 'var(--surface-alt, #f1f1f1)' }}
              />
            </td>
          </tr>
        ))}
      </>
    );
  }

  if (error) {
    const message =
      (error as any)?.response?.data?.message ||
      (error as any)?.message ||
      'Không tải được dữ liệu.';
    return (
      <tr>
        <td colSpan={colSpan} className="px-6 py-10 text-center">
          <div
            role="alert"
            className="mx-auto flex max-w-md flex-col items-center gap-2 text-sm"
          >
            <strong style={{ color: 'var(--danger, #b3261e)' }}>Không tải được dữ liệu</strong>
            <span className="opacity-80">{String(message)}</span>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: 'var(--border, #e2e2e2)' }}
              >
                Thử lại
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  if (empty) {
    if (emptyContent) {
      return <>{emptyContent}</>;
    }
    return (
      <tr>
        <td colSpan={colSpan} className="px-6 py-12 text-center">
          <div className="flex flex-col items-center gap-1">
            <strong className="text-sm">{emptyTitle}</strong>
            <span className="text-xs opacity-70">{emptyDescription}</span>
          </div>
        </td>
      </tr>
    );
  }

  return <>{children}</>;
}

export default DataState;
