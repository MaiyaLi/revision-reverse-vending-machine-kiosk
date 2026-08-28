/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Language = 'en' | 'fil';

export type AppState =
  | 'IDLE'
  | 'MAIN_MENU'
  | 'INSERT_FLOW_SELECT'
  | 'NEW_USER_REGISTRATION'
  | 'LOGIN_SELECT'
  | 'LOGIN_PASSWORD'
  | 'GUEST_NOTICE'
  | 'DEPOSIT_PLANNING'
  | 'VERIFYING_ITEMS'
  | 'DEPOSIT_COMPLETE_SUMMARY'
  | 'REDEEM_BALANCE_SCREEN'
  | 'QRPH_SELECT_PROVIDER'
  | 'QRPH_DISPLAY'
  | 'DISPENSING_CASH'
  | 'PAYOUT_ACCOUNT_INPUT'
  | 'PAYOUT_QR_DISPLAY'
  | 'PAYOUT_PROCESSING'
  | 'PAYOUT_SUCCESS'
  | 'PAYOUT_FAILED'
  | 'FINAL_RECEIPT_CLIENT'
  | 'LEARN_MORE';

export interface UserProfile {
  memberId: string;
  qrCodeId: string;
  fullName: string;
  mobileNumber: string;
  pin: string;
  emailAddress?: string;
  age?: string;
  barangay?: string;
  profilePhoto?: string;
  walletBalance: number;
  totalLifetimeEarnings: number;
  ecoPoints: number;
  co2ReductionKg: number;
}

export interface TransactionHistory {
  id: string;
  date: string;
  type: 'deposit' | 'redemption';
  amount: number;
  details: string;
  ecoPointsGained?: number;
}

export interface DepositedItem {
  id: string;
  number: number;
  detectedMaterial: 'plastic' | 'aluminum' | 'glass' | 'other';
  itemName: string;
  weightGrams: number;
  payoutAmount: number;
  ecoPoints: number;
  co2ReductionKg: number;
  status: 'accepted' | 'rejected';
  imageBlobUrl?: string;
}

export interface SystemTelemetry {
  lastUpdated: string;
  internetConnected: boolean;
  chamberSensorOk: boolean;
  laserSensorOk: boolean;
  inductionSensorOk: boolean;
  loadCellOk: boolean;
  bins: {
    plastic: { count: number; max: number; name: string };
    aluminum: { count: number; max: number; name: string };
    glass: { count: number; max: number; name: string };
  };
  dispenser: {
    coins10Pesos: number;
    coins5Pesos: number;
    coins1Peso: number;
    status: string;
  };
  ambientTracker: {
    temperatureC: number;
    loadCellReadingGrams: number;
    inductiveReading: boolean;
    vl53DistanceMm: number;
  };
}

export interface TranslationSet {
  idleTouchToBegin: string;
  welcomeKiosk: string;
  insertMaterials: string;
  redeemRewards: string;
  learnMore: string;
  back: string;
  continue: string;
  cancel: string;
  newUser: string;
  existingUser: string;
  continueAsGuest: string;
  registerTitle: string;
  fullName: string;
  mobileNumber: string;
  optionalButNeeded: string;
  mobileNumberHelp: string;
  pin: string;
  confirmPin: string;
  emailAddress: string;
  age: string;
  barangay: string;
  profilePhoto: string;
  optional: string;
  required: string;
  guestWarning: string;
  guestDescription: string;
  depositPlanner: string;
  depositPlanIntro: string;
  plasticBottle: string;
  aluminumCan: string;
  glassBottle: string;
  totalEstimatedItems: string;
  startRVM: string;
  processingItemCount: string;
  weightText: string;
  rewardText: string;
  detectedMaterial: string;
  verifyingLive: string;
  accepted: string;
  rejected: string;
  sortingBinLabel: string;
  processingSummary: string;
  keepInWallet: string;
  redeemViaQRPh: string;
  redeemViaCash: string;
  walletBalance: string;
  lifetimeEarnings: string;
  points: string;
  estimatedCo2: string;
  withdrawQRPhTitle: string;
  withdrawCashTitle: string;
  selectBank: string;
  generatingQRPh: string;
  scanToReceivePayout: string;
  referenceNumber: string;
  dispensingProgress: string;
  dispensingFinished: string;
  receiptTitle: string;
  machineId: string;
  transactionId: string;
  payoutMethod: string;
  thanksSavingPlanet: string;
  printReceipt: string;
  sendToMobile: string;
  sendToEmail: string;
  receiptSent: string;
  finished: string;
  authTitle: string;
  authEnterCredentials: string;
  enterPinCode: string;
}

