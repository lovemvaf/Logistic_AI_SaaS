'use client';

import { useCallback, useState } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  StatusLabel,
} from 'ui-kit';
import { TableState, Button } from 'ui-components';

type UploadRow = {
  line: number;
  clientOrderRef?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  service?: string;
  itemCount?: string;
  weightKg?: string;
  codAmount?: string;
  shippingFee?: string;
  error?: string;
};

/** Parse CSV theo chuẩn RFC 4180: soft line breaker cho giá trị trong ngoặc kép. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      current.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\n') {
        current.push(cell);
        cell = '';
        rows.push(current);
        current = [];
        inQuotes = false;
      }
    } else {
      cell += char;
    }
  }
  if (cell || current.length) {
    current.push(cell);
    rows.push(current);
  }
  return rows.filter((row) => row.length > 1);
}

export default function ClientOrdersUpload() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState({ created: 0, failed: 0, errors: '' as string | null });
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(() => {
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setRows([]);
      return;
    }
    const header = parsed[0];
    const mapping: Record<string, number> = {};
    header.forEach((cell: string, idx: number) => {
      mapping[cell.trim().toLowerCase()] = idx;
    });
    setRows(
      parsed.slice(1).map((line: string[], idx: number) => {
        const find = (key: string) => line[mapping[key] ?? -1] ?? '';
        const row: UploadRow = {
          line: idx + 2,
          clientOrderRef: find('mã tham chiếu') || find('clientOrderRef') || find('mã đơn'),
          recipientName: find('tên người nhận') || find('recipientName') || find('người nhận'),
          recipientPhone: find('số điện thoại') || find('recipientPhone') || find('điện thoại'),
          recipientAddress: find('địa chỉ') || find('recipientAddress'),
          service: find('dịch vụ') || find('service'),
        };
        if (!row.clientOrderRef) row.error = 'Thiếu mã tham chiếu.';
        if (!row.recipientName) row.error = 'Thiếu tên người nhận.';
        if (!row.recipientPhone) row.error = 'Thiếu số điện thoại.';
        if (!row.recipientAddress) row.error = 'Thiếu địa chỉ.';
        return row;
      }),
    );
  }, [text]);

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const text = await file.text();
    setText(text);
    await new Promise((resolve) => setTimeout(resolve, 0));
    analyze();
  }, [analyze]);

  const handleUpload = useCallback(async () => {
    setError(null);
    setUploading(true);
    setResult({ created: 0, failed: 0, errors: null });
    try {
      const valid = rows.filter((row) => !row.error);
      for (const row of valid) {
        await data.orders.createOrder({
          clientOrderRef: row.clientOrderRef,
          service: row.service || 'STANDARD',
          recipientName: row.recipientName,
          recipientPhone: row.recipientPhone,
          recipientAddress: row.recipientAddress,
          itemCount: Number(row.itemCount) || 1,
          weightKg: Number(row.weightKg) || 1,
          codAmount: Number(row.codAmount) || 0,
        });
        setResult((prev) => ({ ...prev, created: prev.created + 1 }));
      }
      const invalid = rows.filter((row) => row.error).map((row) => `Dòng ${row.line}: ${row.error}`);
      setResult((prev) => ({
        ...prev,
        failed: invalid.length,
        errors: invalid.length ? invalid.join('\n') : null,
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }, [rows]);

  const errorsLength = rows.filter((row) => row.error).length;

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Nhập đơn</span>
          </>
        }
        title="Nhập đơn hàng hàng loạt"
        description="Tải lên file CSV chứa danh sách đơn hàng. Hệ thống sẽ kiểm tra dữ liệu trước khi tạo đơn."
      />

      <EditorialSection eyebrow="File" title="Dán CSV hoặc tải lên">
        <div className="space-y-3">
          <textarea
            className="w-full rounded-md border border-line bg-canvas p-3 text-[12px] leading-5 text-ink outline-none placeholder:font-sans focus:border-accent focus:ring-2 focus:ring-accent/15"
            rows={8}
            placeholder={`mã tham chiếu,tên người nhận,số điện thoại,địa chỉ,dịch vụ\nAP-20261111-001,Nguyễn Văn An,0901234567,12 đường Nguyễn Huệ,TP. Hồ Chí Minh,STANDARD`}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFile}
              className="text-[12px] text-ink-soft file:mr-3 file:rounded-md file:border file:border-line file:px-3 file:py-2 file:text-[12px] file:font-medium file:transition-colors hover:file:border-accent hover:file:text-accent"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={analyze}
              className="h-10 rounded-lg text-[12px] font-medium"
              disabled={!text.trim()}
            >
              Kiểm tra dữ liệu
            </Button>
          </div>
        </div>
      </EditorialSection>

      <EditorialSection
        eyebrow="Dữ liệu nhập"
        title={
          <span>
            {rows.length} dòng định dạng
            {errorsLength > 0 && (
              <span className="ml-2 text-danger">{`(${errorsLength} lỗi)`}</span>
            )}
          </span>
        }
      >
        {rows.length === 0 ? (
          <EmptyNote>Chưa có dữ liệu nào được phân tích ra khỏi file CSV.</EmptyNote>
        ) : (
          <TableState
            loading={uploading}
            empty={false}
            error={error || undefined}
            colSpan={5}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">Dữ liệu CSV đã phân tích, sẵn sàng tạo đơn</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Dòng
                    </th>
                    <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Mã tham chiếu
                    </th>
                    <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Người nhận
                    </th>
                    <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Dịch vụ
                    </th>
                    <th scope="col" className="h-9 pl-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Lỗi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                      <td className="pr-3 font-mono text-[12px] text-ink">
                        {row.line}
                      </td>
                      <td className="px-3 text-[12px] text-ink-soft">{row.clientOrderRef}</td>
                      <td className="px-3 text-[12px] text-ink-soft">{row.recipientName}</td>
                      <td className="px-3 text-[12px] text-ink-soft">{row.service}</td>
                      <td className="pl-3">
                        {row.error ? (
                          <StatusLabel tone="danger">
                            {row.error}
                          </StatusLabel>
                        ) : (
                          <StatusLabel tone="success">Đủ dữ liệu</StatusLabel>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableState>
        )}
      </EditorialSection>

      {rows.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-ink-faint">
            {rows.length === errorsLength
              ? 'Tất cả dữ liệu đều thiếu thông tin cần thiết.'
              : `${rows.length - errorsLength} dòng đủ dữ liệu.`}
          </p>
          <Button
            type="button"
            variant="primary"
            className="h-10 rounded-lg text-[12px] font-medium"
            onClick={handleUpload}
            disabled={uploading || errorsLength === rows.length}
          >
            {uploading ? 'Đang tạo đơn…' : 'Yêu cầu tạo'}
          </Button>
        </div>
      ) : null}

      {result.created || result.failed ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 border-l-2 border-success bg-surface px-3 py-2 text-[12px] text-ink-soft">
            <StatusLabel tone="success">Hoàn tất</StatusLabel>
            <span>Tạo {result.created} đơn, {result.failed} dòng lỗi</span>
          </div>
          {result.errors ? (
            <div className="space-y-1 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
              {result.errors.split('\n').map((line: string, index: number) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
