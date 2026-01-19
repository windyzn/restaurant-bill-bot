
import React, { useState, useMemo, useEffect } from 'react';
import { Friend, BillItem, TaxCategory, GST_RATE, PST_RATE } from './types';
import { calculateIndividualCosts, solveDebts, calculateItemTotals } from './utils/finance';
import StepProgress from './components/StepProgress';

const BotIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <line x1="8" y1="15" x2="8" y2="15.01" />
    <line x1="16" y1="15" x2="16" y2="15.01" />
  </svg>
);

const HeartIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
);

const App: React.FC = () => {
  const [step, setStep] = useState(1);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [items, setItems] = useState<BillItem[]>([]);
  const [tip, setTip] = useState<number>(0);
  const [tipMode, setTipMode] = useState<'amount' | 'percent' | 'total'>('percent');
  const [tipPercent, setTipPercent] = useState<number>(15);
  const [discount, setDiscount] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [manualGrandTotal, setManualGrandTotal] = useState<number>(0);
  const [payments, setPayments] = useState<Record<string, number>>({});
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [quickAmount, setQuickAmount] = useState<string>('');
  const [quickIncludesTax, setQuickIncludesTax] = useState(false);
  const [etransferEmail, setEtransferEmail] = useState('');
  const [linkingFriendId, setLinkingFriendId] = useState<string | null>(null);
  const [showCoupleHint, setShowCoupleHint] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const nextStep = () => setStep(s => Math.min(s + 1, 5));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));
  const goToStep = (s: number) => setStep(s);

  const addFriend = (name: string) => {
    if (!name.trim()) return;
    const newFriend = { id: Math.random().toString(36).substr(2, 9), name };
    setFriends([...friends, newFriend]);
  };

  const removeFriend = (id: string) => {
    const friend = friends.find(f => f.id === id);
    let updatedFriends = friends.filter(f => f.id !== id);
    if (friend?.partnerId) {
      updatedFriends = updatedFriends.map(f => f.id === friend.partnerId ? { ...f, partnerId: undefined } : f);
    }
    setFriends(updatedFriends);
    setItems(items.map(item => ({
      ...item,
      sharedWith: item.sharedWith.filter(fid => fid !== id)
    })));
  };

  const toggleCouple = (id: string) => {
    if (linkingFriendId === id) {
      setLinkingFriendId(null);
      return;
    }
    if (!linkingFriendId) {
      const friend = friends.find(f => f.id === id);
      if (friend?.partnerId) {
        setFriends(friends.map(f => 
          (f.id === id || f.id === friend.partnerId) ? { ...f, partnerId: undefined } : f
        ));
      } else {
        setLinkingFriendId(id);
      }
    } else {
      setFriends(friends.map(f => {
        if (f.id === id) return { ...f, partnerId: linkingFriendId };
        if (f.id === linkingFriendId) return { ...f, partnerId: id };
        return f;
      }));
      setLinkingFriendId(null);
    }
  };

  const addItem = (name: string, price: number, taxCategory: TaxCategory, isTaxIncluded = false) => {
    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      price,
      taxCategory,
      sharedWith: friends.map(f => f.id),
      isTaxIncluded
    };
    setItems([...items, newItem]);
  };

  const handleQuickTotalAdd = () => {
    const amount = parseFloat(quickAmount);
    if (!isNaN(amount) && amount > 0) {
      addItem("Lump Sum Total", amount, TaxCategory.FOOD, quickIncludesTax);
      setQuickAmount('');
      setShowQuickEntry(false);
      nextStep();
    }
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const toggleShare = (itemId: string, friendId: string) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const isShared = item.sharedWith.includes(friendId);
        return {
          ...item,
          sharedWith: isShared 
            ? item.sharedWith.filter(id => id !== friendId)
            : [...item.sharedWith, friendId]
        };
      }
      return item;
    }));
  };

  const splitAllEvenly = () => {
    const allFriendIds = friends.map(f => f.id);
    setItems(items.map(item => ({ ...item, sharedWith: [...allFriendIds] })));
  };

  const calculations = useMemo(() => {
    const totals = calculateItemTotals(items);
    
    let effectiveDiscount = discount;
    if (discountMode === 'percent') {
      effectiveDiscount = totals.subtotal * (discountPercent / 100);
    }

    let effectiveTip = tip;
    if (tipMode === 'percent') {
      effectiveTip = totals.subtotal * (tipPercent / 100);
    } else if (tipMode === 'total') {
      effectiveTip = Math.max(0, manualGrandTotal - totals.total + effectiveDiscount);
    }

    const netAdjustment = effectiveTip - effectiveDiscount;
    const itemCosts = calculateIndividualCosts(friends, items, netAdjustment);
    const grandTotal = totals.total + effectiveTip - effectiveDiscount;
    
    const balances: Record<string, number> = {};
    friends.forEach(f => {
      balances[f.id] = (payments[f.id] || 0) - (itemCosts[f.id] || 0);
    });
    const settlements = solveDebts(balances, friends);
    
    return { itemCosts, totals, grandTotal, settlements, effectiveTip, effectiveDiscount };
  }, [friends, items, tip, tipMode, tipPercent, discount, discountMode, discountPercent, manualGrandTotal, payments]);

  const paidTotal = useMemo(() => 
    (Object.values(payments) as number[]).reduce((acc, curr) => acc + (curr || 0), 0),
    [payments]
  );

  const setSinglePayer = (friendId: string) => {
    const newPayments: Record<string, number> = {};
    friends.forEach(f => {
      newPayments[f.id] = f.id === friendId ? Number(calculations.grandTotal.toFixed(2)) : 0;
    });
    setPayments(newPayments);
  };

  const generateReportText = () => {
    let text = `Total Bill: $${calculations.grandTotal.toFixed(2)}\n`;
    text += `-------------------\n`;
    
    if (calculations.settlements.length > 0) {
      text += `SETTLEMENTS:\n`;
      text += calculations.settlements.map(s => `• ${s.fromName} pays ${s.toName}: $${s.amount.toFixed(2)}`).join('\n');
      text += `\n-------------------\n`;
    }

    text += `BREAKDOWN:\n`;
    const breakdownLines = friends.map(f => {
      const friendItems = items.filter(item => item.sharedWith.includes(f.id));
      const totalCost = calculations.itemCosts[f.id] || 0;
      
      if (totalCost > 0) {
        const itemNames = friendItems.map(item => item.name).join(', ');
        return `${f.name}: $${totalCost.toFixed(2)} (${itemNames})`;
      }
      return null;
    }).filter(Boolean);
    
    text += breakdownLines.join('\n');
    text += `\n`;

    if (etransferEmail.trim()) {
      text += `\n💰 e-Transfer to: ${etransferEmail.trim()}\n`;
    }
    
    text += `\nSplit via Bill Bot 🤖 https://restaurant-bill-bot.vercel.app/`;
    return text;
  };

  const shareResults = async () => {
    const text = generateReportText();
    if (navigator.share) {
      try { 
        await navigator.share({ 
          title: 'Bill Summary', 
          text: text 
        }); 
      } catch (err) {
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  const copyToClipboard = async () => {
    const text = generateReportText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch (err) {
        alert("Failed to copy! Please select and copy manually.");
      }
      document.body.removeChild(textArea);
    }
  };

  const getBotSpeech = () => {
    switch (step) {
      case 1: return "Hello! I'm Billi. Who are we splitting the bill with today? You can link couples too!";
      case 2: return "Let's record everything that was ordered. Type in items below!";
      case 3: 
        if (tipMode === 'total' && manualGrandTotal === 0) {
          return "I can calculate the tip automatically! Just enter the final bill total from your receipt.";
        }
        return "Time to assign the items. Tap names to split things up!";
      case 4: return "Almost there! Tell me who paid what on the final bill.";
      case 5: return "Calculation complete! I've found the most efficient way to settle up.";
      default: return "Beep boop!";
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center p-0 md:p-8">
      <div className="w-full max-w-lg bg-white min-h-screen md:min-h-0 md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200 relative">
        <header className="bg-indigo-700 px-8 py-10 text-white relative overflow-hidden">
          <div className="absolute top-10 right-8 bot-float opacity-30"><BotIcon className="w-16 h-16" /></div>
          <div className="relative z-10 flex flex-col items-start gap-1">
            <h1 className="text-4xl font-black tracking-tight leading-none">Bill Bot</h1>
            <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-[0.2em] whitespace-nowrap">Simple restaurant bill splitter</p>
            <p className="text-indigo-300/60 text-[8px] font-black uppercase tracking-widest mt-1">made by wubdubs</p>
          </div>
        </header>

        <main className="p-6 flex-1 bg-white flex flex-col relative">
          <StepProgress currentStep={step} onStepClick={goToStep} />

          <div className="mb-8 flex items-start gap-4 animate-in fade-in slide-in-from-top-2 duration-700">
            <div className="p-2.5 bg-indigo-50 rounded-2xl text-indigo-600 shrink-0"><BotIcon className="w-6 h-6" /></div>
            <div className="pt-1"><p className="text-lg font-bold text-slate-800 leading-tight">{getBotSpeech()}</p></div>
          </div>

          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="relative">
                <input 
                  type="text" placeholder="Enter a name..." className="w-full bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 outline-none transition-all pr-14 text-lg font-bold shadow-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') { addFriend((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}
                />
                <button onClick={() => { const input = document.querySelector('input') as HTMLInputElement; addFriend(input.value); input.value = ''; }} className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 shadow-md transition-all active:scale-95">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {friends.map(f => {
                  const partner = friends.find(p => p.id === f.partnerId);
                  const isLinking = linkingFriendId === f.id;
                  return (
                    <div key={f.id} className={`bg-slate-50 border border-slate-100 p-4 rounded-2xl flex justify-between items-center group transition-all ${isLinking ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold text-slate-400 text-xs shadow-sm">{f.name[0].toUpperCase()}</div>
                        <div>
                          <span className="font-bold text-slate-700">{f.name}</span>
                          {partner && <span className="text-[10px] block text-indigo-500 font-bold uppercase tracking-tighter">❤ Linked with {partner.name}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleCouple(f.id)} className={`p-2 rounded-xl transition-all ${partner ? 'text-rose-500 bg-rose-50' : isLinking ? 'text-white bg-indigo-500' : 'text-slate-300 hover:text-indigo-500'}`} title={partner ? "Break couple" : "Link as couple"}>
                          <HeartIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => removeFriend(f.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="px-1 text-left">
                <button 
                  onClick={() => setShowCoupleHint(!showCoupleHint)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tight hover:text-indigo-500 transition-colors"
                >
                  <HeartIcon className="w-2.5 h-2.5" />
                  What is linking?
                </button>
                {showCoupleHint && (
                  <p className="mt-1 text-[9px] text-slate-400 font-medium leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    Linking two people combines their debt. They will be treated as one unit in the final results. Tap the heart icon on any person to start linking!
                  </p>
                )}
              </div>

              {linkingFriendId && <div className="text-center animate-pulse text-xs font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 py-2 rounded-xl">Select another person to link with</div>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Entry List</h2>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4 shadow-inner">
                <div className="flex p-1 bg-slate-200 rounded-xl">
                  <button onClick={() => setShowQuickEntry(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!showQuickEntry ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>Detailed</button>
                  <button onClick={() => setShowQuickEntry(true)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${showQuickEntry ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>Lump Sum</button>
                </div>
                {!showQuickEntry ? (
                  <div className="space-y-3">
                    <input id="itemName" type="text" placeholder="Item Name" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none font-bold" />
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                        <input id="itemPrice" type="number" inputMode="decimal" placeholder="0.00" className="w-full bg-white border border-slate-300 rounded-xl pl-6 pr-4 py-3 text-sm focus:border-indigo-500 outline-none font-mono" />
                      </div>
                      <select id="itemTax" className="bg-white border border-slate-300 rounded-xl px-3 py-3 text-xs font-bold text-slate-600">
                        <option value={TaxCategory.FOOD}>Food (5%)</option>
                        <option value={TaxCategory.CONTAINERS}>Takeout (12%)</option>
                        <option value="INCLUDED">Tax Included</option>
                      </select>
                    </div>
                    <button onClick={() => {
                        const n = document.getElementById('itemName') as HTMLInputElement;
                        const p = document.getElementById('itemPrice') as HTMLInputElement;
                        const t = document.getElementById('itemTax') as HTMLSelectElement;
                        if (n.value && p.value) { 
                          const isInc = t.value === 'INCLUDED';
                          const cat = isInc ? TaxCategory.FOOD : t.value as TaxCategory;
                          addItem(n.value, parseFloat(p.value), cat, isInc); 
                          n.value = ''; p.value = ''; 
                        }
                      }} className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-all active:scale-[0.98] shadow-lg shadow-indigo-100">Add Item</button>
                  </div>
                ) : (
                  <div className="space-y-4 py-2 animate-in fade-in zoom-in-95 duration-200">
                    <div className="relative max-w-[200px] mx-auto">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-600 font-black text-xl">$</span>
                      <input type="number" inputMode="decimal" value={quickAmount} onChange={(e) => setQuickAmount(e.target.value)} placeholder="0.00" className="w-full border-2 border-slate-300 rounded-2xl pl-10 pr-4 py-4 text-2xl font-black text-slate-800 text-center focus:border-indigo-500 outline-none transition-all shadow-sm" />
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setQuickIncludesTax(!quickIncludesTax)}
                        className={`flex items-center gap-3 px-5 py-3 rounded-2xl text-[11px] font-black uppercase transition-all border-2 ${quickIncludesTax ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
                      >
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${quickIncludesTax ? 'bg-white border-white text-indigo-600' : 'bg-slate-50 border-slate-200'}`}>
                          {quickIncludesTax && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"/></svg>}
                        </div>
                        Tax is already included
                      </button>
                    </div>
                    <button onClick={handleQuickTotalAdd} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl">Apply Total & Next</button>
                  </div>
                )}
              </div>
              <div className="max-h-[35vh] overflow-y-auto space-y-2 pr-1 no-scrollbar">
                {items.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-200 transition-all group">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${item.isTaxIncluded ? 'bg-indigo-50 text-indigo-600' : item.taxCategory === TaxCategory.FOOD ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.isTaxIncluded ? 'Tax Included' : item.taxCategory === TaxCategory.FOOD ? 'GST 5%' : 'GST+PST 12%'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-black text-slate-900">${item.price.toFixed(2)}</span>
                      <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              <div className="flex justify-between items-center">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Share Mapping</h2>
                <button onClick={splitAllEvenly} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 uppercase hover:bg-indigo-600 hover:text-white transition-all">Split Evenly</button>
              </div>
              <div className="relative">
                <div className={`space-y-4 max-h-[30vh] overflow-y-auto pr-1 no-scrollbar rounded-3xl ${items.length > 2 ? 'scroll-hint' : ''}`}>
                  {items.map(item => (
                    <div key={item.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:border-indigo-200 transition-all">
                      <div className="bg-slate-50 px-5 py-3 flex justify-between items-center border-b border-slate-100">
                        <span className="font-bold text-slate-800 text-sm truncate">{item.name}</span>
                        <span className="text-[10px] font-black text-slate-500 bg-white px-3 py-1 rounded-lg border border-slate-200">
                          ${(item.isTaxIncluded ? item.price : (item.price * (1 + GST_RATE + (item.taxCategory === TaxCategory.CONTAINERS ? PST_RATE : 0)))).toFixed(2)} Total
                        </span>
                      </div>
                      <div className="p-4 flex flex-wrap gap-2">
                        {friends.map(f => (
                          <button key={f.id} onClick={() => toggleShare(item.id, f.id)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 ${item.sharedWith.includes(f.id) ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-300'}`}>
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {items.length > 2 && <div className="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">↓ Scroll for more items ↓</div>}
              </div>
              
              <div className="pt-4 border-t-2 border-slate-100 space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Add Tip / Bill Total</label>
                      <button onClick={() => setTipMode('total')} className="text-[9px] font-black text-indigo-500 flex items-center gap-1 mt-1 hover:text-indigo-700 transition-colors">
                        <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        Calculate tip for me?
                      </button>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button onClick={() => setTipMode('percent')} className={`px-2 py-1.5 rounded-lg text-[9px] font-black transition-all ${tipMode === 'percent' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>%</button>
                      <button onClick={() => setTipMode('amount')} className={`px-2 py-1.5 rounded-lg text-[9px] font-black transition-all ${tipMode === 'amount' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>$</button>
                      <button onClick={() => setTipMode('total')} className={`px-2 py-1.5 rounded-lg text-[9px] font-black transition-all ${tipMode === 'total' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>BILL TOTAL</button>
                    </div>
                  </div>
                  {tipMode === 'total' ? (
                    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="relative group max-w-[240px] mx-auto">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-lg text-indigo-600">$</span>
                        <input type="number" inputMode="decimal" value={manualGrandTotal || ''} onChange={(e) => setManualGrandTotal(parseFloat(e.target.value) || 0)} placeholder="Total..." className="w-full bg-slate-50 border-2 border-indigo-100 rounded-xl py-3 pl-8 pr-4 text-xl font-black text-indigo-600 text-center focus:border-indigo-500 outline-none transition-all" autoFocus />
                      </div>
                      <div className="flex justify-between items-center px-4 bg-emerald-50 py-2 rounded-xl border border-emerald-100">
                        <span className="text-[9px] font-black text-emerald-600 uppercase">Calculated Tip</span>
                        <span className="text-sm font-black text-emerald-700 font-mono">${calculations.effectiveTip.toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative max-w-[160px] mx-auto">
                      <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-lg transition-colors ${tipMode === 'amount' ? 'text-indigo-600' : 'hidden'}`}>$</span>
                      <input type="number" inputMode="decimal" value={tipMode === 'percent' ? tipPercent : (tip || '')} onChange={(e) => tipMode === 'percent' ? setTipPercent(parseFloat(e.target.value) || 0) : setTip(parseFloat(e.target.value) || 0)} className={`w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 text-xl font-black text-indigo-600 text-center focus:border-indigo-500 outline-none transition-all shadow-sm ${tipMode === 'amount' ? 'pl-8' : ''}`} />
                      <span className={`absolute right-4 top-1/2 -translate-y-1/2 font-black text-lg transition-colors ${tipMode === 'percent' ? 'text-indigo-600' : 'hidden'}`}>%</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Add Discount</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button onClick={() => setDiscountMode('percent')} className={`px-2 py-1.5 rounded-lg text-[9px] font-black transition-all ${discountMode === 'percent' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}>%</button>
                      <button onClick={() => setDiscountMode('amount')} className={`px-2 py-1.5 rounded-lg text-[9px] font-black transition-all ${discountMode === 'amount' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}>$</button>
                    </div>
                  </div>
                  <div className="relative max-w-[160px] mx-auto">
                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-lg transition-colors text-rose-600 ${discountMode === 'amount' ? '' : 'hidden'}`}>-$</span>
                    <input 
                      type="number" 
                      inputMode="decimal" 
                      value={discountMode === 'percent' ? (discountPercent || '') : (discount || '')} 
                      onChange={(e) => discountMode === 'percent' ? setDiscountPercent(parseFloat(e.target.value) || 0) : setDiscount(parseFloat(e.target.value) || 0)} 
                      placeholder="0"
                      className={`w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 text-xl font-black text-rose-600 text-center focus:border-rose-400 outline-none transition-all shadow-sm ${discountMode === 'amount' ? 'pl-10' : ''}`} 
                    />
                    <span className={`absolute right-4 top-1/2 -translate-y-1/2 font-black text-lg transition-colors text-rose-600 ${discountMode === 'percent' ? '' : 'hidden'}`}>% off</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in zoom-in-95 duration-500">
              <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-8 -top-8 text-indigo-500 opacity-20"><BotIcon className="w-32 h-32" /></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Total</p>
                    <h3 className="text-4xl font-black mb-6">${calculations.grandTotal.toFixed(2)}</h3>
                    <div className="flex justify-between items-center text-xs font-bold border-t border-white/10 pt-4">
                        <span className="opacity-60 uppercase">Currently Recorded</span>
                        <span className={`text-lg font-mono ${Math.abs(paidTotal - calculations.grandTotal) < 0.01 ? 'text-emerald-400' : 'text-white'}`}>${paidTotal.toFixed(2)}</span>
                    </div>
                </div>
              </div>
              <div className="space-y-4">
                {friends.map(f => {
                  const shareAmount = calculations.itemCosts[f.id] || 0;
                  return (
                    <div key={f.id} className={`p-4 rounded-2xl border-2 transition-all ${Math.abs((payments[f.id] || 0) - calculations.grandTotal) < 0.01 ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100 bg-white shadow-sm'}`}>
                      <div className="flex items-center gap-3">
                          <div className="flex items-center gap-3 shrink-0">
                              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-600 text-xs">{f.name[0]}</div>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 text-sm leading-none">{f.name}</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase mt-1">Share: ${shareAmount.toFixed(2)}</span>
                              </div>
                          </div>
                          <div className="flex-1"></div>
                          <div className="flex items-center gap-2 shrink-0">
                              <div className="flex flex-col items-center gap-0.5">
                                  <button onClick={() => setSinglePayer(f.id)} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all active:scale-95 border border-indigo-100 flex items-center justify-center" title="Mark as having paid the entire bill">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                  </button>
                                  <span className="text-[8px] font-black uppercase text-indigo-400 tracking-tighter whitespace-nowrap">Paid Full</span>
                              </div>
                              <div className="relative w-24">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                                  <input type="number" inputMode="decimal" value={payments[f.id] || ''} onChange={(e) => setPayments({...payments, [f.id]: parseFloat(e.target.value) || 0})} placeholder="0.00" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-6 pr-2 py-2 text-right font-mono font-black text-slate-900 text-sm outline-none focus:border-indigo-500" />
                              </div>
                          </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8 animate-in zoom-in-95 duration-500 flex-1 flex flex-col relative pb-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-indigo-100 text-white mb-6">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                </div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Settlements</h2>
              </div>
              <div className="space-y-4 flex-1">
                {calculations.settlements.length > 0 ? (
                  <div className="space-y-3">
                    {calculations.settlements.map((s, idx) => (
                        <div key={idx} className="bg-slate-50 p-6 rounded-[2.5rem] flex items-center justify-between border border-slate-100 shadow-sm relative group hover:border-indigo-300 transition-all">
                          <div className="flex-1">
                            <span className="font-black text-slate-900 text-lg block leading-none">{s.fromName}</span>
                            <div className="flex items-center gap-3 text-slate-400 my-4">
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Pays to</span>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                            </div>
                            <span className="font-black text-indigo-600 text-lg block leading-none">{s.toName}</span>
                          </div>
                          <div className="text-3xl font-black text-slate-900 font-mono tracking-tighter shrink-0">${s.amount.toFixed(2)}</div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem]">
                    <BotIcon className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="font-black text-slate-400 uppercase text-sm tracking-widest">No transfers needed!</p>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">e-Transfer Email (Optional)</label>
                <div className="relative">
                  <input type="email" value={etransferEmail} onChange={(e) => setEtransferEmail(e.target.value)} placeholder="name@example.com" className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold shadow-sm focus:border-indigo-500 outline-none transition-all" />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z"/></svg></div>
                </div>
              </div>
              
              <div className="pt-4 pb-4 space-y-3">
                <div className="flex gap-3">
                  <button onClick={shareResults} className="flex-1 flex items-center justify-center gap-3 bg-indigo-600 text-white px-4 py-5 rounded-[2rem] text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                    Share
                  </button>
                  <button onClick={copyToClipboard} className={`flex-1 flex items-center justify-center gap-3 border-2 px-4 py-5 rounded-[2rem] text-xs font-black uppercase tracking-widest transition-all ${copyFeedback ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-500 hover:text-indigo-600'}`}>
                    {copyFeedback ? (
                      <svg className="w-5 h-5 animate-in zoom-in duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                    )}
                    {copyFeedback ? 'Copied!' : 'Copy Text'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="p-8 bg-white border-t border-slate-100 flex gap-4 sticky bottom-0 z-[60]">
          {step > 1 && <button onClick={prevStep} className="flex-1 bg-white border-2 border-slate-200 text-slate-400 font-black py-4 rounded-2xl hover:bg-slate-50 transition-all uppercase text-[10px] tracking-widest">Back</button>}
          <button onClick={step === 5 ? () => window.location.reload() : nextStep} disabled={step === 1 && friends.length < 2} className={`flex-[2] py-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl transition-all ${ (step === 1 && friends.length < 2) ? 'bg-slate-300 shadow-none grayscale opacity-50' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]' }`}>
            {step === 5 ? 'New Bill Split 🤖' : 'Next Step'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default App;
