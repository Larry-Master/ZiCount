# ZiCount - Receipt Claim System

A Tricount-like web application for German receipts with OCR analysis and item claiming functionality.

## Features

- **Receipt Upload & OCR**: Upload receipt images with automatic text recognition
- **Item Detection**: Automatically detect items and prices from receipt text
- **People Management**: Add/remove people and track who uploaded receipts
- **Claim System**: Users can claim/unclaim items with optimistic UI updates
- **Grace Period**: 2-minute window to unclaim items after claiming
- **Mobile-First Design**: Responsive interface optimized for mobile devices
- **German Locale**: Currency formatting in German format (12,34 €)
- **Default "Claim for myself"**: Quick claiming with current user as default

## Architecture

### Components
- **ReceiptList**: Display list of receipts with progress indicators
- **ReceiptDetail**: Detailed view of receipt with claimable items
- **ItemCard**: Individual item with claim/unclaim functionality
- **ClaimModal**: Enhanced modal for selecting any person when claiming
- **MyClaims**: User's claimed items with unclaim option
- **PeopleManager**: Add/remove people and switch current user

### Mobile Features
- **Touch-friendly interface**: Large buttons and touch targets
- **Sticky navigation**: Header stays visible when scrolling
- **Responsive design**: Adapts to all screen sizes
- **Camera integration**: Direct photo capture on mobile devices

### Core Features
- **Multi-user support**: Add people with color-coded avatars
- **Receipt ownership**: Track who uploaded each receipt
- **Optimistic UI**: Immediate feedback for claim actions
- **Concurrency Handling**: Prevents double-claiming with API validation
- **Grace Window**: Users can unclaim items within 2 minutes
- **Currency Utilities**: German locale formatting and price parsing

### API Endpoints
```
GET    /api/receipts                     - List receipts
GET    /api/receipts/:rid               - Get receipt details
POST   /api/receipts/:rid/items/:id/claim - Claim item
POST   /api/items/:id/unclaim           - Unclaim item
GET    /api/users/:userId/claims        - Get user claims
```

## Data Structure

### Person Format
```javascript
{
  id: string,
  name: string,
  color: string // Hex color for avatar
}
```

### Receipt Format
```javascript
{
  id: string,
  name: string,
  createdAt: string,
  uploadedBy: string, // Person ID who uploaded
  imageUrl: string,
  items: Item[]
}
```

### Item Format
```javascript
{
  id: string,
  name: string,
  priceEUR: number,
  imageUrl: string,
  tags: string[],
  receiptId: string,
  claimedBy: string | null,
  claimedAt: string | null,
  confidence?: number
}
```

## Installation

```bash
npm install
npm run dev
```

## Deployment to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Or deploy with GitHub integration
# Push to GitHub and connect repository in Vercel dashboard
```

## Testing

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
```

## Usage

### Mobile Workflow
1. **Add People**: Use "People" tab to add all group members
2. **Select User**: Choose who is uploading via dropdown in header
3. **Capture Receipt**: Tap camera icon to take photo or select from gallery
4. **Analyze**: Process receipt with OCR
5. **Claim Items**: Tap items to claim for yourself or others
6. **Manage Claims**: Use "My Claims" to view and unclaim items

### Desktop Workflow
1. **People Management**: Use full people manager to add/remove members
2. **Drag & Drop**: Drop receipt images directly onto upload area
3. **Quick Claiming**: Default claims to current user
4. **Detailed View**: Enhanced interface with more information

## Technical Details

### Mobile Optimizations
- **Responsive grid**: Single column layout on mobile
- **Touch targets**: Minimum 44px touch areas
- **Sticky header**: Navigation always accessible
- **Optimized modals**: Full-screen on small devices
- **Image handling**: Automatic resizing and compression

### People Management
- **Color coding**: Each person gets a unique color
- **Avatar system**: First letter avatars with person colors
- **Current user tracking**: Clear indication of active user
- **Receipt attribution**: Shows who uploaded each receipt

### Enhanced Claiming
- **Visual person selection**: Avatar-based user picker
- **Default claiming**: Current user pre-selected
- **Grace period indication**: Visual countdown for unclaim window
- **Claim attribution**: Shows person avatars on claimed items

### Currency Handling
- Formats amounts using German locale: `12,34 €`
- Parses various price formats from OCR text
- Handles both object and number price formats

### Optimistic Updates
- Claims show immediately in UI before API confirmation
- Rollback on API errors
- Visual feedback for pending states

### Grace Period Logic
- 2-minute window after claiming
- Real-time calculation of remaining time
- Server-side validation of unclaim requests

### Concurrency Safety
- API prevents double-claiming
- Optimistic updates with error handling
- State synchronization between components

## Development

### Key Files
- `lib/api/client.js` - API client with request handling
- `lib/utils/currency.js` - Currency formatting and parsing
- `lib/hooks/useReceipts.js` - React hooks for receipt state
- `lib/hooks/usePeople.js` - People management hooks
- `components/` - React components for UI
- `__tests__/` - Jest test suites
- `vercel.json` - Vercel deployment configuration

### Testing Strategy
- Unit tests for utility functions
- Component tests with React Testing Library
- Hook tests with renderHook
- Mobile responsive testing
- Mock API responses for integration tests

### Mobile Development Tips
- Test on actual devices for touch interactions
- Use browser dev tools device simulation
- Consider network connectivity issues
- Optimize images for mobile bandwidth
- Test camera functionality on HTTPS
