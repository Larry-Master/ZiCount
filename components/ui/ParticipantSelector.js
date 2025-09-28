/**
 * ParticipantSelector Component
 * 
 * Reusable participant selection component with avatar display,
 * multi-select functionality, and visual feedback for payer identification.
 * 
 * Features:
 * - Multi-select checkbox interface
 * - Avatar display with colors
 * - Payer indication
 * - Responsive grid layout
 * - Keyboard accessibility
 */

import { usePeople } from '@/lib/hooks/usePeople';
import { getAvatarDisplay } from '@/lib/utils/avatar';

export default function ParticipantSelector({
  selectedParticipants,
  onSelectionChange,
  paidBy,
  currentUserId,
  label = 'Teilnehmer auswählen',
  className = '',
  required = false
}) {
  const { people } = usePeople();

  const handleParticipantToggle = (personId) => {
    const isSelected = selectedParticipants.includes(personId);
    const newSelection = isSelected 
      ? selectedParticipants.filter(id => id !== personId)
      : [...selectedParticipants, personId];
    
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    const allIds = people.map(p => p.id);
    onSelectionChange(allIds);
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  return (
    <div className={`participant-selector ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <label className="block font-semibold text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        
        <div className="flex items-center space-x-2 text-xs">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1"
            disabled={selectedParticipants.length === people.length}
            aria-label="Alle auswählen"
          >
            Alle
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={handleClearAll}
            className="text-gray-600 hover:text-gray-800 font-medium px-2 py-1"
            disabled={selectedParticipants.length === 0}
            aria-label="Keine auswählen"
          >
            Keine
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {people.map(person => {
          const isSelected = selectedParticipants.includes(person.id);
          const isPayer = person.id === paidBy;
          const isCurrentUser = person.id === currentUserId;
          
          return (
            <div
              key={person.id}
              className={`participant-card ${isSelected ? 'participant-card-selected' : ''}`}
              onClick={() => handleParticipantToggle(person.id)}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleParticipantToggle(person.id);
                }
              }}
            >
              <input
                id={`participant-${person.id}`}
                type="checkbox"
                value={person.id}
                checked={isSelected}
                onChange={() => handleParticipantToggle(person.id)}
                className="participant-checkbox"
                tabIndex={-1} // Remove from tab order, parent handles focus
              />
              
              <div 
                className="participant-avatar" 
                style={{ backgroundColor: person.color }}
                aria-hidden="true"
              >
                {getAvatarDisplay(person)}
              </div>
              
              <div className="participant-info">
                <span className="participant-name">
                  {person.name}
                  {isCurrentUser && <span className="text-xs text-gray-500 ml-1">(ich)</span>}
                </span>
                {isPayer && (
                  <span className="participant-badge">(bezahlt)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection summary */}
      <div className="mt-2 text-xs text-gray-500">
        {selectedParticipants.length === 0 && (
          <span className="text-red-500">Mindestens eine Person auswählen</span>
        )}
        {selectedParticipants.length > 0 && (
          <span>
            {selectedParticipants.length} von {people.length} Person
            {selectedParticipants.length !== 1 ? 'en' : ''} ausgewählt
          </span>
        )}
      </div>
    </div>
  );
}