# Vercel Deployment Checklist for ZiCount

## ✅ Completed Optimizations

### 1. **Next.js Configuration (`next.config.js`)**
- ✅ Added `serverExternalPackages` for SSH libraries
- ✅ Configured webpack code splitting for better chunk management
- ✅ Set proper image optimization settings
- ✅ Removed deprecated experimental config

### 2. **Vercel Configuration (`vercel.json`)**
- ✅ Added specific function timeout for analyze endpoint (60s)
- ✅ Configured proper API routing
- ✅ Added CORS headers for API endpoints
- ✅ Set production environment variables

### 3. **API Routes Optimization**
- ✅ **Analyze Route** (`/api/analyze/route.js`):
  - Added serverless environment detection
  - Implemented fallback analysis for when SSH is unavailable
  - Added proper error handling and timeout configuration
  - Added graceful degradation for Vercel's serverless environment

- ✅ **All Other Routes**: Verified Vercel compatibility
  - `/api/receipts` - ✅ Working
  - `/api/receipts/[rid]` - ✅ Working  
  - `/api/users/[userId]/claims` - ✅ Working
  - `/api/items/[id]/unclaim` - ✅ Working
  - `/api/receipts/[rid]/items/[id]/claim` - ✅ Working

### 4. **Client-Side Optimizations**
- ✅ **Lazy Loading**: Implemented for all major components
  - `ReceiptDetail`, `ReceiptList`, `MyClaims`, `PeopleManager`
- ✅ **Code Splitting**: Added React Suspense boundaries
- ✅ **Error Handling**: Enhanced API client with better error detection
- ✅ **Error Boundary**: Added app-wide error boundary component

### 5. **Database Connection**
- ✅ **MongoDB**: Optimized for serverless with proper connection pooling
- ✅ **Connection Caching**: Proper development vs production handling

## 🚀 Deployment Steps

### 1. **Pre-deployment Verification**
```bash
# 1. Clear cache and test build locally
rm -rf .next
npm run build

# 2. Test development server
npm run dev

# 3. Run tests (if available)
npm test
```

### 2. **Environment Variables for Vercel**
Set these in your Vercel dashboard:
```
MONGODB_URI=mongodb+srv://...
NODE_ENV=production

# Optional (for SSH OCR functionality):
SSH_HOST=your-ssh-server.com
SSH_USER=your-username
SSH_PASSWORD=your-password
SSH_PORT=22
```

### 3. **Deploy to Vercel**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### 4. **Post-deployment Testing**
1. Test all API endpoints using the route test utility
2. Verify image upload and analysis works (should use fallback on Vercel)
3. Test receipt management features
4. Verify user claims functionality

## 🔧 Route Testing

Use the built-in route testing utility:
```javascript
// In browser console after deployment:
await window.testRoutes().then(console.table);
```

Or run manual tests on these endpoints:
- ✅ `GET /api/receipts` - List all receipts
- ✅ `POST /api/receipts` - Create new receipt
- ✅ `GET /api/receipts/[id]` - Get specific receipt
- ✅ `DELETE /api/receipts/[id]` - Delete receipt
- ✅ `POST /api/analyze` - Upload and analyze receipt image
- ✅ `GET /api/users/[userId]/claims` - Get user claims
- ✅ `POST /api/receipts/[rid]/items/[id]/claim` - Claim item
- ✅ `POST /api/items/[id]/unclaim` - Unclaim item

## ⚠️ Known Limitations on Vercel

1. **SSH-based OCR**: Not available in serverless environment
   - **Solution**: Falls back to mock analysis
   - **Future**: Consider cloud OCR services (Google Vision, AWS Textract)

2. **File Upload Size**: Limited to 10MB on hobby plan
3. **Function Timeout**: 60 seconds max on hobby plan

## 🎯 Performance Optimizations

1. **Lazy Loading**: All major components load on-demand
2. **Code Splitting**: Webpack configured for optimal chunk sizes
3. **Error Boundaries**: Prevent app crashes from component errors
4. **Connection Pooling**: MongoDB connections optimized for serverless
5. **Graceful Degradation**: Fallbacks for when external services fail

## 📊 Monitoring

After deployment, monitor:
1. Function execution times in Vercel dashboard
2. Error rates and types
3. API response times
4. User experience with chunk loading

## 🔄 Future Improvements

1. Replace SSH-based OCR with cloud service
2. Add service worker for offline functionality
3. Implement progressive image loading
4. Add more comprehensive error tracking
5. Consider edge functions for better performance
