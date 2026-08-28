import React, { useState } from 'react';
import { Check, X, ArrowLeft, Trash2 } from 'lucide-react';

interface VirtualKeyboardProps {
  label: string;
  value: string;
  type: 'text' | 'tel' | 'number' | 'email' | 'password';
  maxLength?: number;
  placeholder?: string;
  onChange: (val: string) => void;
  onClose: () => void;
  isLight?: boolean;
}

export default function VirtualKeyboard({
  label,
  value,
  type,
  maxLength,
  placeholder,
  onChange,
  onClose,
  isLight = false,
}: VirtualKeyboardProps) {
  const [isShift, setIsShift] = useState(false);
  const [isSymbols, setIsSymbols] = useState(false);

  // Determine if it should use a Numeric Numpad layout
  const isNumeric = type === 'tel' || type === 'number' || label.toLowerCase().includes('pin');

  // Handle key click
  const handleKeyClick = (key: string) => {
    if (maxLength && value.length >= maxLength) {
      return; // respect maxLength
    }
    onChange(value + key);
  };

  // Handle Backspace
  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  // Handle Clear
  const handleClear = () => {
    onChange('');
  };

  // Layouts
  const qwertyRows = isSymbols
    ? [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
        ['_', '\\', '|', '?', '!', "'", '.', ',', ';', '='],
      ]
    : [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
      ];

  const renderNumpad = () => {
    const numKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return (
      <div className="w-full max-w-lg mx-auto p-3">
        <div className="grid grid-cols-3 gap-4">
          {numKeys.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyClick(num)}
              className={`h-20 rounded-2xl text-3xl font-black transition-all active:scale-95 flex items-center justify-center select-none shadow-md ${
                isLight
                  ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800'
                  : 'bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-100'
              }`}
            >
              {num}
            </button>
          ))}
          {/* Row 4 */}
          <button
            type="button"
            onClick={handleClear}
            className={`h-20 rounded-2xl text-base font-black transition-all active:scale-95 flex items-center justify-center select-none uppercase tracking-widest ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleKeyClick('0')}
            className={`h-20 rounded-2xl text-3xl font-black transition-all active:scale-95 flex items-center justify-center select-none shadow-md ${
              isLight
                ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800'
                : 'bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-100'
            }`}
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className={`h-20 rounded-2xl text-lg font-black transition-all active:scale-95 flex items-center justify-center select-none ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Trash2 className="w-6 h-6 mr-1.5 text-rose-500" /> Back
          </button>
        </div>
      </div>
    );
  };

  const renderQwerty = () => {
    return (
      <div className="w-full max-w-4xl mx-auto p-3 space-y-3">
        {qwertyRows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-2">
            {/* Shift key at the beginning of row 3 */}
            {rowIndex === 2 && (
              <button
                type="button"
                onClick={() => setIsShift(!isShift)}
                className={`px-5 h-16 rounded-xl text-xl font-black transition-all active:scale-95 flex items-center justify-center select-none ${
                  isShift
                    ? 'bg-emerald-600 text-white shadow-md'
                    : isLight
                    ? 'bg-slate-200 hover:bg-slate-250 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-755 text-slate-300'
                }`}
                style={{ minWidth: '68px' }}
              >
                ⇧
              </button>
            )}

            {row.map((char) => {
              const displayChar = isShift && !isSymbols ? char.toUpperCase() : char;
              return (
                <button
                  key={char}
                  type="button"
                  onClick={() => handleKeyClick(displayChar)}
                  className={`flex-1 h-16 rounded-xl text-xl font-black transition-all active:scale-95 flex items-center justify-center select-none shadow-md ${
                    isLight
                      ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800'
                      : 'bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-100'
                  }`}
                  style={{ minWidth: '36px', maxWidth: '72px' }}
                >
                  {displayChar}
                </button>
              );
            })}

            {/* Backspace at the end of row 3 */}
            {rowIndex === 2 && (
              <button
                type="button"
                onClick={handleBackspace}
                className={`px-5 h-16 rounded-xl text-xl font-black transition-all active:scale-95 flex items-center justify-center select-none ${
                  isLight
                    ? 'bg-slate-250 hover:bg-slate-300 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
                style={{ minWidth: '78px' }}
              >
                ⌫
              </button>
            )}
          </div>
        ))}

        {/* Bottom Row */}
        <div className="flex justify-center gap-2 pt-1">
          {/* Symbols Toggle */}
          <button
            type="button"
            onClick={() => setIsSymbols(!isSymbols)}
            className={`px-5 h-16 rounded-xl text-lg font-black transition-all active:scale-95 flex items-center justify-center select-none ${
              isSymbols
                ? 'bg-sky-600 text-white shadow-md'
                : isLight
                ? 'bg-slate-200 hover:bg-slate-250 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
            style={{ minWidth: '85px' }}
          >
            {isSymbols ? 'ABC' : '?123'}
          </button>

          {/* Common Email shortcuts if type is email */}
          {type === 'email' && (
            <>
              <button
                type="button"
                onClick={() => handleKeyClick('@')}
                className={`px-4 h-16 rounded-xl text-lg font-black transition-all active:scale-95 ${
                  isLight ? 'bg-white border text-slate-800' : 'bg-slate-850 text-slate-100'
                }`}
              >
                @
              </button>
              <button
                type="button"
                onClick={() => handleKeyClick('.com')}
                className={`px-4 h-16 rounded-xl text-base font-black transition-all active:scale-95 ${
                  isLight ? 'bg-white border text-slate-800' : 'bg-slate-850 text-slate-100'
                }`}
              >
                .com
              </button>
            </>
          )}

          {/* Spacebar */}
          <button
            type="button"
            onClick={() => handleKeyClick(' ')}
            className={`flex-1 h-16 rounded-xl text-lg font-black transition-all active:scale-95 flex items-center justify-center select-none shadow-sm ${
              isLight
                ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800'
                : 'bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-100'
            }`}
            style={{ minWidth: '180px' }}
          >
            Space
          </button>

          {/* Quick domain buttons for non-emails to fill symbols spacing */}
          {type !== 'email' && (
            <button
              type="button"
              onClick={() => handleKeyClick('.')}
              className={`w-16 h-16 rounded-xl text-lg font-black transition-all active:scale-95 flex items-center justify-center select-none ${
                isLight ? 'bg-white border text-slate-800' : 'bg-slate-850 text-slate-100'
              }`}
            >
              .
            </button>
          )}

          {/* Clear Key */}
          <button
            type="button"
            onClick={handleClear}
            className={`px-5 h-16 rounded-xl text-base font-black transition-all active:scale-95 flex items-center justify-center select-none uppercase tracking-widest ${
              isLight
                ? 'bg-slate-200 hover:bg-slate-250 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
            style={{ minWidth: '80px' }}
          >
            Clear
          </button>
        </div>
      </div>
    );
  };

  // Mask display value if it is secure password/pin field
  const getDisplayValue = () => {
    if (!value) return <span className="opacity-40 italic">{placeholder || 'Tap keys to type...'}</span>;
    if (type === 'password' || label.toLowerCase().includes('pin')) {
      return '• '.repeat(value.length).trim();
    }
    return value;
  };

  return (
    <div
      id="on-screen-virtual-keyboard"
      className={`absolute bottom-0 inset-x-0 z-50 border-t transition-all duration-300 transform translate-y-0 shadow-[0_-15px_40px_rgba(0,0,0,0.5)] flex flex-col p-6 md:p-8 rounded-t-[40px] ${
        isLight
          ? 'bg-slate-100 border-slate-300 text-slate-800 shadow-slate-950/25'
          : 'bg-slate-900 border-emerald-950 text-slate-100 shadow-black/90'
      }`}
    >
      {/* Title & Preview Header */}
      <div className="flex items-center justify-between pb-5 mb-4 border-b border-dashed border-slate-300/40 dark:border-slate-800">
        <div className="text-left space-y-1">
          <span className="text-xs uppercase font-black tracking-widest text-emerald-500">
            Kiosk Screen Input
          </span>
          <h4 className="text-lg font-black uppercase tracking-wide flex items-center gap-2">
            <span>{label}</span>
            {maxLength && (
              <span className="text-xs opacity-60 normal-case font-normal">
                (max {maxLength} chars)
              </span>
            )}
          </h4>
        </div>

        {/* Display screen inside the keyboard */}
        <div
          className={`flex-1 mx-6 max-w-md px-6 py-3.5 rounded-2xl text-center text-xl font-mono font-black tracking-widest border shadow-inner ${
            isLight
              ? 'bg-white border-slate-300 text-slate-900'
              : 'bg-slate-950 border-slate-850 text-teal-400'
          }`}
        >
          {getDisplayValue()}
        </div>

        {/* Actions (Done and Close) */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-base rounded-2xl flex items-center gap-2 shadow-lg transition-all active:scale-95"
          >
            <Check className="w-5 h-5" />
            <span>DONE</span>
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className={`p-3.5 rounded-full transition-all active:scale-95 border ${
              isLight
                ? 'bg-slate-200 hover:bg-slate-250 border-slate-300 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-755 border-slate-700 text-slate-300'
            }`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Keyboard Matrix Area */}
      <div className="pb-2">
        {isNumeric ? renderNumpad() : renderQwerty()}
      </div>
      
      {/* Footer hint */}
      <div className={`text-center text-[9px] ${isLight ? 'text-slate-400' : 'text-slate-500'} font-mono`}>
        ReVision Smart Kiosk Multi-touch Virtual Keyboard &bull; Touch Screen Optimized
      </div>
    </div>
  );
}
