'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';

interface AIFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  predictionData: any;
  resourceId: string;
  resourceType: string;
}

export function AIFeedbackModal({ isOpen, onClose, predictionData, resourceId, resourceType }: AIFeedbackModalProps) {
  const [correctedValue, setCorrectedValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post('/logistics/finance/ai/feedback', {
        modelId: 'demand-v1',
        resourceType,
        resourceId,
        aiPrediction: predictionData,
        humanCorrected: { total_weight_kg: parseFloat(correctedValue) },
        confidence: 1.0,
        tenant_id: 'demo-tenant',
        schema_name: 'tenant'
      });
      alert("Thank you! Your feedback has been recorded. AI Core is evolving.");
      onClose();
    } catch (err) {
      console.error("Feedback failed:", err);
      alert("Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-900/60  ">
      <Card className="w-full max-w-md p-8 shadow-2xl border-primary/20">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <h2 className="text-xl font-bold text-ink">SAI: Human Correction</h2>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">AI PREDICTION</p>
            <p className="text-lg font-mono font-bold text-ink">
              {predictionData?.total_weight_kg || predictionData?.demand || 'N/A'} units/kg
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Actual Value (Corrected)</label>
            <Input 
              type="number" 
              placeholder="Enter real weight/demand..." 
              value={correctedValue}
              onChange={(e) => setCorrectedValue(e.target.value)}
              className="text-lg font-bold"
            />
          </div>

          <p className="text-xs text-inkSoft leading-relaxed">
            By submitting this correction, you are directly training the **SmartGen AI Core**. Your input will be used to fine-tune future forecasts for this tenant.
          </p>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={onClose}>CANCEL</Button>
            <Button 
              variant="primary" 
              className="flex-1 shadow-lg " 
              onClick={handleSubmit}
              isLoading={submitting}
              disabled={!correctedValue}
            >
              TRAIN AI CORE
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
