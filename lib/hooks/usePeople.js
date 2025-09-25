import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';

// Mock data - in production, this would come from a database
let people = [
  { id: 'user1', name: 'Alice', color: '#007bff' },
  { id: 'user2', name: 'Bob', color: '#28a745' },
  { id: 'user3', name: 'Charlie', color: '#fd7e14' }
];

// Simple in-memory pub/sub for sync across hook instances
let listeners = [];

export const usePeople = () => {
  const [peopleList, setPeopleList] = useState(people);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Subscribe to global changes
  useEffect(() => {
    listeners.push(setPeopleList);
    return () => {
      listeners = listeners.filter(l => l !== setPeopleList);
    };
  }, []);

  // Fetch from server on mount
  useEffect(() => {
    let canceled = false;
    
    const fetchPeople = async () => {
      try {
        const serverPeople = await apiClient.getUsers();
        if (!canceled && Array.isArray(serverPeople)) {
          people = serverPeople;
          listeners.forEach(l => { try { l([...serverPeople]); } catch (e) {} });
        }
      } catch (err) {
        console.warn('Could not fetch people from server, using local mock', err.message || err);
      }
    };
    
    fetchPeople();
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
    try {
      await apiClient.deleteUser(personId);
    } catch (err) {
      console.warn('Could not delete person from server, removing locally only', err.message || err);
    }
    
    // Update local state regardless of server result
    people = people.filter(p => p.id !== personId);
    listeners.forEach(l => {
      try { l([...people]); } catch (e) {} 
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
