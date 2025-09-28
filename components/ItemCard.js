import { formatCurrency, parsePrice } from '@/lib/utils/currency';
import { usePeople } from '@/lib/hooks/usePeople';
import { getAvatarDisplay } from '@/lib/utils/avatar';

export default function ItemCard({ item, currentUserId, onClaim, onUnclaim, isMyClaimsContext = false }) {
  const { getPerson } = usePeople();
  const price = typeof item.price === 'object' ? item.price.value : item.price;
  const parsedPrice = parsePrice(price);
  
  const isClaimed = !!item.claimedBy;
  const isMyItem = item.claimedBy === currentUserId;
  const canUnclaim = isMyItem; // Always allow unclaim if it's my item
  const isPending = !!item.pending;

  const claimedByPerson = isClaimed ? getPerson(item.claimedBy) : null;

  const getStatusText = () => {
    if (isPending) return 'Processing...';
    if (isClaimed) {
      if (isMyItem) {
        return 'Claimed by you';
      }
      return `Claimed by ${claimedByPerson?.name || 'Unknown'}`;
    }
    return isMyClaimsContext;
  };

  const getButtonText = () => {
    if (isPending) return 'Processing...';
    if (isMyClaimsContext) {
      return '× Unclaim';
    }
    if (isClaimed) {
      return canUnclaim ? '× Unclaim' : 'Claimed';
    }
    return '+ Claim';
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
    <div className={`item-card ${isPending ? 'opacity-70' : ''}`}>
      {/* Mobile-first responsive layout */}
      <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Main content area */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 pr-2">
              <h4 className="text-sm font-semibold text-gray-900 truncate leading-tight">{item.name}</h4>
              {item.confidence && (
                <div className="mt-1 text-xs text-gray-500">Confidence: {Math.round(item.confidence * 100)}%</div>
              )}
            </div>

            <div className="flex-shrink-0 text-right">
              <div className="text-sm font-medium text-gray-900 whitespace-nowrap">{formatCurrency(parsedPrice)}</div>
            </div>
          </div>
          
          {/* Status and person info - mobile friendly */}
          <div className="flex items-center justify-between mt-2 gap-2">
            <div className="text-xs text-gray-500 flex-1 min-w-0 truncate">{getStatusText()}</div>
            {claimedByPerson && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center text-xs font-medium text-white" style={{ backgroundColor: claimedByPerson.color }}>
                  {getAvatarDisplay(claimedByPerson)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action button - full width on mobile, fixed width on desktop */}
        <div className="w-full sm:w-auto sm:ml-3 flex-shrink-0">
          <button
            onClick={handleClick}
            disabled={isPending || (isMyClaimsContext && !isClaimed)}
            className={`w-full sm:w-auto px-3 py-2 text-xs font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 truncate ${
              isClaimed 
                ? (canUnclaim 
                  ? 'item-btn-unclaim focus:ring-red-500'
                  : 'item-btn-disabled'
                ) 
                : (isMyClaimsContext 
                  ? 'item-btn-disabled' 
                  : 'item-btn-claim focus:ring-indigo-500'
                )
            }`}
          >
            {getButtonText()}
          </button>
        </div>
      </div>
    </div>
  );
}
