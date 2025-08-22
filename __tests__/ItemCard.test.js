import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ItemCard from '@/components/ItemCard';

// Mock the utils
jest.mock('@/lib/utils/currency', () => ({
  formatCurrency: jest.fn((amount) => `€${amount.toFixed(2)}`),
  parsePrice: jest.fn((price) => typeof price === 'number' ? price : parseFloat(price) || 0)
}));

describe('ItemCard', () => {
  const mockItem = {
    id: '1',
    name: 'Test Item',
    price: 12.34,
    tags: ['food', 'lunch'],
    confidence: 0.95
  };

  const defaultProps = {
    item: mockItem,
    currentUserId: 'user1',
    onClaim: jest.fn(),
    onUnclaim: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders unclaimed item correctly', () => {
    render(<ItemCard {...defaultProps} />);
    
    expect(screen.getByText('Test Item')).toBeInTheDocument();
    expect(screen.getByText('€12.34')).toBeInTheDocument();
    expect(screen.getByText('food')).toBeInTheDocument();
    expect(screen.getByText('lunch')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Claim')).toBeInTheDocument();
  });

  test('renders claimed item correctly', () => {
    const claimedItem = {
      ...mockItem,
      claimedBy: 'user2',
      claimedAt: new Date().toISOString()
    };

    render(<ItemCard {...defaultProps} item={claimedItem} />);
    
    expect(screen.getByText('Claimed by user2')).toBeInTheDocument();
    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  test('shows unclaim option for own items', () => {
    const myClaimedItem = {
      ...mockItem,
      claimedBy: 'user1',
      claimedAt: new Date().toISOString()
    };

    render(<ItemCard {...defaultProps} item={myClaimedItem} />);
    
    expect(screen.getByText('Claimed by you')).toBeInTheDocument();
    expect(screen.getByText('Unclaim')).toBeInTheDocument();
  });

  test('handles claim action', () => {
    render(<ItemCard {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Claim'));
    expect(defaultProps.onClaim).toHaveBeenCalledWith(mockItem);
  });

  test('handles unclaim action', () => {
    const myClaimedItem = {
      ...mockItem,
      claimedBy: 'user1',
      claimedAt: new Date().toISOString()
    };

    render(<ItemCard {...defaultProps} item={myClaimedItem} />);
    
    fireEvent.click(screen.getByText('Unclaim'));
    expect(defaultProps.onUnclaim).toHaveBeenCalledWith(myClaimedItem);
  });

  test('shows pending state', () => {
    const pendingItem = { ...mockItem, pending: true };
    
    render(<ItemCard {...defaultProps} item={pendingItem} />);
    
    expect(screen.getByText('Claiming...')).toBeInTheDocument();
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });
});
