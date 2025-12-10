import React from 'react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'error' | 'success';
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'error'
}) => {
  if (!isOpen) return null;

  const isSuccess = type === 'success';
  const bgColor = isSuccess ? 'bg-green-50' : 'bg-red-50';
  const borderColor = isSuccess ? 'border-green-200' : 'border-red-200';
  const textColor = isSuccess ? 'text-green-800' : 'text-red-800';
  const iconBg = isSuccess ? 'bg-green-100' : 'bg-red-100';
  const iconColor = isSuccess ? 'text-green-600' : 'text-red-600';
  const buttonBg = isSuccess ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`${bgColor} ${borderColor} border-2 rounded-lg shadow-xl max-w-md w-full mx-4`}>
        <div className="p-6">
          <div className="flex items-start">
            <div className={`flex-shrink-0 ${iconBg} rounded-full p-2`}>
              {isSuccess ? (
                <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div className="ml-4 flex-1">
              <h3 className={`text-lg font-semibold ${textColor} mb-2`}>
                {title}
              </h3>
              <p className={`text-sm ${textColor} whitespace-pre-wrap`}>
                {message}
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className={`${buttonBg} text-white px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isSuccess ? 'focus:ring-green-500' : 'focus:ring-red-500'
              }`}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


