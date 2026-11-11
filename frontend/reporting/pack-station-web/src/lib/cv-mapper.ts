import type { AiPredictionResult } from './mock/types';

export const CV_CONFIDENCE_THRESHOLD = 0.6;

export interface ImageNetClassPrediction {
  className: string;
  probability: number;
}

export interface CvSkuMappingOutcome {
  prediction: AiPredictionResult | null;
  topRawClass: string | null;
  topRawProbabilityPct: number;
  thresholdMet: boolean;
  notice: string;
}

/**
 * Ánh xạ nhãn ImageNet (MobileNet v1/v2 chưa fine-tune) sang 12 SKU mẫu của trạm đóng gói.
 * Đây là bảng heuristic tạm thời cho camera hỗ trợ; thao tác đóng kiện luôn bắt buộc
 * quét barcode hoặc nhân viên xác nhận thủ công.
 */
export const IMAGENET_SKU_KEYWORDS: ReadonlyArray<{ sku: string; label: string; keywords: string[] }> = [
  { sku: 'SKU-0001', label: 'Cáp USB-C 1m', keywords: ['plug', 'cord', 'coil', 'cable', 'wire', 'usb'] },
  { sku: 'SKU-0002', label: 'Tai nghe Bluetooth', keywords: ['headphone', 'headset', 'earphone', 'microphone', 'loudspeaker'] },
  { sku: 'SKU-0003', label: 'Ốp lưng iPhone', keywords: ['cellular telephone', 'cellphone', 'ipod', 'holster', 'case', 'wallet'] },
  { sku: 'SKU-0004', label: 'Sạc dự phòng 10000mAh', keywords: ['modem', 'hard disc', 'remote control', 'cassette', 'battery'] },
  { sku: 'SKU-0005', label: 'Màn hình 24 inch', keywords: ['monitor', 'screen', 'television', 'desktop computer', 'crt'] },
  { sku: 'SKU-0006', label: 'Bàn phím cơ', keywords: ['computer keyboard', 'keyboard', 'typewriter', 'space bar'] },
  { sku: 'SKU-0007', label: 'Chuột không dây', keywords: ['mouse'] },
  { sku: 'SKU-0008', label: 'Hộp máy', keywords: ['carton', 'crate', 'cardboard', 'matchbox', 'safe'] },
  { sku: 'SKU-0009', label: 'Sổ bảo quản', keywords: ['notebook', 'binder', 'book jacket', 'bookshop', 'menu'] },
  { sku: 'SKU-0010', label: 'Hộp điện thoại', keywords: ['packet', 'envelope', 'mailbag', 'pillow'] },
  { sku: 'SKU-0011', label: 'Bảng tóm tắt điện tử', keywords: ['tablet', 'laptop', 'notebook computer', 'hand-held computer'] },
  { sku: 'SKU-0012', label: 'Cáp sạc nhanh', keywords: ['power drill', 'adapter', 'switch', 'reel'] },
];

export function mapImageNetPredictionsToSku(
  rawPredictions: ImageNetClassPrediction[],
  threshold = CV_CONFIDENCE_THRESHOLD,
): CvSkuMappingOutcome {
  if (!Array.isArray(rawPredictions) || rawPredictions.length === 0) {
    return {
      prediction: null,
      topRawClass: null,
      topRawProbabilityPct: 0,
      thresholdMet: false,
      notice: 'Không nhận được kết quả phân loại từ camera MobileNet.',
    };
  }

  const sortedRaw = [...rawPredictions].sort((a, b) => b.probability - a.probability);
  const topRaw = sortedRaw[0];
  const topRawProbabilityPct = Math.round(Math.max(0, Math.min(1, topRaw.probability)) * 100);

  const skuScores = new Map<string, number>();
  for (const pred of sortedRaw) {
    const normalizedClass = String(pred.className || '').toLowerCase();
    const prob = Number.isFinite(pred.probability) ? Math.max(0, Math.min(1, pred.probability)) : 0;
    for (const entry of IMAGENET_SKU_KEYWORDS) {
      if (entry.keywords.some((kw) => normalizedClass.includes(kw))) {
        const current = skuScores.get(entry.sku) ?? 0;
        if (prob > current) {
          skuScores.set(entry.sku, prob);
        }
      }
    }
  }

  const candidates = Array.from(skuScores.entries())
    .map(([sku, confidence]) => ({ sku, confidence }))
    .sort((a, b) => b.confidence - a.confidence);

  if (candidates.length === 0) {
    return {
      prediction: null,
      topRawClass: topRaw.className,
      topRawProbabilityPct,
      thresholdMet: false,
      notice: `MobileNet ImageNet nhận diện "${topRaw.className}" (${topRawProbabilityPct}%), chưa khớp nhãn 12 SKU kho — vui lòng quét barcode.`,
    };
  }

  const best = candidates[0];
  const thresholdMet = best.confidence >= threshold;
  const confidencePct = Math.round(best.confidence * 100);

  if (!thresholdMet) {
    return {
      prediction: null,
      topRawClass: topRaw.className,
      topRawProbabilityPct,
      thresholdMet: false,
      notice: `Gợi ý gần nhất ${best.sku} chỉ đạt ${confidencePct}% (< ngưỡng ${Math.round(threshold * 100)}%, nhãn gốc "${topRaw.className}") — vui lòng quét barcode hoặc nhập tay.`,
    };
  }

  return {
    prediction: {
      sku: best.sku,
      confidence: confidencePct,
      candidates: candidates.slice(0, 5),
    },
    topRawClass: topRaw.className,
    topRawProbabilityPct,
    thresholdMet: true,
    notice: `Nhận diện gợi ý ${best.sku} (${confidencePct}% từ nhãn ImageNet "${topRaw.className}"). Nhấn "Xác nhận dự đoán" hoặc quét barcode để đối chiếu.`,
  };
}
