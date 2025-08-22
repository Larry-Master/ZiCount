import { renderHook, act } from '@testing-library/react';
import { usePeople } from '@/lib/hooks/usePeople';

describe('usePeople', () => {
  test('starts with default people', () => {
    const { result } = renderHook(() => usePeople());
    
    expect(result.current.people).toHaveLength(3);
    expect(result.current.people[0]).toMatchObject({
      id: 'user1',
      name: 'Alice',
      color: '#007bff'
    });
  });

  test('can add new person', async () => {
    const { result } = renderHook(() => usePeople());
    
    await act(async () => {
      const newPerson = await result.current.addPerson('David');
      expect(newPerson.name).toBe('David');
      expect(newPerson.id).toMatch(/^user_\d+$/);
    });
    
    expect(result.current.people).toHaveLength(4);
    expect(result.current.people[3].name).toBe('David');
  });

  test('can remove person', async () => {
    const { result } = renderHook(() => usePeople());
    
    await act(async () => {
      await result.current.removePerson('user2');
    });
    
    expect(result.current.people).toHaveLength(2);
    expect(result.current.people.find(p => p.id === 'user2')).toBeUndefined();
  });

  test('can get person by id', () => {
    const { result } = renderHook(() => usePeople());
    
    const person = result.current.getPerson('user1');
    expect(person).toMatchObject({
      id: 'user1',
      name: 'Alice',
      color: '#007bff'
    });
  });

  test('ignores empty names when adding', async () => {
    const { result } = renderHook(() => usePeople());
    const initialLength = result.current.people.length;
    
    await act(async () => {
      await result.current.addPerson('');
      await result.current.addPerson('   ');
    });
    
    expect(result.current.people).toHaveLength(initialLength);
  });
});
