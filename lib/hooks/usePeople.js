import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';


// Simple in-memory pub/sub for sync across hook instances
let listeners = [];
let fetchPromise = null; // Cache the fetch promise to prevent duplicate requests
let people = []; // Global people cache

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

  // Fetch from server on mount - but only once globally
  useEffect(() => {
    let canceled = false;
    
    // If there's already a fetch in progress, wait for it
    if (fetchPromise) {
      fetchPromise.then(() => {
        if (!canceled) {
          setPeopleList([...people]);
        }
      });
      return () => { canceled = true; };
    }
    
    // Start a new fetch and cache the promise
    fetchPromise = (async () => {
      try {
        const serverPeople = await apiClient.getUsers();
        if (Array.isArray(serverPeople)) {
          people = serverPeople;
          listeners.forEach(l => { try { l([...serverPeople]); } catch (e) {} });
        }
      } catch (err) {
        console.warn('Could not fetch people from server, using local mock', err.message || err);
      } finally {
        // Clear the promise after completion so future hook instances can retry if needed
        setTimeout(() => { fetchPromise = null; }, 1000);
      }
    })();
    
    fetchPromise.then(() => {
      if (!canceled) {
        setPeopleList([...people]);
      }
    });
    
    return () => { canceled = true; };
  }, []);

  const addPerson = async (name) => {
    if (!name.trim()) return;
    
    const colors = ['#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#e83e8c', '#20c997', '#ffc107'];
    
    // Helper function to generate unique name
    const generateUniqueName = (baseName, existingNames) => {
      let finalName = baseName;
      if (existingNames.includes(finalName)) {
        let counter = 2;
        while (existingNames.includes(`${baseName} ${counter}`)) {
          counter++;
        }
        finalName = `${baseName} ${counter}`;
      }
      return finalName;
    };

    const baseName = name.trim();
    
    // Try to persist to server if available
    try {
      const created = await apiClient.createUser(baseName);
      // server returns { id, name, color } with unique name already handled
      people.push(created);
      listeners.forEach(l => { try { l([...people]); } catch (e) {} });
      return created;
    } catch (err) {
      // Fallback to in-memory behavior if server not reachable
      const existingNames = people.map(p => p.name);
      const uniqueName = generateUniqueName(baseName, existingNames);
      
      const newPerson = {
        id: `user_${Date.now()}`,
        name: uniqueName,
        color: colors[peopleList.length % colors.length]
      };
      
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