export const translations: Record<Language, TranslationSet> = {
  en: {
    idleTouchToBegin: "Touch Anywhere to Begin",
    welcomeKiosk: "ReVision: Reverse Vending Machine",
    insertMaterials: "Insert Materials",
    redeemRewards: "Redeem Rewards",
    learnMore: "Learn More",
    back: "Go Back",
    continue: "Continue",
    cancel: "Cancel",
    newUser: "New Registration",
    existingUser: "Login Member",
    continueAsGuest: "Continue as Guest",
    registerTitle: "Create Free Account",
    fullName: "Full Name",
    mobileNumber: "Mobile Number",
    optionalButNeeded: "Optional but needed",
    mobileNumberHelp: "For login, SMS alerts, and financial withdrawals (GCash).",
    pin: "4-Digit Secure PIN",
    confirmPin: "Confirm 4-Digit PIN",
    emailAddress: "Email Address",
    age: "Age",
    barangay: "Barangay / Neighborhood",
    profilePhoto: "Profile Photo Capture",
    optional: "Optional",
    required: "Required",
    guestWarning: "Important Guest Notice",
    guestDescription: "Under Guest Mode, rewards must be redeemed immediately via Cash Coins or QRPh. Point balances cannot be saved to an account.",
    depositPlanner: "Deposit Planner",
    depositPlanIntro: "Select the quantities of materials you intend to deposit.",
    plasticBottle: "PET Plastic Bottles",
    aluminumCan: "Aluminum Cans",
    glassBottle: "Glass Bottles",
    totalEstimatedItems: "Total Estimated Items",
    startRVM: "Start Deposit Scan",
    processingItemCount: "RVM Scanning Item",
    weightText: "Measured Weight",
    rewardText: "Intake Reward Value",
    detectedMaterial: "Detected Material",
    verifyingLive: "Sensors scanning item...",
    accepted: "Accepted",
    rejected: "Rejected / Unrecognized",
    sortingBinLabel: "Sorting into bin...",
    processingSummary: "Intake Summary",
    keepInWallet: "Save to Wallet Balance",
    redeemViaQRPh: "Redeem via QRPh",
    redeemViaCash: "Dispense Coin Payout",
    walletBalance: "Wallet Balance",
    lifetimeEarnings: "Lifetime Eco Earnings",
    points: "Total Eco-Points",
    estimatedCo2: "CO₂ Reduction Estimate",
    withdrawQRPhTitle: "QRPh Bank Transfer",
    withdrawCashTitle: "Coin Dispenser",
    selectBank: "Select Bank or E-Wallet",
    generatingQRPh: "Generating QRPh code...",
    scanToReceivePayout: "Scan QR below with GCash, Maya, or Bank app to receive instant credit.",
    referenceNumber: "Reference ID",
    dispensingProgress: "Dispensing physical coins. Please standby...",
    dispensingFinished: "Complete! Collect your change in the tray below.",
    receiptTitle: "Transaction Receipt",
    machineId: "Machine ID",
    transactionId: "Ref ID",
    payoutMethod: "Payout Mode",
    thanksSavingPlanet: "Salamat! Thank you for recycling and saving the planet.",
    printReceipt: "Print Receipt Paper",
    sendToMobile: "SMS Receipt",
    sendToEmail: "Email PDF Receipt",
    receiptSent: "Digital Receipt sent successfully!",
    finished: "Complete Session",
    authTitle: "Access Eco-Wallet",
    authEnterCredentials: "Enter Mobile Number or Member ID",
    enterPinCode: "Enter 4-Digit Secure PIN"
  },
  fil: {
    idleTouchToBegin: "Pindutin upang Magsimula",
    welcomeKiosk: "ReVision Recycle Kiosk",
    insertMaterials: "Mag-deposito",
    redeemRewards: "I-redeem ang Balanse",
    learnMore: "Alamin Pa ang Impormasyon",
    back: "Bumalik",
    continue: "Magpatuloy",
    cancel: "Kanselahin",
    newUser: "Bagong Rehistrasyon",
    existingUser: "Mag-login",
    continueAsGuest: "Magpatuloy bilang Guest",
    registerTitle: "Gumawa ng Libreng Account",
    fullName: "Buong Pangalan",
    mobileNumber: "Numero ng Telepono",
    optionalButNeeded: "Opsyonal ngunit kailangan",
    mobileNumberHelp: "Inirerekomenda para sa madaling pag-login, SMS alert, at pag-withdraw sa GCash.",
    pin: "4-Digit PIN",
    confirmPin: "Kumpirmahin ang PIN",
    emailAddress: "Email Address",
    age: "Edad",
    barangay: "Barangay / Purok",
    profilePhoto: "Kunan ng Larawan",
    optional: "Opsyonal",
    required: "Kailangan",
    guestWarning: "Abiso sa mga Guest",
    guestDescription: "Sa Guest Mode, ang mga pabuya ay dapat i-redeem agad gamit ang barya o QRPh. Hindi mai-save ang balanse sa wallet.",
    depositPlanner: "Plano ng Pag-deposito",
    depositPlanIntro: "Piliin ang bilang ng mga idedeposito mong basura.",
    plasticBottle: "Plastik na Bote (PET)",
    aluminumCan: "Mga Lata ng Inumin",
    glassBottle: "Bote ng Salamin",
    totalEstimatedItems: "Kabuuang Bilang",
    startRVM: "Simulan ang Scan",
    processingItemCount: "Sini-scan ang Item",
    weightText: "Timbang",
    rewardText: "Katumbas na Halaga",
    detectedMaterial: "Nakita na Materyal",
    verifyingLive: "Sinusuri ng sensors...",
    accepted: "Tinatanggap",
    rejected: "Tinatanggihan",
    sortingBinLabel: "Inilalagay sa imbakan...",
    processingSummary: "Ulat ng Deposito",
    keepInWallet: "Itabi sa aking Wallet Balance",
    redeemViaQRPh: "I-redeem gamit ang QRPh",
    redeemViaCash: "I-dispense ang Barya",
    walletBalance: "Balanse sa Wallet",
    lifetimeEarnings: "Naipong Kita",
    points: "Naipong Eco-Points",
    estimatedCo2: "Bawas-CO₂",
    withdrawQRPhTitle: "QRPh Paglipat Selyado",
    withdrawCashTitle: "RVM Coin Dispenser",
    selectBank: "Pumili ng E-Wallet / Bank",
    generatingQRPh: "Hinahanda ang QRPh Code...",
    scanToReceivePayout: "I-scan ang QR gamit ang GCash o Bank app para ipadala ang pera.",
    referenceNumber: "Reference ID",
    dispensingProgress: "Iniluluwas ang mga barya. Sandali lamang...",
    dispensingFinished: "Kumpleto na! Kuhanin ang barya sa lagayan sa ibaba.",
    receiptTitle: "Resibo",
    machineId: "Kiosk ID",
    transactionId: "Transaksyon ID",
    payoutMethod: "Paraan ng Pagbayad",
    thanksSavingPlanet: "Salamat! Malaki ang iyong tulong sa kalikasan.",
    printReceipt: "I-print ang Resibo",
    sendToMobile: "Ipadala sa SMS",
    sendToEmail: "Ipadala sa Email bilang PDF",
    receiptSent: "Matagumpay na ipinadala!",
    finished: "Tapusin ang Session",
    authTitle: "Eco-Wallet Portal",
    authEnterCredentials: "Ipasok ang Mobile o Member ID",
    enterPinCode: "Ipasok ang 4-Digit PIN"
  }
};
