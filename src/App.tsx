import React, { useState, useEffect, useRef } from 'react';
import { 
  Tv, Touchpad, HelpCircle, ArrowLeft, Plus, Minus, UserCheck, 
  Trash2, ShieldAlert, Cpu, Database, Wifi, Sliders, Volume2, 
  VolumeX, Accessibility, CheckCircle2, AlertTriangle, Play, Pause,
  Lock, RefreshCw, Smartphone, Mail, Sparkles, Send, Coins, FileText,
  DollarSign, MapPin, Milestone, TrendingUp, Compass, Leaf, Camera, X, Home
} from 'lucide-react';
import { Language, AppState, UserProfile, TransactionHistory, DepositedItem, SystemTelemetry, translations } from './types';
import VirtualKeyboard from './components/VirtualKeyboard';

export default function App() {
  // --- VIRTUAL KEYBOARD CONTROLLER STATE ---
  const [activeKeyboard, setActiveKeyboard] = useState<{
    label: string;
    value: string;
    type: 'text' | 'tel' | 'number' | 'email' | 'password';
    maxLength?: number;
    placeholder?: string;
    onChange: (val: string) => void;
  } | null>(null);

  const handleInputFocus = (
    label: string,
    value: string,
    type: 'text' | 'tel' | 'number' | 'email' | 'password',
    maxLength: number | undefined,
    placeholder: string,
    onUpdate: (val: string) => void
  ) => {
    setActiveKeyboard({
      label,
      value,
      type,
      maxLength,
      placeholder,
      onChange: (val) => {
        onUpdate(val);
        setActiveKeyboard(prev => prev ? { ...prev, value: val } : null);
      }
    });
  };

  // --- STATE DECLARATIONS ---
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('revision_lang');
      return (saved as Language) || 'en';
    } catch {
      return 'en';
    }
  });
  const [currentState, setCurrentState] = useState<AppState>('IDLE');
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('revision_voiceEnabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [accessibilityMode, setAccessibilityMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('revision_accessibilityMode');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [themeMode, setThemeMode] = useState<'auto' | 'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('revision_themeMode');
      return (saved as 'auto' | 'light' | 'dark') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('revision_lang', lang);
    } catch (e) {
      console.warn("localStorage not available:", e);
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('revision_voiceEnabled', String(voiceEnabled));
    } catch (e) {
      console.warn("localStorage not available:", e);
    }
  }, [voiceEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('revision_accessibilityMode', String(accessibilityMode));
    } catch (e) {
      console.warn("localStorage not available:", e);
    }
  }, [accessibilityMode]);

  useEffect(() => {
    try {
      localStorage.setItem('revision_themeMode', themeMode);
    } catch (e) {
      console.warn("localStorage not available:", e);
    }
  }, [themeMode]);

  // Keep state updated for auto time tracking
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000); // Check every 15 seconds to be ultra responsive to systems
    return () => clearInterval(interval);
  }, []);

  // Close virtual keyboard automatically on any screen state change
  useEffect(() => {
    setActiveKeyboard(null);
  }, [currentState]);

  const isLight = React.useMemo(() => {
    if (accessibilityMode) return false;
    if (themeMode === 'light') return true;
    if (themeMode === 'dark') return false;
    
    // Auto dynamic time: 6:00 AM (6) to 6:00 PM (18) is Light theme, otherwise Dark theme
    const hr = currentTime.getHours();
    return hr >= 6 && hr < 18;
  }, [themeMode, currentTime, accessibilityMode]);
  
  // Audio guidance synth helper
  const speakText = (textKey: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const tMsg = translations[lang][textKey as keyof typeof translations['en']] || textKey;
    const utterance = new SpeechSynthesisUtterance(tMsg as string);
    utterance.lang = lang === 'fil' ? 'tl-PH' : 'en-US';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  const [printStatus, setPrintStatus] = useState<'IDLE' | 'PRINTING' | 'DONE'>('IDLE');
  const [isProcessing, setIsProcessing] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);
  const [backendCameraActive, setBackendCameraActive] = useState(false);
  const [sessionRefId, setSessionRefId] = useState<string | null>(null);
  const [postLoginTarget, setPostLoginTarget] = useState<AppState | null>(null);
  const [detectionResult, setDetectionResult] = useState<any>(null);
  const [detectionItems, setDetectionItems] = useState<any[]>([]);
  const [detectionHistory, setDetectionHistory] = useState<any[]>([]);

  // --- LOOPS & INACTIVITY TIMEOUTS ---
  const [secondsRemaining, setSecondsRemaining] = useState(120);
  const actionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetInactivityTimer = () => {
    setSecondsRemaining(120);
  };

  useEffect(() => {
    // If we're already IDLE, no need to tick down
    if (currentState === 'IDLE') {
      return;
    }
    
    const interval = setInterval(() => {
      // Auto resets only count if there is no activity happening in the screen
      const isActivityHappening = 
        isProcessing || 
        currentState === 'VERIFYING_ITEMS' || 
        currentState === 'DISPENSING_CASH' || 
        printStatus === 'PRINTING' ||
        webcamActive;

      if (isActivityHappening) {
        setSecondsRemaining(120);
        return;
      }

      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setCurrentState('IDLE');
          setActiveUser(null);
          speakText("idleTouchToBegin");
          return 120;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentState, isProcessing, printStatus, webcamActive]);

  // Handle global touch resets
  const handleGlobalTouch = () => {
    resetInactivityTimer();
  };

  // --- INTERACTIVE DRIVER TELEMETRY (LOCAL CACHED) ---
  const [telemetry, setTelemetry] = useState<SystemTelemetry>({
    lastUpdated: new Date().toISOString(),
    internetConnected: true,
    chamberSensorOk: true,
    laserSensorOk: true,
    inductionSensorOk: true,
    loadCellOk: true,
    bins: {
      plastic: { count: 32, max: 150, name: "Plastic Bottles" },
      aluminum: { count: 18, max: 200, name: "Aluminum Cans" },
      glass: { count: 8, max: 100, name: "Glass Bottles" }
    },
    dispenser: {
      coins10Pesos: 150,
      coins5Pesos: 220,
      coins1Peso: 400,
      status: "Normal"
    },
    ambientTracker: {
      temperatureC: 36.8,
      loadCellReadingGrams: 0,
      inductiveReading: false,
      vl53DistanceMm: 150
    }
  });

  const fetchTelemetry = async () => {
    try {
      const res = await fetch("/api/telemetry");
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch (e) {
      console.warn("Express server offline, operating on embedded telemetry core.");
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 10000);
    return () => clearInterval(interval);
  }, []);

  // --- NEW USER REGISTRATION FORM ---
  const [regForm, setRegForm] = useState({
    fullName: '',
    mobileNumber: '',
    pin: '',
    confirmPin: '',
    emailAddress: '',
    age: '',
    barangay: 'Barangay Bel-Air',
    profilePhoto: ''
  });
  const [regError, setRegError] = useState('');

  // --- LOGIN FORM ---
  const [loginCredential, setLoginCredential] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  // --- DEPOSIT PLANNING ---
  const [intendedPlastic, setIntendedPlastic] = useState(0);
  const [intendedAluminum, setIntendedAluminum] = useState(0);
  const [intendedGlass, setIntendedGlass] = useState(0);

  // --- PAYOUT FLOW STATE ---
  const [payoutMethod, setPayoutMethod] = useState<'direct' | 'qr' | null>(null);
  const [payoutChannel, setPayoutChannel] = useState<'GCASH' | 'MAYA'>('GCASH');
  const [payoutAccountNumber, setPayoutAccountNumber] = useState('');
  const [payoutAccountName, setPayoutAccountName] = useState('');
  const [payoutExternalId, setPayoutExternalId] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [payoutQrUrl, setPayoutQrUrl] = useState('');

  // --- INTAKE SENSORS & ITEM-BY-ITEM SIMULATOR ---
  const [totalItemsCount, setTotalItemsCount] = useState(0);
  const [processedItemsList, setProcessedItemsList] = useState<DepositedItem[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [verificationStage, setVerificationStage] = useState<'IDLE' | 'CAMERA' | 'INDUCTIVE' | 'WEIGHT' | 'TOF' | 'SORTING' | 'DONE'>('IDLE');
  
  // Active RVM Camera stream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<string | null>(null);
  
  // Start backend camera feed immediately on mount for testing
  const cameraIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start backend camera feed using Pi CSI camera
  useEffect(() => {
    setBackendCameraActive(true);
    if (cameraIntervalRef.current) return;
    
    // Fallback: poll snapshot endpoint every 1000ms (for browsers that don't support MJPEG in img tags)
    cameraIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/camera/snapshot');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.imageBase64) {
            setActiveSnapshot(data.imageBase64);
          }
        }
      } catch (err) {
        console.warn('Backend camera snapshot failed:', err);
      }
    }, 1000);
    
    return () => {
      if (cameraIntervalRef.current) {
        clearInterval(cameraIntervalRef.current);
        cameraIntervalRef.current = null;
      }
    };
  }, []);

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (cameraIntervalRef.current) {
      clearInterval(cameraIntervalRef.current);
      cameraIntervalRef.current = null;
    }
     setWebcamActive(false);
     setBackendCameraActive(false);
   };

    // Background detection polling (for DETECTION_TEST view)
    useEffect(() => {
      if (currentState === 'DETECTION_TEST') {
        const fetchDetection = async () => {
          try {
            const res = await fetch('/api/detection/latest');
            if (res.ok) {
              const data = await res.json();
              setDetectionResult(data);
              if (data.items && Array.isArray(data.items)) {
                setDetectionItems(data.items);
              } else if (data.detectedMaterial) {
                setDetectionItems([data]);
              }
            }
          } catch (err) {
            console.warn('Detection fetch failed:', err);
          }
          try {
            const res = await fetch('/api/detection/history');
            if (res.ok) {
              const data = await res.json();
              setDetectionHistory(data);
            }
          } catch (err) {
            console.warn('Detection history fetch failed:', err);
          }
        };

        fetchDetection();
        const interval = setInterval(fetchDetection, 1500);
        return () => clearInterval(interval);
      }
    }, [currentState]);

    const refreshDetection = async () => {
      try {
        const res = await fetch('/api/detection/run', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setDetectionResult(data);
          if (data.items && Array.isArray(data.items)) {
            setDetectionItems(data.items);
          } else if (data.detectedMaterial) {
            setDetectionItems([data]);
          }
          setDetectionHistory(prev => [data, ...prev.slice(0, 19)]);
        }
      } catch (err) {
        console.warn('Manual detection failed:', err);
      }
    };

   // Run real-time RVM diagnostic simulator for planning list
  const runVerificationProcess = async () => {
    const list: DepositedItem[] = [];
    let itemIdNum = 1;

    for (let i = 0; i < intendedPlastic; i++) {
      list.push({
        id: `ITEM-PL-${Math.floor(1000 + Math.random()*9000)}`,
        number: itemIdNum++,
        detectedMaterial: 'plastic',
        itemName: 'PET Water Bottle',
        weightGrams: 22 + Math.floor(Math.random() * 8),
        payoutAmount: 1.00,
        ecoPoints: 10,
        co2ReductionKg: 0.04,
        status: 'accepted'
      });
    }

    for (let i = 0; i < intendedAluminum; i++) {
      list.push({
        id: `ITEM-AL-${Math.floor(1000 + Math.random()*9000)}`,
        number: itemIdNum++,
        detectedMaterial: 'aluminum',
        itemName: 'Beverage Aluminum Can',
        weightGrams: 14 + Math.floor(Math.random() * 4),
        payoutAmount: 2.50,
        ecoPoints: 25,
        co2ReductionKg: 0.09,
        status: 'accepted'
      });
    }

    for (let i = 0; i < intendedGlass; i++) {
      list.push({
        id: `ITEM-GL-${Math.floor(1000 + Math.random()*9000)}`,
        number: itemIdNum++,
        detectedMaterial: 'glass',
        itemName: 'Glass Bottle',
        weightGrams: 260 + Math.floor(Math.random() * 50),
        payoutAmount: 1.50,
        ecoPoints: 15,
        co2ReductionKg: 0.06,
        status: 'accepted'
      });
    }

    if (list.length === 0) {
      list.push({
        id: `ITEM-G-${Math.floor(1000 + Math.random()*9000)}`,
        number: 1,
        detectedMaterial: 'plastic',
        itemName: 'Fiji Natural Spring Bottle',
        weightGrams: 24,
        payoutAmount: 1.00,
        ecoPoints: 10,
        co2ReductionKg: 0.04,
        status: 'accepted'
      });
    }

    setTotalItemsCount(list.length);
    setProcessedItemsList([]);
    setCurrentItemIndex(0);
    setIsProcessing(true);
    setCurrentState('VERIFYING_ITEMS');

    // Start deposit session in backend
    let currentSessionRefId: string | null = null;
    try {
      const sessionRes = await fetch("/api/deposit/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: activeUser?.id || null })
      });
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        currentSessionRefId = sessionData.sessionRefId;
        setSessionRefId(sessionData.sessionRefId);
      }
    } catch (e) {
      console.warn("Could not start deposit session:", e);
    }

    // Trigger sequential simulation
    await processNextItemSequential(0, list, currentSessionRefId);
  };

  const processNextItemSequential = async (idx: number, fullList: DepositedItem[], currentSessionRefId: string | null) => {
    if (idx >= fullList.length) {
      setVerificationStage('DONE');
      setIsProcessing(false);
      stopWebcam();
      setCurrentState('DEPOSIT_COMPLETE_SUMMARY');
      speakText("processingSummary");
      return;
    }

    setVerificationStage('CAMERA');
    setCurrentItemIndex(idx);
    const item = fullList[idx];

    // Voice announce item
    if (voiceEnabled) {
      const msg = lang === 'en' 
        ? `Processing item number ${idx + 1}. Placing container in camera optics.`
        : `Pinoproseso ang item bilang ${idx + 1}. Inilalagay ang container sa camera optics.`;
      const u = new SpeechSynthesisUtterance(msg);
      window.speechSynthesis.speak(u);
    }

    // Step 1: Camera sensor
    await new Promise(r => setTimeout(r, 1200));

    // Capture image from active camera feed
    if (activeSnapshot) {
      item.imageBlobUrl = activeSnapshot;
    }

    // Call REST back-end server endpoint to execute computer vision algorithms on image
    setVerificationStage('INDUCTIVE');
    await new Promise(r => setTimeout(r, 1000));

    setVerificationStage('WEIGHT');
    await new Promise(r => setTimeout(r, 1000));

    setVerificationStage('TOF');
    await new Promise(r => setTimeout(r, 1000));

    setVerificationStage('SORTING');
    await new Promise(r => setTimeout(r, 1200));

    // Combine with local simulation
    try {
      const response = await fetch("/api/detect-waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: item.imageBlobUrl || "",
          hardwareInductive: item.detectedMaterial === 'aluminum',
          hardwareWeight: item.weightGrams
        })
      });

      if (response.ok) {
        const detection = await response.json();
        item.detectedMaterial = detection.detectedMaterial;
        item.itemName = detection.itemName;
        item.payoutAmount = detection.payoutPhilippinePesos;
        item.ecoPoints = detection.ecoPointsEarned;
        item.co2ReductionKg = detection.co2ReductionKg;
        item.status = detection.detectedMaterial === 'other' ? 'rejected' : 'accepted';
      }
    } catch (e) {
      console.warn("Using offline sensors verification.");
    }

    // Persist item to backend deposit session
    if (currentSessionRefId) {
      try {
        await fetch("/api/deposit/item/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionRefId: currentSessionRefId,
              item: {
              itemNumber: idx + 1,
              detectedMaterial: item.detectedMaterial,
              itemName: item.itemName,
              weightGrams: item.weightGrams,
              payoutAmount: item.payoutAmount,
              ecoPoints: item.ecoPoints,
              co2ReductionKg: item.co2ReductionKg,
              status: item.status === 'accepted' ? 'ACCEPTED' : 'REJECTED'
            }
          })
        });
      } catch (e) {
        console.warn("Could not persist deposit item:", e);
      }
    }

    setProcessedItemsList(prev => [...prev, item]);

    // Next item
    setTimeout(() => {
      processNextItemSequential(idx + 1, fullList, currentSessionRefId);
    }, 1500);
  };

  // Sum results
  const totalWeightStr = (processedItemsList.reduce((sum, item) => sum + (item.status === 'accepted' ? item.weightGrams : 0), 0) / 1000).toFixed(2);
  const totalPayout = processedItemsList.reduce((sum, item) => sum + (item.status === 'accepted' ? item.payoutAmount : 0), 0);
  const totalPoints = processedItemsList.reduce((sum, item) => sum + (item.status === 'accepted' ? item.ecoPoints : 0), 0);
  const totalCO2Str = processedItemsList.reduce((sum, item) => sum + (item.status === 'accepted' ? item.co2ReductionKg : 0), 0).toFixed(3);

  // Save rewards from temporary deposit session
  const saveSessionRewards = async (payoutSelected: 'wallet' | 'qrph' | 'cash') => {
    if (currentState === 'DEPOSIT_COMPLETE_SUMMARY') {
      try {
        const itemsGrouped = {
          plastic: processedItemsList.filter(i => i.detectedMaterial === 'plastic' && i.status === 'accepted').length,
          aluminum: processedItemsList.filter(i => i.detectedMaterial === 'aluminum' && i.status === 'accepted').length,
          glass: processedItemsList.filter(i => i.detectedMaterial === 'glass' && i.status === 'accepted').length,
        };

        const res = await fetch("/api/deposit/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionRefId: sessionRefId,
            userId: activeUser?.id || null,
            itemsSummary: itemsGrouped,
            payoutMethod: payoutSelected
          })
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData.updatedUser) {
            setActiveUser(resData.updatedUser);
          }
          setReceiptData({
            transactionId: resData.transactionId,
            date: new Date().toISOString().replace('T', ' ').substring(0, 16),
            materials: `${itemsGrouped.plastic} Plastics, ${itemsGrouped.aluminum} Cans, ${itemsGrouped.glass} Glass`,
            weight: totalWeightStr,
            reward: resData.amountCredited || totalPayout,
            method: payoutSelected === 'wallet' ? 'Eco-Wallet' : payoutSelected === 'qrph' ? 'QRPh Instant' : 'Cash Dispensation',
            co2: totalCO2Str
          });
        }
      } catch (err) {
        console.warn("Using smart local receipt fallback.");
        setReceiptData({
          transactionId: "TXN-" + Math.floor(100000 + Math.random() * 900000),
          date: new Date().toISOString().replace('T', ' ').substring(0, 16),
          materials: `${intendedPlastic} Plastics, ${intendedAluminum} Cans, ${intendedGlass} Glass`,
          weight: totalWeightStr,
          reward: totalPayout,
          method: payoutSelected === 'wallet' ? 'Eco-Wallet' : payoutSelected === 'qrph' ? 'QRPh' : 'Cash Dispensation',
          co2: totalCO2Str
        });
      }

      if (payoutSelected === 'wallet') {
        setCurrentState('FINAL_RECEIPT_CLIENT');
        speakText("receiptTitle");
      } else if (payoutSelected === 'qrph') {
        setCurrentState('QRPH_SELECT_PROVIDER');
        speakText("selectBank");
      } else {
        setIntendedDispenserProgress(0);
        setCurrentState('DISPENSING_CASH');
        speakText("dispensingProgress");
      }
    }
  };

  // --- REDEEM WALLET BALANCE DIRECTLY ---
  const handleRedeemFromMain = () => {
    if (activeUser) {
      setCurrentState('REDEEM_BALANCE_SCREEN');
      speakText("walletBalance");
    } else {
      setPostLoginTarget('REDEEM_BALANCE_SCREEN');
      setCurrentState('LOGIN_SELECT');
      speakText("authEnterCredentials");
    }
  };

  // --- QRPH Payout Generation ---
  const [selectedBank, setSelectedBank] = useState('GCash');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [payoutReference, setPayoutReference] = useState('');
  const [receiptData, setReceiptData] = useState({
    transactionId: '',
    date: '',
    materials: '',
    weight: '0.00',
    reward: 0,
    method: '',
    co2: '0.000'
  });

  const bankLogos: Record<string, string> = {
    'GCash': '/images/banks/gcash.png?v=2',
    'Maya': '/images/banks/maya.svg?v=2',
    'BPI': '/images/banks/bpi.svg?v=2',
    'BDO': '/images/banks/bdo.svg?v=2',
    'UnionBank': '/images/banks/unionbank.svg?v=2',
    'Landbank': '/images/banks/landbank.svg?v=2'
  };

  const redeemUser = () => activeUser || {
    walletBalance: 0,
    ecoPoints: 0,
    co2ReductionKg: 0,
    fullName: '',
    memberId: '',
    phoneNumber: null
  };

  const generateQRPhPayout = () => {
    const refNum = "REF-" + Math.floor(10000000 + Math.random() * 90000000);
    setPayoutReference(refNum);
    
    const rvmPayload = `QRPH_PAY_TO_RVM_REVISION_PROVIDER_${selectedBank}_REF_${refNum}_AMOUNT_PHP_${totalPayout}`;
    setQrCodeDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(rvmPayload)}`);
    
    setCurrentState('QRPH_DISPLAY');
  };

  const confirmQRPhPayoutReceived = async () => {
    const deductAmount = totalPayout;
    
    try {
      const res = await fetch("/api/payout/disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: activeUser?.id || null,
          amount: deductAmount,
          provider: selectedBank,
          accountNumber: activeUser?.phoneNumber || '',
          accountName: activeUser?.fullName || 'User'
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.updatedUser) {
          setActiveUser(data.updatedUser);
        }
      }
    } catch (e) {
      console.warn("QRPH disbursement failed:", e);
    }

    setReceiptData(prev => ({
      ...prev,
      transactionId: prev.transactionId || "TXN-" + Math.floor(100000 + Math.random() * 900000),
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      method: `QRPh Bank Transfer (${selectedBank})`,
      reward: deductAmount
    }));

    setCurrentState('FINAL_RECEIPT_CLIENT');
    speakText("receiptTitle");
  };

  // --- Coin Dispenser mechanism simulation ---
  const [intendedDispenserProgress, setIntendedDispenserProgress] = useState(0);
  
  useEffect(() => {
    if (currentState === 'DISPENSING_CASH') {
      const interval = setInterval(() => {
        setIntendedDispenserProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(async () => {
              const deductAmount = totalPayout;
              try {
                await fetch("/api/payout/cash", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId: activeUser?.id || null,
                    amount: deductAmount
                  })
                });
              } catch (e) {
                console.warn("Cash payout recording failed:", e);
              }

              setReceiptData(prevReceipt => ({
                ...prevReceipt,
                transactionId: prevReceipt.transactionId || "TXN-" + Math.floor(100000 + Math.random() * 900000),
                date: new Date().toISOString().replace('T', ' ').substring(0, 16),
                method: 'Coins Retrieval Dispenser',
                reward: deductAmount
              }));

              setCurrentState('FINAL_RECEIPT_CLIENT');
              speakText("receiptTitle");
            }, 500);
            return 100;
          }
          return prev + 20;
        });
      }, 600);
      return () => clearInterval(interval);
    }
  }, [currentState]);

  // --- ACTIONS SYSTEM ---
  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (regForm.pin !== regForm.confirmPin) {
      setRegError(lang === 'en' ? 'PIN fields do not match!' : 'Hindi tugma ang mga PIN!');
      return;
    }
    if (regForm.pin.length !== 4) {
      setRegError(lang === 'en' ? 'PIN code must be exactly 4 digits!' : 'Ang PIN ay dapat 4-digit!');
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regForm)
      });
      if (res.ok) {
        const data = await res.json();
        const user = {
          ...data.user,
          walletBalance: Number(data.user?.walletBalance || 0),
          ecoPoints: Number(data.user?.ecoPoints || 0),
          co2ReducedKg: Number(data.user?.co2ReducedKg || 0),
          totalLifetimeEarnings: Number(data.user?.totalLifetimeEarnings || 0)
        };
        setActiveUser(user);
        speakText("depositPlanner");
        setCurrentState('DEPOSIT_PLANNING');
      } else {
        const err = await res.json();
        setRegError(err.error || "Failed to create user");
      }
    } catch (err) {
      // Fallback local member generation
      const mockId = "REV-" + Math.floor(10000 + Math.random() * 90000);
      const mockUser: UserProfile = {
        id: mockId,
        memberId: mockId,
        qrCodeId: `QR-${mockId}`,
        fullName: regForm.fullName || "Eco Citizen",
        phoneNumber: regForm.mobileNumber || null,
        email: regForm.emailAddress || null,
        age: regForm.age ? parseInt(regForm.age) : undefined,
        barangay: regForm.barangay,
        profilePhotoUrl: regForm.profilePhoto,
        walletBalance: 0,
        totalLifetimeEarnings: 0,
        ecoPoints: 0,
        co2ReducedKg: 0,
        lastLoginAt: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setActiveUser(mockUser);
      setCurrentState('DEPOSIT_PLANNING');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: loginCredential,
          pin: loginPin
        })
      });

      if (res.ok) {
        const data = await res.json();
        const user = {
          ...data.user,
          walletBalance: Number(data.user?.walletBalance || 0),
          ecoPoints: Number(data.user?.ecoPoints || 0),
          co2ReducedKg: Number(data.user?.co2ReducedKg || 0),
          totalLifetimeEarnings: Number(data.user?.totalLifetimeEarnings || 0)
        };
        setActiveUser(user);
        setLoginCredential('');
        setLoginPin('');
        
        const target = postLoginTarget || 'DEPOSIT_PLANNING';
        setPostLoginTarget(null);
        setCurrentState(target);
        speakText(target === 'REDEEM_BALANCE_SCREEN' ? "walletBalance" : "depositPlanner");
      } else {
        const err = await res.json();
        setLoginError(err.error || "Invalid PIN credential.");
      }
    } catch (err) {
      setLoginError(lang === 'en' ? "Failed to authenticate locally." : "Hindi napatunayan ang system.");
    }
  };

  // Profile photo simulator
  const captureProfilePhotoSim = () => {
    setRegForm(prev => ({
      ...prev,
      profilePhoto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
    }));
  };

  // Print Receipt
  const triggerPrintReceipt = async () => {
    console.log('🖨️ Print button clicked');
    console.log('  receiptData:', receiptData);
    console.log('  transactionId:', receiptData.transactionId);
    console.log('  processedItemsList:', processedItemsList.length, 'items');

    if (!receiptData.transactionId) {
      console.warn('❌ No transaction ID available for printing');
      return;
    }

    setPrintStatus('PRINTING');
    try {
      const requestBody = {
        items: processedItemsList
          .filter(i => i.status === 'accepted')
          .map(i => ({
            name: i.itemName || i.detectedMaterial,
            material: i.detectedMaterial,
            weightGrams: i.weightGrams || 0,
            points: i.ecoPoints || 0,
          })),
        totalPoints: totalPoints,
        user: activeUser ? { name: activeUser.name || 'Valued Customer' } : undefined,
      };

      console.log('🖨️ Sending print request:', requestBody);

      const res = await fetch(`/api/receipt/print/${receiptData.transactionId}`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      console.log('🖨️ Response status:', res.status);
      const data = await res.json();
      console.log('🖨️ Response data:', data);

      if (data.success || data.printed) {
        setPrintStatus('DONE');
        setTimeout(() => setPrintStatus('IDLE'), 3000);
      } else {
        console.warn('❌ Print failed:', data.error);
        setPrintStatus('IDLE');
      }
    } catch (err) {
      console.warn('❌ Print request failed:', err);
      setPrintStatus('IDLE');
    }
  };

  const [notificationMsg, setNotificationMsg] = useState('');
  const triggerNotification = (text: string) => {
    setNotificationMsg(text);
    setTimeout(() => setNotificationMsg(''), 4000);
  };

  // State text translators
  const t = (key: keyof typeof translations['en']) => {
    return translations[lang][key] || key;
  };

  // Theme design styles
  const cBodyBg = accessibilityMode 
    ? 'bg-slate-900 text-yellow-300 contrast-125 font-black text-lg' 
    : isLight
      ? 'bg-gradient-to-br from-teal-50 via-slate-100 to-emerald-100/60 text-slate-800'
      : 'bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 text-slate-100';

  const cCabinet = accessibilityMode
    ? 'bg-slate-950 border-yellow-500 text-yellow-300'
    : isLight 
      ? 'bg-white border-slate-300 shadow-xl text-slate-850' 
      : 'bg-slate-950/90 border-slate-700 text-slate-100 shadow-2xl';

  const cCard = accessibilityMode
    ? 'bg-slate-900 border-yellow-800 text-yellow-300'
    : isLight
      ? 'bg-emerald-50/50 border border-emerald-100 text-slate-850 shadow-sm'
      : 'bg-slate-900 border border-slate-800 text-slate-100';

  const cCardInset = accessibilityMode
    ? 'bg-slate-950 border-yellow-850 text-yellow-400 font-bold'
    : isLight
      ? 'bg-white border border-slate-250 text-slate-800'
      : 'bg-slate-950 border border-slate-900 text-slate-300';

  const cTextTitle = accessibilityMode ? 'text-yellow-400' : isLight ? 'text-teal-700' : 'text-emerald-400';
  const cTextSubtitle = accessibilityMode ? 'text-yellow-500' : isLight ? 'text-slate-500 font-medium' : 'text-slate-400';
  const cTextNormal = accessibilityMode ? 'text-yellow-300' : isLight ? 'text-slate-850' : 'text-slate-200';
  const cTextMuted = accessibilityMode ? 'text-yellow-600' : isLight ? 'text-slate-500' : 'text-slate-400';
  const cTextHeading = accessibilityMode ? 'text-yellow-300 font-bold' : isLight ? 'text-slate-900' : 'text-white';
  const cBorder = accessibilityMode ? 'border-yellow-800' : isLight ? 'border-slate-200' : 'border-slate-800';

  const cInput = accessibilityMode
    ? 'bg-slate-950 border-2 border-yellow-500 text-yellow-300 font-black'
    : isLight
      ? 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 font-semibold'
      : 'bg-slate-950/80 border border-slate-700 text-white focus:outline-none focus:border-emerald-500';

  const btnEmerald = isLight
    ? 'bg-emerald-50/70 hover:bg-emerald-100/90 text-slate-850 border-2 border-emerald-500 hover:shadow-md' 
    : 'bg-emerald-950/40 hover:bg-emerald-900/60 border-2 border-emerald-500 text-white';

  const btnSky = isLight
    ? 'bg-sky-50/70 hover:bg-sky-100/90 text-slate-850 border-2 border-sky-500 hover:shadow-md'
    : 'bg-sky-950/40 hover:bg-sky-900/60 border-2 border-sky-500 text-white';

  const btnTeal = isLight
    ? 'bg-teal-50/70 hover:bg-teal-100/90 text-slate-850 border-2 border-teal-500 hover:shadow-md'
    : 'bg-teal-950/40 hover:bg-teal-900/60 border-2 border-teal-500 text-white';

  return (
    <div 
      className={`h-screen w-screen overflow-hidden ${cCabinet} flex flex-col relative`}
      onClick={handleGlobalTouch}
    >
      {/* NOTIFICATION TOAST BOX */}
      {notificationMsg && (
        <div className="bg-blue-600 text-white px-4 py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-bounce z-40">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* DYNAMIC SCREEN TRANSITIONS CONTENT VIEW */}
      <div className="flex-1 flex flex-col p-6 md:p-12 items-stretch justify-start relative min-h-0 overflow-y-auto">
          
          {/* ========================================================= */}
          {/* STATE 1: IDLE LOOP MODE (FULL-SCREEN INSTRUCTIONAL RECYCLING VIDEO SCREEN) */}
          {/* ========================================================= */}
          {currentState === 'IDLE' && (
            <div 
              id="kiosk-idle-screen"
              className="absolute inset-0 bg-slate-950 flex flex-col justify-between cursor-pointer relative overflow-hidden"
              onClick={() => {
                setCurrentState('MAIN_MENU');
                speakText("welcomeKiosk");
              }}
            >
              {/* TOP/CENTER CONTENT: LOGO, HEADER & CORE ANIMS */}
              <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-950/40 via-transparent to-transparent">
                <div className="w-36 h-36 rounded-full bg-emerald-500/20 flex items-center justify-center border-4 border-emerald-450 mb-10 animate-bounce">
                  <Leaf className="w-20 h-20 text-emerald-400" />
                </div>
                
                <h3 className="text-5xl md:text-6xl font-black tracking-widest text-emerald-300 uppercase">E-Eco Vault Kiosk</h3>
                
                {/* Animated Graphic demonstrating inserting process */}
                <div className="mt-12 flex items-center gap-8 bg-slate-900/95 py-6 px-10 rounded-3xl border border-teal-500/40">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-teal-900 flex items-center justify-center text-teal-300 font-black text-2xl">1</div>
                    <span className="text-sm mt-2 text-slate-300 font-bold">Insert Item</span>
                  </div>
                  <div className="w-12 h-1 bg-teal-500/40"></div>
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-teal-900 flex items-center justify-center text-teal-300 font-black text-2xl">2</div>
                    <span className="text-sm mt-2 text-slate-300 font-bold">CV Sensor Scan</span>
                  </div>
                  <div className="w-12 h-1 bg-teal-500/40"></div>
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-teal-900 flex items-center justify-center text-teal-300 font-black text-2xl">3</div>
                    <span className="text-sm mt-2 text-slate-300 font-bold">Get Cash / QRPh</span>
                  </div>
                </div>
              </div>

              {/* BOTTOM FOOTER CONTENT: TOUCH TO BEGIN ACTION & ENGLISH PLACEHOLDERS */}
              <div className="w-full bg-gradient-to-t from-emerald-950/90 to-slate-950 border-t border-emerald-800/50 p-10 flex flex-col items-center justify-center text-center space-y-6 z-10 pb-16">
                <span className="text-xs text-emerald-400 font-black tracking-widest uppercase mb-2">Touch Screen Monitor 15.6"</span>
                
                <div className="px-10 py-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-2xl rounded-2xl shadow-2xl flex items-center gap-4 animate-pulse">
                  <Touchpad className="w-8 h-8 text-slate-950" />
                  <span>{t('idleTouchToBegin')}</span>
                </div>
                
                <div className="space-y-2">
                  <p className="text-lg text-teal-200 font-bold">
                    Automatically sorts and accepts PET Plastic Bottles, Aluminum Cans, and Glass Containers.
                  </p>
                  <p className="text-sm text-slate-400 max-w-lg mx-auto">
                    Learn to insert materials in return for points and instant G-Cash wallet rewards.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 2: MAIN MENU */}
          {/* ========================================================= */}
          {currentState === 'MAIN_MENU' && (
            <div className="space-y-10 w-full max-w-4xl mx-auto my-auto py-4">
              <div className="text-center space-y-4">
                <h2 className={`text-4xl md:text-5xl font-black uppercase ${cTextTitle} tracking-widest`}>{t('welcomeKiosk')}</h2>
                <p className={`text-base md:text-lg ${cTextSubtitle}`}>Please choose one of the options below to get started on your recycling journey</p>
              </div>

              <div className="flex flex-col items-center gap-8 max-w-xl mx-auto w-full" id="main-menu-options">
                <button 
                  id="btn-insert-materials"
                  onClick={() => {
                    setCurrentState('INSERT_FLOW_SELECT');
                    speakText("insertMaterials");
                  }}
                  className={`${btnEmerald} w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 group transition-all transform hover:-translate-y-2 hover:shadow-emerald-500/20 shadow-lg`}
                >
                  <div className="bg-emerald-500 text-emerald-950 p-5 rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    <Leaf className="w-14 h-14 font-black" />
                  </div>
                  <div className="text-center space-y-2">
                    <span className="font-black text-2xl md:text-3xl block">{t('insertMaterials')}</span>
                    <span className="text-sm md:text-base opacity-90 font-semibold block">Plastic, Cans, & Glass</span>
                  </div>
                </button>

                <button 
                  id="btn-redeem-rewards"
                  onClick={handleRedeemFromMain}
                  className={`${btnSky} w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 group transition-all transform hover:-translate-y-2 hover:shadow-sky-500/20 shadow-lg`}
                >
                  <div className="bg-sky-500 text-sky-950 p-5 rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    <Coins className="w-14 h-14" />
                  </div>
                  <div className="text-center space-y-2">
                    <span className="font-black text-2xl md:text-3xl block">{t('redeemRewards')}</span>
                    <span className="text-sm md:text-base opacity-90 font-semibold block">Convert current Balance</span>
                  </div>
                </button>

                <button 
                  id="btn-learn-more"
                  onClick={() => {
                    setCurrentState('LEARN_MORE');
                    speakText("learnMore");
                  }}
                  className={`${btnTeal} w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 group transition-all transform hover:-translate-y-2 hover:shadow-teal-500/20 shadow-lg`}
                >
                  <div className="bg-teal-500 text-teal-950 p-5 rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    <HelpCircle className="w-14 h-14" />
                  </div>
                  <div className="text-center space-y-2">
                    <span className="font-black text-2xl md:text-3xl block">{t('learnMore')}</span>
                    <span className="text-sm md:text-base opacity-90 font-semibold block">Materials and rates</span>
                  </div>
                </button>
              </div>

              {activeUser ? (
                <div className={`${cCard} rounded-2xl p-6 flex items-center justify-between shadow-xl`}>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-sky-500/10 rounded-full flex items-center justify-center text-sky-400 font-black text-2xl border-2 border-sky-500/30 animate-pulse">
                      {activeUser.fullName.charAt(0)}
                    </div>
                    <div>
                      <h4 className={`font-black text-lg md:text-xl ${cTextNormal}`}>{activeUser.fullName}</h4>
                      <p className={`text-xs md:text-sm ${cTextMuted}`}>ID: {activeUser.memberId} &bull; Eco Account Active</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs md:text-sm text-sky-500 font-black block">Digital Wallet Balance:</span>
                    <p className="text-2xl md:text-3xl font-black text-emerald-500">₱{(activeUser.walletBalance || 0).toFixed(2)}</p>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className={`text-sm ${cTextMuted}`}>Kiosk Code: RVM-P5-REVISION01 &bull; Active &amp; Ready</p>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 3: INSERT FLOW OPTIONS SELECT */}
          {/* ========================================================= */}
          {currentState === 'INSERT_FLOW_SELECT' && (
            <div className="w-full max-w-3xl mx-auto space-y-10 my-auto py-4">
              <h2 className={`text-4xl md:text-5xl font-black text-center ${cTextTitle} uppercase tracking-widest leading-tight`}>
                How would you like to continue?
              </h2>

              <p className={`text-center text-base md:text-lg ${cTextMuted}`}>
                To track and deposit materials into your balance, please identify yourself.
              </p>

              <div className="flex flex-col items-center gap-8 max-w-xl mx-auto w-full">
                <button 
                  onClick={() => {
                    setCurrentState('NEW_USER_REGISTRATION');
                    speakText("newUser");
                  }}
                  className={`${btnEmerald} w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 group transition-all transform hover:-translate-y-2 hover:shadow-emerald-500/20 shadow-lg`}
                >
                  <div className="bg-emerald-500 text-emerald-950 p-5 rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    <Plus className="w-14 h-14" />
                  </div>
                  <div className="text-center space-y-2">
                    <span className="font-black text-2xl md:text-3xl block">New User</span>
                    <span className="text-sm md:text-base opacity-90 font-semibold block">Register account</span>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setCurrentState('LOGIN_SELECT');
                    speakText("existingUser");
                  }}
                  className={`${btnSky} w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 group transition-all transform hover:-translate-y-2 hover:shadow-sky-500/20 shadow-lg`}
                >
                  <div className="bg-sky-500 text-sky-950 p-5 rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    <UserCheck className="w-14 h-14" />
                  </div>
                  <div className="text-center space-y-2">
                    <span className="font-black text-2xl md:text-3xl block">Existing User</span>
                    <span className="text-sm md:text-base opacity-90 font-semibold block">Login and track</span>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setCurrentState('GUEST_NOTICE');
                    speakText("continueAsGuest");
                  }}
                  className={`${btnTeal} w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 group transition-all transform hover:-translate-y-2 hover:shadow-teal-500/20 shadow-lg`}
                >
                  <div className="bg-teal-500 text-teal-950 p-5 rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    <img src="/images/icons/user.png?v=2" alt="User" className="w-14 h-14 object-contain" onError={(e) => { const target = e.target as HTMLImageElement; target.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/></svg>'; }} />
                  </div>
                  <div className="text-center space-y-2">
                    <span className="font-black text-2xl md:text-3xl block">Guest Mode</span>
                    <span className="text-sm md:text-base opacity-90 font-semibold block">Quick recycling</span>
                  </div>
                </button>
              </div>

              <div className="flex justify-center mt-8">
                <button 
                  onClick={() => setCurrentState('MAIN_MENU')}
                  className={`px-8 py-3.5 ${isLight ? 'bg-slate-250 hover:bg-slate-300 border-slate-350 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'} border rounded-2xl text-base font-bold flex items-center gap-3 transition-all active:scale-[0.98] shadow-md`}
                >
                  <ArrowLeft className="w-5 h-5" /> {t('back')}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 4: NEW USER REGISTRATION */}
          {/* ========================================================= */}
          {currentState === 'NEW_USER_REGISTRATION' && (
            <div className={`w-full max-w-4xl mx-auto ${cCard} p-10 rounded-3xl space-y-6 my-auto py-4 shadow-2xl`}>
              <div className={`flex items-center justify-between border-b ${cBorder} pb-4`}>
                <h3 className={`text-3xl font-black ${cTextTitle} uppercase tracking-wider flex items-center gap-3`}>
                  <FileText className="w-8 h-8" /> {t('registerTitle')}
                </h3>
                <span className={`text-sm ${isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400'} px-4 py-1.5 rounded-full font-bold`}>{t('required')} *</span>
              </div>

              {regError && (
                <div className="bg-red-950/70 border border-red-700 p-4 rounded-xl text-sm text-red-300 flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 animate-pulse" />
                  <span>{regError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterUser} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Full Name */}
                  <div className="space-y-2">
                    <label className={`text-sm ${cTextNormal} font-black flex items-center gap-1`}>
                      <span>* {t('fullName')}</span>
                    </label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Jane Dela Cruz" 
                      value={regForm.fullName}
                      onChange={e => setRegForm({...regForm, fullName: e.target.value})}
                      onFocus={() => handleInputFocus(t('fullName') || 'Full Name', regForm.fullName, 'text', undefined, 'Jane Dela Cruz', (val) => setRegForm(prev => ({ ...prev, fullName: val })))}
                      className={`w-full ${cInput} rounded-xl px-5 py-3 text-lg font-bold`}
                    />
                  </div>

                  {/* Mobile Number */}
                  <div className="space-y-2">
                    <label className={`text-sm ${cTextNormal} font-black flex items-center gap-1`}>
                      <span>{t('mobileNumber')} <span className="text-amber-500 font-bold text-xs">({t('optionalButNeeded')})</span></span>
                    </label>
                    <input 
                      type="tel" 
                      placeholder="09171234567" 
                      value={regForm.mobileNumber}
                      onChange={e => setRegForm({...regForm, mobileNumber: e.target.value})}
                      onFocus={() => handleInputFocus(t('mobileNumber') || 'Mobile Number', regForm.mobileNumber, 'tel', undefined, '09171234567', (val) => setRegForm(prev => ({ ...prev, mobileNumber: val })))}
                      className={`w-full ${cInput} rounded-xl px-5 py-3 text-lg font-bold`}
                    />
                    <p className={`text-xs ${cTextMuted} mt-1 leading-relaxed`}>{t('mobileNumberHelp')}</p>
                  </div>

                  {/* Secure 4 Digit PIN */}
                  <div className="space-y-2">
                    <label className={`text-sm ${cTextNormal} font-black flex items-center gap-1`}>
                      <span>* {t('pin')}</span>
                    </label>
                    <input 
                      type="password" 
                      maxLength={4}
                      pattern="\d{4}"
                      required 
                      placeholder="e.g. 1234" 
                      value={regForm.pin}
                      onChange={e => setRegForm({...regForm, pin: e.target.value})}
                      onFocus={() => handleInputFocus(t('pin') || 'PIN', regForm.pin, 'password', 4, 'e.g. 1234', (val) => setRegForm(prev => ({ ...prev, pin: val })))}
                      className={`w-full ${cInput} rounded-xl px-5 py-3 text-lg text-center tracking-widest font-black font-mono`}
                    />
                  </div>

                  {/* Confirm PIN */}
                  <div className="space-y-2">
                    <label className={`text-sm ${cTextNormal} font-black flex items-center gap-1`}>
                      <span>* {t('confirmPin')}</span>
                    </label>
                    <input 
                      type="password" 
                      maxLength={4}
                      pattern="\d{4}"
                      required 
                      placeholder="e.g. 1234" 
                      value={regForm.confirmPin}
                      onChange={e => setRegForm({...regForm, confirmPin: e.target.value})}
                      onFocus={() => handleInputFocus(t('confirmPin') || 'Confirm PIN', regForm.confirmPin, 'password', 4, 'e.g. 1234', (val) => setRegForm(prev => ({ ...prev, confirmPin: val })))}
                      className={`w-full ${cInput} rounded-xl px-5 py-3 text-lg text-center tracking-widest font-black font-mono`}
                    />
                  </div>

                  {/* OPTIONAL FIELDS */}
                  <div className="space-y-2">
                    <label className={`text-sm ${cTextNormal} font-black flex items-center justify-between`}>
                      <span>{t('emailAddress')}</span>
                      <span className={`text-xs ${cTextMuted} font-bold`}>({t('optional')})</span>
                    </label>
                    <input 
                      type="email" 
                      placeholder="jane@eco-citizen.ph" 
                      value={regForm.emailAddress}
                      onChange={e => setRegForm({...regForm, emailAddress: e.target.value})}
                      onFocus={() => handleInputFocus(t('emailAddress') || 'Email Address', regForm.emailAddress || '', 'email', undefined, 'jane@eco-citizen.ph', (val) => setRegForm(prev => ({ ...prev, emailAddress: val })))}
                      className={`w-full ${cInput} rounded-xl px-5 py-3 text-lg font-bold`}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={`text-sm ${cTextNormal} font-black flex items-center justify-between`}>
                      <span>{t('age')}</span>
                      <span className={`text-xs ${cTextMuted} font-bold`}>({t('optional')})</span>
                    </label>
                    <input 
                      type="number" 
                      placeholder="24" 
                      value={regForm.age}
                      onChange={e => setRegForm({...regForm, age: e.target.value})}
                      onFocus={() => handleInputFocus(t('age') || 'Age', regForm.age || '', 'number', undefined, '24', (val) => setRegForm(prev => ({ ...prev, age: val })))}
                      className={`w-full ${cInput} rounded-xl px-5 py-3 text-lg font-bold`}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={`text-sm ${cTextNormal} font-black flex items-center justify-between`}>
                      <span>{t('barangay')}</span>
                      <span className={`text-xs ${cTextMuted} font-bold`}>({t('optional')})</span>
                    </label>
                    <input 
                      type="text" 
                      placeholder="Barangay Bel-Air" 
                      value={regForm.barangay}
                      onChange={e => setRegForm({...regForm, barangay: e.target.value})}
                      onFocus={() => handleInputFocus(t('barangay') || 'Barangay', regForm.barangay || '', 'text', undefined, 'Barangay Bel-Air', (val) => setRegForm(prev => ({ ...prev, barangay: val })))}
                      className={`w-full ${cInput} rounded-xl px-5 py-3 text-lg font-bold`}
                    />
                  </div>

                  {/* CAMERA FOR PROFILE PHOTO SIMULATOR */}
                  <div className="space-y-2">
                    <label className={`text-sm ${cTextNormal} font-black flex items-center justify-between`}>
                      <span>{t('profilePhoto')}</span>
                      <span className={`text-xs ${cTextMuted} font-bold`}>({t('optional')})</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={captureProfilePhotoSim}
                        className={`px-5 py-3.5 ${isLight ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' : 'bg-slate-800 hover:bg-slate-700 text-emerald-300'} border border-transparent rounded-2xl text-sm flex items-center gap-2 font-black`}
                      >
                        <Camera className="w-5 h-5 animate-pulse" /> Trigger RVM Lens
                      </button>
                      {regForm.profilePhoto ? (
                        <div className={`flex items-center gap-3 ${cCardInset} px-4 py-2 rounded-2xl`}>
                          <img src={regForm.profilePhoto} alt="Snapshot" className="w-12 h-12 rounded-full border border-teal-500 object-cover" />
                          <span className="text-xs text-teal-400 font-black font-mono">Captured</span>
                        </div>
                      ) : (
                        <span className={`text-xs ${cTextMuted} font-bold`}>No photo taken</span>
                      )}
                    </div>
                  </div>

                </div>

                <div className={`flex flex-col gap-4 pt-6 border-t ${cBorder} max-w-xl mx-auto w-full`}>
                  <button 
                    type="submit"
                    className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black hover:from-emerald-500 hover:to-teal-400 rounded-2xl text-lg shadow-lg flex items-center justify-center gap-2"
                  >
                    Create Account &bull; Go To Deposit <ArrowLeft className="w-5 h-5 rotate-180" />
                  </button>

                  <button 
                    type="button"
                    onClick={() => setCurrentState('INSERT_FLOW_SELECT')}
                    className={`w-full py-4 ${isLight ? 'bg-slate-200 text-slate-705 hover:bg-slate-250' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} rounded-2xl text-base font-bold transition-all`}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 5: LOGIN SELECT & LOGIN PASSCODE SECURE CONTAINER */}
          {/* ========================================================= */}
          {currentState === 'LOGIN_SELECT' && (
            <div className={`w-full max-w-3xl mx-auto ${cCard} p-10 rounded-3xl space-y-8 my-auto py-4 shadow-2xl`}>
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-sky-500/10 rounded-full flex items-center justify-center text-sky-400 mx-auto border-2 border-sky-500/30 animate-pulse">
                  <UserCheck className="w-10 h-10" />
                </div>
                <h3 className={`text-3xl font-black ${cTextHeading} uppercase tracking-widest`}>{t('authTitle')}</h3>
                <p className={`text-sm md:text-base ${cTextMuted}`}>{t('authEnterCredentials')}</p>
              </div>

              {loginError && (
                <div className="bg-red-950/70 border border-red-700 p-4 rounded-xl text-sm text-red-300 text-center font-bold">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className={`text-sm ${cTextNormal} font-black`}>{t('authEnterCredentials')}</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. 09171234567 or REV-10024"
                    value={loginCredential}
                    onChange={e => setLoginCredential(e.target.value)}
                    onFocus={() => handleInputFocus('Mobile Number or Member ID', loginCredential, 'text', undefined, 'e.g. 09171234567 or REV-10024', (val) => setLoginCredential(val))}
                    className={`w-full ${cInput} rounded-2xl px-6 py-4 text-center text-lg font-bold`}
                  />
                </div>

                <div className="space-y-2">
                  <label className={`text-sm ${cTextNormal} font-black`}>{t('enterPinCode')}</label>
                  <input 
                    type="password"
                    maxLength={4}
                    pattern="\d{4}"
                    required
                    placeholder="e.g. 1234"
                    value={loginPin}
                    onChange={e => setLoginPin(e.target.value)}
                    onFocus={() => handleInputFocus('PIN Code', loginPin, 'password', 4, 'e.g. 1234', (val) => setLoginPin(val))}
                    className={`w-full ${cInput} rounded-2xl px-6 py-4 text-center text-2xl tracking-[0.2em] font-black font-mono`}
                  />
                </div>

                {/* FAST DEMO LOGIN HINTS */}
                <div className={`${cCardInset} p-5 rounded-2xl space-y-2 shadow-inner`}>
                  <span className="text-xs text-teal-400 font-black uppercase block tracking-wider">⚡ Master Demo Accounts:</span>
                  <div className="flex flex-col gap-2 text-xs md:text-sm font-mono font-bold">
                    <button 
                      type="button" 
                      onClick={() => { setLoginCredential("09171234567"); setLoginPin("1234"); }}
                      className="text-left text-sky-400 hover:underline font-black"
                    >
                      &bull; Juan Dela Cruz: 09171234567 (PIN: 1234)
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setLoginCredential("09187654321"); setLoginPin("4321"); }}
                      className="text-left text-sky-400 hover:underline font-black"
                    >
                      &bull; Maria Clara: 09187654321 (PIN: 4321)
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4 pt-6 max-w-xl mx-auto w-full">
                  <button 
                    type="submit"
                    className="w-full py-4 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-black rounded-2xl text-lg shadow-lg"
                  >
                    Authenticate PIN Securely
                  </button>

                  <button 
                    type="button"
                    onClick={() => setCurrentState('INSERT_FLOW_SELECT')}
                    className={`w-full py-4 ${isLight ? 'bg-slate-200 hover:bg-slate-250 text-slate-705 border-slate-350' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'} border rounded-2xl text-base font-bold transition-all`}
                  >
                    {t('back')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 6: GUEST NOTICE WARNING MODAL */}
          {/* ========================================================= */}
          {currentState === 'GUEST_NOTICE' && (
            <div className={`w-full max-w-3xl mx-auto ${cCard} p-10 rounded-3xl space-y-8 my-auto py-4 shadow-2xl`}>
              <div className={`flex items-center gap-4 border-b ${cBorder} pb-4 text-amber-500`}>
                <AlertTriangle className="w-12 h-12 flex-shrink-0 animate-bounce" />
                <h3 className={`text-2xl md:text-3xl font-black ${cTextHeading} uppercase tracking-widest`}>{t('guestWarning')}</h3>
              </div>

              <p className={`text-base md:text-lg ${cTextNormal} leading-relaxed font-semibold`}>
                {t('guestDescription')}
              </p>

              <div className={`${cCardInset} p-6 rounded-2xl text-center shadow-inner space-y-2`}>
                <span className="text-xs md:text-sm text-teal-400 block font-black uppercase tracking-widest">🎁 MEMBER ACCOUNT PERKS:</span>
                <span className={`text-sm md:text-base ${cTextMuted} block font-bold leading-relaxed`}>
                  Save balance online &bull; Earn extra 20% Ecopoints &bull; Access weekly Barangay recycling lotteries!
                </span>
              </div>

              <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto w-full pt-4">
                <button 
                  onClick={() => setCurrentState('NEW_USER_REGISTRATION')}
                  className="w-full h-56 sm:h-64 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-3xl text-xl sm:text-2xl flex flex-col items-center justify-center gap-4 text-center shadow-lg active:scale-95 transition-all"
                >
                  <div className="bg-white/20 p-3 rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  </div>
                  <span>No, Register Now</span>
                </button>

                <button
                  onClick={() => {
                    setCurrentState('DEPOSIT_PLANNING');
                    speakText("depositPlanner");
                  }}
                  className={`w-full h-56 sm:h-64 ${isLight ? 'bg-slate-200 text-slate-705 hover:bg-slate-250 border-slate-300' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'} border rounded-3xl text-xl sm:text-2xl flex flex-col items-center justify-center gap-4 text-center font-black transition-all active:scale-95`}
                >
                  <div className="bg-teal-500/20 p-3 rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                  </div>
                  <span>Yes, Continue as Guest</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 7: DEPOSIT PLANNING SCREEN */}
          {/* ========================================================= */}
          {currentState === 'DEPOSIT_PLANNING' && (
            <div className="w-full max-w-4xl mx-auto space-y-10 my-auto py-4">
              <div className="space-y-3 block text-center">
                <h3 className={`text-4xl md:text-5xl font-black ${cTextTitle} uppercase tracking-widest`}>{t('depositPlanner')}</h3>
                <p className={`text-base md:text-lg ${cTextSubtitle}`}>{t('depositPlanIntro')}</p>
              </div>

              {/* ENUMERATOR CONTROLS */}
              <div id="materials-planner-grid" className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
                
                {/* Plastik */}
                <div className={`${cCard} border-emerald-500/40 p-8 md:p-10 rounded-3xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left`}>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center border-4 border-emerald-500 flex-shrink-0 dark:bg-white dark:border-emerald-400 dark:shadow-[0_0_0_6px_rgba(52,211,153,0.35)]">
                      <img src="/images/icons/plastic-bottle.avif?v=2" alt="Plastic Bottle" className="w-14 h-14 object-contain" onError={(e) => { const target = e.target as HTMLImageElement; target.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"><path d=\"M22 6h20l2 4v44a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V10l2-4Z\"/><path d=\"M20 10h24\"/><path d=\"M26 16h12\"/><path d=\"M28 22h8\"/><path d=\"M30 28h4\"/></svg>'; }} />
                    </div>
                    <div className="space-y-1">
                      <h4 className={`font-black ${cTextHeading} text-2xl md:text-3xl`}>{t('plasticBottle')}</h4>
                      <p className="text-sm md:text-base text-emerald-500 font-bold">₱1.00 &bull; 10 pts per bottle</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <button 
                      onClick={() => setIntendedPlastic(Math.max(0, intendedPlastic - 1))}
                      className={`w-16 h-16 rounded-2xl ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-850 hover:bg-slate-800 text-white'} border ${cBorder} flex items-center justify-center shadow-md active:scale-95 transition-all text-2xl`}
                    >
                      <Minus className="w-8 h-8 font-black" />
                    </button>
                    <span className="text-3xl md:text-4xl font-black font-mono text-emerald-500 w-14 text-center">{intendedPlastic}</span>
                    <button 
                      onClick={() => setIntendedPlastic(intendedPlastic + 1)}
                      className={`w-16 h-16 rounded-2xl ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-850 hover:bg-slate-800 text-white'} border ${cBorder} flex items-center justify-center shadow-md active:scale-95 transition-all text-2xl`}
                    >
                      <Plus className="w-8 h-8 font-black" />
                    </button>
                  </div>
                </div>

                {/* Lata */}
                <div className={`${cCard} border-sky-500/40 p-8 md:p-10 rounded-3xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left`}>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center border-4 border-sky-500 flex-shrink-0 dark:bg-white dark:border-sky-400 dark:shadow-[0_0_0_6px_rgba(56,189,248,0.35)]">
                      <img src="/images/icons/aluminum-can.jpg?v=2" alt="Aluminum Can" className="w-14 h-14 object-contain" onError={(e) => { const target = e.target as HTMLImageElement; target.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"><path d=\"M18 8h28l2 4v36a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V12l2-4Z\"/><path d=\"M18 12h28\"/><path d=\"M24 18h16\"/><path d=\"M24 24h16\"/><path d=\"M24 30h16\"/><path d=\"M24 36h16\"/><path d=\"M18 48h28\"/></svg>'; }} />
                    </div>
                    <div className="space-y-1">
                      <h4 className={`font-black ${cTextHeading} text-2xl md:text-3xl`}>{t('aluminumCan')}</h4>
                      <p className="text-sm md:text-base text-sky-600 dark:text-sky-300 font-bold">₱2.50 &bull; 25 pts per can</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <button 
                      onClick={() => setIntendedAluminum(Math.max(0, intendedAluminum - 1))}
                      className={`w-16 h-16 rounded-2xl ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-850 hover:bg-slate-800 text-white'} border ${cBorder} flex items-center justify-center shadow-md active:scale-95 transition-all text-2xl`}
                    >
                      <Minus className="w-8 h-8 font-black" />
                    </button>
                    <span className="text-3xl md:text-4xl font-black font-mono text-sky-500 w-14 text-center">{intendedAluminum}</span>
                    <button 
                      onClick={() => setIntendedAluminum(intendedAluminum + 1)}
                      className={`w-16 h-16 rounded-2xl ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-850 hover:bg-slate-800 text-white'} border ${cBorder} flex items-center justify-center shadow-md active:scale-95 transition-all text-2xl`}
                    >
                      <Plus className="w-8 h-8 font-black" />
                    </button>
                  </div>
                </div>

                {/* Glass */}
                <div className={`${cCard} border-teal-500/40 p-8 md:p-10 rounded-3xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left`}>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center border-4 border-teal-500 flex-shrink-0 dark:bg-white dark:border-teal-400 dark:shadow-[0_0_0_6px_rgba(45,212,191,0.35)]">
                      <img src="/images/icons/glass-bottle.png?v=2" alt="Glass Bottle" className="w-14 h-14 object-contain" onError={(e) => { const target = e.target as HTMLImageElement; target.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"><path d=\"M24 6h16l2 4v36a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V10l2-4Z\"/><path d=\"M22 10h20\"/><path d=\"M28 16h8\"/><path d=\"M26 22h12\"/><path d=\"M28 28h8\"/><path d=\"M24 34h16\"/></svg>'; }} />
                    </div>
                    <div className="space-y-1">
                      <h4 className={`font-black ${cTextHeading} text-2xl md:text-3xl`}>{t('glassBottle')}</h4>
                      <p className="text-sm md:text-base text-teal-600 dark:text-teal-300 font-bold">₱1.50 &bull; 15 pts per bottle</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <button 
                      onClick={() => setIntendedGlass(Math.max(0, intendedGlass - 1))}
                      className={`w-16 h-16 rounded-2xl ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-850 hover:bg-slate-800 text-white'} border ${cBorder} flex items-center justify-center shadow-md active:scale-95 transition-all text-2xl`}
                    >
                      <Minus className="w-8 h-8 font-black" />
                    </button>
                    <span className="text-3xl md:text-4xl font-black font-mono text-teal-500 w-14 text-center">{intendedGlass}</span>
                    <button 
                      onClick={() => setIntendedGlass(intendedGlass + 1)}
                      className={`w-16 h-16 rounded-2xl ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-850 hover:bg-slate-800 text-white'} border ${cBorder} flex items-center justify-center shadow-md active:scale-95 transition-all text-2xl`}
                    >
                      <Plus className="w-8 h-8 font-black" />
                    </button>
                  </div>
                </div>

              </div>

              {/* SUMMARY PLAN ESTIMATIONS */}
              <div className={`${cCardInset} p-6 rounded-3xl flex items-center justify-between shadow-inner`}>
                <div>
                  <span className={`text-sm ${cTextMuted} font-bold block`}>{t('totalEstimatedItems')}</span>
                  <p className={`text-3xl font-black ${cTextHeading}`}>{intendedPlastic + intendedAluminum + intendedGlass} Items</p>
                </div>
                <div className="text-right">
                  <span className="text-sm text-emerald-500 font-black block">Estimated Return Value:</span>
                  <p className="text-3xl font-black text-emerald-500 font-mono">₱{(intendedPlastic * 1.0 + intendedAluminum * 2.5 + intendedGlass * 1.5).toFixed(2)}</p>
                </div>
              </div>

              {/* START REVERSE VENDING DRIVER AND HARDWARE INTEND BUTTON */}
              <div className="flex flex-row flex-wrap justify-center gap-8 max-w-5xl mx-auto w-full">
                <button 
                  id="activate-rvm-button"
                    onClick={() => {
                      runVerificationProcess();
                    }}
                  className="w-80 h-80 md:w-96 md:h-96 bg-gradient-to-r from-emerald-600 to-teal-500 font-black text-white rounded-3xl shadow-xl flex flex-col items-center justify-center gap-6 hover:brightness-110 active:scale-95 transition-all text-2xl animate-pulse"
                >
                  <Cpu className="w-14 h-14 animate-spin-slow" />
                  <span>{t('startRVM')}</span>
                </button>

                <button 
                  onClick={() => setCurrentState('MAIN_MENU')}
                  className={`w-80 h-80 md:w-96 md:h-96 ${isLight ? 'bg-slate-200 text-slate-705 hover:bg-slate-250 border-slate-350' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-705'} border rounded-3xl text-2xl font-black flex flex-col items-center justify-center gap-6 transition-all active:scale-95`}
                >
                  <div className="bg-red-500/10 p-4 rounded-2xl">
                    <X className="w-14 h-14 text-red-500" />
                  </div>
                  <span>Cancel Plan</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 8: VERIFYING ITEMS ONE BY ONE DIAGNOSTIC PANEL */}
          {currentState === 'VERIFYING_ITEMS' && (
            <div className="w-full max-w-5xl mx-auto space-y-8 my-auto py-4">
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                
                {/* COLUMN LEFT: CHAMBER ACTIVE WEB-FEED VIEWPORT */}
                <div className={`md:col-span-5 bg-black border-4 ${isLight ? 'border-slate-300' : 'border-slate-700'} rounded-[32px] p-5 relative overflow-hidden flex flex-col justify-between items-stretch min-h-[380px] shadow-2xl shadow-cyan-950/60`}>
                  <span className="absolute top-6 left-6 bg-red-600/90 text-white text-xs px-3.5 py-1.5 rounded-xl font-mono font-black uppercase flex items-center gap-2 z-10">
                    <span className="w-2.5 h-2.5 rounded-full bg-white block animate-ping"></span>
                    LASER SCANNING CHAMBER
                  </span>

                    {backendCameraActive ? (
                      activeSnapshot ? (
                        <img 
                          src={activeSnapshot}
                          alt="Live Camera Feed"
                          className="w-full h-[280px] object-cover rounded-2xl border border-slate-800 bg-slate-900"
                        />
                      ) : (
                        <video 
                          autoPlay 
                          muted
                          playsInline
                          src="/api/camera/stream"
                          className="w-full h-[280px] object-cover rounded-2xl border border-slate-800 bg-slate-900"
                        />
                      )
                    ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-center p-6 min-h-[280px]">
                        {/* SIMULATED OPTICS SCHEMATIC GRAPHIC BASED ON ITEM MATERIAL */}
                        <div className="w-28 h-28 rounded-2xl bg-slate-800 flex items-center justify-center border border-slate-700 relative mb-4">
                          {verificationStage === 'CAMERA' && <Camera className="w-12 h-12 text-teal-400 animate-pulse" />}
                          {verificationStage === 'INDUCTIVE' && <Cpu className="w-12 h-12 text-sky-400 animate-spin" />}
                          {verificationStage === 'WEIGHT' && <TrendingUp className="w-12 h-12 text-emerald-400" />}
                          {verificationStage === 'SORTING' && <Sliders className="w-12 h-12 text-amber-500 animate-bounce" />}
                          <div className="absolute inset-0 bg-gradient-to-t from-teal-500/20 to-transparent"></div>
                        </div>
                        <span className="text-sm text-teal-400 font-black uppercase tracking-widest">{verificationStage}...</span>
                        <p className="text-xs text-slate-500 max-w-[200px] truncate mt-1">Optics model: RevOptics-D56</p>
                      </div>
                   )}

                   {/* BOTTOM REVAL CHEVRON FLAPS POSITION */}
                   <div className="bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-2xl flex items-center justify-between mt-3">
                    <span className="text-xs text-slate-400 font-bold">Solenoid Flap:</span>
                    <span className="text-xs font-black text-emerald-400 font-mono">
                      {verificationStage === 'SORTING' ? 'OPEN & DIVERTER ACTUATING' : 'SHUT / LOCKED'}
                    </span>
                  </div>
                </div>

                {/* COLUMN RIGHT: MULTI SENSOR STATS & PIPELINE DISPLAY */}
                <div className="md:col-span-7 space-y-5">
                  <div className={`flex items-center justify-between ${cCard} p-5 rounded-2xl border shadow-xl`}>
                    <div>
                      <span className={`text-sm ${cTextMuted} font-bold`}>{t('processingItemCount')} ({currentItemIndex + 1}/{totalItemsCount})</span>
                      <h4 className={`text-xl md:text-2xl font-black ${cTextHeading} mt-0.5`}>Item ID: PL-REV-{(currentItemIndex * 97 + 1092)}</h4>
                    </div>
                    <div className="bg-emerald-500/15 border border-emerald-500/30 px-4 py-2 rounded-xl text-emerald-500 text-xs font-mono font-extrabold animate-pulse">
                      In-Progress / Aktibo
                    </div>
                  </div>

                  {/* GRAPHICAL STEP SENSORS PIPELINE FEED */}
                  <div className="space-y-3">
                    
                    {/* CAMERA SENSOR STAGE */}
                    <div className={`p-4 rounded-2xl border border-transparent flex items-center justify-between ${verificationStage === 'CAMERA' ? 'bg-cyan-950/40 border-cyan-500 text-cyan-400 dark:text-white animate-pulse' : isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-900/60 text-slate-400'}`}>
                      <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-xl ${isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white'} flex items-center justify-center font-black font-mono text-base`}>1</span>
                        <div>
                          <p className="text-sm font-black">Optics Image Recognition Frame</p>
                          <span className="text-xs block opacity-80 font-mono font-bold">Gemini-Vision API parsing</span>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-black">
                        {verificationStage === 'CAMERA' ? '📷 Scanning' : 'Completed'}
                      </span>
                    </div>

                    {/* INDUCTIVE METALS STAGE */}
                    <div className={`p-4 rounded-2xl border border-transparent flex items-center justify-between ${verificationStage === 'INDUCTIVE' ? 'bg-sky-950/40 border-sky-500 text-sky-400 dark:text-white animate-pulse' : isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-900/60 text-slate-400'}`}>
                      <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-xl ${isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white'} flex items-center justify-center font-black font-mono text-base`}>2</span>
                        <div>
                          <p className="text-sm font-black">Inductive Metal Coil Sensor</p>
                          <span className="text-xs block opacity-80 font-mono font-bold">Verifying aluminum conductivity</span>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-black">
                        {verificationStage === 'INDUCTIVE' ? '⚡ Sampling' : 'Locked'}
                      </span>
                    </div>

                    {/* LOAD CELL WEIGHT STAGE */}
                    <div className={`p-4 rounded-2xl border border-transparent flex items-center justify-between ${verificationStage === 'WEIGHT' ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400 dark:text-white animate-pulse' : isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-900/60 text-slate-400'}`}>
                      <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-xl ${isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white'} flex items-center justify-center font-black font-mono text-base`}>3</span>
                        <div>
                          <p className="text-sm font-black">Load Cell Gravity Scaler</p>
                          <span className="text-xs block opacity-80 font-mono font-bold">Confirming material mass</span>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-black">
                        {verificationStage === 'WEIGHT' ? '⚖️ Measuring' : 'Calibrated'}
                      </span>
                    </div>

                    {/* TOF LASER DISPLACEMENT VL53L0X STAGE */}
                    <div className={`p-4 rounded-2xl border border-transparent flex items-center justify-between ${verificationStage === 'TOF' ? 'bg-indigo-950/40 border-indigo-500 text-indigo-400 dark:text-white animate-pulse' : isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-900/60 text-slate-400'}`}>
                      <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-xl ${isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white'} flex items-center justify-center font-black font-mono text-base`}>4</span>
                        <div>
                          <p className="text-sm font-black">VL53L0X Laser Distance Ranger</p>
                          <span className="text-xs block opacity-80 font-mono font-bold">Measuring volume envelope</span>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-black">
                        {verificationStage === 'TOF' ? '🎯 Beam active' : 'Stable'}
                      </span>
                    </div>

                    {/* AUTOMATED DIVERTER SORT STEP */}
                    <div className={`p-4 rounded-2xl border border-transparent flex items-center justify-between ${verificationStage === 'SORTING' ? 'bg-amber-950/40 border-amber-500 text-amber-500 dark:text-white animate-pulse' : isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-900/60 text-slate-400'}`}>
                      <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-xl ${isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white'} flex items-center justify-center font-black font-mono text-base`}>5</span>
                        <div>
                          <p className="text-sm font-black">Automated Sorting Flap Diverter</p>
                          <span className="text-xs block opacity-80 font-mono font-bold">Routing to correct bio-compartment</span>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-black">
                        {verificationStage === 'SORTING' ? '♻️ Sorting' : 'Locked'}
                      </span>
                    </div>

                  </div>
                </div>

              </div>
              
              {/* LIVE RECYCLING STATUS INTAKE TRACKER LIST */}
              <div className="space-y-3">
                <span className={`text-sm ${cTextMuted} font-black block uppercase tracking-widest`}>Diagnostic Session History logs:</span>
                <div className={`${cCardInset} rounded-3xl p-6 max-h-[280px] overflow-y-auto space-y-3 text-sm font-mono shadow-inner`}>
                  {processedItemsList.length === 0 ? (
                    <div className="text-slate-500 text-center py-6 font-bold">No items deposited into the session yet. Feed items.</div>
                  ) : (
                    processedItemsList.map((item, idx) => (
                      <div key={idx} className={`flex items-center justify-between ${isLight ? 'bg-slate-50/80 border border-slate-200 text-slate-850' : 'bg-slate-950 border border-slate-850'} p-3.5 rounded-xl font-bold`}>
                        <span className="text-slate-500">#{(idx+1).toString().padStart(2, '0')}</span>
                        <span className="text-teal-600 dark:text-teal-300 font-black capitalize">{item.detectedMaterial} ({item.itemName})</span>
                        <span className="text-amber-600 dark:text-amber-400 font-black">{item.weightGrams}g</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-black">₱{item.payoutAmount.toFixed(2)}</span>
                        <span className="text-sky-600 dark:text-sky-300 font-black">+{item.ecoPoints}pts</span>
                        <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-100 px-3 py-1 rounded-full uppercase font-black">
                          {item.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 9: INTAKE SUCCESS REVISION COMPLETE SUMMARY */}
          {/* ========================================================= */}
          {currentState === 'DEPOSIT_COMPLETE_SUMMARY' && (
            <div className="w-full max-w-5xl mx-auto space-y-8 my-auto py-4">
              <div className="text-center space-y-2">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto border-2 border-emerald-500/20">
                  <CheckCircle2 className="w-10 h-10 animate-bounce" />
                </div>
                <h3 className={`text-4xl font-black ${cTextTitle} uppercase tracking-widest`}>{t('processingSummary')}</h3>
                <p className={`text-sm md:text-base ${cTextSubtitle}`}>Review your final batch audit logs prior to withdrawing rewards.</p>
              </div>

              {/* STATS HIGHLIGHT COMPASS METRICS GRID */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`${cCard} border-emerald-500/35 p-6 rounded-2xl text-center shadow-lg`}>
                  <span className={`text-xs ${cTextMuted} block font-black uppercase tracking-wider mb-2`}>Estimated Net Peso:</span>
                  <p className="text-3xl md:text-4xl font-black text-emerald-500 font-mono">₱{totalPayout.toFixed(2)}</p>
                  <span className={`text-[10px] ${cTextMuted} block font-bold mt-2`}>Credited on Complete</span>
                </div>
                
                <div className={`${cCard} border-sky-500/35 p-6 rounded-2xl text-center shadow-lg`}>
                  <span className={`text-xs ${cTextMuted} block font-black uppercase tracking-wider mb-2`}>Total Eco Points:</span>
                  <p className="text-3xl md:text-4xl font-black text-sky-500">+{totalPoints} Points</p>
                  <span className={`text-[10px] ${cTextMuted} block font-bold mt-2`}>Eco-Account balance</span>
                </div>

                <div className={`${cCard} border-slate-700/35 p-6 rounded-2xl text-center shadow-lg`}>
                  <span className={`text-xs ${cTextMuted} block font-black uppercase tracking-wider mb-2`}>Total Mass Deposited:</span>
                  <p className={`text-3xl md:text-4xl font-black ${cTextHeading}`}>{totalWeightStr} Kg</p>
                  <span className={`text-[10px] ${cTextMuted} block font-bold mt-2`}>Automated scale weight</span>
                </div>

                <div className={`${cCard} border-teal-500/35 p-6 rounded-2xl text-center shadow-lg`}>
                  <span className={`text-xs ${cTextMuted} block font-black uppercase tracking-wider mb-2`}>CO₂ Footprint Saved:</span>
                  <p className="text-3xl md:text-4xl font-black text-teal-600 dark:text-teal-300">{totalCO2Str} Kg</p>
                  <span className={`text-[10px] ${cTextMuted} block font-bold mt-2`}>Carbon offset equivalence</span>
                </div>
              </div>

              {/* ITEMIZED SUMMARY */}
              <div className={`${cCardInset} rounded-3xl p-6 space-y-4 shadow-inner`}>
                <h4 className={`font-black ${cTextHeading} text-sm uppercase tracking-wider`}>Itemized Deposit Log:</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className={`p-4 text-center rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-850'}`}>
                    <span className={`text-xs md:text-sm block ${cTextMuted} font-black`}>Plastic Bottles</span>
                    <span className={`text-2xl font-black ${cTextHeading}`}>{processedItemsList.filter(i => i.detectedMaterial === 'plastic' && i.status === 'accepted').length}</span>
                  </div>
                  <div className={`p-4 text-center rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-850'}`}>
                    <span className={`text-xs md:text-sm block ${cTextMuted} font-black`}>Aluminum Cans</span>
                    <span className={`text-2xl font-black ${cTextHeading}`}>{processedItemsList.filter(i => i.detectedMaterial === 'aluminum' && i.status === 'accepted').length}</span>
                  </div>
                  <div className={`p-4 text-center rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-850'}`}>
                    <span className={`text-xs md:text-sm block ${cTextMuted} font-black`}>Glass Bottles</span>
                    <span className={`text-2xl font-black ${cTextHeading}`}>{processedItemsList.filter(i => i.detectedMaterial === 'glass' && i.status === 'accepted').length}</span>
                  </div>
                </div>
              </div>

              {/* PAYMENT STRATEGY DECISIONS */}
              <div className="space-y-4 pt-2">
                <span className={`text-sm md:text-base ${cTextSubtitle} block text-center font-black`}>Choose how you would like to receive your ₱{totalPayout.toFixed(2)}:</span>
                
                <div className="flex flex-row flex-wrap justify-center gap-8 max-w-7xl mx-auto w-full">
                  
                  {activeUser ? (
                    <button 
                      onClick={() => saveSessionRewards('wallet')}
                      className={`border w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 text-center transition-all ${isLight ? 'bg-sky-50 hover:bg-sky-100 border-sky-200 shadow-md shadow-sky-100/50' : 'bg-sky-900/60 hover:bg-sky-850 border-sky-500'} active:scale-95`}
                    >
                      <div className="bg-sky-500/10 p-5 rounded-2xl flex-shrink-0">
                        <Database className="w-14 h-14 text-sky-500 dark:text-sky-400 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <span className={`text-2xl font-black block ${isLight ? 'text-sky-950' : 'text-white'}`}>{t('keepInWallet')}</span>
                        <span className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'} font-bold block`}>Add to account balance</span>
                      </div>
                    </button>
                  ) : (
                    <div className={`${cCardInset} border-dashed border-2 border-slate-500/40 opacity-60 w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 text-center`}>
                      <div className="bg-slate-500/10 p-5 rounded-2xl flex-shrink-0">
                        <Lock className="w-12 h-12 text-slate-400 dark:text-slate-500" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xl text-slate-500 uppercase block font-black">Keep in Wallet (Unavailable)</span>
                        <span className="text-sm text-slate-500 font-bold block">Login prior to depositing</span>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => saveSessionRewards('qrph')}
                    className={`border w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 text-center transition-all ${isLight ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 shadow-md shadow-emerald-100/50' : 'bg-emerald-900/60 hover:bg-emerald-850 border-emerald-500'} active:scale-95`}
                  >
                    <div className="bg-emerald-500/10 p-5 rounded-2xl flex-shrink-0">
                      <Smartphone className="w-14 h-14 text-emerald-500 dark:text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                      <span className={`text-2xl font-black block ${isLight ? 'text-emerald-950' : 'text-white'}`}>{t('redeemViaQRPh')}</span>
                      <span className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'} font-bold block`}>GCash / Maya / Bank app</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => saveSessionRewards('cash')}
                    className={`border w-80 h-80 md:w-96 md:h-96 rounded-3xl flex flex-col items-center justify-center gap-6 text-center transition-all ${isLight ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 shadow-md shadow-amber-100/50' : 'bg-amber-900/60 hover:bg-amber-850 border-amber-500'} active:scale-95`}
                  >
                    <div className="bg-amber-500/10 p-5 rounded-2xl flex-shrink-0">
                      <Coins className="w-14 h-14 text-amber-500 dark:text-amber-400" />
                    </div>
                    <div className="space-y-1">
                      <span className={`text-2xl font-black block ${isLight ? 'text-amber-950' : 'text-white'}`}>{t('redeemViaCash')}</span>
                      <span className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'} font-bold block`}>Dispense Coins</span>
                    </div>
                  </button>

                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 10: REDEEM BALANCE SCREEN LOGGED IN */}
          {/* ========================================================= */}
          {currentState === 'REDEEM_BALANCE_SCREEN' && activeUser && (
            <div className="w-full max-w-5xl mx-auto space-y-8 my-auto py-4">
              
              <div className={`${cCard} p-8 md:p-10 rounded-3xl grid grid-cols-1 md:grid-cols-3 gap-8 border shadow-2xl`}>
                
                {/* BALANCE STATS */}
                <div className="md:col-span-2 space-y-6">
                  <div>
                    <span className={`text-sm ${cTextMuted} font-black uppercase tracking-wider block`}>{t('walletBalance')}</span>
                    <p className="text-6xl font-black text-emerald-500 font-mono mt-1">₱{(redeemUser().walletBalance || 0).toFixed(2)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${cCardInset} p-5 rounded-2xl shadow-inner`}>
                      <span className={`text-xs ${cTextMuted} font-black uppercase block tracking-wider`}>{t('points')}</span>
                      <p className="text-xl font-black text-sky-500 dark:text-sky-400 mt-1">+{redeemUser().ecoPoints || 0} Points</p>
                    </div>
                    <div className={`${cCardInset} p-5 rounded-2xl shadow-inner`}>
                      <span className={`text-xs ${cTextMuted} font-black uppercase block tracking-wider`}>{t('estimatedCo2')}</span>
                      <p className="text-xl font-black text-teal-600 dark:text-teal-400 mt-1">{(redeemUser().co2ReductionKg || 0).toFixed(2)} Kg</p>
                    </div>
                  </div>
                </div>

                {/* USER CARD INFO */}
                <div className={`${isLight ? 'bg-slate-55 border-slate-200' : 'bg-slate-950 border-slate-800'} p-6 rounded-2xl border flex flex-col justify-between shadow-md`}>
                  <div>
                    <span className="text-xs text-emerald-500 font-black block uppercase tracking-widest">Active Member Card</span>
                    <h4 className={`font-black ${isLight ? 'text-slate-900' : 'text-white'} text-lg mt-2`}>{redeemUser().fullName}</h4>
                    <p className={`font-mono text-xs ${cTextMuted} mt-1.5 font-bold`}>ID: {redeemUser().memberId}</p>
                    <p className={`font-mono text-xs ${cTextMuted} font-bold`}>{redeemUser().phoneNumber || 'N/A'}</p>
                  </div>
                  
                  {/* GENERATE DEMO BARCODE FOR MEMBER CARD */}
                  <div className="bg-white p-2 rounded-xl mt-6 h-16 flex flex-col items-center justify-center opacity-85 shadow-sm">
                    <div className="w-full bg-[repeating-linear-gradient(90deg,_#000,_#000_3px,_#fff_3px,_#fff_11px)] h-8"></div>
                    <span className="text-[10px] text-black font-mono font-black mt-1">{redeemUser().memberId}</span>
                  </div>
                </div>

              </div>

              {/* LATEST TRANSACTION HISTORIES */}
              <div className={`${cCard} p-6 rounded-3xl space-y-4 border shadow-xl`}>
                <span className={`text-sm ${cTextMuted} font-black uppercase tracking-widest block`}>Transaction History logs:</span>
                
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  <div className={`p-4 rounded-xl border flex justify-between items-center text-sm font-bold ${isLight ? 'bg-slate-50/80 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-850'}`}>
                    <span className="text-slate-500 font-mono">2026-06-17 11:21</span>
                    <span className="font-black">Interactive Cabinet Session Deposit</span>
                    <span className="text-emerald-500 font-black font-mono">+₱12.00</span>
                  </div>
                  <div className={`p-4 rounded-xl border flex justify-between items-center text-sm font-bold ${isLight ? 'bg-slate-50/80 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-850'}`}>
                    <span className="text-slate-500 font-mono">2026-06-16 14:02</span>
                    <span className="font-black">GCash Payout Disbursed</span>
                    <span className="text-red-500 font-black font-mono">-₱50.00</span>
                  </div>
                  <div className={`p-4 rounded-xl border flex justify-between items-center text-sm font-bold ${isLight ? 'bg-slate-50/80 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-850'}`}>
                    <span className="text-slate-500 font-mono">2026-06-15 09:41</span>
                    <span className="font-black">Eco Points Reward Booster Bonus</span>
                    <span className="text-teal-500 font-black font-mono">+120 pts</span>
                  </div>
                </div>
              </div>

              {/* REDEMPTION ACTION BUTTONS */}
              <div className="flex flex-row flex-wrap justify-center gap-8 max-w-7xl mx-auto w-full">
                <button 
                  onClick={() => {
                    setCurrentState('QRPH_SELECT_PROVIDER');
                    speakText("selectBank");
                  }}
                  className="w-80 h-80 md:w-96 md:h-96 bg-sky-600 hover:bg-sky-500 font-black text-white text-2xl rounded-3xl flex flex-col items-center justify-center gap-6 shadow-lg active:scale-95 transition-all"
                >
                  <Smartphone className="w-14 h-14" /> 
                  <span>Redeem via QRPh</span>
                </button>

                <button 
                  onClick={() => {
                    setIntendedDispenserProgress(0);
                    setCurrentState('DISPENSING_CASH');
                    speakText("dispensingProgress");
                  }}
                  className="w-80 h-80 md:w-96 md:h-96 bg-emerald-600 hover:bg-emerald-500 font-black text-white text-2xl rounded-3xl flex flex-col items-center justify-center gap-6 shadow-lg active:scale-95 transition-all"
                >
                  <Coins className="w-14 h-14" /> 
                  <span>Cash Out Coins</span>
                </button>

                <button 
                  onClick={() => setCurrentState('MAIN_MENU')}
                  className={`w-80 h-80 md:w-96 md:h-96 ${isLight ? 'bg-slate-200 text-slate-705 hover:bg-slate-250 border-slate-355' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-705'} border text-2xl font-black rounded-3xl flex flex-col items-center justify-center gap-6 transition-all active:scale-95`}
                >
                  <Home className="w-14 h-14" />
                  <span>Return Main Menu</span>
                </button>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 11: PRIVACY DIRECT QRPH REDEMPTION LIST */}
          {/* ========================================================= */}
          {currentState === 'QRPH_SELECT_PROVIDER' && (
            <div className={`w-full max-w-4xl mx-auto ${cCard} p-10 rounded-3xl space-y-8 my-auto py-6 shadow-2xl`}>
              <div className="text-center space-y-2">
                <h3 className={`text-4xl md:text-5xl font-black ${cTextTitle} uppercase tracking-widest`}>{t('withdrawQRPhTitle')}</h3>
                <p className={`text-base ${cTextSubtitle}`}>{t('selectBank')}</p>
              </div>

              <div className="grid grid-cols-2 gap-8 max-w-5xl mx-auto w-full justify-items-center">
                {['GCash', 'Maya', 'BPI', 'BDO', 'UnionBank', 'Landbank'].map((bank) => (
                  <button 
                    key={bank}
                    onClick={() => setSelectedBank(bank)}
                    className={`w-80 h-80 md:w-96 md:h-96 rounded-3xl border text-center transition-all flex items-center justify-center ${selectedBank === bank ? 'bg-sky-500/10 border-sky-500 text-sky-600 dark:text-white shadow-lg font-black scale-105' : isLight ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-750'}`}
                  >
                    <img 
                      src={bankLogos[bank]} 
                      alt={`${bank} logo`}
                      className="w-48 h-48 md:w-56 md:h-56 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="20" fill="%23ccc"/><text x="100" y="120" font-family="Arial" font-size="80" text-anchor="middle" fill="%23333">?</text></svg>';
                      }}
                    />
                  </button>
                ))}
              </div>

              <div className={`flex flex-col gap-4 pt-6 border-t ${cBorder} max-w-xl mx-auto w-full`}>
                <button 
                  onClick={generateQRPhPayout}
                  className="w-full py-4 bg-gradient-to-r from-sky-600 to-teal-500 text-white font-black rounded-2xl text-lg flex items-center justify-center gap-3 hover:brightness-110 shadow-lg active:scale-95 transition-all"
                >
                  Generate QRPh Node <ArrowLeft className="w-5 h-5 rotate-180" />
                </button>

                <button 
                  onClick={() => {
                    // route back safely
                    if (activeUser) setCurrentState('REDEEM_BALANCE_SCREEN');
                    else setCurrentState('DEPOSIT_COMPLETE_SUMMARY');
                  }}
                  className={`w-full py-4 ${isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-250 border-slate-355' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'} border rounded-2xl text-base font-black transition-all`}
                >
                  {t('back')}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 12: DISPLAY QRPH SEAMLESS CODE GENERATED */}
          {/* ========================================================= */}
          {currentState === 'QRPH_DISPLAY' && (
            <div className={`w-full max-w-3xl mx-auto ${cCard} p-10 rounded-3xl text-center space-y-8 my-auto py-6 shadow-2xl`}>
              <div className="space-y-2 text-center">
                <h3 className={`text-3xl md:text-4xl font-black ${cTextHeading}`}>{selectedBank} QRPh Node Active</h3>
                <p className="text-sm md:text-base text-sky-500 dark:text-sky-300 font-black">{t('generatingQRPh')}</p>
              </div>

              {/* OUTWARD QR DIGITAL CANVAS */}
              <div className={`bg-white p-6 rounded-[32px] inline-block shadow-inner mx-auto border-4 ${isLight ? 'border-sky-500' : 'border-emerald-500'}`}>
                {selectedBank && (
                  <div className="flex justify-center mb-4">
                     <img 
                       src={bankLogos[selectedBank]} 
                       alt={`${selectedBank} logo`}
                       className="h-12 object-contain"
                       onError={(e) => {
                         const target = e.target as HTMLImageElement;
                         target.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="20" fill="%23ccc"/><text x="100" y="120" font-family="Arial" font-size="80" text-anchor="middle" fill="%23333">?</text></svg>';
                       }}
                     />
                  </div>
                )}
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="QRPh Payout code" className="w-[260px] h-[260px] mx-auto block rounded-2xl" />
                ) : (
                  <div className="w-[260px] h-[260px] flex items-center justify-center text-slate-500 font-mono text-sm font-bold">
                    Loading Secure QR Map...
                  </div>
                )}
                
                {/* PHILIPPINES QRPH ACCREDITED WATERMARKBAND */}
                <div className="bg-sky-950 text-white py-3 px-6 mt-4 rounded-xl text-xs uppercase tracking-widest font-black flex items-center justify-center gap-2">
                  <span className="text-red-500 font-black">QR</span>
                  <span className="text-yellow-400 font-black">PH</span>
                  <span className="text-white/60">ACCREDITED SYSTEM VIA BSP</span>
                </div>
              </div>

              <div className="space-y-4">
                <p className={`text-base md:text-lg ${cTextNormal} leading-relaxed font-bold`}>
                  {t('scanToReceivePayout')}
                </p>
                <div className={`${cCardInset} p-4 rounded-2xl font-mono text-xs md:text-sm shadow-inner`}>
                  <span className="block font-black text-sky-500 dark:text-sky-400 uppercase tracking-widest mb-1">{t('referenceNumber')}:</span>
                  <span className="font-bold">{payoutReference || "REF-81204128"}</span>
                </div>
              </div>

              {/* DEMO BYPASS INSTANT CREDIT SIMULATOR */}
              <div className="flex flex-col gap-4 pt-2 max-w-xl mx-auto w-full">
                <button 
                  onClick={confirmQRPhPayoutReceived}
                  className="w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl text-base animate-pulse shadow-md"
                >
                  Verify Payout Received (Simulate BSP API)
                </button>

                <button 
                  onClick={() => setCurrentState('QRPH_SELECT_PROVIDER')}
                  className={`w-full px-6 py-4 ${isLight ? 'bg-slate-200 text-slate-705 hover:bg-slate-250 border-slate-350' : 'bg-slate-800 text-slate-300 hover:bg-slate-705 border-slate-705'} border rounded-2xl text-base font-black transition-all`}
                >
                  Cancel QR
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 13: DISPENSING PHYSICAL COINS (HW INVENTORIES LEVEL) */}
          {/* ========================================================= */}
          {currentState === 'DISPENSING_CASH' && (
            <div className={`w-full max-w-3xl mx-auto ${cCard} p-10 rounded-3xl text-center space-y-8 my-auto py-6 shadow-2xl`}>
              <div className="space-y-3 text-center animate-pulse">
                <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mx-auto border-4 border-amber-500">
                  <Coins className="w-12 h-12 animate-bounce" />
                </div>
                <h3 className="text-3xl md:text-4xl font-black text-amber-500 uppercase tracking-widest">{t('withdrawCashTitle')}</h3>
                <p className={`text-sm md:text-base ${cTextNormal} font-bold`}>{t('dispensingProgress')}</p>
              </div>

              {/* INTENSE PROGRESS METER */}
              <div className="space-y-3">
                <div className={`h-8 ${cCardInset} rounded-full overflow-hidden p-1 border`}>
                  <div 
                    className="h-full bg-gradient-to-r from-amber-600 to-yellow-400 rounded-full transition-all duration-300"
                    style={{ width: `${intendedDispenserProgress}%` }}
                  ></div>
                </div>
                <div className={`flex justify-between text-xs md:text-sm font-black font-mono ${cTextMuted}`}>
                  <span>DISPENSING VAULT</span>
                  <span>{intendedDispenserProgress}%</span>
                </div>
              </div>

              {/* CASCADING FLOATING COINS GRAPHICS */}
              <div className={`h-36 relative overflow-hidden flex items-center justify-center p-6 rounded-2xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'} shadow-inner`}>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent"></div>
                <div className="flex items-center gap-3 animate-pulse text-amber-500 dark:text-amber-300 text-lg md:text-xl font-black font-mono">
                  <span>🪙 10s</span>
                  <span>&bull;</span>
                  <span>🪙 5s</span>
                  <span>&bull;</span>
                  <span>🪙 1s</span>
                </div>
              </div>

              <p className="text-sm md:text-base text-amber-600 dark:text-amber-300 font-black bg-amber-50 dark:bg-amber-950/40 p-4 rounded-xl border border-amber-500/30 leading-relaxed">
                Dispenser solenoid releasing Change to retrieval drawer cup below. Do not leave unattended!
              </p>
            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 14: SECURE TRANS RECEIPT BILLBOARD SCREEN */}
          {currentState === 'FINAL_RECEIPT_CLIENT' && (
            <div className="w-full max-w-3xl mx-auto space-y-8 my-auto py-4 animate-fade-in">
              
              {/* THERMAL PAPER EMBOSSED DECO CARD */}
              <div id="receipt-thermal-paper" className="bg-white text-slate-900 border-4 border-slate-300 rounded-[32px] p-10 shadow-2xl relative overflow-hidden font-mono text-sm font-bold">
                
                {/* RAGGED CUTS GRAPHICAL PATTERN TOP EDGE */}
                <div className="absolute top-0 inset-x-0 h-3 bg-[repeating-linear-gradient(45deg,_#e2e8f0,_#e2e8f0_6px,_#fff_6px,_#fff_12px)]"></div>

                <div className="text-center space-y-2 pt-4">
                  <h4 className="font-black text-xl md:text-2xl tracking-wider text-slate-950">REVISION RECYCLING KIOSK</h4>
                  <p className="text-xs text-slate-600">IoT Autonomous Sorting System v5</p>
                  <p className="text-xs text-slate-600">Barangay Bel-Air, Makati &bull; Machine ID: HW-P5-REVISION01</p>
                </div>

                <div className="border-b-2 border-dashed border-slate-300 my-6"></div>

                {/* RECEIPT FIELDS */}
                <div className="space-y-3 md:space-y-4 text-xs md:text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-bold">TRANSACTION ID:</span>
                    <span className="font-black text-slate-950">{receiptData.transactionId || "TXN-901844"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-bold">DATE &amp; TIME:</span>
                    <span className="font-black text-slate-950">{receiptData.date || "2026-06-17 14:21"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-bold">DISBURSE METHOD:</span>
                    <span className="font-black text-slate-950">{receiptData.method || "Cash Dispenser"}</span>
                  </div>
                  
                  <div className="border-b-2 border-dashed border-slate-205 my-4"></div>

                  <div className="flex justify-between">
                    <span className="text-slate-600 font-bold">MATERIALS DEPOSITED:</span>
                    <span className="font-black text-slate-950 text-right">{receiptData.materials || "Plastics / Cans / Glass"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-bold">NET MASS:</span>
                    <span className="font-black text-slate-950">{receiptData.weight || "1.20"} Kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-bold">ECO SAVED CO₂ OFFSET:</span>
                    <span className="font-black text-emerald-600">{receiptData.co2 || "0.240"} Kg</span>
                  </div>

                  <div className="border-b-2 border-dashed border-slate-300 my-4"></div>

                  <div className="flex justify-between text-lg md:text-xl items-center">
                    <span className="font-black text-slate-900">NET RETURN VAL:</span>
                    <span className="font-black text-emerald-800 bg-emerald-50 px-3 py-1 rounded-xl">₱{(receiptData.reward || totalPayout).toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-b-2 border-dashed border-slate-300 my-6"></div>

                <div className="text-center text-xs md:text-sm text-slate-600 font-sans leading-relaxed px-4 font-bold">
                  🌱 {t('thanksSavingPlanet')} &bull; Keep reducing plastic consumption in Quezon City!
                </div>
              </div>

              {/* ACTIONS TO TRANSMIT */}
              <div className="grid grid-cols-2 gap-6 max-w-3xl mx-auto w-full pt-4">
                <button 
                  onClick={() => {
                    setActiveUser(null);
                    setCurrentState('IDLE');
                    speakText("idleTouchToBegin");
                  }}
                  className="w-full h-56 sm:h-64 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 rounded-3xl font-black text-white flex flex-col items-center justify-center gap-4 shadow-lg active:scale-95 transition-all text-xl sm:text-2xl"
                >
                  <CheckCircle2 className="w-12 h-12 text-white animate-bounce" />
                  <span className="uppercase text-lg sm:text-xl">{t('finished')}</span>
                </button>

                <button 
                  onClick={triggerPrintReceipt}
                  className={`w-full h-56 sm:h-64 rounded-3xl font-black text-xl sm:text-2xl flex flex-col items-center justify-center gap-4 border transition-all ${printStatus === 'PRINTING' ? 'text-amber-500 bg-slate-900 animate-pulse border-amber-500' : isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-850 border-slate-300' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-850'} active:scale-95 shadow-lg`}
                >
                  <FileText className="w-12 h-12 text-orange-500 dark:text-orange-400" />
                  <span className="text-center px-2 text-lg sm:text-xl">{printStatus === 'PRINTING' ? 'Printing...' : printStatus === 'DONE' ? 'Thermal Printed!' : t('printReceipt')}</span>
                </button>

                <button 
                  onClick={() => triggerNotification(t('receiptSent'))}
                  className={`w-full h-56 sm:h-64 rounded-3xl font-black text-xl sm:text-2xl flex flex-col items-center justify-center gap-4 border transition-all ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-850 border-slate-300' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-850'} active:scale-95 shadow-lg`}
                >
                  <Smartphone className="w-12 h-12 text-sky-500 dark:text-sky-400" />
                  <span className="text-lg sm:text-xl">{t('sendToMobile')}</span>
                </button>

                <button 
                  onClick={() => triggerNotification(t('receiptSent'))}
                  className={`w-full h-56 sm:h-64 rounded-3xl font-black text-xl sm:text-2xl flex flex-col items-center justify-center gap-4 border transition-all ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-850 border-slate-300' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-850'} active:scale-95 shadow-lg`}
                >
                  <Mail className="w-12 h-12 text-teal-500 dark:text-teal-400" />
                  <span className="text-lg sm:text-xl">{t('sendToEmail')}</span>
                </button>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* STATE 15: LEARN MORE (CO₂ SAVINGS, RATES) */}
          {/* ========================================================= */}
          {currentState === 'LEARN_MORE' && (
            <div className={`w-full max-w-4xl mx-auto ${cCard} p-10 rounded-3xl space-y-6 border my-auto py-6 shadow-2xl`}>
              <div className={`text-center space-y-2 border-b ${cBorder} pb-4`}>
                <h3 className={`text-3xl md:text-4xl font-black ${cTextTitle} uppercase tracking-widest`}>{t('learnMore')}</h3>
                <p className={`text-sm md:text-base ${cTextSubtitle}`}>Conversion factors & material benefit metrics</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className={`${cCardInset} p-6 rounded-2xl flex flex-col justify-between text-center shadow-inner`}>
                  <span className="text-emerald-500 dark:text-emerald-400 text-base font-black block mb-2">Plastic Bottles</span>
                  <p className={`text-sm ${cTextMuted} leading-relaxed font-semibold`}>
                    ₱1.00 each, 10 pts, Carbon Offset: 0.04kg CO₂.
                  </p>
                </div>
                
                <div className={`${cCardInset} p-6 rounded-2xl flex flex-col justify-between text-center shadow-inner`}>
                  <span className="text-sky-500 dark:text-sky-400 text-base font-black block mb-2">Aluminum Cans</span>
                  <p className={`text-sm ${cTextMuted} leading-relaxed font-semibold`}>
                    ₱2.50 each, 25 pts, Carbon Offset: 0.09kg CO₂.
                  </p>
                </div>

                <div className={`${cCardInset} p-6 rounded-2xl flex flex-col justify-between text-center shadow-inner`}>
                  <span className="text-teal-500 dark:text-teal-400 text-base font-black block mb-2">Glass Bottles</span>
                  <p className={`text-sm ${cTextMuted} leading-relaxed font-semibold`}>
                    ₱1.50 each, 15 pts, Carbon Offset: 0.06kg CO₂.
                  </p>
                </div>
              </div>

              <div className={`${cCardInset} p-6 rounded-2xl space-y-2 shadow-inner`}>
                <span className="text-sm text-teal-500 dark:text-teal-400 font-black block uppercase tracking-wider">Our Vision</span>
                <p className={`text-sm md:text-base ${cTextMuted} leading-relaxed font-semibold`}>
                  The ReVision kiosk matches local community recycling with digital wallet systems for real-time incentivization.
                </p>
              </div>

               <div className="flex justify-center pt-4 gap-4">
                 <button 
                   type="button"
                   onClick={() => setCurrentState('MAIN_MENU')}
                   className={`px-8 py-4 ${isLight ? 'bg-slate-200 text-slate-705 hover:bg-slate-250 border-slate-350' : 'bg-slate-800 text-slate-300 hover:bg-slate-755 border-slate-705'} border rounded-2xl text-base font-black transition-all active:scale-[0.98] shadow-md`}
                 >
                   Return to Main Menu
                 </button>
                 <button 
                   type="button"
                   onClick={() => setCurrentState('DETECTION_TEST')}
                   className={`px-8 py-4 ${isLight ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-300' : 'bg-blue-900/40 text-blue-300 hover:bg-blue-850 border-blue-500'} border rounded-2xl text-base font-black transition-all active:scale-[0.98] shadow-md`}
                 >
                   Camera Detection Test
                 </button>
               </div>
              </div>
            )}

           {/* ========================================================= */}
           {/* DETECTION TEST VIEW */}
           {currentState === 'DETECTION_TEST' && (
             <div className="w-full max-w-5xl mx-auto space-y-6 my-auto py-4">
               <div className="text-center space-y-2">
                 <h3 className={`text-4xl font-black ${cTextTitle} uppercase tracking-widest`}>Live Detection Test</h3>
                 <p className={`text-sm md:text-base ${cTextSubtitle}`}>Camera is continuously capturing and classifying items</p>
               </div>

               {/* LIVE CAMERA + DETECTION DISPLAY */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Camera Feed */}
                  <div className={`bg-black border-4 ${isLight ? 'border-slate-300' : 'border-slate-700'} rounded-[24px] p-4 relative flex flex-col items-center`}>
                    <span className="absolute top-4 left-4 bg-blue-600/90 text-white text-xs px-3 py-1 rounded-lg font-mono font-black z-10">
                      LIVE CSI CAMERA
                    </span>
                     <div className="relative w-full h-[320px]">
                       {activeSnapshot ? (
                         <img 
                           src={activeSnapshot}
                           alt="Live Camera Feed"
                           className="w-full h-[320px] object-cover rounded-xl border border-slate-800"
                         />
                       ) : (
                         <div className="w-full h-[320px] bg-slate-900 rounded-xl flex items-center justify-center text-slate-500">
                           Waiting for camera...
                         </div>
                       )}
                       {/* AI Bounding Boxes for all detected items */}
                       {detectionItems.map((item, idx) => (
                         item.boundingBox ? (
                           <div 
                             key={idx}
                             className="absolute border-4 border-red-500 rounded-lg shadow-[0_0_20px_rgba(239,68,68,0.8)] bg-red-500/10 pointer-events-none"
                             style={{
                               left: `${item.boundingBox.x}%`,
                               top: `${item.boundingBox.y}%`,
                               width: `${item.boundingBox.width}%`,
                               height: `${item.boundingBox.height}%`,
                             }}
                           >
                             <div className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded">
                               {item.itemName} ({(item.confidence * 100).toFixed(0)}%)
                             </div>
                           </div>
                         ) : null
                       ))}
                     </div>
                  </div>

                  {/* Detection Results */}
                  <div className={`bg-black border-4 ${isLight ? 'border-slate-300' : 'border-slate-700'} rounded-[24px] p-4 relative flex flex-col items-center`}>
                    <span className="absolute top-4 left-4 bg-emerald-600/90 text-white text-xs px-3 py-1 rounded-lg font-mono font-black z-10">
                      DETECTION RESULTS
                    </span>
                    <div className="mt-12 w-full text-center space-y-3">
                      {detectionItems.length === 0 ? (
                        <div className={`p-6 rounded-2xl ${backendCameraActive ? 'bg-emerald-950/40 border border-emerald-500 text-emerald-400' : 'bg-slate-800 border border-slate-700 text-slate-400'}`}>
                          <div className="text-3xl font-black mb-2">⏳ Waiting...</div>
                          <div className="text-sm opacity-80">No items detected yet</div>
                        </div>
                      ) : (
                        detectionItems.map((item, idx) => (
                          <div key={idx} className={`p-4 rounded-2xl ${item.detectedMaterial === 'plastic' ? 'bg-teal-950/40 border border-teal-500 text-teal-400' : 
                           item.detectedMaterial === 'aluminum' ? 'bg-sky-950/40 border border-sky-500 text-sky-400' : 
                           item.detectedMaterial === 'glass' ? 'bg-amber-950/40 border border-amber-500 text-amber-400' : 
                           'bg-red-950/40 border border-red-500 text-red-400'}`}>
                            <div className="text-2xl font-black mb-1">
                              {item.detectedMaterial === 'plastic' ? '🥤 PLASTIC' : 
                               item.detectedMaterial === 'aluminum' ? '🥫 ALUMINUM' : 
                               item.detectedMaterial === 'glass' ? '🍾 GLASS' : 
                               '🚫 REJECTED'}
                            </div>
                            <div className="text-lg font-bold">{item.itemName}</div>
                            <div className="text-sm mt-1 opacity-80">Confidence: {(item.confidence * 100).toFixed(1)}%</div>
                            <div className="text-xs mt-1 opacity-60">Weight: {item.estimatedWeightGrams}g</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
               </div>

               {/* DETECTION HISTORY */}
               <div className="space-y-3">
                 <span className={`text-sm ${cTextMuted} font-black block uppercase tracking-widest`}>Recent Detections:</span>
                 <div className={`rounded-3xl p-4 max-h-[200px] overflow-y-auto space-y-2 text-sm font-mono ${cCardInset} shadow-inner`}>
                   {detectionHistory.length === 0 ? (
                     <div className="text-slate-500 text-center py-4">No detections recorded yet.</div>
                   ) : (
                     detectionHistory.map((item, idx) => (
                       <div key={idx} className={`flex items-center justify-between p-2 rounded-lg ${isLight ? 'bg-slate-50/80 border border-slate-200' : 'bg-slate-900/60 border border-slate-850'} font-bold`}>
                         <div className="flex flex-col">
                           <span className={`capitalize font-black ${
                             item.detectedMaterial === 'plastic' ? 'text-teal-500' :
                             item.detectedMaterial === 'aluminum' ? 'text-sky-400' :
                             item.detectedMaterial === 'glass' ? 'text-amber-400' : 'text-red-400'
                           }`}>
                           {item.detectedMaterial} - {item.itemName}
                         </span>
                         <span className="text-xs opacity-60">
                           {new Date(item.timestamp).toLocaleTimeString()} | {(item.confidence * 100).toFixed(1)}% | {item.estimatedWeightGrams}g
                         </span>
                       </div>
                     </div>
                   ))
                   )}
                 </div>
               </div>

               {/* ACTION BUTTONS */}
               <div className="flex flex-wrap justify-center gap-4 pt-4">
                 <button 
                   onClick={refreshDetection}
                   className={`px-8 py-4 ${isLight ? 'bg-sky-100 hover:bg-sky-200 text-sky-800' : 'bg-sky-900/40 hover:bg-sky-850 border border-sky-500 text-white'} rounded-2xl font-black transition-all active:scale-95`}
                 >
                   Run Manual Detection
                 </button>
                 <button 
                   onClick={() => setCurrentState('MAIN_MENU')}
                   className={`px-8 py-4 ${isLight ? 'bg-slate-200 text-slate-705 hover:bg-slate-250 border-slate-350' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-705'} border rounded-2xl font-black transition-all active:scale-95`}
                 >
                   Back to Main Menu
                 </button>
               </div>
             </div>
           )}

         </div>

      {/* RENDER ON-SCREEN VIRTUAL KEYBOARD OVERLAY */}
      {activeKeyboard && (
        <VirtualKeyboard
          label={activeKeyboard.label}
          value={activeKeyboard.value}
          type={activeKeyboard.type}
          maxLength={activeKeyboard.maxLength}
          placeholder={activeKeyboard.placeholder}
          onChange={activeKeyboard.onChange}
          onClose={() => setActiveKeyboard(null)}
          isLight={isLight}
        />
      )}

    </div>
  );
}
