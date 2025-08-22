import { useState, useEffect } from 'react';

// Mock data - in production, this would come from a database
let people = [
  { id: 'user1', name: 'Alice', color: '#007bff' },
  { id: 'user2', name: 'Bob', color: '#28a745' },
  { id: 'user3', name: 'Charlie', color: '#fd7e14' }
];

export const usePeople = () => {
  const [peopleList, setPeopleList] = useState(people);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addPerson = async (name) => {
    if (!name.trim()) return;
    
    const colors = ['#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#e83e8c', '#20c997', '#ffc107'];
    const newPerson = {
      id: `user_${Date.now()}`,
      name: name.trim(),
      color: colors[peopleList.length % colors.length]
    };

    setPeopleList(prev => [...prev, newPerson]);
    people.push(newPerson); // Update mock data
    return newPerson;
  };

  const removePerson = async (personId) => {
    setPeopleList(prev => prev.filter(p => p.id !== personId));
    people = people.filter(p => p.id !== personId);
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
