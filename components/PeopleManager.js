import { useState } from 'react';
import { usePeople } from '@/lib/hooks/usePeople';

export default function PeopleManager({ currentUserId, onCurrentUserChange, onDataChanged, compact = false }) {
  const { people, addPerson, removePerson } = usePeople();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddPerson = async (e) => {
    e.preventDefault();
    if (!newPersonName.trim()) return;

    setIsAdding(true);
    try {
      const newPerson = await addPerson(newPersonName);
      setNewPersonName('');
      setShowAddForm(false);
      // Trigger data refresh in parent components
      if (onDataChanged) onDataChanged();
  // Do not auto-switch current user when creating a new person.
    } catch (err) {
      console.error('Failed to add person:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemovePerson = async (personId) => {
    if (people.length <= 1) return; // Keep at least one person
    
    const personName = people.find(p => p.id === personId)?.name || 'Unknown';
    
    if (confirm(`Remove ${personName}? This will permanently delete:\n\n• The person from your people list\n• All their claims on receipts\n• Their participation in receipts\n\nThis action cannot be undone.`)) {
      try {
        await removePerson(personId);
        
        // Trigger data refresh in parent components
        if (onDataChanged) onDataChanged();
        
        // Switch current user if necessary
        if (currentUserId === personId && people.length > 1) {
          const remainingPeople = people.filter(p => p.id !== personId);
          if (onCurrentUserChange && remainingPeople.length > 0) {
            onCurrentUserChange(remainingPeople[0].id);
          }
        }
      } catch (err) {
        alert('Failed to remove person. Please try again.');
        console.error('Failed to remove person:', err);
      }
    }
  };

  if (compact) {
    return (
      <div className="people-manager-compact">
        <div className="current-user-selector">
          <label htmlFor="current-user">Claiming as:</label>
          <select
            id="current-user"
            value={currentUserId}
            onChange={(e) => onCurrentUserChange?.(e.target.value)}
            className="user-select"
          >
            {people.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="add-person-btn compact"
            title="Add person"
          >
            +
          </button>
        </div>

        {showAddForm && (
          <div className="add-person-form compact">
            <form onSubmit={handleAddPerson}>
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value.substring(0, 15))}
                placeholder="Person name"
                className="person-name-input"
                autoFocus
                disabled={isAdding}
                maxLength={15}
              />
              <div className="form-actions">
                <button type="submit" disabled={!newPersonName.trim() || isAdding}>
                  {isAdding ? '...' : 'Add'}
                </button>
                <button type="button" onClick={() => {
                  setShowAddForm(false);
                  setNewPersonName('');
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="people-manager">
      <div className="people-header">
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="add-person-btn"
        >
          + Add Person
        </button>
      </div>

      <div className="people-list">
        {people.map(person => (
          <div
            key={person.id}
            className={`person-item ${currentUserId === person.id ? 'current' : ''}`}
          >
            <div className="person-info">
              <div
                className="person-avatar"
                style={{ backgroundColor: person.color }}
              >
                {person.name.charAt(0).toUpperCase()}
              </div>
              <div className="person-details">
                <span className="person-name">{person.name}</span>
                {currentUserId === person.id && (
                  <span className="current-indicator">Current</span>
                )}
              </div>
            </div>
            <div className="person-actions">
              {currentUserId !== person.id && (
                <button
                  type="button"
                  onClick={() => onCurrentUserChange?.(person.id)}
                  className="switch-user-btn"
                >
                  Switch
                </button>
              )}
              {people.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemovePerson(person.id)}
                  className="remove-person-btn"
                  title="Remove person"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddForm && (
        <div className="add-person-form">
          <form onSubmit={handleAddPerson}>
            <div className="form-group">
              <label htmlFor="person-name">Person Name</label>
              <input
                id="person-name"
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value.substring(0, 15))}
                placeholder="Enter name"
                className="person-name-input"
                autoFocus
                disabled={isAdding}
                maxLength={15}
              />
            </div>
            <div className="form-actions">
              <button type="submit" disabled={!newPersonName.trim() || isAdding}>
                {isAdding ? 'Adding...' : 'Add Person'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewPersonName('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
