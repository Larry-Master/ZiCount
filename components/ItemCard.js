import { formatCurrency, parsePrice } from '@/lib/utils/currency';
import { usePeople } from '@/lib/hooks/usePeople';

export default function ItemCard({ item, currentUserId, onClaim, onUnclaim }) {
  const { getPerson } = usePeople();
  const price = typeof item.price === 'object' ? item.price.value : item.price;
  const parsedPrice = parsePrice(price);
  
  const isClaimed = !!item.claimedBy;
  const isMyItem = item.claimedBy === currentUserId;
  const canUnclaim = isMyItem; // Always allow unclaim if it's my item
  const isPending = item.pending;

  const claimedByPerson = isClaimed ? getPerson(item.claimedBy) : null;

  const handleClick = () => {
    if (isPending) return;
    
    if (isClaimed) {
      if (canUnclaim) {
        onUnclaim(item);
      }
    } else {
      onClaim(item);
    }
  };

  const getStatusText = () => {
    if (isPending) return 'Claiming...';
    if (isClaimed) {
      if (isMyItem) {
        return 'Claimed by you';
      }
      return `Claimed by ${claimedByPerson?.name || 'Unknown'}`;
    }
    return 'Available';
  };

  const getButtonText = () => {
    if (isPending) return 'Processing...';
    if (isClaimed) {
      return canUnclaim ? 'Unclaim' : 'Claimed';
    }
    return 'Claim';
  };

  return (
    <div className={`item-card ${isClaimed ? 'claimed' : 'available'} ${isPending ? 'pending' : ''}`}>
      <div className="item-content">
        <div className="item-header">
          <h4 className="item-name">{item.name}</h4>
          <div className="item-price">
            {formatCurrency(parsedPrice)}
          </div>
        </div>
        
        {item.tags && item.tags.length > 0 && (
          <div className="item-tags">
            {item.tags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}

        <div className="item-status">
          <div className="status-row">
            <span className={`status-indicator ${isClaimed ? 'claimed' : 'available'}`} />
            <span className="status-text">{getStatusText()}</span>
          </div>
          {claimedByPerson && (
            <div className="claimed-by">
              <div
                className="person-avatar tiny"
                style={{ backgroundColor: claimedByPerson.color }}
              >
                {claimedByPerson.name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>

        {item.confidence && (
          <div className="item-confidence">
            Confidence: {Math.round(item.confidence * 100)}%
          </div>
        )}
      </div>

      <button
        className={`claim-button ${isClaimed ? (canUnclaim ? 'unclaim' : 'disabled') : 'available'}`}
        onClick={handleClick}
        disabled={isPending || (isClaimed && !canUnclaim)}
      >
        {getButtonText()}
      </button>
    </div>
  );
}
