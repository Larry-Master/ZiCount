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
        <h2 className="text-lg font-semibold text-gray-900 mb-3 sm:mb-0">All Receipts</h2>
        
        {/* Mobile-first responsive totals */}
        <div className="grid grid-cols-1 sm:flex sm:gap-4 gap-2 text-sm">
          <div className="flex items-center justify-between sm:justify-start gap-2 p-2 sm:p-0 bg-gray-50 sm:bg-transparent rounded-lg sm:rounded-none">
            <span className="text-gray-500 font-medium">Total Value:</span>
            <span className="font-semibold text-gray-900">{formatCurrency(totalOverall)}</span>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2 p-2 sm:p-0 bg-indigo-50 sm:bg-transparent rounded-lg sm:rounded-none">
            <span className="text-gray-500 font-medium">Total Claimed:</span>
            <span className="font-semibold text-indigo-600">{formatCurrency(totalClaimedOverall)}</span>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2 p-2 sm:p-0 bg-green-50 sm:bg-transparent rounded-lg sm:rounded-none">
            <span className="text-gray-500 font-medium">Remaining:</span>
            <span className="font-semibold text-green-600">{formatCurrency(totalOverall - totalClaimedOverall)}</span>
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
            <button key={receipt.id} onClick={() => onReceiptSelect(receipt.id)} className="w-full text-left bg-white border border-gray-100 rounded-lg p-4 hover:shadow-md transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                {/* Main content area */}
                <div className="flex-1 min-w-0">
                  {/* Receipt header */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-semibold text-gray-900 truncate flex-1 mr-3">
                      {receipt.name || `Receipt #${receipt.id}`}
                    </h3>
                    <div className="flex-shrink-0">
                      <span className="text-lg font-bold text-indigo-600">
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Receipt details */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    {!isManualReceipt && (
                      <>
                        <div>Items: <span className="font-medium">{receipt.items?.length || 0}</span></div>
                        <div>Claimed: <span className="font-medium">{claimedCount}</span></div>
                        <div>Claimed Amount: <span className="font-medium text-indigo-600">{formatCurrency(claimedAmount)}</span></div>
                      </>
                    )}
                    {isManualReceipt && (
                      <div className="text-blue-600 font-medium">Manual Receipt</div>
                    )}
                  </div>
                </div>

                {/* Progress section - only for uploaded receipts */}
                {!isManualReceipt && (
                  <div className="flex-shrink-0 w-full sm:w-32 mt-2 sm:mt-0">
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-indigo-500 h-2 transition-all duration-300" style={{ width: `${totalAmount > 0 ? (claimedAmount / totalAmount) * 100 : 0}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-gray-500 text-right">
                      {Math.round(totalAmount > 0 ? (claimedAmount / totalAmount) * 100 : 0)}% claimed
                    </div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
