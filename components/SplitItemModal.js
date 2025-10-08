import { useState } from 'react';
import { formatCurrency, parsePrice } from '@/lib/utils/currency';

export default function SplitItemModal({ item, onSplit, onCancel }) {
  const [numberOfSplits, setNumberOfSplits] = useState(2);
  const [customSplits, setCustomSplits] = useState([]);
  const [splitMode, setSplitMode] = useState('equal'); // 'equal' or 'custom'
  const [loading, setLoading] = useState(false);

  const price = typeof item.price === 'object' ? item.price.value : item.price;
  const parsedPrice = parsePrice(price);

  // Initialize custom splits when switching to custom mode
  const initializeCustomSplits = () => {
    const splits = Array(numberOfSplits).fill(0).map((_, i) => ({
      amount: (parsedPrice / numberOfSplits).toFixed(2),
      name: `${item.name} (${i + 1})`
    }));
    setCustomSplits(splits);
  };

  const handleSplitModeChange = (mode) => {
    setSplitMode(mode);
    if (mode === 'custom' && customSplits.length === 0) {
      initializeCustomSplits();
    }
  };

  const handleNumberOfSplitsChange = (value) => {
    // Allow empty string for user to clear and type new value
    if (value === '') {
      setNumberOfSplits('');
      return;
    }
    
    const num = parseInt(value);
    // Allow any number input, will validate on blur
    if (!isNaN(num)) {
      setNumberOfSplits(num);
      
      if (splitMode === 'custom' && num >= 2 && num <= 10) {
        const splits = Array(num).fill(0).map((_, i) => ({
          amount: customSplits[i]?.amount || (parsedPrice / num).toFixed(2),
          name: customSplits[i]?.name || `${item.name} (${i + 1})`
        }));
        setCustomSplits(splits);
      }
    }
  };

  const handleNumberOfSplitsBlur = () => {
    // On blur, clamp the value to valid range
    if (numberOfSplits === '' || numberOfSplits < 2) {
      setNumberOfSplits(2);
    } else if (numberOfSplits > 10) {
      setNumberOfSplits(10);
    }
    
    // Update custom splits with the clamped value
    if (splitMode === 'custom') {
      const validNum = Math.max(2, Math.min(10, parseInt(numberOfSplits) || 2));
      const splits = Array(validNum).fill(0).map((_, i) => ({
        amount: customSplits[i]?.amount || (parsedPrice / validNum).toFixed(2),
        name: customSplits[i]?.name || `${item.name} (${i + 1})`
      }));
      setCustomSplits(splits);
    }
  };

  const handleCustomSplitChange = (index, field, value) => {
    const newSplits = [...customSplits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setCustomSplits(newSplits);
  };

  const getTotalCustomAmount = () => {
    return customSplits.reduce((sum, split) => sum + (parseFloat(split.amount) || 0), 0);
  };

  const isValid = () => {
    const numSplits = parseInt(numberOfSplits);
    if (splitMode === 'equal') {
      return numSplits >= 2 && numSplits <= 10;
    } else {
      const total = getTotalCustomAmount();
      const diff = Math.abs(total - parsedPrice);
      return diff < 0.01 && customSplits.every(split => split.name.trim() !== '') && numSplits >= 2 && numSplits <= 10;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid()) return;

    setLoading(true);
    try {
      let splits;
      const validNum = Math.max(2, Math.min(10, parseInt(numberOfSplits) || 2));
      
      if (splitMode === 'equal') {
        // Calculate split with proper rounding to avoid floating point issues
        const priceInCents = Math.round(parsedPrice * 100);
        const baseAmountInCents = Math.floor(priceInCents / validNum);
        const remainderCents = priceInCents - (baseAmountInCents * validNum);
        
        splits = Array(validNum).fill(0).map((_, i) => {
          // Distribute remainder cents to first N items (one cent each)
          const amountInCents = baseAmountInCents + (i < remainderCents ? 1 : 0);
          const amount = amountInCents / 100;
          
          return {
            name: `${item.name} (${i + 1})`,
            amount: amount
          };
        });
      } else {
        splits = customSplits.map((split, i) => ({
          name: split.name || `${item.name} (${i + 1})`,
          amount: parseFloat(split.amount)
        }));
      }

      await onSplit(splits);
    } catch (err) {
      console.error('Split failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onCancel}>
      <div 
        className="w-full sm:w-[600px] bg-white rounded-t-xl sm:rounded-xl p-4 sm:p-6 shadow-lg max-h-[90vh] overflow-y-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Split Item</h3>
            <div className="text-sm text-gray-500 mt-1">{item.name}</div>
            <div className="text-sm font-semibold text-indigo-600 mt-1">
              Total: {formatCurrency(parsedPrice)}
            </div>
          </div>
          <button 
            aria-label="Close" 
            onClick={onCancel} 
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Split Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Split Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSplitModeChange('equal')}
                className={`px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all ${
                  splitMode === 'equal'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                Equal Split
              </button>
              <button
                type="button"
                onClick={() => handleSplitModeChange('custom')}
                className={`px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all ${
                  splitMode === 'custom'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                Custom Split
              </button>
            </div>
          </div>

          {/* Number of Splits */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of Parts (2-10)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="2"
              max="10"
              value={numberOfSplits}
              onChange={(e) => handleNumberOfSplitsChange(e.target.value)}
              onBlur={handleNumberOfSplitsBlur}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Preview Section */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Preview</h4>
            
            {splitMode === 'equal' ? (
              <div className="space-y-2">
                {Array(Math.max(2, Math.min(10, parseInt(numberOfSplits) || 2))).fill(0).map((_, i) => {
                  const validNum = Math.max(2, Math.min(10, parseInt(numberOfSplits) || 2));
                  // Calculate split with proper rounding
                  const priceInCents = Math.round(parsedPrice * 100);
                  const baseAmountInCents = Math.floor(priceInCents / validNum);
                  const remainderCents = priceInCents - (baseAmountInCents * validNum);
                  
                  // Distribute remainder cents to first N items (one cent each)
                  const amountInCents = baseAmountInCents + (i < remainderCents ? 1 : 0);
                  const amount = amountInCents / 100;
                  
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200">
                      <span className="text-sm text-gray-700">({i + 1})</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {customSplits.map((split, i) => (
                  <div key={i} className="p-3 bg-white rounded-md border border-gray-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Name</label>
                        <input
                          type="text"
                          value={split.name}
                          onChange={(e) => handleCustomSplitChange(i, 'name', e.target.value)}
                          placeholder={`${item.name} (${i + 1})`}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Amount (€)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={split.amount}
                          onChange={(e) => handleCustomSplitChange(i, 'amount', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Total Validation */}
                <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-md border border-indigo-200">
                  <span className="text-sm font-medium text-gray-700">Total</span>
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${
                      Math.abs(getTotalCustomAmount() - parsedPrice) < 0.01
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {formatCurrency(getTotalCustomAmount())}
                    </span>
                    {Math.abs(getTotalCustomAmount() - parsedPrice) >= 0.01 && (
                      <div className="text-xs text-red-600 mt-1">
                        Difference: {formatCurrency(Math.abs(getTotalCustomAmount() - parsedPrice))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button 
              type="button" 
              onClick={onCancel} 
              disabled={loading} 
              className="btn-secondary w-full"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || !isValid()} 
              className="btn-primary w-full"
            >
              {loading ? 'Splitting...' : `Split into ${parseInt(numberOfSplits) || 2} parts`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
