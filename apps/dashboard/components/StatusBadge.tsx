const STATUS_STYLES: Record<string, string> = {
  deployed:            'bg-green-100  text-green-800  border-green-200',
  pending_approval:    'bg-yellow-100 text-yellow-800 border-yellow-200',
  failed:              'bg-red-100    text-red-800    border-red-200',
  rollback_failed:     'bg-red-100    text-red-800    border-red-200',
  rolled_back:         'bg-slate-100  text-slate-600  border-slate-200',
  queued:              'bg-blue-100   text-blue-800   border-blue-200',
  regression_detected: 'bg-orange-100 text-orange-800 border-orange-200',
  in_progress:         'bg-purple-100 text-purple-800 border-purple-200',
  completed:           'bg-green-100  text-green-800  border-green-200',
  partial:             'bg-yellow-100 text-yellow-800 border-yellow-200',
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval:    'Pending Approval',
  regression_detected: 'Regression',
  rollback_failed:     'Rollback Failed',
  in_progress:         'In Progress',
};

interface Props {
  status: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: Props) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
  const sz    = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center rounded border font-medium capitalize ${sz} ${style}`}>
      {label}
    </span>
  );
}
