/**
 * DebtSolver Component
 * 
 * Advanced debt calculation and settlement system for shared expenses.
 * This component analyzes all receipts and claims to determine who owes
 * money to whom, then calculates the minimum number of transactions
 * needed to settle all debts.
 * 
 * Key Features:
 * - Precise cent-based calculations to avoid floating point errors
 * - Handles both individually claimed items and shared expenses  
 * - Calculates optimal settlement transactions (minimal transfers)
 * - Supports partial participants (not everyone splits everything)
 * - Deterministic remainder distribution for exact splits
 * 
 * Algorithm:
 * 1. Calculate individual balances (what each person owes/is owed)
 * 2. Sort people by debt amounts (creditors vs debtors)
 * 3. Match largest creditor with largest debtor iteratively
 * 4. Generate minimal set of settlement transactions
 */

import React, { useMemo } from 'react';
import { useReceipts } from '@/lib/hooks/useReceipts';
import { usePeople } from '@/lib/hooks/usePeople';
import { formatCurrency } from '@/lib/utils/currency';

/**
 * Core debt settlement computation engine
 * 
 * Uses cent-based integer arithmetic for precision and deterministic results.
 * Handles complex scenarios including:
 * - Mixed individual and shared expenses
 * - Variable participant groups per receipt
 * - Remainder distribution for uneven splits
 * 
 * @param {Array} receipts - All receipt data with items and claims
 * @param {Array} people - All registered people/users
 * @returns {Object} Settlement plan with transactions and final balances
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

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Schulden (Abrechnung)</h3>
      {loading && <div className="text-sm text-gray-500">Belege werden geladen…</div>}

      {!loading && (
        <>
          <h4 className="text-md font-semibold mt-2 mb-4">Bilanzen</h4>
          <div className="space-y-2">
            {sortedPeopleByBalance.map((p, index) => {
              const amt = balances[p.id] || 0;
              const cls = amt > 0 ? 'text-green-600' : amt < 0 ? 'text-red-600' : 'text-gray-600';

              return (
                <div
                  key={p.id}
                  className="debt-person-item flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span className="debt-person-name">{p.name}</span>
                  <span className={`debt-amount font-medium ${cls}`}>{formatCurrency(amt)}</span>
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
                <div
                  key={idx}
                  className="settlement-item p-3 bg-gray-50 rounded-lg"
                >
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
