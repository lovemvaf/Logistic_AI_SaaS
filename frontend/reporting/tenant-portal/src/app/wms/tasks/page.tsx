'use client';
import { useState, useEffect } from 'react';
import {formatDate} from '@/lib/date-utils';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Task = {
  id: string;
  taskType: string;
  status: string;
  priority: number;
  quantityRequested: number;
  quantityActual: number | null;
  product: { name: string; sku: string } | null;
  assignee: { fullName: string } | null;
  createdAt: string;
};

export default function MyTasksPage() {
  const { user, token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchTasks();
  }, [token, page]);

  const fetchTasks = async () => {
    if (!token) return;
    try {
      const res = await api.get('/tasks', { params: { page, limit } });
      const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setTasks(data);
      setTotal(res.data?.meta?.total || 0);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await api.post(`/tasks/${taskId}/complete`, { actualQty: 1 });
      fetchTasks();
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'PENDING': return 'warning';
      case 'ASSIGNED': return 'info';
      case 'IN_PROGRESS': return 'neutral';
      case 'COMPLETED': return 'success';
      default: return 'neutral';
    }
  };

  const getTaskTypeLabel = (type: string) => {
    switch (type) {
      case 'PICK': return 'Picking';
      case 'PUTAWAY': return 'Putaway';
      case 'REPLENISH': return 'Replenishment';
      case 'PACK': return 'Packing';
      default: return type;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto ">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-ink tracking-tight">
          My Warehouse Tasks
        </h1>
        <p className="text-sm text-inkSoft mt-2 font-medium">View and manage your assigned picking and putaway tasks.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      <Card className="p-6">
        {tasks.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <p className="font-medium">No Active Tasks</p>
            <p className="text-sm mt-1">You do not have any warehouse tasks assigned to you at the moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-ink">{getTaskTypeLabel(task.taskType)}</span>
                    <Badge variant={getStatusVariant(task.status)}>{task.status}</Badge>
                  </div>
                  <p className="text-sm text-inkSoft">
                    {task.product?.name || 'Unknown Product'} - Qty: {task.quantityRequested}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Created: {formatDate(task.createdAt)}
                  </p>
                </div>
                {task.status !== 'COMPLETED' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleCompleteTask(task.id)}
                  >
                    Complete
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {!loading && total > limit && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} tasks)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
