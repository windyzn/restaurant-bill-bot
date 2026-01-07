
export enum TaxCategory {
  FOOD = 'FOOD', // GST only (5%)
  CONTAINERS = 'CONTAINERS' // GST (5%) + PST (7%)
}

export interface Friend {
  id: string;
  name: string;
  partnerId?: string; // ID of another friend to group as a couple
}

export interface BillItem {
  id: string;
  name: string;
  price: number;
  taxCategory: TaxCategory;
  sharedWith: string[]; // Array of Friend IDs
  isTaxIncluded?: boolean; // If true, don't add 5/12% tax on top
}

export interface PaymentRecord {
  friendId: string;
  amount: number;
}

export interface Settlement {
  from: string; // Friend ID (or Couple name/combined ID string)
  to: string;   // Friend ID
  amount: number;
  isFromCouple?: boolean;
  isToCouple?: boolean;
  coupleNames?: string;
}

export const GST_RATE = 0.05;
export const PST_RATE = 0.07;
