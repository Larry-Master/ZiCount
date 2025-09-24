import { formatCurrency } from '@/lib/utils/currency';

export default function ReceiptList({ receipts, onReceiptSelect, loading }) {
  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading receipts...</div>;
  }

  if (!receipts?.length) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-800">No receipts found</h2>
        <p className="text-gray-500 mt-2">Upload your first receipt to get started!</p>
      </div>
    );
  }

  // Calculate total value: sum of all receipts using API totalAmount
  const totalOverall = receipts.reduce((sum, receipt) => {
    // Use API totalAmount if available, otherwise fallback to 0
    if (receipt.totalAmount !== undefined) {
      return sum + receipt.totalAmount;
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
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">All Receipts</h2>
        <div className="mt-3 sm:mt-0 flex gap-4 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Total Value:</span>
            <span className="font-medium">{formatCurrency(totalOverall)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Total Claimed:</span>
            <span className="font-medium text-indigo-600">{formatCurrency(totalClaimedOverall)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Remaining:</span>
            <span className="font-medium">{formatCurrency(totalOverall - totalClaimedOverall)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {receipts.map(receipt => {
          // Use API totalAmount
          const totalAmount = receipt.totalAmount || 0;
          const claimedAmount = (receipt.items || [])
            .filter(item => item.claimedBy)
            .reduce((sum, item) => {
              const price = typeof item.price === 'object' ? item.price.value : item.price;
              return sum + (parseFloat(price) || 0);
            }, 0);
          const claimedCount = (receipt.items || []).filter(item => item.claimedBy).length;
          
          // Check if this is a manual receipt (items have 'manual' tag)
          const isManualReceipt = receipt.items && receipt.items.length > 0 && receipt.items[0].tags?.includes('manual');
          
          return (
            <button key={receipt.id} onClick={() => onReceiptSelect(receipt.id)} className="w-full text-left bg-white border border-gray-100 rounded-lg p-4 hover:shadow transition flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">{receipt.name || `Receipt #${receipt.id}`}</h3>
                 
                </div>
                <div className="mt-2 text-sm text-gray-600 flex gap-4 flex-wrap">
                  {!isManualReceipt && (
                    <>
                      <div>Items: <span className="font-medium">{receipt.items?.length || 0}</span></div>
                      <div>Claimed: <span className="font-medium">{claimedCount}</span></div>
                    </>
                  )}
                  <div>Total: <span className="font-medium">{formatCurrency(totalAmount)}</span></div>
                  {!isManualReceipt && (
                    <div>Claimed Amount: <span className="font-medium text-indigo-600">{formatCurrency(claimedAmount)}</span></div>
                  )}
                </div>
              </div>

              <div className="sm:w-48">
                {!isManualReceipt && (
                  <>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-indigo-500 h-2" style={{ width: `${totalAmount > 0 ? (claimedAmount / totalAmount) * 100 : 0}%` }} />
                    </div>

                    <div className="mt-2 text-xs text-gray-500 text-right">{formatCurrency(claimedAmount)} / {formatCurrency(totalAmount)} claimed</div>
                  </>
                )}
                {isManualReceipt && (
                  <div className="text-xs text-gray-500 text-right">Manual Receipt</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
