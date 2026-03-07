interface Props { score: number }

export default function RiskBadge({ score }: Props) {
  const style =
    score <= 3 ? 'bg-green-100  text-green-800  border-green-200'
    : score <= 6 ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
    : 'bg-red-100    text-red-800    border-red-200';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-5 rounded border text-xs font-bold ${style}`}>
      {score}
    </span>
  );
}
