
import { BillItem, Friend, TaxCategory, GST_RATE, PST_RATE, Settlement } from '../types';

export const calculateItemTotals = (items: BillItem[]) => {
  let subtotal = 0;
  let gst = 0;
  let pst = 0;

  items.forEach(item => {
    subtotal += item.price;
    if (!item.isTaxIncluded) {
      gst += item.price * GST_RATE;
      if (item.taxCategory === TaxCategory.CONTAINERS) {
        pst += item.price * PST_RATE;
      }
    }
  });

  return { subtotal, gst, pst, total: subtotal + gst + pst };
};

export const calculateIndividualCosts = (
  friends: Friend[],
  items: BillItem[],
  tipAmount: number
) => {
  const { total: billTotal } = calculateItemTotals(items);
  const costMap: Record<string, number> = {};
  
  friends.forEach(f => costMap[f.id] = 0);

  items.forEach(item => {
    if (item.sharedWith.length === 0) return;
    
    let itemTotal = item.price;
    if (!item.isTaxIncluded) {
      const itemGst = item.price * GST_RATE;
      const itemPst = item.taxCategory === TaxCategory.CONTAINERS ? item.price * PST_RATE : 0;
      itemTotal = item.price + itemGst + itemPst;
    }
    
    const share = itemTotal / item.sharedWith.length;
    item.sharedWith.forEach(friendId => {
      costMap[friendId] += share;
    });
  });

  // Distribute tip proportionally to the share of the bill
  if (billTotal > 0) {
    friends.forEach(f => {
      const proportion = costMap[f.id] / billTotal;
      costMap[f.id] += proportion * tipAmount;
    });
  }

  return costMap;
};

export const solveDebts = (
  balances: Record<string, number>,
  friends: Friend[]
): Settlement[] => {
  const settleList: Settlement[] = [];
  
  // Merge balances for couples
  const processedBalances: Record<string, number> = {};
  const processedFriendIds = new Set<string>();
  const namesMap: Record<string, string> = {}; 

  friends.forEach(f => {
    if (processedFriendIds.has(f.id)) return;

    if (f.partnerId) {
      const partner = friends.find(p => p.id === f.partnerId);
      if (partner) {
        const combinedId = `couple_${f.id}_${partner.id}`;
        processedBalances[combinedId] = (balances[f.id] || 0) + (balances[partner.id] || 0);
        namesMap[combinedId] = `${f.name} & ${partner.name}`;
        processedFriendIds.add(f.id);
        processedFriendIds.add(partner.id);
      } else {
        processedBalances[f.id] = balances[f.id] || 0;
        namesMap[f.id] = f.name;
        processedFriendIds.add(f.id);
      }
    } else {
      processedBalances[f.id] = balances[f.id] || 0;
      namesMap[f.id] = f.name;
      processedFriendIds.add(f.id);
    }
  });

  const credit = Object.keys(processedBalances)
    .filter(id => processedBalances[id] > 0.01)
    .sort((a, b) => processedBalances[b] - processedBalances[a]);
  const debit = Object.keys(processedBalances)
    .filter(id => processedBalances[id] < -0.01)
    .sort((a, b) => processedBalances[a] - processedBalances[b]);

  let i = 0, j = 0;
  const tempBalances = { ...processedBalances };

  while (i < credit.length && j < debit.length) {
    const creditor = credit[i];
    const debtor = debit[j];
    const amount = Math.min(tempBalances[creditor], -tempBalances[debtor]);

    if (amount > 0.01) {
      settleList.push({
        from: debtor,
        to: creditor,
        fromName: namesMap[debtor],
        toName: namesMap[creditor],
        amount: Number(amount.toFixed(2))
      });
    }

    tempBalances[creditor] -= amount;
    tempBalances[debtor] += amount;

    if (tempBalances[creditor] < 0.01) i++;
    if (tempBalances[debtor] > -0.01) j++;
  }

  return settleList;
};
