import { formatCurrency, parsePrice } from '@/lib/utils/currency';
import { usePeople } from '@/lib/hooks/usePeople';

export default function ItemCard({ item, currentUserId, onClaim, onUnclaim, isMyClaimsContext = false }) {
  const { getPerson } = usePeople();
  const price = typeof item.price === 'object' ? item.price.value : item.price;
  const parsedPrice = parsePrice(price);
  
  const isClaimed = !!item.claimedBy;
  const isMyItem = item.claimedBy === currentUserId;
  const canUnclaim = isMyItem; // Always allow unclaim if it's my item
  const isPending = item.pending;

  const claimedByPerson = isClaimed ? getPerson(item.claimedBy) : null;

  const getStatusText = () => {
    if (isPending) return 'Processing...';
    if (isClaimed) {
      if (isMyItem) {
        return 'Claimed by you';
      }
      return `Claimed by ${claimedByPerson?.name || 'Unknown'}`;
    }
    return isMyClaimsContext ? 'Unclaim' : 'Available';
  };

  const getButtonText = () => {
    if (isPending) return 'Processing...';
    if (isMyClaimsContext) {
      return 'Unclaim';
    }
    if (isClaimed) {
      return canUnclaim ? 'Unclaim' : 'Claimed';
    }
    return 'Claim';
  };

  const handleClick = () => {
    if (isPending) return;

    if (isMyClaimsContext) {
      if (isClaimed) {
        onUnclaim(item);
      }
    } else {
      if (isClaimed) {
        if (canUnclaim) {
          onUnclaim(item);
        }
      } else if (onClaim) {
        onClaim(item);
      }
    }
  };

  return (
    <div className={`flex items-center justify-between p-4 bg-white rounded-lg shadow-sm border ${isClaimed ? 'border-indigo-200' : 'border-gray-100'} ${isPending ? 'opacity-70' : 'hover:shadow-md'} transition`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 pr-2">
            <h4 className="text-sm font-semibold text-gray-900 truncate">{item.name}</h4>
            {item.confidence && (
              <div className="mt-2 text-xs text-gray-500">Confidence: {Math.round(item.confidence * 100)}%</div>
            )}
          </div>

          <div className="flex-shrink-0 text-right ml-2">
            <div className="text-sm font-medium text-gray-900">{formatCurrency(parsedPrice)}</div>
            <div className="mt-2 flex items-center justify-end gap-2">
              {claimedByPerson && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white" style={{ backgroundColor: claimedByPerson.color }}>{claimedByPerson.name.charAt(0).toUpperCase()}</div>
                </div>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-500">{getStatusText()}</div>
          </div>
        </div>
      </div>

      <div className="ml-4 flex-shrink-0">
        <button
          onClick={handleClick}
          disabled={isPending || (isMyClaimsContext && !isClaimed)}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${isClaimed ? (canUnclaim ? 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50' : 'bg-gray-100 text-gray-500 cursor-default') : (isMyClaimsContext ? 'bg-gray-100 text-gray-500 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-700')}`}
        >
          {getButtonText()}
        </button>
      </div>
    </div>
  );
}
