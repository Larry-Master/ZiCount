import { formatCurrency, calculateTotal } from '@/lib/utils/currency';

export default function ReceiptList({ receipts, onReceiptSelect, loading }) {
  if (loading) {
    return <div>Loading receipts...</div>;
  }

  if (!receipts?.length) {
    return (
      <div className="no-receipts">
        <h2>No receipts found</h2>
        <p>Upload your first receipt to get started!</p>
      </div>
    );
  }

  // Calculate total value: sum of all items (manual and uploaded receipts)
  const totalOverall = receipts.reduce((sum, receipt) => {
    // If receipt has participants and items, sum per participant cost
    if (receipt.participants && receipt.participants.length > 0) {
      // Manual receipts: items have participant field
      if (receipt.items && receipt.items.every(it => it.participant)) {
        return sum + receipt.items.reduce((s, it) => s + (typeof it.price === 'object' ? it.price.value : it.price), 0);
      } else if (receipt.items && receipt.items.length > 0) {
        // Uploaded receipts: split total equally
        const total = calculateTotal(receipt.items);
        return sum + total;
      }
    } else {
      // No participants: fallback to total
      return sum + calculateTotal(receipt.items || []);
    }
    return sum;
  }, 0);

  // Total claimed: only claimed items
  const totalClaimedOverall = receipts.reduce((sum, receipt) => {
    const claimedAmount = (receipt.items || [])
      .filter(item => item.claimedBy)
      .reduce((claimedSum, item) => {
        const price = typeof item.price === 'object' ? item.price.value : item.price;
        return claimedSum + (parseFloat(price) || 0);
      }, 0);
    return sum + claimedAmount;
  }, 0);

  return (
    <div className="receipts-overview">
      <div className="overview-header">
        <h2>All Receipts</h2>
        <div className="overview-totals">
          <div className="total-item">
            <span className="total-label">Total Value:</span>
            <span className="total-amount">{formatCurrency(totalOverall)}</span>
          </div>
          <div className="total-item">
            <span className="total-label">Total Claimed:</span>
            <span className="total-amount claimed">{formatCurrency(totalClaimedOverall)}</span>
          </div>
          <div className="total-item">
            <span className="total-label">Remaining:</span>
            <span className="total-amount remaining">{formatCurrency(totalOverall - totalClaimedOverall)}</span>
          </div>
        </div>
      </div>

      <div className="receipt-list">
        {receipts.map(receipt => {
          const totalAmount = calculateTotal(receipt.items || []);
          const claimedAmount = (receipt.items || [])
            .filter(item => item.claimedBy)
            .reduce((sum, item) => {
              const price = typeof item.price === 'object' ? item.price.value : item.price;
              return sum + (parseFloat(price) || 0);
            }, 0);
          const claimedCount = (receipt.items || []).filter(item => item.claimedBy).length;
          
          return (
            <div 
              key={receipt.id} 
              className="receipt-item"
              onClick={() => onReceiptSelect(receipt.id)}
            >
              <div className="receipt-header">
                <h3>{receipt.name || `Receipt #${receipt.id}`}</h3>
                <span className="receipt-date">
                  {new Date(receipt.createdAt).toLocaleDateString('de-DE')}
                </span>
              </div>
              
              <div className="receipt-stats">
                <div className="stat-group">
                  <span className="stat-label">Items:</span>
                  <span className="stat-value">{receipt.items?.length || 0}</span>
                </div>
                <div className="stat-group">
                  <span className="stat-label">Claimed:</span>
                  <span className="stat-value">{claimedCount}</span>
                </div>
                <div className="stat-group">
                  <span className="stat-label">Total:</span>
                  <span className="stat-value">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="stat-group">
                  <span className="stat-label">Claimed Amount:</span>
                  <span className="stat-value claimed-amount">{formatCurrency(claimedAmount)}</span>
                </div>
              </div>

              <div className="receipt-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ 
                      width: `${totalAmount > 0 ? (claimedAmount / totalAmount) * 100 : 0}%` 
                    }}
                  />
                </div>
                <span className="progress-text">
                  {formatCurrency(claimedAmount)} / {formatCurrency(totalAmount)} claimed
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
