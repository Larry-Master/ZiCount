import React, { useMemo } from 'react';
import { useReceipts } from '@/lib/hooks/useReceipts';
import { usePeople } from '@/lib/hooks/usePeople';
import { formatCurrency } from '@/lib/utils/currency';

/**
 * computeSettlements
 *
 * Robust cent-based settlement engine.
 * - Uses integer cents for all computations
 * - Ignores unknown user IDs in splits (but warns in dev)
 * - Deterministically distributes any cent residual so ledger sums to zero
 * - Produces a greedy minimal transfer set (largest creditor ↔ largest debtor)
 *
 * @param {Array} receipts
 * @param {Array} people
 * @returns {{settlements: Array<{from:string,to:string,amount:number}>, balances: Record<string, number>}}
 */
function computeSettlements(receipts = [], people = []) {
  const toCents = (amt = 0) => Math.round(Number(amt || 0) * 100);
  const fromCents = (cents = 0) => cents / 100;

  // Known people set (used to ignore unknown IDs appearing in receipts)
  const validPeopleIds = new Set((people || []).map((p) => p.id));

  // Initialize balances (in cents) only for known users
  const balances = {};
  (people || []).forEach((p) => {
    if (p && p.id) balances[p.id] = 0;
  });

  (receipts || []).forEach((r, receiptIndex) => {
    const total = r?.totalAmount ?? 0;
    const totalCents = toCents(total);
    const payer = r?.uploadedBy;

    // If payer is not a known user, skip this receipt and warn (can't assign credits to unknowns)
    if (!payer || !validPeopleIds.has(payer) || totalCents === 0) {
      if (process.env.NODE_ENV !== 'production') {
        if (!payer) {
          console.warn(`[DebtSolver] Receipt #${receiptIndex} missing payer (uploadedBy). Skipping.`);
        } else if (!validPeopleIds.has(payer)) {
          console.warn(`[DebtSolver] Receipt #${receiptIndex} uploadedBy (${payer}) not found in people. Skipping.`);
        } else if (totalCents === 0) {
          console.warn(`[DebtSolver] Receipt #${receiptIndex} has totalAmount 0. Skipping.`);
        }
      }
      return;
    }

    // Participants: keep only known users
    const rawParticipants = Array.isArray(r?.participants) ? r.participants.filter(Boolean) : [];
    const unknownParticipants = rawParticipants.filter((id) => !validPeopleIds.has(id));
    if (unknownParticipants.length && process.env.NODE_ENV !== 'production') {
      console.warn(
        `[DebtSolver] Receipt #${receiptIndex} has participants not found in people: ${unknownParticipants.join(', ')}. They will be ignored for splitting.`
      );
    }
    const participants = rawParticipants.filter((pid) => validPeopleIds.has(pid));

    // Calculate claimed items cost (only count claims from known people)
    const items = Array.isArray(r?.items) ? r.items : [];
    let claimedTotalCents = 0;
    const claimedByPerson = {};

    items.forEach((item, itemIndex) => {
      const claimer = item?.claimedBy;
      if (!claimer) return;
      if (!validPeopleIds.has(claimer)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[DebtSolver] Receipt #${receiptIndex} item #${itemIndex} claimedBy (${claimer}) not found in people. Ignoring this claim.`
          );
        }
        return;
      }

      const rawPrice =
        item?.price && typeof item.price === 'object'
          ? item.price.value ?? item.price.amount ?? 0
          : item?.price ?? 0;

      const itemCents = toCents(rawPrice);
      claimedTotalCents += itemCents;
      claimedByPerson[claimer] = (claimedByPerson[claimer] || 0) + itemCents;
    });

    // Remaining cost after claimed items
    const remainingCents = totalCents - claimedTotalCents;

    // Payer paid the full receipt amount (credit)
    balances[payer] += totalCents;

    // Charge claimed items to their claimers (only known users present in claimedByPerson)
    Object.keys(claimedByPerson).forEach((pid) => {
      balances[pid] -= claimedByPerson[pid];
    });

    // Split remaining cost among participants only (if any participants selected and remaining cost > 0)
    if (participants.length > 0 && remainingCents > 0) {
      const baseSplit = Math.floor(remainingCents / participants.length);
      let remainder = remainingCents - baseSplit * participants.length;

      // Deterministic distribution: iterate in participants array order
      participants.forEach((pid) => {
        const extra = remainder > 0 ? 1 : 0;
        const share = baseSplit + extra;
        balances[pid] -= share;
        if (remainder > 0) remainder--;
      });
    }
    // If no participants selected or remainingCents <= 0, payer effectively keeps the remainder/overcharge
  });

  // Ensure overall ledger sums to zero by adjusting any cent residuals deterministically.
  const ids = Object.keys(balances);
  let totalCentsSum = ids.reduce((s, id) => s + (balances[id] || 0), 0);

  if (totalCentsSum !== 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DebtSolver] Ledger residual detected: ${fromCents(totalCentsSum)}. Distributing deterministically.`);
    }

    let residual = totalCentsSum;

    const findLargestCreditor = () =>
      ids.reduce((bestId, id) => {
        if ((balances[id] || 0) <= 0) return bestId;
        if (!bestId) return id;
        return balances[id] > balances[bestId] ? id : bestId;
      }, null);

    const findLargestDebtor = () =>
      ids.reduce((bestId, id) => {
        if ((balances[id] || 0) >= 0) return bestId;
        if (!bestId) return id;
        return balances[id] < balances[bestId] ? id : bestId;
      }, null);

    // Loop is tiny — residual should be only a few cents in normal cases
    while (residual !== 0) {
      if (residual > 0) {
        const cid = findLargestCreditor();
        if (cid) {
          balances[cid] -= 1;
          residual -= 1;
        } else {
          balances[ids[0]] -= 1;
          residual -= 1;
        }
      } else {
        const did = findLargestDebtor();
        if (did) {
          balances[did] += 1;
          residual += 1;
        } else {
          balances[ids[0]] += 1;
          residual += 1;
        }
      }
    }
    totalCentsSum = ids.reduce((s, id) => s + (balances[id] || 0), 0);
    if (totalCentsSum !== 0 && process.env.NODE_ENV !== 'production') {
      console.error('[DebtSolver] Failed to normalize ledger completely. Residual remains:', fromCents(totalCentsSum));
    }
  }

  // Build creditors/debtors (in cents)
  const creditors = [];
  const debtors = [];
  Object.keys(balances).forEach((id) => {
    const cents = balances[id] || 0;
    if (cents > 0) creditors.push({ id, amount: cents });
    else if (cents < 0) debtors.push({ id, amount: -cents }); // store positive magnitude for debtors
  });

  // Sort descending so we match largest first
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  // Greedy match for minimal transactions
  const settlementsInCents = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(debtor.amount, creditor.amount);

    settlementsInCents.push({ from: debtor.id, to: creditor.id, amount: pay });

    debtor.amount -= pay;
    creditor.amount -= pay;

    if (debtor.amount === 0) i++;
    if (creditor.amount === 0) j++;
  }

  // Convert back to currency numbers for UI
  const settlements = settlementsInCents.map((s) => ({
    from: s.from,
    to: s.to,
    amount: fromCents(s.amount),
  }));

  const balancesInCurrency = Object.fromEntries(
    Object.entries(balances).map(([id, cents]) => [id, fromCents(cents)])
  );

  return { settlements, balances: balancesInCurrency };
}

/**
 * DebtSolver component
 */
export default function DebtSolver() {
  const { receipts, loading } = useReceipts();
  const { people } = usePeople();

  const { settlements, balances } = useMemo(
    () => computeSettlements(receipts || [], people || []),
    [receipts, people]
  );

  const getName = (id) => {
    const person = (people || []).find((p) => p.id === id);
    return person ? person.name : `Unknown User (${id})`;
  };

  // Calculate total amount from all receipts for bar scaling
  const totalFromAllReceipts = (receipts || []).reduce((sum, receipt) => {
    return sum + (receipt.totalAmount || 0);
  }, 0);

  // Sorted people by balance (descending)
  const sortedPeopleByBalance = (people || [])
    .slice()
    .sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Schulden (Abrechnung)</h3>
      {loading && <div className="text-sm text-gray-500">Belege werden geladen…</div>}

      {!loading && (
        <>
          <h4 className="text-md font-semibold mt-2 mb-4">Bilanzen</h4>
          <div className="space-y-2">
            {sortedPeopleByBalance.map((p) => {
              const amt = balances[p.id] || 0;
              const cls = amt > 0 ? 'text-green-600' : amt < 0 ? 'text-red-600' : 'text-gray-600';

              // Calculate bar width based on total from all receipts for meaningful scale
              const barWidth = totalFromAllReceipts > 0 ? (Math.abs(amt) / totalFromAllReceipts) * 100 : 0;
              const isPositive = amt > 0;
              const isNegative = amt < 0;

              return (
                <div key={p.id} className="debt-person-item p-3 bg-gray-50 rounded-lg">
                  <div className="debt-person-header flex items-center justify-between mb-2">
                    <span className="debt-person-name">{p.name}</span>
                    <span className={`debt-amount font-medium ${cls}`}>{formatCurrency(amt)}</span>
                  </div>
                  {(isPositive || isNegative) && (
                    <div className="debt-bar-container bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`debt-bar ${isPositive ? 'debt-bar-positive' : 'debt-bar-negative'} h-2 rounded-full`}
                        style={{ width: `${barWidth}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h4 className="text-md font-semibold mt-4 mb-4">Ausgleichszahlungen</h4>
          {(!settlements || settlements.length === 0) ? (
            <div className="text-gray-600 text-center py-8 bg-green-50 rounded-xl">
              <div className="text-2xl mb-2">🎉</div>
              <div className="font-medium">Keine offenen Schulden</div>
              <div className="text-sm">Alle sind ausgeglichen!</div>
            </div>
          ) : (
            <div className="space-y-3">
              {settlements.map((s, idx) => (
                <div key={idx} className="settlement-item p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="settlement-info">
                      <span className="settlement-name font-medium text-red-600">{getName(s.from)}</span>
                      <span className="mx-2">→</span>
                      <span className="settlement-name font-medium text-green-600">{getName(s.to)}</span>
                    </div>
                    <div className="settlement-amount font-semibold text-blue-600">{formatCurrency(s.amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
