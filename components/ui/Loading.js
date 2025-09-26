/**
 * Loading Components for ZiCount
 * 
 * Reusable loading state components with consistent styling
 * and accessibility features across the application.
 */

/**
 * Standard loading spinner component
 * 
 * @param {Object} props - Component props
 * @param {string} props.size - Size variant ('sm', 'md', 'lg') 
 * @param {string} props.color - Color variant ('blue', 'indigo', 'gray')
 * @param {string} props.className - Additional CSS classes
 * @returns {JSX.Element} Loading spinner
 */
export const LoadingSpinner = ({ 
  size = 'md', 
  color = 'blue', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8', 
    lg: 'h-12 w-12'
  };

  const colorClasses = {
    blue: 'border-blue-600',
    indigo: 'border-indigo-600',
    gray: 'border-gray-600'
  };

  return (
    <div 
      className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

/**
 * Centered loading container for page sections
 * 
 * @param {Object} props - Component props  
 * @param {string} props.message - Loading message to display
 * @param {string} props.size - Spinner size
 * @returns {JSX.Element} Centered loading container
 */
export const CenteredLoading = ({ 
  message = 'Loading...', 
  size = 'md' 
}) => (
  <div className="flex flex-col items-center justify-center p-8 space-y-2">
    <LoadingSpinner size={size} />
    <p className="text-gray-500 text-sm">{message}</p>
  </div>
);

// Backwards-compatible named export used across the codebase
export const LoadingSection = CenteredLoading;

// Small loader used for dynamic imports and compact placeholders
export const ComponentLoader = ({ message = 'Loading...' }) => (
  <div className="flex justify-center p-8"><LoadingSpinner /></div>
);

/**
 * Inline loading component for smaller UI elements
 * 
 * @param {Object} props - Component props
 * @param {string} props.text - Loading text
 * @returns {JSX.Element} Inline loading component
 */
export const InlineLoading = ({ text = 'Loading...' }) => (
  <div className="flex items-center space-x-2">
    <LoadingSpinner size="sm" />
    <span className="text-sm text-gray-500">{text}</span>
  </div>
);

// Default export for backward compatibility
export default CenteredLoading;