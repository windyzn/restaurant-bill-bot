
import React from 'react';

interface StepProgressProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

const StepProgress: React.FC<StepProgressProps> = ({ currentStep, onStepClick }) => {
  const steps = ["Friends", "Items", "Split", "Payments", "Results"];
  
  return (
    <div className="flex items-center justify-between mb-8 px-2 overflow-x-auto no-scrollbar">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = currentStep === stepNumber;
        const isCompleted = currentStep > stepNumber;

        return (
          <React.Fragment key={label}>
            <button 
              onClick={() => onStepClick(stepNumber)}
              className="flex flex-col items-center min-w-[60px] outline-none group"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all transform group-active:scale-90 ${
                isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 
                isCompleted ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
              }`}>
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                ) : stepNumber}
              </div>
              <span className={`text-[10px] uppercase mt-2 font-bold tracking-tight transition-colors ${
                isActive ? 'text-indigo-600' : 'text-slate-400'
              }`}>
                {label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-[2px] mx-1 mb-6 transition-colors ${
                isCompleted ? 'bg-emerald-200' : 'bg-slate-100'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default StepProgress;
