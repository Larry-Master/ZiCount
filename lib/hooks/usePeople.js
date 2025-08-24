import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';

// Mock data - in production, this would come from a database
let people = [
  { id: 'user1', name: 'Alice', color: '#007bff' },
  { id: 'user2', name: 'Bob', color: '#28a745' },
  { id: 'user3', name: 'Charlie', color: '#fd7e14' }
];

// Simple in-memory pub/sub so multiple hook instances stay in sync
let listeners = [];

export const usePeople = () => {
  const [peopleList, setPeopleList] = useState(people);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Subscribe this hook instance to global changes
  useEffect(() => {
    listeners.push(setPeopleList);
    return () => {
      listeners = listeners.filter(l => l !== setPeopleList);
    };
  }, []);

  // Fetch people from server on mount (if available). If the server fails, fall back to in-memory mock.
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const serverPeople = await apiClient.getUsers();
        if (!canceled && Array.isArray(serverPeople)) {
          people = serverPeople;
          setPeopleList(serverPeople);
        }
      } catch (err) {
        // ignore - keep mock people
        console.warn('Could not fetch people from server, using local mock', err.message || err);
      }
    })();
    return () => { canceled = true; };
  }, []);

  const addPerson = async (name) => {
    if (!name.trim()) return;
    
    const colors = ['#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#e83e8c', '#20c997', '#ffc107'];
    const newPerson = {
      id: `user_${Date.now()}`,
      name: name.trim(),
      color: colors[peopleList.length % colors.length]
    };

    // Try to persist to server if available
    try {
      const created = await apiClient.createUser(newPerson.name);
      // server returns { id, name, color }
      people.push(created);
      listeners.forEach(l => { try { l([...people]); } catch (e) {} });
      return created;
    } catch (err) {
      // Fallback to in-memory behavior if server not reachable
      people.push(newPerson);
      listeners.forEach(l => { try { l([...people]); } catch (e) {} });
      return newPerson;
    }
  };

  const removePerson = async (personId) => {
    // Update module-level mock DB
    people = people.filter(p => p.id !== personId);
    // Notify subscribers
    listeners.forEach(l => {
      try { l([...people]); } catch (e) { /* ignore listener errors */ }
    });
  };

  const getPerson = (personId) => {
    return peopleList.find(p => p.id === personId);
  };

  return {
    people: peopleList,
    loading,
    error,
    addPerson,
    removePerson,
    getPerson
  };
};
