import React, { useMemo } from 'react';
import { useReceipts } from '@/lib/hooks/useReceipts';
import { usePeople } from '@/lib/hooks/usePeople';
import { formatCurrency } from '@/lib/utils/currency';

/**
 * Debt solver / settlement computation (cents-based for exact math)
 *
 * - Works entirely in integer cents to avoid floating point drift.
 * - Derives participants from r.participants and item.claimedBy, ensures payer included.
 * - Splits remainders deterministically (participants sorted by id).
 * - Accounts for solo claimed items separately from shared items.
 * - Returns { settlements: [{from,to,amount}], balances: { personId: amountInCurrency } }
 */

function computeSettlements(receipts = [], people = []) {
  const toCents = (amt = 0) => Math.round(Number(amt || 0) * 100);
  const fromCents = (cents = 0) => cents / 100;

  // Initialize balances (in cents)
  const balances = {};
  (people || []).forEach((p) => {
    if (p && p.id) balances[p.id] = 0;
  });

  (receipts || []).forEach((r) => {
    // Use only the totalAmount from the receipt
    const total = r?.totalAmount || 0;
    const totalCents = toCents(total);
    const payer = r?.uploadedBy;
    if (!payer || totalCents === 0) return;

    // Get explicitly selected participants
    const participants = Array.isArray(r?.participants) ? r.participants.filter(Boolean) : [];
    
    // Calculate claimed items cost
    const items = Array.isArray(r?.items) ? r.items : [];
    let claimedTotalCents = 0;
    const claimedByPerson = {};

    items.forEach((item) => {
      if (item?.claimedBy) {
        const rawPrice = item?.price && typeof item.price === 'object'
          ? (item.price.value ?? item.price.amount ?? 0)
          : item?.price ?? 0;
        const itemCents = toCents(rawPrice);
        
        claimedTotalCents += itemCents;
        claimedByPerson[item.claimedBy] = (claimedByPerson[item.claimedBy] || 0) + itemCents;
      }
    });

    // Remaining cost after claimed items
    const remainingCents = totalCents - claimedTotalCents;
    
    // Ensure balances has entries for payer, participants, and claimers
    if (!(payer in balances)) balances[payer] = 0;
    participants.forEach((pid) => {
      if (!(pid in balances)) balances[pid] = 0;
    });
    Object.keys(claimedByPerson).forEach((pid) => {
      if (!(pid in balances)) balances[pid] = 0;
    });

    // Payer paid the full receipt amount (credit)
    balances[payer] += totalCents;

    // Charge claimed items to their claimers
    Object.keys(claimedByPerson).forEach((pid) => {
      balances[pid] -= claimedByPerson[pid];
    });

    // Split remaining cost among participants only (if any participants selected and remaining cost > 0)
    if (participants.length > 0 && remainingCents > 0) {
      const baseSplit = Math.floor(remainingCents / participants.length);
      let remainder = remainingCents - baseSplit * participants.length;

      participants.forEach((pid) => {
        const extra = remainder > 0 ? 1 : 0;
        const share = baseSplit + extra;
        balances[pid] -= share;
        if (remainder > 0) remainder--;
      });
    }
    // If no participants selected or all items claimed, payer keeps remaining credit
  });

  // Build creditors/debtors (in cents)
  const creditors = [];
  const debtors = [];
  Object.keys(balances).forEach((id) => {
    const cents = balances[id] || 0;
    if (cents > 0) creditors.push({ id, amount: cents });
    else if (cents < 0) debtors.push({ id, amount: -cents });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  // Greedy match
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

export default function DebtSolver() {
  const { receipts, loading } = useReceipts();
  const { people } = usePeople();

  const { settlements, balances } = useMemo(
    () => computeSettlements(receipts || [], people || []),
    [receipts, people]
  );

  const getName = (id) => (people || []).find((p) => p.id === id)?.name || id;

  // Sorted people by balance (descending)
  const sortedPeopleByBalance = (people || [])
    .slice()
    .sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));

  const biggestCreditor = sortedPeopleByBalance.find((p) => (balances[p.id] || 0) > 0);
  const biggestDebtor = [...sortedPeopleByBalance].reverse().find((p) => (balances[p.id] || 0) < 0);

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Schulden (Abrechnung)</h3>
      {loading && <div className="text-sm text-gray-500">Belege werden geladen…</div>}

      {!loading && (
        <>
          <h4 className="text-md font-semibold mt-2 mb-2">Bilanzen</h4>
          <ul className="space-y-1">
            {sortedPeopleByBalance.map((p) => {
              const amt = balances[p.id] || 0;
              const cls = amt > 0 ? 'text-green-600' : amt < 0 ? 'text-red-600' : 'text-gray-600';
              const isTopCreditor = biggestCreditor && biggestCreditor.id === p.id;
              const isTopDebtor = biggestDebtor && biggestDebtor.id === p.id;

              return (
                <li
                  key={p.id}
                  className="flex justify-between items-center text-sm p-2 rounded-md border"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{p.name}</span>
                    {isTopCreditor && (
                      <span className="inline-block text-xs font-medium bg-green-50 text-green-800 px-2 py-0.5 rounded">
                        Bezahlt alles &lt;3
                      </span>
                    )}
                    {isTopDebtor && (
                      <span className="inline-block text-xs font-medium bg-red-50 text-red-800 px-2 py-0.5 rounded">
                        Vermutlich nie beim Einkauf dabei
                      </span>
                    )}
                  </div>
                  <span className={cls}>{formatCurrency(amt)}</span>
                </li>
              );
            })}
          </ul>

          <h4 className="text-md font-semibold mt-4 mb-2">Ausgleichszahlungen</h4>
          {(!settlements || settlements.length === 0) ? (
            <div className="text-gray-600">Keine offenen Schulden — alle sind ausgeglichen.</div>
          ) : (
            <ul className="space-y-2">
              {settlements.map((s, idx) => (
                <li
                  key={idx}
                  className="p-3 border rounded-md flex justify-between items-center"
                >
                  <div>
                    <div className="text-sm text-gray-600 flex items-center gap-3">
                      <span className="text-sm text-red-600">{getName(s.from)}</span>
                      <span aria-hidden>→</span>
                      <span className="text-sm text-green-600">{getName(s.to)}</span>
                    </div>
                    <div className="text-lg font-medium">{formatCurrency(s.amount)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
