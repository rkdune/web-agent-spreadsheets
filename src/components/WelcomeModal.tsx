'use client';

import { useState } from 'react';
import { X, FlaskConical, Edit3, Zap, Bot } from 'lucide-react';

export default function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(true);

  const closeModal = () => {
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-transparent flex items-center justify-center z-50">
      <div className="rounded-lg p-6 max-w-md w-full mx-4 relative" style={{ backgroundColor: '#212121' }}>
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 hover:opacity-75 transition-opacity"
          style={{ color: '#F3EFF3' }}
        >
          <X className="w-5 h-5" />
        </button>
            
        <div className="pr-8">
          <p className="leading-relaxed" style={{ color: '#F3EFF3' }}>
            Hi, I&apos;m Rohan <span className="text-lg">👋</span>. I built a working prototype of a AI-native spreadsheet. Every data imputation is done by a web agents! Other than the example data the sheet starts with, none of the functionality is hardcoded.
          </p>
          
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-3">
              <span style={{ color: '#F3EFF3' }}>1.</span>
              <div className="flex items-center gap-2">
                <span style={{ color: '#F3EFF3' }}>Generations call 4o-mini with web search tool, and all sources are cited in each cell.</span>
                <Bot className="w-4 h-4 text-yellow-600 flex-shrink-0" />
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <span style={{ color: '#F3EFF3' }}>2.</span>
              <div className="flex items-center gap-2">
                <span style={{ color: '#F3EFF3' }}>Press the turbo generate button to queue generations in all empty cells in a column.</span>
                <Zap className="w-4 h-4 text-green-600 flex-shrink-0" />
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="font-medium" style={{ color: '#F3EFF3' }}>3.</span>
              <div className="flex items-center gap-2">
                <span style={{ color: '#F3EFF3' }}>A/B column prompt testing through a scalable eval framework</span>
                <FlaskConical className="w-4 h-4 text-purple-600 flex-shrink-0" />
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <span className="font-medium" style={{ color: '#F3EFF3' }}>4.</span>
              <div className="flex items-center gap-2">
                <span style={{ color: '#F3EFF3' }}>Model routing (either done manually or informed by prior evals)</span>
                <Edit3 className="w-4 h-4 text-blue-600 flex-shrink-0" />
              </div>
            </div>
          </div>
        
          <p className="leading-relaxed mt-3" style={{ color: '#F3EFF3' }}>
            Have fun with it!
          </p>
          
          <div className="mt-6 flex justify-between items-center">
            <div className="flex gap-3">
            </div>
            <button
              onClick={closeModal}
              className="px-4 py-2 rounded-md transition-colors"
              style={{ backgroundColor: '#2563eb', color: '#F3EFF3' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 