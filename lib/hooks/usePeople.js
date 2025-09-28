import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';

async function conditionalFetch(url, prev) {
  const headers = {};
  if (prev && prev._lastModified) headers['If-Modified-Since'] = prev._lastModified;
  const res = await fetch(url, { headers });
  if (res.status === 304) return { __notModified: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  data._lastModified = res.headers.get('last-modified') || new Date().toUTCString();
  return data;
}


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

    const doFetch = async () => {
      try {
        const prev = { _lastModified: people && people._lastModified };
        const data = await conditionalFetch('/api/users', prev);
        if (data && data.__notModified) return;
        if (Array.isArray(data)) {
          // store lastModified on the array object
          data._lastModified = data._lastModified || new Date().toUTCString();
          people = data;
          listeners.forEach(l => { try { l([...data]); } catch (e) {} });
        }
      } catch (err) {
        console.warn('Could not fetch people from server, using local mock', err.message || err);
      }
    };

    // initial fetch
    doFetch();

    // clear cached promise reference behavior not needed now
    return () => { canceled = true; };
  }, []);

  // periodic visibility-aware refresh for people list
  useEffect(() => {
    if (typeof window === 'undefined') return;
  const interval = 7000; // 7s - shorter for near-realtime people updates
    let timer = null;
    const tryRefresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const prev = { _lastModified: people && people._lastModified };
        const data = await conditionalFetch('/api/users', prev);
        if (data && data.__notModified) return;
        if (Array.isArray(data)) {
          data._lastModified = data._lastModified || new Date().toUTCString();
          people = data;
          listeners.forEach(l => { try { l([...data]); } catch (e) {} });
        }
      } catch (e) {
        // ignore
      }
    };

    timer = setInterval(tryRefresh, interval);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tryRefresh(); });
    return () => {
      clearInterval(timer);
    };
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
      // ensure created includes timestamps if server provided them
      if (created.updatedAt) people._lastModified = created.updatedAt;
      else people._lastModified = new Date().toUTCString();
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
    // bump local lastModified so conditional fetches don't assume older timestamp
    people._lastModified = new Date().toUTCString();
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
